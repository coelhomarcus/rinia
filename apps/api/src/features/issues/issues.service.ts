import { nextLabels, positionsAtTop, type BulkUpdateIssuesInput, type CreateIssueCommentInput, type CreateIssueInput, type CreateIssueRelationInput, type IssueListQuery, type IssueOrder, type MyIssuesQuery, type TiptapDocument, type UpdateIssueCommentInput, type UpdateIssueInput } from "@rinia/shared";
import { and, asc, desc, eq, inArray, isNull, max, min, notInArray, or, sql, type SQL } from "drizzle-orm";
import { db } from "../../db";
import { boardColumns, categories, commentReactions, issueActivities, issueComments, issueDescriptionRevisions, issueLabels, issueRelations, issues, issueSubscriptions, projectKeyAliases, projectMembers, projects, users } from "../../db/schema";
import type { TiptapDocument as StoredDocument } from "../../db/schema";
import { HttpError } from "../../lib/http-error";
import { requireUndoWindow } from "../../lib/soft-delete";
import { mentionedUserIds, newMentions, recordIssueChange } from "../notifications/notifications.service";
import { publishChange } from "../realtime/realtime.service";

const EMPTY_DOCUMENT = { type: "doc" as const, content: [] };
const PERSON = { id: true, name: true, username: true, avatarUrl: true } as const;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Loads an issue's labels with the names and colors the lists show. */
const LABELS_WITH = { columns: { categoryId: true }, with: { category: { columns: { id: true, name: true, color: true } } } } as const;

type LabelRow = { categoryId: string; category: { id: string; name: string; color: string | null } };

/** Replaces the loaded label rows with `categoryIds` and `categories`, sorted by name. */
export function withLabels<T extends { labels: LabelRow[] }>({ labels, ...issue }: T) {
    const categories = labels.map((label) => label.category).sort((left, right) => left.name.localeCompare(right.name));
    return { ...issue, categoryIds: categories.map((category) => category.id), categories };
}

/** Which labels a change adds and which it removes. */
export function labelChanges(current: string[], next: string[]) {
    const before = new Set(current);
    const after = new Set(next);
    return { added: next.filter((id) => !before.has(id)), removed: current.filter((id) => !after.has(id)) };
}

/** Edits by the same author within this long of a version's first save update that version instead of adding one. */
export const DESCRIPTION_REVISION_WINDOW_MS = 5 * 60 * 1000;

/** Most urgent first, issues without a priority last. The enum's own order runs low to high, so it cannot sort this. */
const priorityRank = sql`case ${issues.priority} when 'urgent' then 0 when 'high' then 1 when 'medium' then 2 when 'low' then 3 else 4 end`;

/** How a list sorts. Due dates run soonest first, with undated issues last. */
function issueOrder(orderBy: IssueOrder) {
    if (orderBy === "updated") return desc(issues.updatedAt);
    if (orderBy === "number") return asc(issues.number);
    if (orderBy === "priority") return asc(priorityRank);
    if (orderBy === "due") return sql`${issues.dueDate} asc nulls last`;
    return asc(issues.position);
}

function validateIssueImageUrls(document?: TiptapDocument) {
    if (!document) return;
    const visit = (nodes: unknown[]) => {
        for (const candidate of nodes) {
            if (!candidate || typeof candidate !== "object") continue;
            const node = candidate as { type?: unknown; attrs?: { src?: unknown }; content?: unknown[] };
            if (node.type === "image" && typeof node.attrs?.src === "string" && node.attrs.src.trim()) {
                try {
                    const url = new URL(node.attrs.src);
                    if (!(["http:", "https:"].includes(url.protocol))) throw new Error();
                } catch {
                    throw new HttpError(400, "Issue image URLs must use HTTP or HTTPS");
                }
            }
            if (Array.isArray(node.content)) visit(node.content);
        }
    };
    visit(document.content ?? []);
}

function parseIdentifier(identifier: string): { key: string; number: number } | null {
    const match = /^([A-Z0-9]{2,8})-(\d+)$/.exec(identifier.toUpperCase());
    return match ? { key: match[1], number: Number(match[2]) } : null;
}

async function findIssue(identifier: string) {
    const parsed = parseIdentifier(identifier);
    if (parsed) {
        const [match] = await db
            .select({ id: issues.id })
            .from(issues)
            .innerJoin(projects, eq(issues.projectId, projects.id))
        .where(and(eq(projects.issueKey, parsed.key), eq(issues.number, parsed.number), isNull(issues.deletedAt)));
        // Identifiers from before a project key change still open the same issue.
        const [aliased] = match
            ? []
            : await db
                  .select({ id: issues.id })
                  .from(issues)
                  .innerJoin(projectKeyAliases, eq(issues.projectId, projectKeyAliases.projectId))
                  .where(and(eq(projectKeyAliases.key, parsed.key), eq(issues.number, parsed.number), isNull(issues.deletedAt)));
        identifier = match?.id ?? aliased?.id ?? identifier;
    }
    // An identifier that matched no issue is not an id either; Postgres would reject it as a uuid.
    if (!UUID.test(identifier)) return undefined;

    const issue = await db.query.issues.findFirst({
        where: and(eq(issues.id, identifier), isNull(issues.deletedAt)),
        with: {
            project: { columns: { id: true, name: true, issueKey: true } },
            assignee: { columns: { id: true, name: true, username: true, avatarUrl: true } },
            createdBy: { columns: { id: true, name: true, username: true, avatarUrl: true } },
            labels: LABELS_WITH,
            column: { columns: { id: true, name: true } },
            parent: { columns: { id: true, number: true, title: true } },
            children: { where: (child, { isNull: isNullValue }) => isNullValue(child.deletedAt), columns: { id: true, number: true, title: true, columnId: true, priority: true } },
        },
    });
    return issue && withLabels(issue);
}

