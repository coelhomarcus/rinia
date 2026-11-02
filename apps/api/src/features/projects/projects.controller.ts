import { addProjectMemberSchema, createProjectSchema, updateProjectPageSchema, updateProjectSchema } from "@rinia/shared";
import { z } from "zod";
import { asyncHandler } from "../../middleware/async-handler";
import { assertProjectMembership } from "../../middleware/project-membership.middleware";
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
    updateProject,
    updateProjectPage,
} from "./projects.service";

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
    await assertProjectMembership(project.id, req.user!.sub);
    res.json({ project });
});

export const getOne = asyncHandler<{ projectId: string }>(async (req, res) => {
    const project = await getProjectById(req.params.projectId);
    res.json({ project });
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
    res.json({ members });
});

export const addMember = asyncHandler<{ projectId: string }>(async (req, res) => {
    const input = addProjectMemberSchema.parse(req.body);
    const member = await addProjectMember(req.params.projectId, input.username);
    res.status(201).json({ member });
});

export const lookupMember = asyncHandler<{ projectId: string }>(async (req, res) => {
    const { username } = addProjectMemberSchema.parse({ username: req.query.username });
    res.json(await lookupProjectMember(req.params.projectId, username));
});

export const removeMember = asyncHandler<{ projectId: string; userId: string }>(async (req, res) => {
    await removeProjectMember(req.params.projectId, req.params.userId);
    res.status(204).send();
});
