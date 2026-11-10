import { can, type ProjectAction, type ProjectRole } from "@rinia/shared";
import { and, eq, inArray, ne, or, type SQL } from "drizzle-orm";
import { db } from "../db";
import { issues, projectDocuments, projectMembers, projectShares } from "../db/schema";
import { assertProjectAccess, ROLE_DENIED_MESSAGE } from "../middleware/project-membership.middleware";
import { HttpError } from "./http-error";
import { withinTokenScope } from "./project-access";
import { logFor } from "./request-context";

/**
 * What a guest may see. Every other role sees the whole project; a guest sees the issues and pages shared with them and
 * the issues assigned to them, and nothing else. Every list, search, inbox and channel goes through these, so none of
 * them can show a guest something outside that.
 */

/** Projects where the user sees everything: those they belong to with any role but guest. */
export function fullAccessProjectIds(userId: string) {
    return db
        .select({ id: projectMembers.projectId })
        .from(projectMembers)
        .where(and(eq(projectMembers.userId, userId), ne(projectMembers.role, "guest"), withinTokenScope(projectMembers.projectId, userId)));
}

function guestProjectIds(userId: string) {
    return db
        .select({ id: projectMembers.projectId })
        .from(projectMembers)
        .where(and(eq(projectMembers.userId, userId), eq(projectMembers.role, "guest"), withinTokenScope(projectMembers.projectId, userId)));
}

/** The issues the user sees as a guest: shared with them, or assigned to them. */
function guestIssueIds(userId: string) {
    return db
        .select({ id: issues.id })
        .from(issues)
        .where(
            and(
                inArray(issues.projectId, guestProjectIds(userId)),
                or(eq(issues.assigneeId, userId), inArray(issues.id, db.select({ id: projectShares.issueId }).from(projectShares).where(eq(projectShares.userId, userId)))),
            ),
        );
}

/** The pages the user sees as a guest: those shared with them. */
function guestDocumentIds(userId: string) {
    return db
        .select({ id: projectShares.documentId })
        .from(projectShares)
        .where(and(eq(projectShares.userId, userId), inArray(projectShares.projectId, guestProjectIds(userId))));
}

/** A condition on `issues` matching the issues the user can see, across every project. */
export function visibleIssues(userId: string): SQL {
    return or(inArray(issues.projectId, fullAccessProjectIds(userId)), inArray(issues.id, guestIssueIds(userId)))!;
}

/** A condition on `project_documents` matching the pages the user can see, across every project. */
export function visibleDocuments(userId: string): SQL {
    return or(inArray(projectDocuments.projectId, fullAccessProjectIds(userId)), inArray(projectDocuments.id, guestDocumentIds(userId)))!;
}

/** For a list inside one project: nothing to add for a full member, the guest's issues for a guest. */
export function issueListScope(userId: string, role: ProjectRole): SQL | undefined {
    return role === "guest" ? inArray(issues.id, guestIssueIds(userId)) : undefined;
}

export function documentListScope(userId: string, role: ProjectRole): SQL | undefined {
    return role === "guest" ? inArray(projectDocuments.id, guestDocumentIds(userId)) : undefined;
}

export async function guestSeesIssue(userId: string, issue: { id: string; assigneeId: string | null }) {
    if (issue.assigneeId === userId) return true;
    const share = await db.query.projectShares.findFirst({ where: and(eq(projectShares.userId, userId), eq(projectShares.issueId, issue.id)), columns: { id: true } });
    return !!share;
}

export async function guestSeesDocument(userId: string, documentId: string) {
    const share = await db.query.projectShares.findFirst({ where: and(eq(projectShares.userId, userId), eq(projectShares.documentId, documentId)), columns: { id: true } });
    return !!share;
}

function refuse(projectId: string, role: ProjectRole, action: ProjectAction): never {
    logFor("audit").warn({ event: "permission.denied", reason: "role", projectId, role, action }, "role refused an action");
    throw new HttpError(403, ROLE_DENIED_MESSAGE);
}

/**
 * Checks the user may see the issue and, with `action`, that their role allows it. An issue a guest cannot see is a
 * 404, the same as one that does not exist, so a guest cannot learn what is outside what was shared with them.
 */
export async function assertIssueAccess(userId: string, issue: { id: string; projectId: string; assigneeId: string | null }, action?: ProjectAction): Promise<ProjectRole> {
    const { role } = await assertProjectAccess(issue.projectId, userId);
    if (role === "guest" && !(await guestSeesIssue(userId, issue))) throw new HttpError(404, "Issue not found");
    if (action && !can(role, action)) refuse(issue.projectId, role, action);
    return role;
}

/** `assertIssueAccess` for an issue known only by id. A deleted issue is not found. */
export async function assertIssueIdAccess(userId: string, issueId: string, action?: ProjectAction) {
    const issue = await db.query.issues.findFirst({ where: eq(issues.id, issueId), columns: { id: true, projectId: true, assigneeId: true, deletedAt: true } });
    if (!issue || issue.deletedAt) throw new HttpError(404, "Issue not found");
    return { issue, role: await assertIssueAccess(userId, issue, action) };
}

/** The same for a page. */
export async function assertDocumentAccess(userId: string, projectId: string, documentId: string, action?: ProjectAction): Promise<ProjectRole> {
    const { role } = await assertProjectAccess(projectId, userId);
    if (role === "guest" && !(await guestSeesDocument(userId, documentId))) throw new HttpError(404, "Document not found");
    if (action && !can(role, action)) refuse(projectId, role, action);
    return role;
}

/** For a route already behind `requireProjectPermission`, which knows the role. */
export async function assertDocumentVisible(userId: string, role: ProjectRole, documentId: string) {
    if (role === "guest" && !(await guestSeesDocument(userId, documentId))) throw new HttpError(404, "Document not found");
}
