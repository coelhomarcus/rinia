import { and, eq, inArray, sql, type SQL } from "drizzle-orm";
import type { PgColumn } from "drizzle-orm/pg-core";
import { db } from "../db";
import { projectMembers } from "../db/schema";
import { HttpError } from "./http-error";
import { logFor, tokenProjectScope } from "./request-context";

export const TOKEN_PROJECT_MESSAGE = "This API token cannot reach this project";

/** Whether the API token behind the current request may reach the project. Sessions, and tokens without a scope, reach every project their owner is in. */
export function tokenReachesProject(projectId: string, userId?: string): boolean {
    const scope = tokenProjectScope(userId);
    return !scope || scope.includes(projectId);
}

/** Refuses a project outside the token's scope, before anything about it is read. Call it ahead of the membership check. */
export function assertTokenReachesProject(projectId: string, userId?: string): void {
    if (tokenReachesProject(projectId, userId)) return;
    logFor("audit").warn({ event: "permission.denied", reason: "token_project_scope", projectId }, "API token refused from a project outside its scope");
    throw new HttpError(403, TOKEN_PROJECT_MESSAGE);
}

/**
 * A condition narrowing `column` (a project id) to the token's projects, or undefined when the request has no scope.
 * Add it to a query on rows the user can already see by membership.
 */
export function withinTokenScope(column: PgColumn, userId: string): SQL | undefined {
    const scope = tokenProjectScope(userId);
    if (!scope) return undefined;
    // An empty scope is a token whose projects are all gone: it reaches nothing, never everything.
    return scope.length > 0 ? inArray(column, [...scope]) : sql`false`;
}

/**
 * The ids of the projects the user can reach: those they belong to, narrowed to the token's projects when the request
 * comes from a scoped API token. Every list, search and inbox goes through this, so none of them can show another project.
 */
export function reachableProjectIds(userId: string) {
    return db.select({ id: projectMembers.projectId }).from(projectMembers).where(and(eq(projectMembers.userId, userId), withinTokenScope(projectMembers.projectId, userId)));
}
