import { Router } from "express";
import { requireAuth } from "../../middleware/auth.middleware";
import { download } from "./files.controller";

export const filesRouter = Router();
filesRouter.use(requireAuth);
filesRouter.get("/:fileId", download);
