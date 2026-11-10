import type { IssueOrder, IssuePriority } from "@rinia/shared";
import { sql, type SQL } from "drizzle-orm";
import { issues } from "../../db/schema";
import { HttpError } from "../../lib/http-error";

/** Same ranking the list uses: most urgent first, no priority last. */
const priorityRank = sql`case ${issues.priority} when 'urgent' then 0 when 'high' then 1 when 'medium' then 2 when 'low' then 3 else 4 end`;

const PRIORITY_RANK: Record<IssuePriority, number> = { urgent: 0, high: 1, medium: 2, low: 3, none: 4 };

/** The columns a cursor has to repeat so the next page continues in the same order. */
interface IssueCursorPoint {
    number: number;
    position?: number;
    updatedAt?: string;
    rank?: number;
    dueDate?: string | null;
}

/** A row the cursor can be taken from. Dates may already be strings. */
export interface CursorSource {
    number: number;
    position: number;
    updatedAt: Date | string;
    priority: IssuePriority;
    dueDate: string | null;
}

/** Opaque cursor. It carries the sort key of the last row, not an offset, so inserts do not shift the next page. */
export function encodeIssueCursor(orderBy: IssueOrder, issue: CursorSource): string {
    const point: IssueCursorPoint = { number: issue.number };
    if (orderBy === "position") point.position = issue.position;
    if (orderBy === "updated") point.updatedAt = new Date(issue.updatedAt).toISOString();
    if (orderBy === "priority") point.rank = PRIORITY_RANK[issue.priority] ?? PRIORITY_RANK.none;
    if (orderBy === "due") point.dueDate = issue.dueDate;
    return Buffer.from(JSON.stringify(point)).toString("base64url");
}

export function decodeIssueCursor(cursor: string): IssueCursorPoint | null {
    try {
        const parsed = JSON.parse(Buffer.from(cursor, "base64url").toString()) as IssueCursorPoint;
        if (!parsed || typeof parsed.number !== "number" || !Number.isFinite(parsed.number)) return null;
        return parsed;
    } catch {
        return null;
    }
}

/**
 * Rows strictly after `cursor` in the list's order. The issue number breaks ties, and it is unique per project,
 * so the order never repeats a row or skips one.
 */
export function issueCursorFilter(orderBy: IssueOrder, cursor: string): SQL {
    const point = decodeIssueCursor(cursor);
    if (!point) throw new HttpError(400, "Invalid cursor");
    const numberTie = sql`${issues.number} > ${point.number}`;
    if (orderBy === "number") return numberTie;
    if (orderBy === "position") {
        if (typeof point.position !== "number") throw new HttpError(400, "Invalid cursor");
        return sql`(${issues.position} > ${point.position} or (${issues.position} = ${point.position} and ${numberTie}))`;
    }
    if (orderBy === "updated") {
        if (typeof point.updatedAt !== "string") throw new HttpError(400, "Invalid cursor");
        return sql`(${issues.updatedAt} < ${point.updatedAt} or (${issues.updatedAt} = ${point.updatedAt} and ${numberTie}))`;
    }
    if (orderBy === "priority") {
        if (typeof point.rank !== "number") throw new HttpError(400, "Invalid cursor");
        return sql`(${priorityRank} > ${point.rank} or (${priorityRank} = ${point.rank} and ${numberTie}))`;
    }
    if (point.dueDate) return sql`(${issues.dueDate} > ${point.dueDate} or (${issues.dueDate} = ${point.dueDate} and ${numberTie}) or ${issues.dueDate} is null)`;
    return sql`(${issues.dueDate} is null and ${numberTie})`;
}
