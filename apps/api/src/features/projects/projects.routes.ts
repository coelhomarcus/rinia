import { Router } from "express";
import { documentParamsSchema } from "@rinia/shared";
import { asyncHandler } from "../../middleware/async-handler";
import { documentsRouter } from "../documents/documents.routes";
import { begin as beginUpload, chunk as uploadChunk, complete as completeUpload, list as listFiles, remove as removeFile, upload as uploadFile } from "../files/files.controller";
import { projectIssuesRouter } from "../issues/issues.routes";
import { categoriesRouter } from "../categories/categories.routes";
import { columnsRouter } from "../columns/columns.routes";
import { viewPreferencesRouter } from "../view-preferences/view-preferences.routes";
import { viewsRouter } from "../views/views.routes";
import { requireAuth, requireUnscopedToken } from "../../middleware/auth.middleware";
import { requireProjectMember, requireProjectPermission } from "../../middleware/project-membership.middleware";
import {
  addMember,
  lookupMember,
  create,
  getByKey,
  getOne,
  list,
  listMembers,
  remove,
  removeMember,
  stats,
  transfer,
  update,
  updateMember,
  updatePage,
} from "./projects.controller";

export const projectsRouter = Router();

projectsRouter.use(requireAuth);

projectsRouter.get("/", list);
projectsRouter.post("/", requireUnscopedToken, create);

projectsRouter.get("/by-key/:key", getByKey);
projectsRouter.get("/:projectId", requireProjectMember, getOne);
projectsRouter.patch("/:projectId", requireProjectPermission("project.update"), update);
projectsRouter.delete("/:projectId", requireProjectPermission("project.delete"), remove);
projectsRouter.post("/:projectId/transfer", requireProjectPermission("project.transfer"), transfer);
projectsRouter.patch("/:projectId/page", requireProjectPermission("project.page.update"), updatePage);
projectsRouter.get("/:projectId/stats", requireProjectPermission("project.stats"), stats);
projectsRouter.use(
  "/:projectId/documents",
  asyncHandler<{ projectId: string }>(async (req, _res, next) => {
    documentParamsSchema.shape.projectId.parse(req.params.projectId);
    next();
  }),
  requireProjectMember,
  documentsRouter,
);

projectsRouter.get("/:projectId/files", requireProjectMember, listFiles);
projectsRouter.post("/:projectId/files", requireProjectPermission("files.write"), uploadFile);
projectsRouter.delete("/:projectId/files/:fileId", requireProjectPermission("files.write"), removeFile);
projectsRouter.post("/:projectId/files/uploads", requireProjectPermission("files.write"), beginUpload);
projectsRouter.put("/:projectId/files/uploads/:uploadId", requireProjectPermission("files.write"), uploadChunk);
projectsRouter.post("/:projectId/files/uploads/:uploadId/complete", requireProjectPermission("files.write"), completeUpload);
projectsRouter.get("/:projectId/members", requireProjectMember, listMembers);
projectsRouter.get("/:projectId/members/lookup", requireProjectPermission("members.manage"), lookupMember);
projectsRouter.post("/:projectId/members", requireProjectPermission("members.manage"), addMember);
projectsRouter.patch("/:projectId/members/:userId", requireProjectPermission("members.manage"), updateMember);
projectsRouter.delete(
  "/:projectId/members/:userId",
  requireProjectPermission("members.manage"),
  removeMember,
);

projectsRouter.use("/:projectId/categories", categoriesRouter);
projectsRouter.use("/:projectId/columns", columnsRouter);
projectsRouter.use("/:projectId/issues", projectIssuesRouter);
projectsRouter.use("/:projectId/view-preference", viewPreferencesRouter);
projectsRouter.use("/:projectId/views", viewsRouter);
