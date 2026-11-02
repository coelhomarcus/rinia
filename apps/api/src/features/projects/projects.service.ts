import { parseProjectCover, resolveLocale, suggestProjectKey, type CreateProjectInput, type Locale, type UpdateProjectInput, type UpdateProjectPageInput } from "@rinia/shared";
import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "../../db";
import { boardColumns, projectKeyAliases, projectMembers, projects, users } from "../../db/schema";
import { HttpError } from "../../lib/http-error";
import { DEFAULT_COLUMNS } from "./default-columns";
import { isProjectKeyConflict } from "./project-key";
import { publishChange, realtimeHub } from "../realtime/realtime.service";

const PROJECT_LIST_COLUMNS = {
    id: true,
    name: true,
    issueKey: true,
    description: true,
    repositoryUrl: true,
    icon: true,
    iconAppearance: true,
    cover: true,
    createdBy: true,
    createdAt: true,
    updatedAt: true,
} as const;

type ProjectAppearanceInput = Pick<CreateProjectInput, "icon" | "iconAppearance" | "cover">;

function projectAppearance(input: ProjectAppearanceInput) {
    if (input.iconAppearance !== undefined) {
        return {
            iconAppearance: input.iconAppearance,
            // Preserve the old field for older clients only when this is a catalog icon.
            icon: input.iconAppearance?.type === "icon" ? input.iconAppearance.key : null,
        };
    }
    return input.icon === undefined ? {} : { icon: input.icon, iconAppearance: input.icon ? { type: "icon" as const, key: input.icon } : null };
}

function withParsedCover<T extends { cover: unknown }>(project: T) {
    return { ...project, cover: parseProjectCover(project.cover) };
}

/** Another project's former key stays reserved so its old issue links never point somewhere else. */
async function isReservedKey(issueKey: string, projectId?: string) {
    const alias = await db.query.projectKeyAliases.findFirst({ where: eq(projectKeyAliases.key, issueKey), columns: { projectId: true } });
    return !!alias && alias.projectId !== projectId;
}

async function resolveProjectKey(name: string) {
    const [existing, aliases] = await Promise.all([
        db.query.projects.findMany({ columns: { issueKey: true } }),
        db.query.projectKeyAliases.findMany({ columns: { key: true } }),
    ]);
    const taken = new Set([...existing.map((project) => project.issueKey), ...aliases.map((alias) => alias.key)]);

    const base = suggestProjectKey(name);
    let candidate = base;
    let suffix = 1;
    while (taken.has(candidate)) {
        const suffixText = String(suffix++);
        candidate = `${base.slice(0, 8 - suffixText.length)}${suffixText}`;
    }
    return candidate;
}

export async function createProject(input: CreateProjectInput, creatorId: string) {
    const creator = await db.query.users.findFirst({ where: eq(users.id, creatorId), columns: { locale: true } });
    const locale: Locale = resolveLocale(creator?.locale);
    if (input.issueKey && await isReservedKey(input.issueKey)) throw new HttpError(409, "Project key is already in use");
    for (let attempt = 0; attempt < 5; attempt += 1) {
        const issueKey = input.issueKey ?? await resolveProjectKey(input.name);

        try {
            return await db.transaction(async (tx) => {
                const { icon: _icon, iconAppearance: _iconAppearance, cover, issueKey: _inputIssueKey, ...projectInput } = input;
                const [project] = await tx
                    .insert(projects)
                    .values({
                        issueKey,
                        ...projectInput,
                        cover: cover ?? null,
                        ...projectAppearance(input),
                        createdBy: creatorId,
                    })
                    .returning();

                await tx.insert(projectMembers).values({ projectId: project.id, userId: creatorId, role: "owner" });

                await tx.insert(boardColumns).values(
                    DEFAULT_COLUMNS[locale].map((column, index) => ({
                        projectId: project.id,
                        name: column.name,
                        color: column.color,
                        position: (index + 1) * 1000,
                    })),
                );

                return withParsedCover(project);
            });
        } catch (error) {
            if (!isProjectKeyConflict(error)) throw error;
            if (input.issueKey) throw new HttpError(409, "Project key is already in use");
        }
    }

    throw new HttpError(409, "Could not generate a unique project key");
}

/** The projects the user belongs to. Site admins are no exception: they see only the projects they are members of. */
export async function listProjectsForUser(userId: string) {
    const projectList = (
        await db.query.projectMembers.findMany({
            where: eq(projectMembers.userId, userId),
            with: { project: { columns: PROJECT_LIST_COLUMNS } },
        })
    ).map((membership) => membership.project);

    type MemberPreview = { id: string; name: string; avatarUrl: string | null };
    if (projectList.length === 0) return projectList.map((project) => ({ ...withParsedCover(project), memberCount: 0, memberPreview: [], owner: null as MemberPreview | null }));
    const projectIds = projectList.map((project) => project.id);
    const memberships = await db.query.projectMembers.findMany({
        where: inArray(projectMembers.projectId, projectIds),
        orderBy: [projectMembers.joinedAt],
        with: { user: { columns: { id: true, name: true, avatarUrl: true } } },
    });
    const memberMap = new Map<string, MemberPreview[]>();
    // Lets the sidebar group projects by whose they are.
    const ownerMap = new Map<string, MemberPreview>();
    for (const membership of memberships) {
        const members = memberMap.get(membership.projectId) ?? [];
        members.push(membership.user);
        memberMap.set(membership.projectId, members);
        if (membership.role === "owner" && !ownerMap.has(membership.projectId)) ownerMap.set(membership.projectId, membership.user);
    }
    return projectList.map((project) => {
        const members = memberMap.get(project.id) ?? [];
        return { ...withParsedCover(project), memberCount: members.length, memberPreview: members.slice(0, 3), owner: ownerMap.get(project.id) ?? null };
    });
}

