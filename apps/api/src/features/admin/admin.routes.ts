import { Router } from "express";
import { requireAuth } from "../../middleware/auth.middleware";
import { requireAdmin } from "../../middleware/admin.middleware";
import { getProject, listProjects } from "./admin.controller";

export const adminRouter = Router();

adminRouter.use(requireAuth, requireAdmin);
adminRouter.get("/projects", listProjects);
adminRouter.get("/projects/:projectId", getProject);