export async function getIssueOrThrow(identifier: string) {
    const issue = await findIssue(identifier);
    if (!issue) throw new HttpError(404, "Issue not found");
    return issue;
}

export function issueIdentifier(issue: { number: number; project: { issueKey: string } }) {
    return `${issue.project.issueKey}-${issue.number}`;
}

async function ensureIssueBelongsToProject(issueId: string, projectId: string) {
    const issue = await db.query.issues.findFirst({ where: and(eq(issues.id, issueId), eq(issues.projectId, projectId), isNull(issues.deletedAt)), columns: { id: true } });
    if (!issue) throw new HttpError(400, "Issue does not belong to this project");
}

/** The position of the top card in a column, leaving out the cards being moved there. Null when the column is empty. */
async function topPositionInColumn(columnId: string, moving: string[]) {
    const [top] = await db
        .select({ position: min(issues.position) })
        .from(issues)
        .where(and(eq(issues.columnId, columnId), isNull(issues.deletedAt), notInArray(issues.id, moving)));
    return top?.position ?? null;
}

async function ensureColumnInProject(columnId: string, projectId: string) {
    const column = await db.query.boardColumns.findFirst({ where: and(eq(boardColumns.id, columnId), eq(boardColumns.projectId, projectId)), columns: { id: true } });
    if (!column) throw new HttpError(400, "Status does not belong to this project");
}

async function ensureProjectMember(userId: string, projectId: string) {
    const membership = await db.query.projectMembers.findFirst({
        where: and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, userId)),
        columns: { id: true },
    });
    if (!membership) throw new HttpError(400, "User is not a member of this project");
}

async function ensureAssigneeInProject(assigneeId: string, projectId: string) {
    const member = await db.query.projectMembers.findFirst({ where: and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, assigneeId)), columns: { id: true } });
    if (!member) throw new HttpError(400, "User is not a member of this project");
}

async function ensureCategoriesInProject(categoryIds: string[], projectId: string) {
    if (categoryIds.length === 0) return;
    const found = await db.query.categories.findMany({ where: and(inArray(categories.id, categoryIds), eq(categories.projectId, projectId)), columns: { id: true } });
    if (found.length !== new Set(categoryIds).size) throw new HttpError(400, "Category does not belong to this project");
}

async function ensureParentIsValid(parentIssueId: string, issueId: string | undefined, projectId: string) {
    if (parentIssueId === issueId) throw new HttpError(400, "An issue cannot be its own parent");
    await ensureIssueBelongsToProject(parentIssueId, projectId);

    let current = parentIssueId;
    for (let depth = 0; depth < 20; depth += 1) {
        const parent = await db.query.issues.findFirst({ where: and(eq(issues.id, current), isNull(issues.deletedAt)), columns: { parentIssueId: true } });
        if (!parent?.parentIssueId) return;
        if (parent.parentIssueId === issueId) throw new HttpError(400, "An issue cannot become its own ancestor");
        current = parent.parentIssueId;
    }
    throw new HttpError(400, "Issue nesting is too deep");
}

async function nextIssueNumber(projectId: string, tx: any = db): Promise<{ issueKey: string; number: number }> {
    const [updated] = await tx
        .update(projects)
        .set({ nextIssueNumber: sql`${projects.nextIssueNumber} + 1` })
        .where(eq(projects.id, projectId))
        .returning({ issueKey: projects.issueKey, number: projects.nextIssueNumber });
    if (!updated) throw new HttpError(404, "Project not found");
    return { issueKey: updated.issueKey, number: updated.number - 1 };
}

export async function listIssues(projectId: string, query: IssueListQuery) {
    const filters = [eq(issues.projectId, projectId), isNull(issues.deletedAt)];
    if (query.columnId) filters.push(eq(issues.columnId, query.columnId));
    if (query.priority) filters.push(eq(issues.priority, query.priority));
    if (query.assigneeId) filters.push(eq(issues.assigneeId, query.assigneeId));
    // Several labels match issues that have any of them.
    if (query.categoryIds?.length) filters.push(inArray(issues.id, db.select({ id: issueLabels.issueId }).from(issueLabels).where(inArray(issueLabels.categoryId, query.categoryIds))));

    // The number breaks ties, so issues that share a position (or a priority, for that order) keep a stable order.
    const rows = (await db.query.issues.findMany({ where: and(...filters), orderBy: [issueOrder(query.orderBy), asc(issues.number)], with: { labels: LABELS_WITH } })).map(withLabels);
    const project = await db.query.projects.findFirst({ where: eq(projects.id, projectId), columns: { issueKey: true } });
    if (!project) throw new HttpError(404, "Project not found");
    return rows.map((issue) => ({ ...issue, identifier: `${project.issueKey}-${issue.number}` }));
}

