import { createViewSchema, duplicateViewSchema, updateViewSchema } from "@rinia/shared";
import type { Request } from "express";
import { z } from "zod";
import { asyncHandler } from "../../middleware/async-handler";
import { createView, deleteView, duplicateView, listViews, restoreView, updateView, type ViewActor } from "./views.service";

type ProjectParams = { projectId: string };
type ViewParams = ProjectParams & { viewId: string };

/** Mounted behind `requireProjectMember`, which leaves the member's role on the request. */
function actorOf(req: Request<ProjectParams>): ViewActor {
    return { userId: req.user!.sub, isProjectOwner: req.projectMembership?.role === "owner" };
}

const viewId = (req: Request<ViewParams>) => z.string().uuid().parse(req.params.viewId);

export const list = asyncHandler<ProjectParams>(async (req, res) => {
    res.json({ views: await listViews(req.params.projectId, actorOf(req)) });
});

export const create = asyncHandler<ProjectParams>(async (req, res) => {
    res.status(201).json({ view: await createView(req.params.projectId, actorOf(req), createViewSchema.parse(req.body)) });
});

export const update = asyncHandler<ViewParams>(async (req, res) => {
    res.json({ view: await updateView(req.params.projectId, viewId(req), actorOf(req), updateViewSchema.parse(req.body)) });
});

export const duplicate = asyncHandler<ViewParams>(async (req, res) => {
    res.status(201).json({ view: await duplicateView(req.params.projectId, viewId(req), actorOf(req), duplicateViewSchema.parse(req.body ?? {})) });
});

export const remove = asyncHandler<ViewParams>(async (req, res) => {
    res.json(await deleteView(req.params.projectId, viewId(req), actorOf(req)));
});

export const restore = asyncHandler<ViewParams>(async (req, res) => {
    const { deletedAt } = z.object({ deletedAt: z.string().datetime() }).parse(req.body);
    res.json(await restoreView(req.params.projectId, viewId(req), actorOf(req), new Date(deletedAt)));
});
