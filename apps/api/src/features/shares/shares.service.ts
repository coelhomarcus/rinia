import type { RealtimeChannel } from "@rinia/shared";
import { and, asc, eq, isNull } from "drizzle-orm";
import { db } from "../../db";
import { projectDocuments, projectMembers, projectShares } from "../../db/schema";
import { HttpError } from "../../lib/http-error";
import { logFor } from "../../lib/request-context";
import { publishChange, realtimeHub } from "../realtime/realtime.service";

const PERSON = { id: true, name: true, username: true, avatarUrl: true } as const;

/** Only a guest needs a share: everyone else in the project already sees every issue and page. */
async function assertGuest(projectId: string, userId: string) {
    const member = await db.query.projectMembers.findFirst({ where: and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, userId)), columns: { role: true } });
    if (!member) throw new HttpError(400, "User is not a member of this project");
    if (member.role !== "guest") throw new HttpError(400, "Only guests need an issue or page shared with them");
}

function listShares(where: ReturnType<typeof and>) {
    return db.query.projectShares
        .findMany({ where, orderBy: [asc(projectShares.createdAt)], with: { user: { columns: PERSON } } })
        .then((rows) => rows.map((row) => ({ id: row.id, user: row.user, sharedBy: row.sharedBy, createdAt: row.createdAt })));
}

async function share(target: { projectId: string; issueId?: string; documentId?: string }, userId: string, actorId: string) {
    await assertGuest(target.projectId, userId);
    const [row] = await db
        .insert(projectShares)
        .values({ projectId: target.projectId, userId, issueId: target.issueId ?? null, documentId: target.documentId ?? null, sharedBy: actorId })
        .onConflictDoNothing()
        .returning();
    if (row) {
        publishChange("share.created", { projectId: target.projectId, id: row.id, ...(target.issueId && { issueId: target.issueId }) });
        logFor("audit").info({ event: "share.created", projectId: target.projectId, userId, issueId: target.issueId, documentId: target.documentId }, "shared with a guest");
    }
    const [shared] = await listShares(and(eq(projectShares.userId, userId), target.issueId ? eq(projectShares.issueId, target.issueId) : eq(projectShares.documentId, target.documentId!)));
    return shared;
}

async function unshare(target: { projectId: string; issueId?: string; documentId?: string; assigneeId?: string | null }, userId: string) {
    const [row] = await db
        .delete(projectShares)
        .where(and(eq(projectShares.projectId, target.projectId), eq(projectShares.userId, userId), target.issueId ? eq(projectShares.issueId, target.issueId) : eq(projectShares.documentId, target.documentId!)))
        .returning({ id: projectShares.id });
    if (!row) throw new HttpError(404, "Share not found");
    publishChange("share.deleted", { projectId: target.projectId, id: row.id, ...(target.issueId && { issueId: target.issueId }) });
    logFor("audit").info({ event: "share.deleted", projectId: target.projectId, userId, issueId: target.issueId, documentId: target.documentId }, "unshared from a guest");
    // A guest with the issue or page open stops receiving it. An issue assigned to them stays theirs to see.
    if (target.assigneeId === userId) return;
    const channel: RealtimeChannel = target.issueId ? `issue:${target.issueId}` : `document:${target.documentId}`;
    realtimeHub.revokeChannel(userId, channel);
}

export const listIssueShares = (issueId: string) => listShares(eq(projectShares.issueId, issueId));
export const shareIssue = (issue: { id: string; projectId: string }, userId: string, actorId: string) => share({ projectId: issue.projectId, issueId: issue.id }, userId, actorId);
export const unshareIssue = (issue: { id: string; projectId: string; assigneeId: string | null }, userId: string) => unshare({ projectId: issue.projectId, issueId: issue.id, assigneeId: issue.assigneeId }, userId);

async function assertDocumentInProject(projectId: string, documentId: string) {
    const document = await db.query.projectDocuments.findFirst({ where: and(eq(projectDocuments.id, documentId), eq(projectDocuments.projectId, projectId), isNull(projectDocuments.deletedAt)), columns: { id: true } });
    if (!document) throw new HttpError(404, "Document not found");
}

export async function listDocumentShares(projectId: string, documentId: string) {
    await assertDocumentInProject(projectId, documentId);
    return listShares(eq(projectShares.documentId, documentId));
}

export async function shareDocument(projectId: string, documentId: string, userId: string, actorId: string) {
    await assertDocumentInProject(projectId, documentId);
    return share({ projectId, documentId }, userId, actorId);
}

export const unshareDocument = (projectId: string, documentId: string, userId: string) => unshare({ projectId, documentId }, userId);
