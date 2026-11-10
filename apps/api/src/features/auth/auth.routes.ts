import { Router } from "express";
import { requireAuth } from "../../middleware/auth.middleware";
import { loginRateLimiter, passwordRateLimiter, registerRateLimiter } from "../../middleware/rate-limit.middleware";
import { confirmEmail, forgotPassword, login, logout, me, options, register, resetPasswordWithLink } from "./auth.controller";

export const authRouter = Router();

authRouter.post("/register", registerRateLimiter, register);
authRouter.post("/login", loginRateLimiter, login);
authRouter.post("/logout", logout);
authRouter.get("/me", requireAuth, me);
authRouter.get("/options", options);
authRouter.post("/forgot-password", passwordRateLimiter, forgotPassword);
authRouter.post("/reset-password", passwordRateLimiter, resetPasswordWithLink);
authRouter.post("/confirm-email", passwordRateLimiter, confirmEmail);
