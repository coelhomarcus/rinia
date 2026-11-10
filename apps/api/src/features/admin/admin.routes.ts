import { Router } from "express";
import { requireAuth, requireSession } from "../../middleware/auth.middleware";
import { requireAdmin } from "../../middleware/admin.middleware";
import { getProject, getUser, listProjects, listUsers, resetPassword, revokeSessions, sendResetLink, updateUser } from "./admin.controller";

export const adminRouter = Router();

adminRouter.use(requireAuth, requireAdmin);
adminRouter.get("/projects", listProjects);
adminRouter.get("/projects/:projectId", getProject);
adminRouter.get("/users", listUsers);
adminRouter.get("/users/:userId", getUser);
// Acting on someone's account takes a signed-in admin, never a script holding an API token.
adminRouter.patch("/users/:userId", requireSession, updateUser);
adminRouter.post("/users/:userId/sessions/revoke", requireSession, revokeSessions);
adminRouter.post("/users/:userId/password", requireSession, resetPassword);
adminRouter.post("/users/:userId/password-reset-email", requireSession, sendResetLink);
