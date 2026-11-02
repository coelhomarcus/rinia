import type { NextFunction, Request, Response } from "express";
import type { Level } from "pino";
import { env } from "../config/env";

/** Only API calls are logged: the health check would drown the rest, and static files say nothing about a failure. */
export function isLoggedPath(path: string): boolean {
    return path.startsWith("/api/") && path !== "/api/health";
}

/** Server errors are errors and client mistakes warnings, except a missing session or page, which happen all day. */
export function accessLogLevel(status: number): Level {
    if (status >= 500) return "error";
    if (status >= 400 && status !== 401 && status !== 404) return "warn";
    return "info";
}

/**
 * The matched route as a pattern, such as `/api/projects/:projectId/issues/:issueId`. Express sets `req.route` when a
 * route matches, under `req.baseUrl`, the path its router is mounted at. That path holds the real values of a mount's
 * params (`/:projectId/issues` is mounted at `/api/projects/8b2d…/issues`), so each value Express sets in `req.params`
 * is remembered and turned back into its name. Both are read as they are set: by the time the response finishes, an
 * error may have unwound the routers.
 */
function trackRoutePattern(req: Request): () => string | undefined {
    let route: Request["route"];
    let params: Request["params"] = req.params;
    let pattern: string | undefined;
    const names = new Map<string, string>();
    Object.defineProperty(req, "params", {
        configurable: true,
        enumerable: true,
        get: () => params,
        set: (value: Request["params"]) => {
            params = value;
            for (const [name, param] of Object.entries(value ?? {})) if (typeof param === "string" && param) names.set(param, name);
        },
    });
    Object.defineProperty(req, "route", {
        configurable: true,
        enumerable: true,
        get: () => route,
        set: (value: Request["route"]) => {
            route = value;
            const base = req.baseUrl
                .split("/")
                .map((segment) => {
                    const name = names.get(safeDecode(segment));
                    return name ? `:${name}` : segment;
                })
                .join("/");
            const path = `${base}${typeof value?.path === "string" ? value.path : ""}`;
            pattern = path.length > 1 ? path.replace(/\/$/, "") : path;
        },
    });
    return () => pattern;
}

function safeDecode(segment: string) {
    try {
        return decodeURIComponent(segment);
    } catch {
        return segment;
    }
}

/**
 * One `http.request` line per finished API call: the route pattern rather than the URL, so ids and queries stay out,
 * with status, duration, size and who called. A call slower than `slowRequestMs` is a warning whatever its status.
 */
export function accessLog({ slowRequestMs = env.SLOW_REQUEST_MS } = {}) {
    return (req: Request, res: Response, next: NextFunction): void => {
        // Read now: a router mounted at a prefix would show only the rest of the path.
        const path = req.path;
        if (!isLoggedPath(path)) return next();
        const started = performance.now();
        const routePattern = trackRoutePattern(req);
        let logged = false;
        const log = () => {
            if (logged) return;
            logged = true;
            const durationMs = Math.round((performance.now() - started) * 10) / 10;
            const slow = durationMs > slowRequestMs;
            const status = res.statusCode;
            const byStatus = accessLogLevel(status);
            const level = slow && byStatus === "info" ? "warn" : byStatus;
            const route = routePattern();
            const contentLength = Number(res.get("content-length"));
            req.log[level](
                {
                    event: "http.request",
                    method: req.method,
                    route: route ?? null,
                    // Without a matching route there is no pattern; the path alone, without its query, shows what was asked for.
                    ...(route ? {} : { path }),
                    status,
                    durationMs,
                    contentLength: Number.isFinite(contentLength) ? contentLength : undefined,
                    ip: req.ip,
                    userAgent: req.get("user-agent"),
                    userId: req.user?.sub,
                    ...(slow ? { slow: true } : {}),
                    ...(res.writableFinished ? {} : { aborted: true }),
                },
                `${req.method} ${route ?? path} ${status} ${Math.round(durationMs)}ms`,
            );
        };
        res.once("finish", log);
        res.once("close", log);
        next();
    };
}
