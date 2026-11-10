import { Router } from "express";
import { requireAuth } from "../../middleware/auth.middleware";
import { requireProjectPermissionByMethod } from "../../middleware/project-membership.middleware";
import { follow, subscription, unfollow } from "../notifications/notifications.controller";
import { addComment, addReaction, addShare, removeShare, shares, bulkDelete, bulkRestore, bulkUpdate, addRelation, activity, comments, create, descriptionRevisions, getOne, list, patchComment, relations, remove, removeComment, removeReaction, removeRelation, restore, restoreComment, restoreDescription, update } from "./issues.controller";

export const projectIssuesRouter = Router({ mergeParams: true });
// Reading the list is open to every role (a guest gets only their issues); every other route here changes issues.
projectIssuesRouter.use(requireProjectPermissionByMethod("project.read", "issues.write"));
projectIssuesRouter.get("/", list);
projectIssuesRouter.post("/", create);
projectIssuesRouter.patch("/bulk", bulkUpdate);
projectIssuesRouter.post("/bulk-delete", bulkDelete);
projectIssuesRouter.post("/bulk-restore", bulkRestore);

export const issuesRouter = Router();
issuesRouter.use(requireAuth);
issuesRouter.get("/:issueIdentifier", getOne);
issuesRouter.patch("/:issueIdentifier", update);
issuesRouter.delete("/:issueIdentifier", remove);
issuesRouter.post("/:issueIdentifier/restore", restore);
issuesRouter.get("/:issueIdentifier/comments", comments);
issuesRouter.post("/:issueIdentifier/comments", addComment);
issuesRouter.get("/:issueIdentifier/activity", activity);
issuesRouter.get("/:issueIdentifier/relations", relations);
issuesRouter.post("/:issueIdentifier/relations", addRelation);
issuesRouter.get("/:issueIdentifier/description-revisions", descriptionRevisions);
issuesRouter.post("/:issueIdentifier/description-revisions/:revisionId/restore", restoreDescription);
issuesRouter.get("/:issueIdentifier/subscription", subscription);
issuesRouter.put("/:issueIdentifier/subscription", follow);
issuesRouter.delete("/:issueIdentifier/subscription", unfollow);
issuesRouter.get("/:issueIdentifier/shares", shares);
issuesRouter.post("/:issueIdentifier/shares", addShare);
issuesRouter.delete("/:issueIdentifier/shares/:userId", removeShare);

export const issueCommentsRouter = Router();
issueCommentsRouter.use(requireAuth);
issueCommentsRouter.patch("/:commentId", patchComment);
issueCommentsRouter.delete("/:commentId", removeComment);
issueCommentsRouter.post("/:commentId/restore", restoreComment);
issueCommentsRouter.post("/:commentId/reactions", addReaction);
issueCommentsRouter.delete("/:commentId/reactions/:emoji", removeReaction);

export const issueRelationsRouter = Router();
issueRelationsRouter.use(requireAuth);
issueRelationsRouter.delete("/:relationId", removeRelation);
