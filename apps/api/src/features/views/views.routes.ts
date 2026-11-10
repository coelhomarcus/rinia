import { Router } from "express";
import { requireProjectPermissionByMethod } from "../../middleware/project-membership.middleware";
import { create, duplicate, list, remove, restore, update } from "./views.controller";

export const viewsRouter = Router({ mergeParams: true });

// Saving a view takes `views.create`; sharing one and managing others' shared views are checked by the service.
viewsRouter.use(requireProjectPermissionByMethod("project.read", "views.create"));

viewsRouter.get("/", list);
viewsRouter.post("/", create);
viewsRouter.patch("/:viewId", update);
viewsRouter.delete("/:viewId", remove);
viewsRouter.post("/:viewId/restore", restore);
viewsRouter.post("/:viewId/duplicate", duplicate);
