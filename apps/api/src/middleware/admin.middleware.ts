import type { NextFunction, Request, Response } from "express";
import { logFor } from "../lib/request-context";

export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
    if (!req.user?.isAdmin) {
        logFor("audit").warn({ event: "permission.denied", reason: "admin_required" }, "non-admin refused from an admin route");
        res.status(403).json({ error: "Administrator access required", code: "errors.permissionDenied" });
        return;
    }
    next();
}
