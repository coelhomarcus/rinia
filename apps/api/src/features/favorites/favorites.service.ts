import type { CreateFavoriteInput } from "@rinia/shared";
import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import { db } from "../../db";
import { favorites, issues, projectDocuments, projectMembers, views } from "../../db/schema";
import { HttpError } from "../../lib/http-error";
import { requireUndoWindow } from "../../lib/soft-delete";
import { assertProjectMembership } from "../../middleware/project-membership.middleware";

const FAVORITE_WITH = {
    project: { columns: { id: true, name: true, issueKey: true, icon: true, iconAppearance: true } },
    document: { columns: { id: true, title: true, iconAppearance: true, deletedAt: true } },
    issue: { columns: { id: true, number: true, title: true, deletedAt: true } },
    view: { columns: { id: true, name: true, shared: true, ownerId: true, deletedAt: true } },
} as const;

type FavoriteRow = NonNullable<Awaited<ReturnType<typeof findFavorite>>>;

function findFavorite(id: string) {
    return db.query.favorites.findFirst({ where: eq(favorites.id, id), with: FAVORITE_WITH });
}

function toFavorite(row: FavoriteRow) {
    return {
        id: row.id,
        kind: row.kind,
        projectId: row.projectId,
        documentId: row.documentId,
        issueId: row.issueId,
        viewId: row.viewId,
        createdAt: row.createdAt,
        project: row.project,
        document: row.document ?? null,
        issue: row.issue ? { ...row.issue, identifier: `${row.project.issueKey}-${row.issue.number}` } : null,
        view: row.view ? { id: row.view.id, name: row.view.name } : null,
    };
}

/** The user's favorites, oldest first, skipping projects they no longer belong to. */
export async function listFavorites(userId: string) {
    const rows = await db.query.favorites.findMany({
        where: and(eq(favorites.userId, userId), isNull(favorites.deletedAt)),
        orderBy: [asc(favorites.createdAt)],
        with: FAVORITE_WITH,
    });
    // A view stops showing when it is deleted, or when its owner takes it back from the project.
    const activeTargets = rows.filter((row) => !row.document?.deletedAt && !row.issue?.deletedAt && !row.view?.deletedAt && (!row.view || row.view.shared || row.view.ownerId === userId));
    if (activeTargets.length === 0) return activeTargets.map(toFavorite);

    const memberships = await db.query.projectMembers.findMany({
        where: and(eq(projectMembers.userId, userId), inArray(projectMembers.projectId, [...new Set(activeTargets.map((row) => row.projectId))])),
        columns: { projectId: true },
    });
    const allowed = new Set(memberships.map((membership) => membership.projectId));
    return activeTargets.filter((row) => allowed.has(row.projectId)).map(toFavorite);
}

export async function addFavorite(userId: string, input: CreateFavoriteInput) {
    await assertProjectMembership(input.projectId, userId);
    const documentId = input.kind === "document" ? input.documentId : null;
    const issueId = input.kind === "issue" ? input.issueId : null;
    const viewId = input.kind === "view" ? input.viewId : null;

    if (documentId) {
        const document = await db.query.projectDocuments.findFirst({ where: and(eq(projectDocuments.id, documentId), eq(projectDocuments.projectId, input.projectId), isNull(projectDocuments.deletedAt)), columns: { id: true } });
        if (!document) throw new HttpError(404, "Document not found");
    }
    if (issueId) {
        const issue = await db.query.issues.findFirst({ where: and(eq(issues.id, issueId), eq(issues.projectId, input.projectId), isNull(issues.deletedAt)), columns: { id: true } });
        if (!issue) throw new HttpError(404, "Issue not found");
    }

    if (viewId) {
        const view = await db.query.views.findFirst({ where: and(eq(views.id, viewId), eq(views.projectId, input.projectId), isNull(views.deletedAt)), columns: { shared: true, ownerId: true } });
        if (!view || (!view.shared && view.ownerId !== userId)) throw new HttpError(404, "View not found");
    }

    // Favoriting twice is a no-op that returns the existing favorite.
    const [inserted] = await db
        .insert(favorites)
        .values({ userId, kind: input.kind, projectId: input.projectId, documentId, issueId, viewId })
        .onConflictDoUpdate({
            target: [favorites.userId, favorites.kind, favorites.projectId, favorites.documentId, favorites.issueId, favorites.viewId],
            set: { deletedAt: null },
        })
        .returning({ id: favorites.id });
    const id =
        inserted?.id ??
        (await db.query.favorites.findFirst({
            where: (table, { and: all, eq: equals, isNull }) =>
                all(
                    equals(table.userId, userId),
                    equals(table.kind, input.kind),
                    equals(table.projectId, input.projectId),
                    documentId ? equals(table.documentId, documentId) : isNull(table.documentId),
                    issueId ? equals(table.issueId, issueId) : isNull(table.issueId),
                    viewId ? equals(table.viewId, viewId) : isNull(table.viewId),
                ),
            columns: { id: true },
        }))?.id;
    const row = id ? await findFavorite(id) : undefined;
    if (!row) throw new HttpError(500, "Could not save the favorite");
    return toFavorite(row);
}

export async function removeFavorite(userId: string, favoriteId: string) {
    const deletedAt = new Date();
    const [removed] = await db.update(favorites).set({ deletedAt }).where(and(eq(favorites.id, favoriteId), eq(favorites.userId, userId), isNull(favorites.deletedAt))).returning({ id: favorites.id });
    if (!removed) throw new HttpError(404, "Favorite not found");
    return { deletedAt: deletedAt.toISOString() };
}

export async function restoreFavorite(userId: string, favoriteId: string, deletedAt: Date) {
    requireUndoWindow(deletedAt);
    const [restored] = await db.update(favorites).set({ deletedAt: null }).where(and(
        eq(favorites.id, favoriteId), eq(favorites.userId, userId), eq(favorites.deletedAt, deletedAt),
    )).returning({ id: favorites.id });
    if (!restored) throw new HttpError(404, "Favorite not found or undo window expired");
    return { restored: true };
}
