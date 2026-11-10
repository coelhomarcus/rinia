import { shareWithGuestSchema, bulkDeleteIssuesSchema, bulkUpdateIssuesSchema, commentReactionSchema, reactionEmojiSchema, createIssueCommentSchema, createIssueRelationSchema, createIssueSchema, issueListQuerySchema, updateIssueCommentSchema, updateIssueSchema } from "@rinia/shared";
import { inArray } from "drizzle-orm";
import { z } from "zod";
import { db } from "../../db";
import { issues } from "../../db/schema";
import { asyncHandler } from "../../middleware/async-handler";
import { assertIssueAccess, guestSeesIssue } from "../../lib/guest-access";
import { roleOf } from "../../middleware/project-membership.middleware";
import { listIssueShares, shareIssue, unshareIssue } from "../shares/shares.service";
import {
    addCommentReaction,
    bulkDeleteIssues,
    bulkUpdateIssues,
    createIssue,
    createIssueComment,
    createIssueRelation,
    deleteIssue,
    deleteIssueComment,
    deleteIssueRelation,
    getIssueOrThrow,
    listDescriptionRevisions,
    listIssueActivity,
    listIssueComments,
    listIssueRelations,
    listIssuePage,
    removeCommentReaction,
    restoreIssue,
    restoreIssueComment,
    restoreBulkIssues,
    restoreDescriptionRevision,
    updateIssue,
    updateIssueComment,
    issueIdentifier,
} from "./issues.service";

export const list = asyncHandler<{ projectId: string }>(async (req, res) => {
    const query = issueListQuerySchema.parse(req.query);
    res.json(await listIssuePage(req.params.projectId, query, { userId: req.user!.sub, role: roleOf(req) }));
});

export const create = asyncHandler<{ projectId: string }>(async (req, res) => {
    const issue = await createIssue(req.params.projectId, createIssueSchema.parse(req.body), req.user!.sub);
    res.status(201).json({ issue });
});

export const getOne = asyncHandler<{ issueIdentifier: string }>(async (req, res) => {
    const issue = await getIssueOrThrow(req.params.issueIdentifier);
    const role = await assertIssueAccess(req.user!.sub, issue);
    res.json({ issue: { ...(role === "guest" ? await forGuest(issue, req.user!.sub) : issue), identifier: issueIdentifier(issue) } });
});

/** A guest sees the parent and sub-issues only when those were shared with them too. */
async function forGuest<T extends { parent: { id: string } | null; children: Array<{ id: string }> }>(issue: T, userId: string): Promise<T> {
    const ids = [...(issue.parent ? [issue.parent.id] : []), ...issue.children.map((child) => child.id)];
    const relatives = ids.length ? await db.query.issues.findMany({ where: inArray(issues.id, ids), columns: { id: true, assigneeId: true } }) : [];
    const seen = new Set<string>();
    for (const relative of relatives) if (await guestSeesIssue(userId, relative)) seen.add(relative.id);
    return { ...issue, parent: issue.parent && seen.has(issue.parent.id) ? issue.parent : null, children: issue.children.filter((child) => seen.has(child.id)) };
}

/** Who an issue is shared with. Only guests need it; everyone else already sees the issue. */
async function shareableIssue(identifier: string, userId: string) {
    const issue = await getIssueOrThrow(identifier);
    await assertIssueAccess(userId, issue, "shares.manage");
    return issue;
}

export const shares = asyncHandler<{ issueIdentifier: string }>(async (req, res) => {
    const issue = await shareableIssue(req.params.issueIdentifier, req.user!.sub);
    res.json({ shares: await listIssueShares(issue.id) });
});

export const addShare = asyncHandler<{ issueIdentifier: string }>(async (req, res) => {
    const issue = await shareableIssue(req.params.issueIdentifier, req.user!.sub);
    const { userId } = shareWithGuestSchema.parse(req.body);
    res.status(201).json({ share: await shareIssue(issue, userId, req.user!.sub) });
});

export const removeShare = asyncHandler<{ issueIdentifier: string; userId: string }>(async (req, res) => {
    const issue = await shareableIssue(req.params.issueIdentifier, req.user!.sub);
    await unshareIssue(issue, z.string().uuid().parse(req.params.userId));
    res.status(204).send();
});

export const update = asyncHandler<{ issueIdentifier: string }>(async (req, res) => {
    const issue = await updateIssue(req.params.issueIdentifier, updateIssueSchema.parse(req.body), req.user!.sub);
    res.json({ issue });
});

