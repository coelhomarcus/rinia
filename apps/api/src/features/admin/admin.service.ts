import { randomBytes } from "node:crypto";
import { and, count, eq, inArray, isNull } from "drizzle-orm";
import { apiTokens, issues, projectDocuments, projectMembers, projects, users } from "../../db/schema";
import { db } from "../../db";
import { HttpError } from "../../lib/http-error";
import { hashPassword } from "../../lib/password";
import { forgetUserSessions, revokeSessions } from "../auth/sessions.service";

/*
 * What site admins see of a project: who is in it and how big it is, never what anyone wrote. Names, people and counts
 * only; no description, page, issue, comment or document text leaves these functions.
 */
const PERSON = { id: true, name: true, username: true, avatarUrl: true } as const;
const ADMIN_PROJECT_COLUMNS = { id: true, name: true, issueKey: true, icon: true, iconAppearance: true, createdAt: true, updatedAt: true } as const;

async function countsByProject(projectIds: string[]) {
    if (projectIds.length === 0) return { issues: new Map<string, number>(), documents: new Map<string, number>() };
    const [issueRows, documentRows] = await Promise.all([
        db.select({ projectId: issues.projectId, value: count() }).from(issues).where(and(inArray(issues.projectId, projectIds), isNull(issues.deletedAt))).groupBy(issues.projectId),
        db
            .select({ projectId: projectDocuments.projectId, value: count() })
            .from(projectDocuments)
            .where(and(inArray(projectDocuments.projectId, projectIds), isNull(projectDocuments.deletedAt)))
            .groupBy(projectDocuments.projectId),
    ]);
    return { issues: new Map(issueRows.map((row) => [row.projectId, row.value])), documents: new Map(documentRows.map((row) => [row.projectId, row.value])) };
}

export async function listAdminProjects() {
    const rows = await db.query.projects.findMany({
        columns: ADMIN_PROJECT_COLUMNS,
        orderBy: (table, { asc }) => [asc(table.name)],
        with: {
            creator: { columns: PERSON },
            members: { columns: { role: true }, with: { user: { columns: PERSON } } },
        },
    });
    const totals = await countsByProject(rows.map((row) => row.id));
    return rows.map(({ creator, members, ...project }) => ({
        ...project,
        createdBy: creator,
        owner: members.find((member) => member.role === "owner")?.user ?? null,
        memberCount: members.length,
        issueCount: totals.issues.get(project.id) ?? 0,
        documentCount: totals.documents.get(project.id) ?? 0,
    }));
}

export async function getAdminProject(projectId: string) {
    const project = await db.query.projects.findFirst({
        where: eq(projects.id, projectId),
        columns: ADMIN_PROJECT_COLUMNS,
        with: {
            creator: { columns: PERSON },
            members: { columns: { role: true, joinedAt: true }, orderBy: (table, { asc }) => [asc(table.joinedAt)], with: { user: { columns: PERSON } } },
        },
    });
    if (!project) throw new HttpError(404, "Project not found");
    const { creator, members, ...rest } = project;
    const totals = await countsByProject([project.id]);
    return {
        ...rest,
        createdBy: creator,
        owner: members.find((member) => member.role === "owner")?.user ?? null,
        members: members.map((member) => ({ ...member.user, role: member.role, joinedAt: member.joinedAt })),
        issueCount: totals.issues.get(project.id) ?? 0,
        documentCount: totals.documents.get(project.id) ?? 0,
    };
}

/*
 * What site admins see of a person: who they are, how to reach them and where they work. Never their password, and
 * nothing they wrote.
 */
const ADMIN_USER_COLUMNS = { id: true, name: true, username: true, email: true, avatarUrl: true, isAdmin: true, suspendedAt: true, createdAt: true } as const;

export async function listAdminUsers() {
    const [rows, memberships] = await Promise.all([
        db.query.users.findMany({ columns: ADMIN_USER_COLUMNS, orderBy: (table, { asc }) => [asc(table.name)] }),
        db.select({ userId: projectMembers.userId, value: count() }).from(projectMembers).groupBy(projectMembers.userId),
    ]);
    const projectCounts = new Map(memberships.map((row) => [row.userId, row.value]));
    return rows.map((user) => ({ ...user, projectCount: projectCounts.get(user.id) ?? 0 }));
}

export async function getAdminUser(userId: string) {
    const user = await db.query.users.findFirst({
        where: eq(users.id, userId),
        columns: ADMIN_USER_COLUMNS,
        with: {
            projectMemberships: {
                columns: { role: true, joinedAt: true },
                orderBy: (table, { asc }) => [asc(table.joinedAt)],
                with: { project: { columns: { id: true, name: true, issueKey: true, icon: true, iconAppearance: true } } },
            },
        },
    });
    if (!user) throw new HttpError(404, "User not found");
    const [tokens] = await db.select({ value: count() }).from(apiTokens).where(eq(apiTokens.userId, userId));
    const { projectMemberships, ...rest } = user;
    return {
        ...rest,
        projects: projectMemberships.map((membership) => ({ ...membership.project, role: membership.role, joinedAt: membership.joinedAt })),
        apiTokenCount: tokens?.value ?? 0,
    };
}

/** Admins act on other people's accounts; their own goes through their profile, so nobody locks themselves out. */
export function assertNotSelf(actorId: string, userId: string) {
    if (actorId === userId) throw new HttpError(403, "You cannot do this to your own account");
}

async function updateUser(userId: string, values: Partial<typeof users.$inferInsert>) {
    const [updated] = await db
        .update(users)
        .set({ ...values, updatedAt: new Date() })
        .where(eq(users.id, userId))
        .returning({ id: users.id });
    if (!updated) throw new HttpError(404, "User not found");
}

/** Grants or removes admin rights, or suspends or restores the account. Suspending ends every open session at once. */
export async function updateAdminUser(actorId: string, userId: string, changes: { isAdmin?: boolean; suspended?: boolean }) {
    assertNotSelf(actorId, userId);
    const values: Partial<typeof users.$inferInsert> = {};
    if (changes.isAdmin !== undefined) values.isAdmin = changes.isAdmin;
    if (changes.suspended !== undefined) values.suspendedAt = changes.suspended ? new Date() : null;
    await updateUser(userId, values);
    // Admin rights and suspension are read with the session, so the next request sees the change.
    forgetUserSessions(userId);
    if (changes.suspended) await revokeSessions(userId);
    return getAdminUser(userId);
}

/** Signs the person out of every browser. API tokens keep working; the person manages those. */
export async function revokeUserSessions(actorId: string, userId: string) {
    assertNotSelf(actorId, userId);
    await revokeSessions(userId);
}

/**
 * Replaces the password with a random one the admin hands over, for someone who lost theirs, and signs them out
 * everywhere. The new password is returned once and never stored in the clear.
 */
export async function resetUserPassword(actorId: string, userId: string) {
    assertNotSelf(actorId, userId);
    const password = randomBytes(12).toString("base64url");
    await updateUser(userId, { passwordHash: await hashPassword(password) });
    await revokeSessions(userId);
    return password;
}
