import type { NextFunction, Request, Response } from "express";
import { authenticateApiToken } from "../features/api-tokens/api-tokens.service";
import { sessionUser } from "../features/auth/auth.service";
import { SESSION_COOKIE_NAME } from "../lib/cookies";
import { verifyToken } from "../lib/jwt";
import { identifyRequest, logFor } from "../lib/request-context";
import { asyncHandler } from "./async-handler";

/** The token in `Authorization: Bearer <token>`, "" for a bearer header without one, or undefined without a bearer header. */
export function bearerToken(header: string | undefined): string | undefined {
    const match = /^Bearer(?:\s+(.*))?$/i.exec(header?.trim() ?? "");
    return match ? (match[1] ?? "").trim() : undefined;
}

/** Methods that only read. A read-only token may send these and nothing else. */
const READ_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * Accepts the session cookie or an API token. A request that sends a token is judged by the token alone, so a
 * revoked token fails even from a browser that also holds a session. A read-only token is refused anything but
 * reading; the MCP endpoint, where every call is a POST, sorts its tools by `req.tokenAccess` instead.
 */
export const requireAuth = asyncHandler(async (req, res, next) => {
    const apiToken = bearerToken(req.get("authorization"));
    if (apiToken !== undefined) {
        const authenticated = apiToken ? await authenticateApiToken(apiToken) : null;
        if (!authenticated) {
            logFor("auth").warn({ event: "auth.token_rejected", ip: req.ip, empty: !apiToken }, "invalid or revoked API token used");
            res.status(401).json({ error: "Invalid or revoked API token", code: "errors.invalidSession" });
            return;
        }
        req.user = authenticated.user;
        req.authMethod = "token";
        req.tokenAccess = authenticated.access;
        identifyRequest(req);
        if (authenticated.access === "read" && !READ_METHODS.has(req.method) && !req.baseUrl.startsWith("/api/mcp")) {
            logFor("audit").warn({ event: "permission.denied", reason: "read_only_token", method: req.method }, "read-only API token used to change something");
            res.status(403).json({ error: "This API token can only read", code: "errors.permissionDenied" });
            return;
        }
        next();
        return;
    }

    const token = req.cookies?.[SESSION_COOKIE_NAME] as string | undefined;

    if (!token) {
        res.status(401).json({ error: "Not authenticated", code: "errors.notAuthenticated" });
        return;
    }

    let session;
    try {
        session = verifyToken(token);
    } catch {
        res.status(401).json({ error: "Invalid or expired session", code: "errors.invalidSession" });
        return;
    }
    // A suspended account, or one an admin signed out everywhere, loses its sessions at once.
    const user = await sessionUser(session);
    if (!user) {
        logFor("auth").warn({ event: "auth.session_rejected", userId: session.sub, ip: req.ip }, "session of a suspended, signed-out or deleted account used");
        res.status(401).json({ error: "Invalid or expired session", code: "errors.invalidSession" });
        return;
    }
    req.user = user;
    req.authMethod = "session";
    identifyRequest(req);
    next();
});

/** For actions only a signed-in person may take, never a script holding an API token. Runs after `requireAuth`. */
export function requireSession(req: Request, res: Response, next: NextFunction): void {
    if (req.authMethod !== "session") {
        logFor("audit").warn({ event: "permission.denied", reason: "session_required" }, "API token used where a session is required");
        res.status(403).json({ error: "API tokens cannot do this", code: "errors.permissionDenied" });
        return;
    }
    next();
}
