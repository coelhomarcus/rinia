import { Router } from "express";
import { requireProjectPermissionByMethod } from "../../middleware/project-membership.middleware";
import { create, list, remove, update } from "./categories.controller";

export const categoriesRouter = Router({ mergeParams: true });

// Editors create labels and change their own; changing anyone's takes `labels.manage`, checked by the service.
categoriesRouter.use(requireProjectPermissionByMethod("project.read", "labels.create"));

categoriesRouter.get("/", list);
categoriesRouter.post("/", create);
categoriesRouter.patch("/:categoryId", update);
categoriesRouter.delete("/:categoryId", remove);
