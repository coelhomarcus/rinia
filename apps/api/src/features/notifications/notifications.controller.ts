import { myIssuesQuerySchema, updateNotificationSchema } from "@rinia/shared";
import { z } from "zod";
import { asyncHandler } from "../../middleware/async-handler";
import { assertProjectMembership } from "../../middleware/project-membership.middleware";
import { getIssueOrThrow, listMyIssues } from "../issues/issues.service";
import { countUnreadNotifications, followIssue, isFollowingIssue, listNotifications, markAllNotificationsRead, setNotificationRead, unfollowIssue } from "./notifications.service";

export const list = asyncHandler(async (req, res) => {
    res.json({ notifications: await listNotifications(req.user!.sub) });
});

export const unreadCount = asyncHandler(async (req, res) => {
    res.json({ count: await countUnreadNotifications(req.user!.sub) });
});

export const update = asyncHandler<{ notificationId: string }>(async (req, res) => {
    const { read } = updateNotificationSchema.parse(req.body);
    res.json({ notification: await setNotificationRead(req.user!.sub, z.string().uuid().parse(req.params.notificationId), read) });
});

export const readAll = asyncHandler(async (req, res) => {
    await markAllNotificationsRead(req.user!.sub);
    res.status(204).end();
});

export const myIssues = asyncHandler(async (req, res) => {
    res.json({ issues: await listMyIssues(req.user!.sub, myIssuesQuerySchema.parse(req.query)) });
});

/** Following is per issue and needs access to its project, like reading the issue does. */
async function followableIssue(identifier: string, userId: string) {
    const issue = await getIssueOrThrow(identifier);
    await assertProjectMembership(issue.projectId, userId);
    return issue;
}

export const subscription = asyncHandler<{ issueIdentifier: string }>(async (req, res) => {
    const issue = await followableIssue(req.params.issueIdentifier, req.user!.sub);
    res.json({ subscription: { following: await isFollowingIssue(req.user!.sub, issue.id) } });
});

export const follow = asyncHandler<{ issueIdentifier: string }>(async (req, res) => {
    const issue = await followableIssue(req.params.issueIdentifier, req.user!.sub);
    await followIssue(req.user!.sub, issue.id);
    res.json({ subscription: { following: true } });
});

export const unfollow = asyncHandler<{ issueIdentifier: string }>(async (req, res) => {
    const issue = await followableIssue(req.params.issueIdentifier, req.user!.sub);
    await unfollowIssue(req.user!.sub, issue.id);
    res.json({ subscription: { following: false } });
});