/**
 * Issues from every project the user can see that are assigned to them, created by them, or that they follow,
 * with what the list needs to show them outside their project.
 */
export async function listMyIssues(userId: string, query: MyIssuesQuery) {
    const filters: SQL[] = [
        isNull(issues.deletedAt),
        query.filter === "assigned"
            ? eq(issues.assigneeId, userId)
            : query.filter === "created"
              ? eq(issues.createdBy, userId)
              : inArray(issues.id, db.select({ id: issueSubscriptions.issueId }).from(issueSubscriptions).where(eq(issueSubscriptions.userId, userId))),
    ];
    filters.push(inArray(issues.projectId, db.select({ id: projectMembers.projectId }).from(projectMembers).where(eq(projectMembers.userId, userId))));

    const rows = await db.query.issues.findMany({
        where: and(...filters),
        orderBy: [issueOrder(query.orderBy), asc(issues.number)],
        limit: 500,
        with: {
            project: { columns: { id: true, name: true, issueKey: true, icon: true, iconAppearance: true } },
            column: { columns: { id: true, name: true, color: true, position: true } },
            labels: LABELS_WITH,
            assignee: { columns: { id: true, name: true, username: true, avatarUrl: true } },
        },
    });
    return rows.map((issue) => ({ ...withLabels(issue), identifier: issueIdentifier(issue) }));
}

export async function createIssue(projectId: string, input: CreateIssueInput, actorId: string) {
    validateIssueImageUrls(input.descriptionJson);
    await ensureProjectMember(actorId, projectId);
    if (input.parentIssueId) await ensureParentIsValid(input.parentIssueId, undefined, projectId);
    await ensureColumnInProject(input.columnId, projectId);
    if (input.assigneeId) await ensureAssigneeInProject(input.assigneeId, projectId);
    const categoryIds = input.categoryIds ?? [];
    await ensureCategoriesInProject(categoryIds, projectId);

    const issue = await db.transaction(async (tx) => {
        const identity = await nextIssueNumber(projectId, tx);
        // New issues go to the end of the project's manual order, each with a position of its own, so any two
        // issues can be reordered between each other.
        const [last] = await tx.select({ position: max(issues.position) }).from(issues).where(eq(issues.projectId, projectId));
        const [created] = await tx
            .insert(issues)
            .values({
                projectId,
                number: identity.number,
                columnId: input.columnId,
                title: input.title,
                descriptionJson: input.descriptionJson ?? EMPTY_DOCUMENT,
                assigneeId: input.assigneeId,
                priority: input.priority,
                parentIssueId: input.parentIssueId,
                estimate: input.estimate,
                dueDate: input.dueDate,
                createdBy: actorId,
                position: (last?.position ?? 0) + 1000,
            })
            .returning();
        if (categoryIds.length > 0) await tx.insert(issueLabels).values(categoryIds.map((categoryId) => ({ issueId: created.id, categoryId })));
        await tx.insert(issueActivities).values({ issueId: created.id, actorId, type: "created", payload: {} });
        return { ...created, categoryIds, project: { issueKey: identity.issueKey } };
    });
    if (input.descriptionJson?.content.length) {
        await recordDescriptionRevision({ issueId: issue.id, revision: issue.descriptionRevision, authorId: actorId, contentJson: input.descriptionJson });
    }
    await recordIssueChange(issue, { actorId, created: true, assigneeId: issue.assigneeId, mentionedIds: mentionedUserIds(input.descriptionJson) });
    publishChange("issue.created", { projectId, id: issue.id });
    return { ...issue, identifier: issueIdentifier(issue) };
}