export async function getProjectById(projectId: string) {
    const project = await db.query.projects.findFirst({ where: eq(projects.id, projectId) });
    if (!project) {
        throw new HttpError(404, "Project not found");
    }
    return withParsedCover(project);
}

/** Finds a project by its current key or a key it used before, so old URLs keep resolving. */
export async function getProjectByKey(key: string) {
    const issueKey = key.trim().toUpperCase();
    const current = await db.query.projects.findFirst({ where: eq(projects.issueKey, issueKey) });
    if (current) return withParsedCover(current);
    const alias = await db.query.projectKeyAliases.findFirst({ where: eq(projectKeyAliases.key, issueKey), columns: { projectId: true } });
    if (!alias) throw new HttpError(404, "Project not found");
    return getProjectById(alias.projectId);
}

export async function updateProject(projectId: string, input: UpdateProjectInput) {
    const current = await getProjectById(projectId);
    const renamedKey = input.issueKey && input.issueKey !== current.issueKey ? input.issueKey : null;
    if (renamedKey) {
        const duplicate = await db.query.projects.findFirst({ where: and(eq(projects.issueKey, renamedKey), sql`${projects.id} <> ${projectId}`), columns: { id: true } });
        if (duplicate || await isReservedKey(renamedKey, projectId)) throw new HttpError(409, "Project key is already in use");
    }
    const { icon: _icon, iconAppearance: _iconAppearance, cover: _cover, ...projectInput } = input;
    const project = await db
        .transaction(async (tx) => {
            if (renamedKey) {
                // Issue identifiers are derived from the key, so renaming it renames every issue at once.
                // The old key becomes an alias only when issues already carry it in links.
                await tx.delete(projectKeyAliases).where(and(eq(projectKeyAliases.key, renamedKey), eq(projectKeyAliases.projectId, projectId)));
                if (current.nextIssueNumber > 1) {
                    await tx.insert(projectKeyAliases).values({ key: current.issueKey, projectId }).onConflictDoNothing();
                }
            }
            const [updated] = await tx
                .update(projects)
                .set({
                    ...projectInput,
                    ...(input.cover === undefined ? {} : { cover: input.cover }),
                    ...projectAppearance(input),
                    updatedAt: new Date(),
                })
                .where(eq(projects.id, projectId))
                .returning();
            return updated;
        })
        .catch((error: unknown) => {
            if (isProjectKeyConflict(error)) throw new HttpError(409, "Project key is already in use");
            throw error;
        });

    if (!project) {
        throw new HttpError(404, "Project not found");
    }
    publishChange("project.updated", { projectId, id: projectId });
    return withParsedCover(project);
}

export async function updateProjectPage(projectId: string, input: UpdateProjectPageInput) {
    const [project] = await db
        .update(projects)
        .set({ pageContent: input.pageContent, updatedAt: new Date() })
        .where(eq(projects.id, projectId))
        .returning();

    if (!project) {
        throw new HttpError(404, "Project not found");
    }
    publishChange("project.updated", { projectId, id: projectId });
    return project;
}

export async function deleteProject(projectId: string) {
    const [deleted] = await db.delete(projects).where(eq(projects.id, projectId)).returning({ id: projects.id });
    if (!deleted) {
        throw new HttpError(404, "Project not found");
    }
}

export async function listProjectMembers(projectId: string) {
    const members = await db.query.projectMembers.findMany({
        where: eq(projectMembers.projectId, projectId),
        with: { user: { columns: { id: true, name: true, username: true, email: true, avatarUrl: true } } },
    });

    return members.map((member) => ({ ...member.user, role: member.role, joinedAt: member.joinedAt }));
}

export async function addProjectMember(projectId: string, username: string) {
    const user = await db.query.users.findFirst({
        where: eq(users.username, username),
        columns: { id: true, name: true, username: true, email: true, avatarUrl: true },
    });

    if (!user) {
        throw new HttpError(404, "User not found");
    }

    const existing = await db.query.projectMembers.findFirst({
        where: and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, user.id)),
    });

    if (existing) {
        throw new HttpError(409, "User is already a member of this project");
    }

    const [member] = await db
        .insert(projectMembers)
        .values({ projectId, userId: user.id, role: "member" })
        .returning();
    publishChange("member.added", { projectId, id: user.id });

    return { ...user, role: member.role, joinedAt: member.joinedAt };
}

/** What the add-member form previews before it adds anyone: who a username belongs to, and whether they are already in. */
export async function lookupProjectMember(projectId: string, username: string) {
    const user = await db.query.users.findFirst({
        where: eq(users.username, username),
        columns: { id: true, name: true, username: true, avatarUrl: true },
    });
    if (!user) return { user: null, isMember: false };

    const membership = await db.query.projectMembers.findFirst({
        where: and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, user.id)),
    });
    return { user, isMember: !!membership };
}

export async function removeProjectMember(projectId: string, userId: string) {
    const target = await db.query.projectMembers.findFirst({
        where: and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, userId)),
    });

    if (!target) {
        throw new HttpError(404, "Member not found");
    }
    if (target.role === "owner") {
        throw new HttpError(400, "The project owner cannot be removed");
    }

    await db.delete(projectMembers).where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, userId)));
    publishChange("member.removed", { projectId, id: userId });
    realtimeHub.revoke(projectId, userId);
}
