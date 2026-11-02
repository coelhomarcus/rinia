import { and, inArray, isNotNull, lt } from "drizzle-orm";
import { db } from "./index";
import { favorites, issueComments, issues, projectDocuments, views } from "./schema";
import { SOFT_DELETE_RETENTION_MS } from "../lib/soft-delete";

/** Permanently removes undoable deletions after their recovery window has elapsed, and says how many of each went. */
export async function cleanupExpiredDeletes(now = new Date()) {
    const cutoff = new Date(now.getTime() - SOFT_DELETE_RETENTION_MS);
    const removed = { favorites: 0, views: 0, documents: 0, comments: 0, issues: 0 };
    removed.favorites = (await db.delete(favorites).where(and(isNotNull(favorites.deletedAt), lt(favorites.deletedAt, cutoff)))).rowCount ?? 0;
    removed.views = (await db.delete(views).where(and(isNotNull(views.deletedAt), lt(views.deletedAt, cutoff)))).rowCount ?? 0;
    removed.documents = (await db.delete(projectDocuments).where(and(isNotNull(projectDocuments.deletedAt), lt(projectDocuments.deletedAt, cutoff)))).rowCount ?? 0;
    removed.comments = (await db.delete(issueComments).where(and(isNotNull(issueComments.deletedAt), lt(issueComments.deletedAt, cutoff)))).rowCount ?? 0;

    const expiredIssues = await db.query.issues.findMany({
        where: and(isNotNull(issues.deletedAt), lt(issues.deletedAt, cutoff)),
        columns: { id: true },
    });
    const ids = expiredIssues.map((issue) => issue.id);
    if (!ids.length) return removed;
    await db.update(issues).set({ parentIssueId: null }).where(inArray(issues.parentIssueId, ids));
    removed.issues = (await db.delete(issues).where(inArray(issues.id, ids))).rowCount ?? 0;
    return removed;
}