export async function updateIssue(identifier: string, input: UpdateIssueInput, actorId: string) {
    const current = await getIssueOrThrow(identifier);
    await ensureProjectMember(actorId, current.projectId);
    validateIssueImageUrls(input.descriptionJson);
    if (input.columnId) await ensureColumnInProject(input.columnId, current.projectId);
    if (input.assigneeId) await ensureAssigneeInProject(input.assigneeId, current.projectId);
    if (input.categoryIds) await ensureCategoriesInProject(input.categoryIds, current.projectId);
    if (input.parentIssueId) await ensureParentIsValid(input.parentIssueId, current.id, current.projectId);

    const { expectedDescriptionRevision, categoryIds, ...values } = input;
    // A card moved to another column without a place picked for it, as from a status menu, goes to the top.
    if (input.columnId && input.columnId !== current.columnId && input.position === undefined) {
        [values.position] = positionsAtTop(await topPositionInColumn(input.columnId, [current.id]), 1);
    }
    const writesDescription = values.descriptionJson !== undefined;
    const [updated] = await db.update(issues)
        .set({
            ...values,
            ...(writesDescription ? { descriptionRevision: sql`${issues.descriptionRevision} + 1` } : {}),
            updatedAt: new Date(),
        })
        .where(writesDescription
            ? and(eq(issues.id, current.id), eq(issues.descriptionRevision, expectedDescriptionRevision!))
            : eq(issues.id, current.id))
        .returning();
    if (!updated && writesDescription) throw new HttpError(409, "This issue description was updated elsewhere. Your draft has been kept.");
    if (!updated) throw new HttpError(404, "Issue not found");
    if (writesDescription) await recordDescriptionRevision({ issueId: current.id, revision: updated.descriptionRevision, authorId: actorId, contentJson: updated.descriptionJson });

    const activityMap = [
        ["columnId", "status_changed"],
        ["priority", "priority_changed"],
        ["assigneeId", "assignee_changed"],
        ["estimate", "estimate_changed"],
        ["dueDate", "due_date_changed"],
        ["parentIssueId", "parent_changed"],
    ] as const;
    for (const [field, type] of activityMap) {
        if (field in input && current[field] !== input[field]) {
            await db.insert(issueActivities).values({ issueId: current.id, actorId, type, payload: { field, from: current[field], to: input[field] } });
        }
    }
    if (categoryIds) {
        const { added, removed } = labelChanges(current.categoryIds, categoryIds);
        if (removed.length > 0) await db.delete(issueLabels).where(and(eq(issueLabels.issueId, current.id), inArray(issueLabels.categoryId, removed)));
        if (added.length > 0) await db.insert(issueLabels).values(added.map((categoryId) => ({ issueId: current.id, categoryId }))).onConflictDoNothing();
        const changes = [...added.map((categoryId) => ({ type: "label_added" as const, categoryId })), ...removed.map((categoryId) => ({ type: "label_removed" as const, categoryId }))];
        if (changes.length > 0) await db.insert(issueActivities).values(changes.map(({ type, categoryId }) => ({ issueId: current.id, actorId, type, payload: { categoryId } })));
    }
    await recordIssueChange(current, {
        actorId,
        assigneeId: input.assigneeId && input.assigneeId !== current.assigneeId ? input.assigneeId : undefined,
        status: input.columnId && input.columnId !== current.columnId ? { from: current.columnId, to: input.columnId } : undefined,
        mentionedIds: writesDescription ? newMentions(current.descriptionJson, values.descriptionJson) : undefined,
    });
    publishChange("issue.updated", { projectId: current.projectId, id: current.id });

    const project = await db.query.projects.findFirst({ where: eq(projects.id, current.projectId), columns: { issueKey: true } });
    return { ...updated, categoryIds: categoryIds ?? current.categoryIds, identifier: `${project?.issueKey}-${updated.number}` };
}

export async function deleteIssue(identifier: string, actorId: string) {
    const issue = await getIssueOrThrow(identifier);
    await ensureProjectMember(actorId, issue.projectId);
    const rows = await db.query.issues.findMany({ where: and(eq(issues.projectId, issue.projectId), isNull(issues.deletedAt)), columns: { id: true, parentIssueId: true } });
    const ids = new Set([issue.id]);
    for (let changed = true; changed;) {
        changed = false;
        for (const row of rows) if (row.parentIssueId && ids.has(row.parentIssueId) && !ids.has(row.id)) { ids.add(row.id); changed = true; }
    }
    const deletedAt = new Date();
    await db.update(issues).set({ deletedAt }).where(inArray(issues.id, [...ids]));
    for (const id of ids) publishChange("issue.deleted", { projectId: issue.projectId, id });
    return { deletedAt: deletedAt.toISOString() };
}

export async function restoreIssue(identifier: string, actorId: string, deletedAt: Date) {
    requireUndoWindow(deletedAt);
    const parsed = parseIdentifier(identifier);
    if (!parsed) throw new HttpError(404, "Issue not found");
    const [row] = await db.select({ id: issues.id, projectId: issues.projectId }).from(issues).innerJoin(projects, eq(issues.projectId, projects.id))
        .where(and(eq(projects.issueKey, parsed.key), eq(issues.number, parsed.number), eq(issues.deletedAt, deletedAt)));
    if (!row) throw new HttpError(404, "Issue not found or undo window expired");
    await ensureProjectMember(actorId, row.projectId);
    const descendants = await db.query.issues.findMany({ where: and(eq(issues.projectId, row.projectId), eq(issues.deletedAt, deletedAt)), columns: { id: true, parentIssueId: true } });
    const ids = new Set([row.id]);
    for (let changed = true; changed;) {
        changed = false;
        for (const child of descendants) if (child.parentIssueId && ids.has(child.parentIssueId) && !ids.has(child.id)) { ids.add(child.id); changed = true; }
    }
    await db.update(issues).set({ deletedAt: null }).where(and(inArray(issues.id, [...ids]), eq(issues.projectId, row.projectId), eq(issues.deletedAt, deletedAt)));
    for (const id of ids) publishChange("issue.restored", { projectId: row.projectId, id });
    return { restored: true };
}

