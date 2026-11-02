import type { NextFunction, Request, Response } from "express";
import type { Level } from "pino";
import { ZodError } from "zod";
import { HttpError } from "../lib/http-error";
import { logger } from "../lib/logger";
import { resolveApiError } from "@rinia/shared";

/** A refused permission or too many attempts is worth a look; the rest of the client's mistakes are routine. */
function httpErrorLevel(status: number): Level {
    if (status >= 500) return "error";
    return status === 403 || status === 429 ? "warn" : "info";
}

export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction): void {
    const log = (req.log ?? logger).child({ module: "http" });

    if (err instanceof ZodError) {
        // Which fields were wrong, never what was in them.
        log.info({ event: "http.invalid_data", status: 400, fields: [...new Set(err.issues.map((issue) => issue.path.join(".") || "(root)"))] }, "invalid request data");
        res.status(400).json({
            error: "Invalid data",
            code: "errors.invalidData",
            fields: err.flatten().fieldErrors,
            fieldCodes: err.issues.map((issue) => ({
                path: issue.path.join("."),
                code: `validation.${issue.code}`,
                minimum: "minimum" in issue ? issue.minimum : undefined,
                maximum: "maximum" in issue ? issue.maximum : undefined,
            })),
        });
        return;
    }

    if (err instanceof HttpError) {
        const level = httpErrorLevel(err.statusCode);
        log[level]({ event: "http.error", status: err.statusCode, code: err.code, ...(level === "error" ? { err } : {}) }, err.message);
        res.status(err.statusCode).json({ error: err.message, code: err.code, params: err.params });
        return;
    }

    if (typeof err === "object" && err !== null && "type" in err && err.type === "entity.too.large") {
        const message = "This document is too large to save. Split its content into smaller pages.";
        log.info({ event: "http.error", status: 413, code: "entity.too.large" }, "request body too large");
        res.status(413).json({ error: message, ...resolveApiError(message, 413) });
        return;
    }

    log.error({ event: "http.error", status: 500, method: req.method, err }, "unhandled error");
    res.status(500).json({ error: "Internal error", code: "errors.internal", requestId: req.id });
}
