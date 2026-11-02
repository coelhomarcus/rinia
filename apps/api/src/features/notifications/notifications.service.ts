import type { NotificationType } from "@rinia/shared";
import { and, count, desc, eq, inArray, isNotNull, isNull, or } from "drizzle-orm";
import { db } from "../../db";
import { boardColumns, issueSubscriptions, notifications, projectMembers, users } from "../../db/schema";
import { HttpError } from "../../lib/http-error";

const PERSON = { id: true, name: true, username: true, avatarUrl: true } as const;
const EXCERPT_LENGTH = 160;

type TiptapNode = { type?: unknown; text?: unknown; attrs?: { id?: unknown; label?: unknown }; content?: unknown };
/** Any stored or submitted Tiptap document; only its nodes are read. */
type RichText = { content?: unknown } | null | undefined;

function walk(nodes: unknown, visit: (node: TiptapNode) => void) {
    if (!Array.isArray(nodes)) return;
    for (const candidate of nodes) {
        if (!candidate || typeof candidate !== "object") continue;
        const node = candidate as TiptapNode;
        visit(node);
        walk(node.content, visit);
    }
}

/** Everyone a Tiptap document mentions, once each, in the order they first appear. */
export function mentionedUserIds(document: RichText): string[] {
    const ids = new Set<string>();
    walk(document?.content, (node) => {
        if (node.type === "mention" && typeof node.attrs?.id === "string" && node.attrs.id) ids.add(node.attrs.id);
    });
    return [...ids];
}

/** The people `next` mentions that `previous` did not, so editing a text only notifies the newly mentioned. */
export function newMentions(previous: RichText, next: RichText): string[] {
    const before = new Set(mentionedUserIds(previous));
    return mentionedUserIds(next).filter((id) => !before.has(id));
}

/** A short, single-line preview of a comment for the inbox. */
export function plainTextExcerpt(document: RichText, length = EXCERPT_LENGTH): string {
    const parts: string[] = [];
    walk(document?.content, (node) => {
        if (node.type === "text" && typeof node.text === "string") parts.push(node.text);
        else if (node.type === "mention" && typeof node.attrs?.label === "string") parts.push(`@${node.attrs.label}`);
        else if (node.type === "paragraph" || node.type === "heading" || node.type === "hardBreak") parts.push(" ");
    });
    const text = parts.join("").replace(/\s+/g, " ").trim();
    return text.length > length ? `${text.slice(0, length - 1).trimEnd()}…` : text;
}

/** What one action did to an issue, as far as notifications care. */
export interface IssueChange {
    actorId: string;
    /** The action created the issue, so its creator starts following it. */
    created?: boolean;
    /** Who the issue was just assigned to. */
    assigneeId?: string | null;
    /** People this action mentions for the first time. */
    mentionedIds?: string[];
    /** The comment the action wrote. `created` is false when an existing comment was edited. */
    comment?: { id: string; created: boolean };
    /** The issue moved from one state (column) to another. */
    status?: { from: string; to: string };
    /** For a reply: who wrote the thread's comment or replied before. */
    threadParticipantIds?: string[];
}

export interface PlannedNotification {
    userId: string;
    type: NotificationType;
    commentId: string | null;
    payload: Record<string, unknown>;
}

/**
 * Who starts following the issue and who gets notified. Only people in `audience` (those who can still see the
 * project) are considered, the actor is never notified, and each person gets at most one notification per action:
 * being assigned beats being mentioned, which beats a reply in a thread you are in, which beats hearing about a
 * comment or a state change as a follower.
 */
export function planIssueChange(change: IssueChange, followers: string[], audience: Set<string>) {
    const follow = new Set<string>();
    if (change.created || change.comment?.created) follow.add(change.actorId);
    if (change.assigneeId) follow.add(change.assigneeId);
    for (const id of change.mentionedIds ?? []) follow.add(id);

    const planned = new Map<string, PlannedNotification>();
    const notify = (userId: string, type: NotificationType, payload: Record<string, unknown> = {}) => {
        if (userId === change.actorId || !audience.has(userId) || planned.has(userId)) return;
        planned.set(userId, { userId, type, commentId: type === "mentioned" || type === "replied" || type === "commented" ? (change.comment?.id ?? null) : null, payload });
    };
    if (change.assigneeId) notify(change.assigneeId, "assigned");
    for (const id of change.mentionedIds ?? []) notify(id, "mentioned");
    if (change.comment?.created) for (const id of change.threadParticipantIds ?? []) notify(id, "replied");
    if (change.comment?.created) for (const id of followers) notify(id, "commented");
    if (change.status) for (const id of followers) notify(id, "status_changed", { from: change.status.from, to: change.status.to });

    return { follow: [...follow].filter((id) => audience.has(id)), notifications: [...planned.values()] };
}

