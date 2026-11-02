import { z } from "zod";
import { asyncHandler } from "../../middleware/async-handler";
import { getAdminProject, listAdminProjects } from "./admin.service";

export const listProjects = asyncHandler(async (_req, res) => {
    res.json({ projects: await listAdminProjects() });
});

export const getProject = asyncHandler<{ projectId: string }>(async (req, res) => {
    res.json({ project: await getAdminProject(z.string().uuid().parse(req.params.projectId)) });
});
