import { Router } from "express";
import { requireAuth, requireSession } from "../../middleware/auth.middleware";
import { loginRateLimiter, passwordRateLimiter, registerRateLimiter } from "../../middleware/rate-limit.middleware";
import { confirmEmail, forgotPassword, login, logout, me, options, register, resetPasswordWithLink, revokeOtherSessions, revokeSession, sessionsList } from "./auth.controller";

export const authRouter = Router();

authRouter.post("/register", registerRateLimiter, register);
authRouter.post("/login", loginRateLimiter, login);
authRouter.post("/logout", logout);
authRouter.get("/me", requireAuth, me);
authRouter.get("/options", options);
authRouter.post("/forgot-password", passwordRateLimiter, forgotPassword);
authRouter.post("/reset-password", passwordRateLimiter, resetPasswordWithLink);
authRouter.post("/confirm-email", passwordRateLimiter, confirmEmail);
// Sessions are managed from a signed-in browser, never with an API token.
authRouter.get("/sessions", requireAuth, requireSession, sessionsList);
authRouter.post("/sessions/revoke-others", requireAuth, requireSession, revokeOtherSessions);
authRouter.delete("/sessions/:sessionId", requireAuth, requireSession, revokeSession);
