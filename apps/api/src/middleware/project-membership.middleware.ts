import { and, eq } from "drizzle-orm";
import type { Response } from "express";
import { db } from "../db";
import { projectMembers, projects } from "../db/schema";
import { HttpError } from "../lib/http-error";
import { assertTokenReachesProject, TOKEN_PROJECT_MESSAGE, tokenReachesProject } from "../lib/project-access";
import { logFor } from "../lib/request-context";
import { asyncHandler } from "./async-handler";

async function ensureProjectExists(projectId: string): Promise<void> {
    const project = await db.query.projects.findFirst({
        where: eq(projects.id, projectId),
        columns: { id: true },
    });

    if (!project) {
        throw new HttpError(404, "Project not found");
    }
}

function findMembership(projectId: string, userId: string) {
    return db.query.projectMembers.findFirst({
        where: and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, userId)),
    });
}

/** Ad hoc membership check for routes without `:projectId` in the URL (e.g. /api/cards/:cardId), where the project is discovered from the resource itself. */
export async function assertProjectMembership(projectId: string, userId: string): Promise<void> {
    assertTokenReachesProject(projectId, userId);
    const membership = await findMembership(projectId, userId);
    if (!membership) {
        throw new HttpError(403, "You are not a member of this project");
    }
}

/** A scoped API token is refused projects outside its scope, whether the project exists or not. */
function refuseOutOfScope(projectId: string, res: Response): boolean {
    if (tokenReachesProject(projectId)) return false;
    logFor("audit").warn({ event: "permission.denied", reason: "token_project_scope", projectId }, "API token refused from a project outside its scope");
    res.status(403).json({ error: TOKEN_PROJECT_MESSAGE, code: "errors.permissionDenied" });
    return true;
}

export const requireProjectMember = asyncHandler<{ projectId: string }>(async (req, res, next) => {
    const { projectId } = req.params;
    if (refuseOutOfScope(projectId, res)) return;
    await ensureProjectExists(projectId);

    const membership = await findMembership(projectId, req.user!.sub);
    if (!membership) {
        logFor("audit").warn({ event: "permission.denied", reason: "membership_required", projectId }, "non-member refused from a project");
        res.status(403).json({ error: "You are not a member of this project", code: "errors.membershipRequired" });
        return;
    }

    req.projectMembership = membership;
    next();
});

export const requireProjectOwner = asyncHandler<{ projectId: string }>(async (req, res, next) => {
    const { projectId } = req.params;
    if (refuseOutOfScope(projectId, res)) return;
    await ensureProjectExists(projectId);

    const membership = await findMembership(projectId, req.user!.sub);
    if (!membership || membership.role !== "owner") {
        logFor("audit").warn({ event: "permission.denied", reason: "owner_required", projectId }, "non-owner refused from an owner action");
        res.status(403).json({ error: "Only the project owner can do this", code: "errors.permissionDenied" });
        return;
    }

    req.projectMembership = membership;
    next();
});