export const remove = asyncHandler<{ issueIdentifier: string }>(async (req, res) => {
    res.json(await deleteIssue(req.params.issueIdentifier, req.user!.sub));
});

export const restore = asyncHandler<{ issueIdentifier: string }>(async (req, res) => {
    const { deletedAt } = z.object({ deletedAt: z.string().datetime() }).parse(req.body);
    res.json(await restoreIssue(req.params.issueIdentifier, req.user!.sub, new Date(deletedAt)));
});

export const comments = asyncHandler<{ issueIdentifier: string }>(async (req, res) => {
    res.json({ comments: await listIssueComments(req.params.issueIdentifier, req.user!.sub) });
});

export const addComment = asyncHandler<{ issueIdentifier: string }>(async (req, res) => {
    res.status(201).json({ comment: await createIssueComment(req.params.issueIdentifier, createIssueCommentSchema.parse(req.body), req.user!.sub) });
});

export const activity = asyncHandler<{ issueIdentifier: string }>(async (req, res) => {
    res.json({ activity: await listIssueActivity(req.params.issueIdentifier, req.user!.sub) });
});

export const relations = asyncHandler<{ issueIdentifier: string }>(async (req, res) => {
    res.json({ relations: await listIssueRelations(req.params.issueIdentifier, req.user!.sub) });
});

export const addRelation = asyncHandler<{ issueIdentifier: string }>(async (req, res) => {
    res.status(201).json({ relation: await createIssueRelation(req.params.issueIdentifier, createIssueRelationSchema.parse(req.body), req.user!.sub) });
});

export const patchComment = asyncHandler<{ commentId: string }>(async (req, res) => {
    res.json({ comment: await updateIssueComment(req.params.commentId, updateIssueCommentSchema.parse(req.body), req.user!.sub) });
});

export const removeComment = asyncHandler<{ commentId: string }>(async (req, res) => {
    res.json(await deleteIssueComment(req.params.commentId, req.user!.sub));
});

export const restoreComment = asyncHandler<{ commentId: string }>(async (req, res) => {
    const { deletedAt } = z.object({ deletedAt: z.string().datetime() }).parse(req.body);
    res.json(await restoreIssueComment(req.params.commentId, req.user!.sub, new Date(deletedAt)));
});

export const removeRelation = asyncHandler<{ relationId: string }>(async (req, res) => {
    await deleteIssueRelation(req.params.relationId, req.user!.sub);
    res.status(204).send();
});

export const addReaction = asyncHandler<{ commentId: string }>(async (req, res) => {
    const { emoji } = commentReactionSchema.parse(req.body);
    res.status(201).json({ reactions: await addCommentReaction(z.string().uuid().parse(req.params.commentId), emoji, req.user!.sub) });
});

export const removeReaction = asyncHandler<{ commentId: string; emoji: string }>(async (req, res) => {
    res.json({ reactions: await removeCommentReaction(z.string().uuid().parse(req.params.commentId), reactionEmojiSchema.parse(req.params.emoji), req.user!.sub) });
});

export const descriptionRevisions = asyncHandler<{ issueIdentifier: string }>(async (req, res) => {
    res.json({ revisions: await listDescriptionRevisions(req.params.issueIdentifier, req.user!.sub) });
});

export const restoreDescription = asyncHandler<{ issueIdentifier: string; revisionId: string }>(async (req, res) => {
    res.json({ issue: await restoreDescriptionRevision(req.params.issueIdentifier, z.string().uuid().parse(req.params.revisionId), req.user!.sub) });
});

export const bulkUpdate = asyncHandler<{ projectId: string }>(async (req, res) => {
    res.json({ issues: await bulkUpdateIssues(req.params.projectId, bulkUpdateIssuesSchema.parse(req.body), req.user!.sub) });
});

export const bulkDelete = asyncHandler<{ projectId: string }>(async (req, res) => {
    res.json(await bulkDeleteIssues(req.params.projectId, bulkDeleteIssuesSchema.parse(req.body).issueIds, req.user!.sub));
});

export const bulkRestore = asyncHandler<{ projectId: string }>(async (req, res) => {
    const { issueIds, deletedAt } = z.object({ issueIds: z.array(z.string().uuid()).min(1).max(100), deletedAt: z.string().datetime() }).parse(req.body);
    res.json(await restoreBulkIssues(req.params.projectId, issueIds, req.user!.sub, new Date(deletedAt)));
});