export async function restoreBulkIssues(projectId: string, issueIds: string[], actorId: string, deletedAt: Date) {
    requireUndoWindow(deletedAt);
    await ensureProjectMember(actorId, projectId);
    const rows = await db.query.issues.findMany({ where: and(eq(issues.projectId, projectId), inArray(issues.id, issueIds), eq(issues.deletedAt, deletedAt)), columns: { id: true } });
    if (rows.length !== issueIds.length) throw new HttpError(404, "Some issues could not be restored");
    await db.update(issues).set({ deletedAt: null }).where(and(eq(issues.projectId, projectId), inArray(issues.id, issueIds), eq(issues.deletedAt, deletedAt)));
    for (const id of issueIds) publishChange("issue.restored", { projectId, id });
    return { restored: true };
}

export async function listIssueComments(identifier: string, actorId: string) {
    const issue = await getIssueOrThrow(identifier);
    await ensureProjectMember(actorId, issue.projectId);
    const rows = await db.query.issueComments.findMany({
        where: and(eq(issueComments.issueId, issue.id), isNull(issueComments.deletedAt)),
        orderBy: [asc(issueComments.createdAt)],
        with: {
            author: { columns: PERSON },
            reactions: { columns: { emoji: true, createdAt: true }, orderBy: [asc(commentReactions.createdAt)], with: { user: { columns: PERSON } } },
        },
    });
    return rows.map(({ reactions, ...comment }) => ({ ...comment, reactions: groupReactions(reactions) }));
}

/** One entry per emoji, in the order each was first used, with everyone who reacted with it. */
export function groupReactions(rows: Array<{ emoji: string; user: { id: string; name: string; username: string; avatarUrl: string | null } }>) {
    const groups = new Map<string, { emoji: string; users: Array<{ id: string; name: string; username: string; avatarUrl: string | null }> }>();
    for (const row of rows) {
        const group = groups.get(row.emoji) ?? { emoji: row.emoji, users: [] };
        group.users.push(row.user);
        groups.set(row.emoji, group);
    }
    return [...groups.values()];
}

async function commentForMember(commentId: string, userId: string) {
    const comment = await db.query.issueComments.findFirst({ where: and(eq(issueComments.id, commentId), isNull(issueComments.deletedAt)), columns: { id: true, issueId: true }, with: { issue: { columns: { projectId: true, deletedAt: true } } } });
    if (!comment) throw new HttpError(404, "Comment not found");
    if (comment.issue.deletedAt) throw new HttpError(404, "Issue not found");
    await ensureProjectMember(userId, comment.issue.projectId);
    return comment;
}

async function commentReactionGroups(commentId: string) {
    const rows = await db.query.commentReactions.findMany({
        where: eq(commentReactions.commentId, commentId),
        orderBy: [asc(commentReactions.createdAt)],
        columns: { emoji: true },
        with: { user: { columns: PERSON } },
    });
    return groupReactions(rows);
}

/** Adds the user's reaction. Reacting twice with the same emoji keeps one. Returns the comment's reactions. */
export async function addCommentReaction(commentId: string, emoji: string, userId: string) {
    const comment = await commentForMember(commentId, userId);
    await db.insert(commentReactions).values({ commentId, userId, emoji }).onConflictDoNothing();
    publishChange("comment.reacted", { projectId: comment.issue.projectId, id: commentId, issueId: comment.issueId });
    return commentReactionGroups(commentId);
}

/** Removes the user's own reaction; other people's stay. Returns the comment's reactions. */
export async function removeCommentReaction(commentId: string, emoji: string, userId: string) {
    const comment = await commentForMember(commentId, userId);
    await db.delete(commentReactions).where(and(eq(commentReactions.commentId, commentId), eq(commentReactions.userId, userId), eq(commentReactions.emoji, emoji)));
    publishChange("comment.reacted", { projectId: comment.issue.projectId, id: commentId, issueId: comment.issueId });
    return commentReactionGroups(commentId);
}

/** The comment that opens the thread a reply goes into. Replying to a reply joins its thread, keeping threads one level deep. */
async function threadOf(parentCommentId: string, issueId: string) {
    const parent = await db.query.issueComments.findFirst({ where: and(eq(issueComments.id, parentCommentId), eq(issueComments.issueId, issueId), isNull(issueComments.deletedAt)), columns: { id: true, parentCommentId: true } });
    if (!parent) throw new HttpError(404, "Comment not found");
    return parent.parentCommentId ?? parent.id;
}

export async function createIssueComment(identifier: string, input: CreateIssueCommentInput, authorId: string) {
    const issue = await getIssueOrThrow(identifier);
    await ensureProjectMember(authorId, issue.projectId);
    const threadId = input.parentCommentId ? await threadOf(input.parentCommentId, issue.id) : null;
    // Everyone who already wrote in the thread hears about the reply, followers of the issue or not.
    const threadParticipantIds = threadId
        ? [...new Set((await db.query.issueComments.findMany({ where: and(or(eq(issueComments.id, threadId), eq(issueComments.parentCommentId, threadId)), isNull(issueComments.deletedAt)), columns: { authorId: true } })).map((row) => row.authorId))]
        : [];
    const [comment] = await db.insert(issueComments).values({ issueId: issue.id, authorId, parentCommentId: threadId, contentJson: input.contentJson }).returning();
    await recordIssueChange(issue, { actorId: authorId, comment: { id: comment.id, created: true }, mentionedIds: mentionedUserIds(input.contentJson), threadParticipantIds });
    publishChange("comment.created", { projectId: issue.projectId, id: comment.id, issueId: issue.id });
    const created = await db.query.issueComments.findFirst({ where: eq(issueComments.id, comment.id), with: { author: { columns: PERSON } } });
    return created && { ...created, reactions: [] };
}

