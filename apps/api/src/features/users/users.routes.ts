import { Router } from "express";
import { requireAuth } from "../../middleware/auth.middleware";
import { downloadAvatar, removeAvatar, updateLocale, updateMe, uploadAvatar } from "./users.controller";

export const usersRouter = Router();

usersRouter.use(requireAuth);
usersRouter.patch("/me", updateMe);
usersRouter.patch("/me/locale", updateLocale);
usersRouter.put("/me/avatar", uploadAvatar);
usersRouter.delete("/me/avatar", removeAvatar);
usersRouter.get("/:userId/avatar", downloadAvatar);
