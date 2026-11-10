import { can, type ProjectAction, type ProjectRole } from "@rinia/shared";
import { and, eq } from "drizzle-orm";
import type { Request, Response } from "express";
import { db } from "../db";
import { projectMembers, projects } from "../db/schema";
import { HttpError } from "../lib/http-error";
import { assertTokenReachesProject, TOKEN_PROJECT_MESSAGE, tokenReachesProject } from "../lib/project-access";
import { logFor } from "../lib/request-context";
import { asyncHandler } from "./async-handler";

type Membership = typeof projectMembers.$inferSelect;

export const ROLE_DENIED_MESSAGE = "Your role in this project does not allow this";

/** Project plus this user's membership, in one round trip. No row means the project is missing. */
function projectAccessQuery(projectId: string, userId: string) {
    return db
        .select({ issueKey: projects.issueKey, membership: projectMembers })
        .from(projects)
        .leftJoin(projectMembers, and(eq(projectMembers.projectId, projects.id), eq(projectMembers.userId, userId)))
        .where(eq(projects.id, projectId));
}

async function loadProjectAccess(projectId: string, userId: string) {
    const [row] = await projectAccessQuery(projectId, userId);
    return row;
}

function membershipOf(row: { membership: Membership | null } | undefined): Membership | undefined {
    const membership = row?.membership;
    if (!membership || (membership.id == null && membership.role == null)) return undefined;
    return membership;
}

function deniedByRole(projectId: string, role: ProjectRole, action: ProjectAction) {
    logFor("audit").warn({ event: "permission.denied", reason: "role", projectId, role, action }, "role refused an action");
}

/**
 * The user's membership after checking the token reaches the project, the project exists (404) and the user is in it
 * (403). With `action`, the role must also allow it (403). For routes without `:projectId` in the URL, where the
 * project is discovered from the resource itself.
 */
export async function assertProjectAccess(projectId: string, userId: string, action: ProjectAction = "project.read"): Promise<Membership> {
    assertTokenReachesProject(projectId, userId);
    const row = await loadProjectAccess(projectId, userId);
    if (!row) throw new HttpError(404, "Project not found");
    const membership = membershipOf(row);
    if (!membership) throw new HttpError(403, "You are not a member of this project");
    if (!can(membership.role, action)) {
        deniedByRole(projectId, membership.role, action);
        throw new HttpError(403, ROLE_DENIED_MESSAGE);
    }
    return membership;
}

/** The user's role in the project, or a 404/403 like `assertProjectAccess`. */
export async function assertProjectMembership(projectId: string, userId: string): Promise<ProjectRole> {
    return (await assertProjectAccess(projectId, userId)).role;
}

/** A scoped API token is refused projects outside its scope, whether the project exists or not. */
function refuseOutOfScope(projectId: string, res: Response): boolean {
    if (tokenReachesProject(projectId)) return false;
    logFor("audit").warn({ event: "permission.denied", reason: "token_project_scope", projectId }, "API token refused from a project outside its scope");
    res.status(403).json({ error: TOKEN_PROJECT_MESSAGE, code: "errors.permissionDenied" });
    return true;
}

/**
 * Lets the request through when the user's role in `:projectId` allows `action`, and leaves the membership on the
 * request. Every project route names its action here, so what a role may do is decided in one map.
 */
export function requireProjectPermission(action: ProjectAction) {
    return asyncHandler<{ projectId: string }>(async (req, res, next) => {
        const { projectId } = req.params;
        if (refuseOutOfScope(projectId, res)) return;
        const row = await loadProjectAccess(projectId, req.user!.sub);
        if (!row) throw new HttpError(404, "Project not found");

        const membership = membershipOf(row);
        if (!membership) {
            logFor("audit").warn({ event: "permission.denied", reason: "membership_required", projectId }, "non-member refused from a project");
            res.status(403).json({ error: "You are not a member of this project", code: "errors.membershipRequired" });
            return;
        }
        if (!can(membership.role, action)) {
            deniedByRole(projectId, membership.role, action);
            res.status(403).json({ error: ROLE_DENIED_MESSAGE, code: "errors.permissionDenied" });
            return;
        }

        req.projectMembership = membership;
        next();
    });
}

/** Any member, whatever their role. Routes that change something name a stricter action. */
export const requireProjectMember = requireProjectPermission("project.read");

/** Picks the action from the HTTP method: reads need `read`, anything else needs `write`. */
export function requireProjectPermissionByMethod(read: ProjectAction, write: ProjectAction) {
    const reading = requireProjectPermission(read);
    const writing = requireProjectPermission(write);
    return (req: Request<{ projectId: string }>, res: Response, next: (error?: unknown) => void) =>
        (req.method === "GET" || req.method === "HEAD" ? reading : writing)(req, res, next);
}

/** The role left on the request by `requireProjectPermission`. */
export function roleOf(req: Request): ProjectRole {
    const role = req.projectMembership?.role;
    if (!role) throw new Error("roleOf needs requireProjectPermission in front of the route");
    return role;
}

/** For a route behind `requireProjectPermission` that needs a stricter action for some requests. */
export function assertRole(req: Request, action: ProjectAction) {
    const role = roleOf(req);
    if (can(role, action)) return role;
    deniedByRole(req.projectMembership!.projectId, role, action);
    throw new HttpError(403, ROLE_DENIED_MESSAGE);
}
