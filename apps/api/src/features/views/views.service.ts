import { can, savedViewFiltersSchema, type ProjectRole, type CreateViewInput, type DuplicateViewInput, type UpdateViewInput } from "@rinia/shared";
import { and, asc, eq, isNull, or } from "drizzle-orm";
import { db } from "../../db";
import { views } from "../../db/schema";
import { HttpError } from "../../lib/http-error";
import { requireUndoWindow } from "../../lib/soft-delete";
import { publishChange } from "../realtime/realtime.service";

/** Who is acting on a view, and their role in its project. */
export interface ViewActor {
    userId: string;
    role: ProjectRole;
}

const VIEW_WITH = { owner: { columns: { id: true, name: true } } } as const;
const MAX_NAME_LENGTH = 80;
const COPY_SUFFIX = " (copy)";

type ViewRow = NonNullable<Awaited<ReturnType<typeof findView>>>;

function findView(projectId: string, viewId: string, deletedAt: Date | null = null) {
    return db.query.views.findFirst({
        where: and(eq(views.id, viewId), eq(views.projectId, projectId), deletedAt ? eq(views.deletedAt, deletedAt) : isNull(views.deletedAt)),
        with: VIEW_WITH,
    });
}

const isVisible = (row: Pick<ViewRow, "shared" | "ownerId">, actor: ViewActor) => row.shared || row.ownerId === actor.userId;

/** The owner manages their view; project owners and admins also manage the views shared with their project. */
const canManage = (row: Pick<ViewRow, "shared" | "ownerId">, actor: ViewActor) => row.ownerId === actor.userId || (row.shared && can(actor.role, "views.manageShared"));

/** Sharing puts a view in front of the whole project, which a viewer cannot do. */
function assertMayShare(actor: ViewActor) {
    if (!can(actor.role, "views.share")) throw new HttpError(403, "Your role in this project does not allow this");
}

function toView(row: ViewRow, actor: ViewActor) {
    // A saved view that no longer parses (the schema moved on) opens as the unfiltered page rather than failing.
    const filters = savedViewFiltersSchema.safeParse(row.filters);
    return {
        id: row.id,
        projectId: row.projectId,
        ownerId: row.ownerId,
        owner: row.owner,
        name: row.name,
        shared: row.shared,
        filters: filters.success ? filters.data : {},
        canEdit: canManage(row, actor),
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
    };
}

/** A view the actor can see, or a 404 that does not reveal whether someone else's private view exists. */
async function requireVisibleView(projectId: string, viewId: string, actor: ViewActor, deletedAt: Date | null = null) {
    const row = await findView(projectId, viewId, deletedAt);
    if (!row || !isVisible(row, actor)) throw new HttpError(404, "View not found");
    return row;
}

async function requireManagedView(projectId: string, viewId: string, actor: ViewActor, deletedAt: Date | null = null) {
    const row = await requireVisibleView(projectId, viewId, actor, deletedAt);
    if (!canManage(row, actor)) throw new HttpError(403, "You do not have permission to change this view");
    return row;
}

/** The project's views the actor can open: their own, then everyone's shared ones, oldest first. */
export async function listViews(projectId: string, actor: ViewActor) {
    const rows = await db.query.views.findMany({
        where: and(eq(views.projectId, projectId), isNull(views.deletedAt), or(eq(views.shared, true), eq(views.ownerId, actor.userId))),
        orderBy: [asc(views.createdAt), asc(views.id)],
        with: VIEW_WITH,
    });
    return rows.map((row) => toView(row, actor));
}

export async function createView(projectId: string, actor: ViewActor, input: CreateViewInput) {
    if (input.shared) assertMayShare(actor);
    const [inserted] = await db
        .insert(views)
        .values({ projectId, ownerId: actor.userId, name: input.name, shared: input.shared, filters: input.filters })
        .returning({ id: views.id });
    const row = inserted && (await findView(projectId, inserted.id));
    if (!row) throw new HttpError(500, "Could not save the view");
    publishChange("view.created", { projectId, id: row.id });
    return toView(row, actor);
}

export async function updateView(projectId: string, viewId: string, actor: ViewActor, input: UpdateViewInput) {
    const current = await requireManagedView(projectId, viewId, actor);
    // Sharing decides who can find the view, so only its owner changes it.
    if (input.shared !== undefined && input.shared !== current.shared && current.ownerId !== actor.userId) {
        throw new HttpError(403, "Only the view owner can change who sees it");
    }
    if (input.shared && !current.shared) assertMayShare(actor);
    await db
        .update(views)
        .set({ ...(input.name !== undefined && { name: input.name }), ...(input.shared !== undefined && { shared: input.shared }), ...(input.filters !== undefined && { filters: input.filters }), updatedAt: new Date() })
        .where(and(eq(views.id, viewId), eq(views.projectId, projectId), isNull(views.deletedAt)));
    const row = await findView(projectId, viewId);
    if (!row) throw new HttpError(404, "View not found");
    publishChange("view.updated", { projectId, id: viewId });
    return toView(row, actor);
}

/** A personal copy of any view the actor can see, whoever owns it. */
export async function duplicateView(projectId: string, viewId: string, actor: ViewActor, input: DuplicateViewInput) {
    const source = await requireVisibleView(projectId, viewId, actor);
    const name = input.name ?? `${source.name.slice(0, MAX_NAME_LENGTH - COPY_SUFFIX.length)}${COPY_SUFFIX}`;
    return createView(projectId, actor, { name, shared: false, filters: toView(source, actor).filters });
}

export async function deleteView(projectId: string, viewId: string, actor: ViewActor) {
    await requireManagedView(projectId, viewId, actor);
    const deletedAt = new Date();
    const [removed] = await db
        .update(views)
        .set({ deletedAt })
        .where(and(eq(views.id, viewId), eq(views.projectId, projectId), isNull(views.deletedAt)))
        .returning({ id: views.id });
    if (!removed) throw new HttpError(404, "View not found");
    publishChange("view.deleted", { projectId, id: viewId });
    return { deletedAt: deletedAt.toISOString() };
}

export async function restoreView(projectId: string, viewId: string, actor: ViewActor, deletedAt: Date) {
    requireUndoWindow(deletedAt);
    await requireManagedView(projectId, viewId, actor, deletedAt);
    const [restored] = await db
        .update(views)
        .set({ deletedAt: null })
        .where(and(eq(views.id, viewId), eq(views.projectId, projectId), eq(views.deletedAt, deletedAt)))
        .returning({ id: views.id });
    if (!restored) throw new HttpError(404, "View not found or undo window expired");
    publishChange("view.restored", { projectId, id: viewId });
    return { restored: true };
}
