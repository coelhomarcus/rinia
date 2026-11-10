import { and, desc, eq, ilike, isNull, or, sql, type SQL } from "drizzle-orm";
import { db } from "../../db";
import { boardColumns, issues, projectDocuments, projects } from "../../db/schema";
import { HttpError } from "../../lib/http-error";
import { visibleDocuments, visibleIssues } from "../../lib/guest-access";
import { consumeRateLimit } from "../../lib/rate-limit";

export interface SearchOptions {
    /** Only this project. Membership is the caller's to check. */
    projectId?: string;
    limit?: number;
}

/** `%term%` for ILIKE, with the term's own wildcards matched literally. */
function containing(term: string) {
    return `%${term.replace(/[\\%_]/g, (character) => `\\${character}`)}%`;
}

/** Every text value in a Tiptap document, so a search matches what people wrote and not the JSON around it. */
const richText = (column: SQL | typeof issues.descriptionJson | typeof projectDocuments.contentJson) => sql`jsonb_path_query_array(${column}, 'lax $.**.text')::text`;

/**
 * Issues and pages whose title or text contains the term, from what the user can see: every issue and page of their
 * projects, or for a guest, only what was shared with them. An identifier such as
 * `RIN-4` finds that issue first. Pages are searched in their last saved state.
 */
export async function searchWorkspace(userId: string, term: string, options: SearchOptions = {}) {
    const hit = consumeRateLimit("search", userId);
    if (!hit.allowed) {
        const error = new HttpError(429, "Too many requests. Please try again later.");
        error.retryAfter = hit.retryAfterSeconds;
        throw error;
    }
    const limit = options.limit ?? 20;
    const pattern = containing(term.trim());
    const scope: SQL[] = [];
    if (options.projectId) scope.push(eq(projects.id, options.projectId));

    const identifier = /^([A-Za-z0-9]{2,8})-(\d+)$/.exec(term.trim());
    const issueMatch = or(
        ilike(issues.title, pattern),
        sql`${richText(issues.descriptionJson)} ilike ${pattern}`,
        identifier ? and(eq(projects.issueKey, identifier[1].toUpperCase()), eq(issues.number, Number(identifier[2]))) : undefined,
    );
    const exactFirst = identifier ? sql`case when ${projects.issueKey} = ${identifier[1].toUpperCase()} and ${issues.number} = ${Number(identifier[2])} then 0 else 1 end` : sql`1`;
    const titleFirst = sql`case when ${issues.title} ilike ${pattern} then 0 else 1 end`;

    const [issueRows, documentRows] = await Promise.all([
        db
            .select({ number: issues.number, title: issues.title, priority: issues.priority, updatedAt: issues.updatedAt, issueKey: projects.issueKey, projectName: projects.name, state: boardColumns.name })
            .from(issues)
            .innerJoin(projects, eq(issues.projectId, projects.id))
            .innerJoin(boardColumns, eq(issues.columnId, boardColumns.id))
            .where(and(isNull(issues.deletedAt), issueMatch, visibleIssues(userId), ...scope))
            .orderBy(exactFirst, titleFirst, desc(issues.updatedAt))
            .limit(limit),
        db
            .select({ id: projectDocuments.id, title: projectDocuments.title, updatedAt: projectDocuments.updatedAt, issueKey: projects.issueKey, projectName: projects.name })
            .from(projectDocuments)
            .innerJoin(projects, eq(projectDocuments.projectId, projects.id))
            .where(and(isNull(projectDocuments.deletedAt), or(ilike(projectDocuments.title, pattern), sql`${richText(projectDocuments.contentJson)} ilike ${pattern}`), visibleDocuments(userId), ...scope))
            .orderBy(sql`case when ${projectDocuments.title} ilike ${pattern} then 0 else 1 end`, desc(projectDocuments.updatedAt))
            .limit(limit),
    ]);
    return { issues: issueRows, documents: documentRows };
}