export async function updateIssueComment(commentId: string, input: UpdateIssueCommentInput, authorId: string) {
    await commentForMember(commentId, authorId);
    const comment = await db.query.issueComments.findFirst({ where: and(eq(issueComments.id, commentId), isNull(issueComments.deletedAt)) });
    if (!comment) throw new HttpError(404, "Comment not found");
    if (comment.authorId !== authorId) throw new HttpError(403, "Only the comment author can edit it");
    const [updated] = await db.update(issueComments).set({ contentJson: input.contentJson, updatedAt: new Date() }).where(eq(issueComments.id, commentId)).returning();
    const issue = await db.query.issues.findFirst({ where: eq(issues.id, comment.issueId), columns: { id: true, projectId: true } });
    if (issue) await recordIssueChange(issue, { actorId: authorId, comment: { id: commentId, created: false }, mentionedIds: newMentions(comment.contentJson, input.contentJson) });
    if (issue) publishChange("comment.updated", { projectId: issue.projectId, id: commentId, issueId: issue.id });
    return updated;
}

export async function deleteIssueComment(commentId: string, authorId: string) {
    const { issue } = await commentForMember(commentId, authorId);
    const comment = await db.query.issueComments.findFirst({ where: and(eq(issueComments.id, commentId), isNull(issueComments.deletedAt)) });
    if (!comment) throw new HttpError(404, "Comment not found");
    if (comment.authorId !== authorId) throw new HttpError(403, "Only the comment author can delete it");
    const deletedAt = new Date();
    await db.update(issueComments).set({ deletedAt }).where(and(or(eq(issueComments.id, commentId), eq(issueComments.parentCommentId, commentId)), isNull(issueComments.deletedAt)));
    publishChange("comment.deleted", { projectId: issue.projectId, id: commentId, issueId: comment.issueId });
    return { deletedAt: deletedAt.toISOString() };
}

export async function restoreIssueComment(commentId: string, authorId: string, deletedAt: Date) {
    requireUndoWindow(deletedAt);
    const comment = await db.query.issueComments.findFirst({ where: and(eq(issueComments.id, commentId), eq(issueComments.deletedAt, deletedAt)), with: { issue: { columns: { projectId: true } } } });
    if (!comment) throw new HttpError(404, "Comment not found or undo window expired");
    if (comment.authorId !== authorId) throw new HttpError(403, "Only the comment author can restore it");
    await ensureProjectMember(authorId, comment.issue.projectId);
    await db.update(issueComments).set({ deletedAt: null }).where(and(or(eq(issueComments.id, commentId), eq(issueComments.parentCommentId, commentId)), eq(issueComments.deletedAt, deletedAt)));
    publishChange("comment.restored", { projectId: comment.issue.projectId, id: commentId, issueId: comment.issueId });
    return { restored: true };
}

export async function listIssueActivity(identifier: string, actorId: string) {
    const issue = await getIssueOrThrow(identifier);
    await ensureProjectMember(actorId, issue.projectId);
    return db.query.issueActivities.findMany({
        where: eq(issueActivities.issueId, issue.id),
        orderBy: [desc(issueActivities.createdAt)],
        with: { actor: { columns: { id: true, name: true, username: true, avatarUrl: true } } },
    });
}

export async function listIssueRelations(identifier: string, actorId: string) {
    const issue = await getIssueOrThrow(identifier);
    await ensureProjectMember(actorId, issue.projectId);
    const relations = await db.query.issueRelations.findMany({
        where: or(eq(issueRelations.sourceIssueId, issue.id), eq(issueRelations.targetIssueId, issue.id)),
        with: {
            source: { columns: { id: true, number: true, title: true, projectId: true }, with: { project: { columns: { issueKey: true } } } },
            target: { columns: { id: true, number: true, title: true, projectId: true }, with: { project: { columns: { issueKey: true } } } },
        },
    });
    return relations.map((relation) => ({ ...relation, target: relation.sourceIssueId === issue.id ? relation.target : relation.source }));
}

