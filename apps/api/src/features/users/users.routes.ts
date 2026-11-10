import { Router } from "express";
import { requireAuth, requireSession } from "../../middleware/auth.middleware";
import { passwordRateLimiter } from "../../middleware/rate-limit.middleware";
import { deleteEmailChange, downloadAvatar, getEmailChange, removeAvatar, startEmailChange, updateLocale, updateMe, updatePassword, uploadAvatar } from "./users.controller";

export const usersRouter = Router();

usersRouter.use(requireAuth);
usersRouter.patch("/me", updateMe);
usersRouter.patch("/me/locale", updateLocale);
usersRouter.put("/me/password", requireSession, passwordRateLimiter, updatePassword);
usersRouter.get("/me/email-change", getEmailChange);
usersRouter.post("/me/email-change", requireSession, passwordRateLimiter, startEmailChange);
usersRouter.delete("/me/email-change", requireSession, deleteEmailChange);
usersRouter.put("/me/avatar", uploadAvatar);
usersRouter.delete("/me/avatar", removeAvatar);
usersRouter.get("/:userId/avatar", downloadAvatar);
