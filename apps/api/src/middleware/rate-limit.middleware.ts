import type { NextFunction, Request, Response } from "express";
import rateLimit from "express-rate-limit";
import { consumeRateLimit, requestRateGroup, type RateGroup } from "../lib/rate-limit";
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

const LIMITED = "Too many requests. Please try again later.";

export function rejectLimited(req: Request, res: Response, group: RateGroup, retryAfterSeconds: number) {
    logFor("auth").warn({ event: "rate_limited", limiter: group, ip: req.ip, userId: req.user?.sub }, `too many ${group} requests`);
    res.setHeader("Retry-After", String(retryAfterSeconds));
    res.status(429).json({ error: LIMITED, code: "errors.requestLimit" });
}

/** Spends the budget for this route after the caller is known. Reads are free. */
export function enforceRequestLimit(req: Request, res: Response): boolean {
    const group = requestRateGroup(req.method, req.originalUrl || `${req.baseUrl}${req.path}`);
    if (!group || group === "oauth") return true;
    const hit = consumeRateLimit(group, req.user?.sub ?? req.ip ?? "unknown");
    if (hit.allowed) return true;
    rejectLimited(req, res, group, hit.retryAfterSeconds);
    return false;
}

/** OAuth registration, consent and tokens are keyed by IP: most of them have no signed-in user yet. */
export function limitRoute(group: RateGroup) {
    return (req: Request, res: Response, next: NextFunction) => {
        const hit = consumeRateLimit(group, req.ip ?? "unknown");
        if (hit.allowed) return next();
        rejectLimited(req, res, group, hit.retryAfterSeconds);
    };
}

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
