import { z } from "zod";
import { appBaseUrl } from "../../lib/app-url";
import { logFor } from "../../lib/request-context";
import { sendAdminResetLink } from "../auth/password.service";
import { asyncHandler } from "../../middleware/async-handler";
import { assertNotSelf, getAdminProject, getAdminUser, listAdminProjects, listAdminUsers, resetUserPassword, revokeUserSessions, updateAdminUser } from "./admin.service";

// Admins see every project, members included, so each look is recorded.
export const listProjects = asyncHandler(async (_req, res) => {
    logFor("audit").info({ event: "admin.projects_listed" }, "admin listed every project");
    res.json({ projects: await listAdminProjects() });
});

export const getProject = asyncHandler<{ projectId: string }>(async (req, res) => {
    const projectId = z.string().uuid().parse(req.params.projectId);
    logFor("audit").info({ event: "admin.project_viewed", projectId }, "admin viewed a project");
    res.json({ project: await getAdminProject(projectId) });
});

export const listUsers = asyncHandler(async (_req, res) => {
    logFor("audit").info({ event: "admin.users_listed" }, "admin listed every user");
    res.json({ users: await listAdminUsers() });
});

const userIdSchema = z.string().uuid();

export const getUser = asyncHandler<{ userId: string }>(async (req, res) => {
    const userId = userIdSchema.parse(req.params.userId);
    logFor("audit").info({ event: "admin.user_viewed", targetUserId: userId }, "admin viewed a user");
    res.json({ user: await getAdminUser(userId) });
});

const updateUserSchema = z.object({ isAdmin: z.boolean().optional(), suspended: z.boolean().optional() }).refine((value) => value.isAdmin !== undefined || value.suspended !== undefined);

export const updateUser = asyncHandler<{ userId: string }>(async (req, res) => {
    const userId = userIdSchema.parse(req.params.userId);
    const changes = updateUserSchema.parse(req.body);
    const user = await updateAdminUser(req.user!.sub, userId, changes);
    logFor("audit").warn({ event: "admin.user_updated", targetUserId: userId, ...changes }, "admin changed a user's access");
    res.json({ user });
});

export const revokeSessions = asyncHandler<{ userId: string }>(async (req, res) => {
    const userId = userIdSchema.parse(req.params.userId);
    await revokeUserSessions(req.user!.sub, userId);
    logFor("audit").warn({ event: "admin.user_sessions_revoked", targetUserId: userId }, "admin signed a user out everywhere");
    res.status(204).send();
});

export const resetPassword = asyncHandler<{ userId: string }>(async (req, res) => {
    const userId = userIdSchema.parse(req.params.userId);
    const password = await resetUserPassword(req.user!.sub, userId);
    logFor("audit").warn({ event: "admin.user_password_reset", targetUserId: userId }, "admin reset a user's password");
    res.json({ password });
});

export const sendResetLink = asyncHandler<{ userId: string }>(async (req, res) => {
    const userId = userIdSchema.parse(req.params.userId);
    assertNotSelf(req.user!.sub, userId);
    const sent = await sendAdminResetLink(userId, appBaseUrl(req));
    logFor("audit").warn({ event: "admin.user_reset_link_sent", targetUserId: userId }, "admin emailed a user a password reset link");
    res.json(sent);
});