export async function createIssueRelation(identifier: string, input: CreateIssueRelationInput, actorId: string) {
    const source = await getIssueOrThrow(identifier);
    const target = await getIssueOrThrow(input.targetIssueIdentifier);
    await ensureProjectMember(actorId, source.projectId);
    if (source.projectId !== target.projectId) throw new HttpError(400, "Issues must belong to the same project");
    if (source.id === target.id) throw new HttpError(400, "An issue cannot relate to itself");
    const existing = await db.query.issueRelations.findFirst({ where: and(eq(issueRelations.sourceIssueId, source.id), eq(issueRelations.targetIssueId, target.id), eq(issueRelations.type, input.type)) });
    if (existing) throw new HttpError(409, "This relation already exists");
    const [relation] = await db.insert(issueRelations).values({ sourceIssueId: source.id, targetIssueId: target.id, type: input.type }).returning();
    await db.insert(issueActivities).values({ issueId: source.id, actorId, type: "relation_added", payload: { relationId: relation.id, targetIssueId: target.id, relationType: input.type } });
    // Both issues list the relation, so both pages hear about it.
    for (const issueId of [source.id, target.id]) publishChange("relation.created", { projectId: source.projectId, id: relation.id, issueId });
    return relation;
}

export async function deleteIssueRelation(relationId: string, actorId: string) {
    const relation = await db.query.issueRelations.findFirst({ where: eq(issueRelations.id, relationId) });
    if (!relation) throw new HttpError(404, "Relation not found");
    const source = await getIssueOrThrow(relation.sourceIssueId);
    await ensureProjectMember(actorId, source.projectId);
    await db.delete(issueRelations).where(eq(issueRelations.id, relationId));
    await db.insert(issueActivities).values({ issueId: source.id, actorId, type: "relation_removed", payload: { relationId, targetIssueId: relation.targetIssueId, relationType: relation.type } });
    for (const issueId of [relation.sourceIssueId, relation.targetIssueId]) publishChange("relation.deleted", { projectId: source.projectId, id: relationId, issueId });
}

/**
 * Saves a description as a version. A save by the author of the latest version, within a few minutes of that
 * version's first save, updates it; anything else, and every restore, adds a version.
 */
export async function recordDescriptionRevision(input: { issueId: string; revision: number; authorId: string; contentJson: StoredDocument; restoredFromId?: string }, now = new Date()) {
    const latest = input.restoredFromId
        ? undefined
        : await db.query.issueDescriptionRevisions.findFirst({ where: eq(issueDescriptionRevisions.issueId, input.issueId), orderBy: [desc(issueDescriptionRevisions.createdAt)] });
    const grouped = latest && latest.authorId === input.authorId && !latest.restoredFromId && now.getTime() - latest.createdAt.getTime() < DESCRIPTION_REVISION_WINDOW_MS;
    if (grouped) {
        await db.update(issueDescriptionRevisions).set({ contentJson: input.contentJson, revision: input.revision, updatedAt: now }).where(eq(issueDescriptionRevisions.id, latest.id));
        return;
    }
    await db.insert(issueDescriptionRevisions).values({ ...input, createdAt: now, updatedAt: now });
}

export async function listDescriptionRevisions(identifier: string, actorId: string) {
    const issue = await getIssueOrThrow(identifier);
    await ensureProjectMember(actorId, issue.projectId);
    return db.query.issueDescriptionRevisions.findMany({
        where: eq(issueDescriptionRevisions.issueId, issue.id),
        orderBy: [desc(issueDescriptionRevisions.createdAt)],
        limit: 100,
        with: { author: { columns: PERSON } },
    });
}

/** Brings back an older version as the description. The restore is a new version; the ones before it stay. */
export async function restoreDescriptionRevision(identifier: string, revisionId: string, actorId: string) {
    const current = await getIssueOrThrow(identifier);
    await ensureProjectMember(actorId, current.projectId);
    const version = await db.query.issueDescriptionRevisions.findFirst({
        where: and(eq(issueDescriptionRevisions.id, revisionId), eq(issueDescriptionRevisions.issueId, current.id)),
    });
    if (!version) throw new HttpError(404, "Description version not found");

    const [updated] = await db
        .update(issues)
        .set({ descriptionJson: version.contentJson, descriptionRevision: sql`${issues.descriptionRevision} + 1`, updatedAt: new Date() })
        .where(eq(issues.id, current.id))
        .returning();
    if (!updated) throw new HttpError(404, "Issue not found");
    await recordDescriptionRevision({ issueId: current.id, revision: updated.descriptionRevision, authorId: actorId, contentJson: version.contentJson, restoredFromId: version.id });
    await recordIssueChange(current, { actorId, mentionedIds: newMentions(current.descriptionJson, version.contentJson) });
    publishChange("issue.updated", { projectId: current.projectId, id: current.id });
    return { ...updated, identifier: issueIdentifier(current) };
}

/** The fields a bulk change can set directly on each issue, with the activity each one records. */
const BULK_FIELDS = [
    ["columnId", "status_changed"],
    ["priority", "priority_changed"],
    ["assigneeId", "assignee_changed"],
    ["estimate", "estimate_changed"],
    ["dueDate", "due_date_changed"],
] as const;

/** Each selected issue in the project, or a 404 when any is missing, so a bulk change never applies halfway. */
async function issuesInProject(projectId: string, issueIds: string[]) {
    const rows = await db.query.issues.findMany({
        where: and(eq(issues.projectId, projectId), inArray(issues.id, issueIds), isNull(issues.deletedAt)),
        with: { labels: LABELS_WITH },
    });
    if (rows.length !== issueIds.length) throw new HttpError(404, "Some issues were not found in this project");
    return rows.map(withLabels);
}

