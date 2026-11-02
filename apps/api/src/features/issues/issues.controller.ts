import { bulkDeleteIssuesSchema, bulkUpdateIssuesSchema, commentReactionSchema, reactionEmojiSchema, createIssueCommentSchema, createIssueRelationSchema, createIssueSchema, issueListQuerySchema, updateIssueCommentSchema, updateIssueSchema } from "@rinia/shared";
import { z } from "zod";
import { asyncHandler } from "../../middleware/async-handler";
import { assertProjectMembership } from "../../middleware/project-membership.middleware";
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
    listIssues,
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
    res.json({ issues: await listIssues(req.params.projectId, query) });
});

export const create = asyncHandler<{ projectId: string }>(async (req, res) => {
    const issue = await createIssue(req.params.projectId, createIssueSchema.parse(req.body), req.user!.sub);
    res.status(201).json({ issue });
});

export const getOne = asyncHandler<{ issueIdentifier: string }>(async (req, res) => {
    const issue = await getIssueOrThrow(req.params.issueIdentifier);
    await assertProjectMembership(issue.projectId, req.user!.sub);
    res.json({ issue: { ...issue, identifier: issueIdentifier(issue) } });
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
    res.json(await bulkDeleteIssues(req.params.projectId, bulkDeleteIssuesSchema.parse(req.body).issueIds));
});

export const bulkRestore = asyncHandler<{ projectId: string }>(async (req, res) => {
    const { issueIds, deletedAt } = z.object({ issueIds: z.array(z.string().uuid()).min(1).max(100), deletedAt: z.string().datetime() }).parse(req.body);
    res.json(await restoreBulkIssues(req.params.projectId, issueIds, req.user!.sub, new Date(deletedAt)));
});
