import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";
import { REALTIME_CLIENT_HEADER } from "@rinia/shared";
import type { NextFunction, Request, Response } from "express";
import { type Logger, logger } from "./logger";

const storage = new AsyncLocalStorage<Request>();

export const REQUEST_ID_HEADER = "X-Request-Id";
/** An id a proxy or client sent is kept when it is short and plain, so it can be searched for in both their logs and ours. */
const VALID_REQUEST_ID = /^[A-Za-z0-9._:-]{8,128}$/;

/**
 * Gives the request an id, from `X-Request-Id` or a new one, returns it in the response header, and a logger that
 * carries it. Runs first, so even a body that fails to parse is logged with its id.
 */
export function assignRequestId(req: Request, res: Response, next: NextFunction): void {
    const sent = req.get(REQUEST_ID_HEADER);
    req.id = sent && VALID_REQUEST_ID.test(sent) ? sent : randomUUID();
    req.log = logger.child({ requestId: req.id });
    res.set(REQUEST_ID_HEADER, req.id);
    next();
}

/** Keeps the request reachable from services, so realtime events can say who made a change and logs which request they belong to. */
export function requestContext(req: Request, _res: Response, next: NextFunction): void {
    storage.run(req, next);
}

/** Adds who is signed in to the request's logger. Called by `requireAuth`. */
export function identifyRequest(req: Request): void {
    if (!req.user) return;
    req.log = (req.log ?? logger).child({ userId: req.user.sub, authMethod: req.authMethod });
}

/** The current request's logger, with its id and user, or the process logger outside a request. */
export function currentLogger(): Logger {
    return storage.getStore()?.log ?? logger;
}

/** `currentLogger()` tagged with the part of the API writing, such as `notifications` or `auth`. */
export function logFor(module: string): Logger {
    return currentLogger().child({ module });
}

/**
 * The projects the current request's API token is limited to, or null when it may reach all of them: a session, a
 * token without a scope, or no request at all. It applies only to the token's own user, so a service that looks at
 * someone else (a notification's recipients, say) is not narrowed by the person who made the request.
 */
export function tokenProjectScope(userId?: string): readonly string[] | null {
    const req = storage.getStore();
    if (!req?.tokenProjectIds) return null;
    return userId === undefined || req.user?.sub === userId ? req.tokenProjectIds : null;
}

/** Who caused the change being handled: the signed-in user and the tab they sent it from. Both are null outside a request. */
export function currentOrigin(): { actorId: string | null; clientId: string | null } {
    const req = storage.getStore();
    const clientId = req?.get(REALTIME_CLIENT_HEADER);
    return { actorId: req?.user?.sub ?? null, clientId: clientId && clientId.length <= 64 ? clientId : null };
}
