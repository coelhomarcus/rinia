import { and, count, eq, inArray, isNull } from "drizzle-orm";
import { issues, projectDocuments, projects } from "../../db/schema";
import { db } from "../../db";
import { HttpError } from "../../lib/http-error";

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
