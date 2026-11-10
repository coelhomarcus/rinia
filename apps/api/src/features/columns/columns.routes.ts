import { Router } from "express";
import { requireProjectPermissionByMethod } from "../../middleware/project-membership.middleware";
import { create, list, remove, update } from "./columns.controller";

export const columnsRouter = Router({ mergeParams: true });

// Every role reads the states; only managers change them.
columnsRouter.use(requireProjectPermissionByMethod("project.read", "states.manage"));

columnsRouter.get("/", list);
columnsRouter.post("/", create);
columnsRouter.patch("/:columnId", update);
columnsRouter.delete("/:columnId", remove);
