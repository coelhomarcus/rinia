import { z } from "zod";
import { logFor } from "../../lib/request-context";
import { asyncHandler } from "../../middleware/async-handler";
import { getAdminProject, listAdminProjects } from "./admin.service";

// Admins see every project, members included, so each look is recorded.
export const listProjects = asyncHandler(async (_req, res) => {
    logFor("audit").info({ event: "admin.projects_listed" }, "admin listed every project");
    res.json({ projects: await listAdminProjects() });
});

export const getProject = asyncHandler<{ projectId: string }>(async (req, res) => {
    const projectId = z.string().uuid().parse(req.params.projectId);
    logFor("audit").info({ event: "admin.project_viewed", projectId }, "admin viewed a project");
    res.json({ project: await getAdminProject(projectId) });
});