/**
 * Applies one change to many issues of a project in a single transaction, with an activity entry for each issue
 * that actually changed. Membership is checked once, by the project route.
 */
export async function bulkUpdateIssues(projectId: string, input: BulkUpdateIssuesInput, actorId: string) {
    const { issueIds, patch } = input;
    if (patch.columnId) await ensureColumnInProject(patch.columnId, projectId);
    if (patch.assigneeId) await ensureAssigneeInProject(patch.assigneeId, projectId);
    await ensureCategoriesInProject([...(patch.categoryIds ?? []), ...(patch.addCategoryIds ?? []), ...(patch.removeCategoryIds ?? [])], projectId);
    const current = await issuesInProject(projectId, issueIds);

    const values = Object.fromEntries(BULK_FIELDS.filter(([field]) => patch[field] !== undefined).map(([field]) => [field, patch[field]]));
    const touchesLabels = patch.categoryIds !== undefined || patch.addCategoryIds !== undefined || patch.removeCategoryIds !== undefined;
    const activities: Array<typeof issueActivities.$inferInsert> = [];
    const labelsToAdd: Array<{ issueId: string; categoryId: string }> = [];
    const labelsToRemove: Array<{ issueId: string; categoryId: string }> = [];
    for (const issue of current) {
        for (const [field, type] of BULK_FIELDS) {
            if (field in values && issue[field] !== values[field]) activities.push({ issueId: issue.id, actorId, type, payload: { field, from: issue[field], to: values[field] } });
        }
        if (!touchesLabels) continue;
        const { added, removed } = labelChanges(issue.categoryIds, nextLabels(issue.categoryIds, patch));
        for (const categoryId of added) {
            labelsToAdd.push({ issueId: issue.id, categoryId });
            activities.push({ issueId: issue.id, actorId, type: "label_added", payload: { categoryId } });
        }
        for (const categoryId of removed) {
            labelsToRemove.push({ issueId: issue.id, categoryId });
            activities.push({ issueId: issue.id, actorId, type: "label_removed", payload: { categoryId } });
        }
    }

    // Cards moved to another column go to its top, keeping the order they had among themselves.
    const moved = patch.columnId ? current.filter((issue) => issue.columnId !== patch.columnId).sort((a, b) => a.position - b.position || a.number - b.number) : [];
    const movedPositions = moved.length ? positionsAtTop(await topPositionInColumn(patch.columnId!, moved.map((issue) => issue.id)), moved.length) : [];

    await db.transaction(async (tx) => {
        await tx.update(issues).set({ ...values, updatedAt: new Date() }).where(and(eq(issues.projectId, projectId), inArray(issues.id, issueIds)));
        for (const [index, issue] of moved.entries()) await tx.update(issues).set({ position: movedPositions[index] }).where(eq(issues.id, issue.id));
        if (labelsToRemove.length > 0) {
            await tx.delete(issueLabels).where(or(...labelsToRemove.map((label) => and(eq(issueLabels.issueId, label.issueId), eq(issueLabels.categoryId, label.categoryId)))));
        }
        if (labelsToAdd.length > 0) await tx.insert(issueLabels).values(labelsToAdd).onConflictDoNothing();
        if (activities.length > 0) await tx.insert(issueActivities).values(activities);
    });
    for (const issueId of issueIds) publishChange("issue.updated", { projectId, id: issueId });

    // Notifications follow the saved change; a failure there is logged, not reported, like single edits.
    for (const issue of current) {
        await recordIssueChange(issue, {
            actorId,
            assigneeId: patch.assigneeId && patch.assigneeId !== issue.assigneeId ? patch.assigneeId : undefined,
            status: patch.columnId && patch.columnId !== issue.columnId ? { from: issue.columnId, to: patch.columnId } : undefined,
        });
    }

    const project = await db.query.projects.findFirst({ where: eq(projects.id, projectId), columns: { issueKey: true } });
    const updated = await issuesInProject(projectId, issueIds);
    return updated.map((issue) => ({ ...issue, identifier: `${project?.issueKey}-${issue.number}` }));
}

/**
 * Deletes several issues at once, or none. Sub-issues of a deleted issue must be deleted with it; otherwise the
 * request is refused, as for a single issue.
 */
export async function bulkDeleteIssues(projectId: string, issueIds: string[]) {
    await issuesInProject(projectId, issueIds);
    const selected = new Set(issueIds);
    const children = await db.query.issues.findMany({ where: and(inArray(issues.parentIssueId, issueIds), isNull(issues.deletedAt)), columns: { id: true } });
    if (children.some((child) => !selected.has(child.id))) throw new HttpError(409, "Reparent or delete the sub-issues before deleting this issue");

    const deletedAt = new Date();
    await db.update(issues).set({ deletedAt }).where(and(eq(issues.projectId, projectId), inArray(issues.id, issueIds)));
    for (const issueId of issueIds) publishChange("issue.deleted", { projectId, id: issueId });
    return { deletedAt: deletedAt.toISOString() };
}
