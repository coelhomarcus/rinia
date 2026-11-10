import type { Request } from "express";
import rateLimit from "express-rate-limit";
import { logFor } from "../lib/request-context";

function logLimitHit(req: Request, limiter: "login" | "register" | "password") {
    logFor("auth").warn({ event: "auth.rate_limited", limiter, ip: req.ip }, `too many ${limiter} attempts`);
}

export const loginRateLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 10,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res) => {
        logLimitHit(req, "login");
        res.status(429).json({ error: "Too many login attempts. Try again in a few minutes.", code: "errors.tooManyLoginAttempts" });
    },
});

export const registerRateLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    limit: 5,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res) => {
        logLimitHit(req, "register");
        res.status(429).json({ error: "Too many registration attempts. Try again later.", code: "errors.tooManyRegistrationAttempts" });
    },
});

/** Asking for a reset link, using one, and changing a password from the profile share one budget. */
export const passwordRateLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 10,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res) => {
        logLimitHit(req, "password");
        res.status(429).json({ error: "Too many password attempts. Try again in a few minutes.", code: "errors.tooManyPasswordAttempts" });
    },
});
