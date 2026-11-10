import { addProjectMemberSchema, createProjectSchema, projectStatsQuerySchema, transferProjectSchema, updateProjectMemberSchema, updateProjectPageSchema, updateProjectSchema } from "@rinia/shared";
import type { ProjectRole } from "@rinia/shared";
import { z } from "zod";
import { asyncHandler } from "../../middleware/async-handler";
import { assertProjectMembership, roleOf } from "../../middleware/project-membership.middleware";
import {
    addProjectMember,
    createProject,
    deleteProject,
    getProjectById,
    getProjectByKey,
    listProjectMembers,
    lookupProjectMember,
    listProjectsForUser,
    removeProjectMember,
    transferProject,
    updateProject,
    updateProjectMemberRole,
    updateProjectPage,
} from "./projects.service";
import { getProjectStats } from "./project-stats.service";

export const create = asyncHandler(async (req, res) => {
    const input = createProjectSchema.parse(req.body);
    const project = await createProject(input, req.user!.sub);
    res.status(201).json({ project });
});

export const list = asyncHandler(async (req, res) => {
    const projectList = await listProjectsForUser(req.user!.sub);
    res.json({ projects: projectList });
});

export const getByKey = asyncHandler<{ key: string }>(async (req, res) => {
    const project = await getProjectByKey(z.string().trim().min(1).max(16).parse(req.params.key));
    const role = await assertProjectMembership(project.id, req.user!.sub);
    res.json({ project: forRole(project, role) });
});

export const getOne = asyncHandler<{ projectId: string }>(async (req, res) => {
    const project = await getProjectById(req.params.projectId);
    res.json({ project: forRole(project, roleOf(req)) });
});

export const update = asyncHandler<{ projectId: string }>(async (req, res) => {
    const input = updateProjectSchema.parse(req.body);
    const project = await updateProject(req.params.projectId, input);
    res.json({ project });
});

export const updatePage = asyncHandler<{ projectId: string }>(async (req, res) => {
    const input = updateProjectPageSchema.parse(req.body);
    const project = await updateProjectPage(req.params.projectId, input);
    res.json({ project });
});

export const remove = asyncHandler<{ projectId: string }>(async (req, res) => {
    await deleteProject(req.params.projectId);
    res.status(204).send();
});

export const listMembers = asyncHandler<{ projectId: string }>(async (req, res) => {
    const members = await listProjectMembers(req.params.projectId);
    // A guest is someone from outside: they see who is in the project, not how to reach them.
    res.json({ members: roleOf(req) === "guest" ? members.map(({ email: _email, ...member }) => member) : members });
});

export const addMember = asyncHandler<{ projectId: string }>(async (req, res) => {
    const input = addProjectMemberSchema.parse(req.body);
    const member = await addProjectMember(req.params.projectId, input.username, input.role ?? "member", roleOf(req));
    res.status(201).json({ member });
});

export const lookupMember = asyncHandler<{ projectId: string }>(async (req, res) => {
    const { username } = addProjectMemberSchema.parse({ username: req.query.username });
    res.json(await lookupProjectMember(req.params.projectId, username));
});

export const removeMember = asyncHandler<{ projectId: string; userId: string }>(async (req, res) => {
    await removeProjectMember(req.params.projectId, z.string().uuid().parse(req.params.userId), roleOf(req));
    res.status(204).send();
});

export const updateMember = asyncHandler<{ projectId: string; userId: string }>(async (req, res) => {
    const { role } = updateProjectMemberSchema.parse(req.body);
    res.json({ member: await updateProjectMemberRole(req.params.projectId, z.string().uuid().parse(req.params.userId), role, roleOf(req)) });
});

export const transfer = asyncHandler<{ projectId: string }>(async (req, res) => {
    const { userId } = transferProjectSchema.parse(req.body);
    await transferProject(req.params.projectId, req.user!.sub, userId);
    res.status(204).send();
});

export const stats = asyncHandler<{ projectId: string }>(async (req, res) => {
    const query = projectStatsQuerySchema.parse(req.query);
    res.json({ stats: await getProjectStats(req.params.projectId, query) });
});

/** The project as the role sees it. A guest does not get the project page, which is not one of the pages shared with them. */
function forRole<T extends { pageContent?: unknown }>(project: T, role: ProjectRole): T {
    return role === "guest" ? { ...project, pageContent: "" } : project;
}