/** Of `userIds`, the people who can see the project: its members. */
async function projectAudience(projectId: string, userIds: string[]) {
    if (userIds.length === 0) return new Set<string>();
    const rows = await db
        .select({ id: users.id })
        .from(users)
        .leftJoin(projectMembers, and(eq(projectMembers.userId, users.id), eq(projectMembers.projectId, projectId)))
        .where(and(inArray(users.id, userIds), isNotNull(projectMembers.id)));
    return new Set(rows.map((row) => row.id));
}

/** Records who follows the issue after `change` and notifies the people it concerns. */
export async function recordIssueChange(issue: { id: string; projectId: string }, change: IssueChange) {
    const relevant = change.created || change.assigneeId || change.mentionedIds?.length || change.comment?.created || change.status;
    if (!relevant) return;
    try {
        const followers = (await db.select({ userId: issueSubscriptions.userId }).from(issueSubscriptions).where(eq(issueSubscriptions.issueId, issue.id))).map((row) => row.userId);
        const candidates = new Set([change.actorId, ...followers, ...(change.assigneeId ? [change.assigneeId] : []), ...(change.mentionedIds ?? []), ...(change.threadParticipantIds ?? [])]);
        const plan = planIssueChange(change, followers, await projectAudience(issue.projectId, [...candidates]));
        if (plan.follow.length > 0) {
            await db.insert(issueSubscriptions).values(plan.follow.map((userId) => ({ userId, issueId: issue.id }))).onConflictDoNothing();
        }
        if (plan.notifications.length > 0) {
            await db.insert(notifications).values(plan.notifications.map((notification) => ({ ...notification, actorId: change.actorId, projectId: issue.projectId, issueId: issue.id })));
        }
    } catch (error) {
        // The change itself is already saved; a missed notification must not turn it into a failed request.
        console.error("Could not record issue notifications", error);
    }
}

/** Hides notifications from projects the user has left. */
function visibleTo(userId: string) {
    return inArray(notifications.projectId, db.select({ id: projectMembers.projectId }).from(projectMembers).where(eq(projectMembers.userId, userId)));
}

export async function listNotifications(userId: string) {
    const rows = await db.query.notifications.findMany({
        where: and(eq(notifications.userId, userId), visibleTo(userId)),
        orderBy: [desc(notifications.createdAt)],
        limit: 200,
        with: {
            actor: { columns: PERSON },
            project: { columns: { id: true, name: true, issueKey: true, icon: true, iconAppearance: true } },
            issue: { columns: { id: true, number: true, title: true, columnId: true, priority: true } },
            comment: { columns: { contentJson: true } },
        },
    });

    // State changes name the states they moved between, even ones deleted since.
    const columnIds = new Set<string>();
    for (const row of rows) {
        if (row.type !== "status_changed") continue;
        for (const id of [row.payload.from, row.payload.to]) if (typeof id === "string") columnIds.add(id);
    }
    const columns = columnIds.size
        ? await db.query.boardColumns.findMany({ where: inArray(boardColumns.id, [...columnIds]), columns: { id: true, name: true, color: true } })
        : [];
    const columnById = new Map(columns.map((column) => [column.id, column]));

    return rows.map((row) => ({
        id: row.id,
        type: row.type,
        readAt: row.readAt,
        createdAt: row.createdAt,
        actor: row.actor,
        project: row.project,
        issue: { ...row.issue, identifier: `${row.project.issueKey}-${row.issue.number}` },
        excerpt: row.comment ? plainTextExcerpt(row.comment.contentJson) : null,
        status:
            row.type === "status_changed"
                ? { from: columnById.get(String(row.payload.from)) ?? null, to: columnById.get(String(row.payload.to)) ?? null }
                : null,
    }));
}

export async function countUnreadNotifications(userId: string) {
    const [row] = await db
        .select({ value: count() })
        .from(notifications)
        .where(and(eq(notifications.userId, userId), isNull(notifications.readAt), visibleTo(userId)));
    return row?.value ?? 0;
}

export async function setNotificationRead(userId: string, notificationId: string, read: boolean) {
    const [updated] = await db
        .update(notifications)
        .set({ readAt: read ? new Date() : null })
        .where(and(eq(notifications.id, notificationId), eq(notifications.userId, userId)))
        .returning({ id: notifications.id, readAt: notifications.readAt });
    if (!updated) throw new HttpError(404, "Notification not found");
    return updated;
}

export async function markAllNotificationsRead(userId: string) {
    await db.update(notifications).set({ readAt: new Date() }).where(and(eq(notifications.userId, userId), isNull(notifications.readAt)));
}

export async function isFollowingIssue(userId: string, issueId: string) {
    const row = await db.query.issueSubscriptions.findFirst({ where: and(eq(issueSubscriptions.userId, userId), eq(issueSubscriptions.issueId, issueId)), columns: { userId: true } });
    return !!row;
}

export async function followIssue(userId: string, issueId: string) {
    await db.insert(issueSubscriptions).values({ userId, issueId }).onConflictDoNothing();
}

export async function unfollowIssue(userId: string, issueId: string) {
    await db.delete(issueSubscriptions).where(and(eq(issueSubscriptions.userId, userId), eq(issueSubscriptions.issueId, issueId)));
}
