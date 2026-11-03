import { columnBucket, isDoneColumn, PROJECT_STATS_ACTIVITY_DAYS, type ProjectActivityDay, type ProjectStats, type ProjectStatsQuery } from "@rinia/shared";
import { eq, sql } from "drizzle-orm";
import { db } from "../../db";
import { boardColumns } from "../../db/schema";

/** One day of `issue_activities`, as the query groups it. */
export interface ActivityRow {
    day: string;
    created: number;
    createdMcp: number;
    completed: number;
    total: number;
}

/** The calendar day `date` falls on in `timeZone`, as YYYY-MM-DD. */
export function dayInZone(date: Date, timeZone: string): string {
    return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

/** `day` moved by `amount` calendar days. */
export function addDays(day: string, amount: number): string {
    const [year, month, date] = day.split("-").map(Number);
    return new Date(Date.UTC(year!, month! - 1, date! + amount)).toISOString().slice(0, 10);
}

/** Turns the per-day rows into the response: every day filled in, the period's series, the totals and the streaks. */
export function buildProjectStats({ today, timeZone, days, openIssues, rows }: { today: string; timeZone: string; days: number; openIssues: number; rows: ActivityRow[] }): ProjectStats {
    const byDay = new Map(rows.map((row) => [row.day, row]));
    const series = (length: number) => Array.from({ length }, (_, index) => addDays(today, index - length + 1));

    const activity: ProjectActivityDay[] = series(PROJECT_STATS_ACTIVITY_DAYS).map((date) => {
        const row = byDay.get(date);
        const created = row?.created ?? 0;
        const completed = row?.completed ?? 0;
        return { date, created, completed, updated: Math.max(0, (row?.total ?? 0) - created - completed) };
    });
    const period = series(days).map((date) => {
        const row = byDay.get(date);
        const created = row?.created ?? 0;
        const createdMcp = Math.min(created, row?.createdMcp ?? 0);
        return { date, completed: row?.completed ?? 0, createdWeb: created - createdMcp, createdMcp };
    });

    let longestStreak = 0;
    let run = 0;
    for (const day of activity) {
        run = day.completed > 0 ? run + 1 : 0;
        longestStreak = Math.max(longestStreak, run);
    }
    // A streak still counts while today has nothing yet, as long as it ran up to yesterday.
    let currentStreak = 0;
    let index = activity.length - 1;
    if (activity[index]?.completed === 0) index -= 1;
    while (index >= 0 && activity[index]!.completed > 0) {
        currentStreak += 1;
        index -= 1;
    }

    return {
        today,
        timeZone,
        days,
        openIssues,
        completedInPeriod: period.reduce((sum, day) => sum + day.completed, 0),
        longestStreak,
        currentStreak,
        activity,
        period,
    };
}

/**
 * The overview's numbers for one project: open issues, and per-day created, completed and other changes from the
 * activity log. Deleted issues are left out, and days are counted in the viewer's time zone.
 */
export async function getProjectStats(projectId: string, { days, tz }: ProjectStatsQuery): Promise<ProjectStats> {
    const today = dayInZone(new Date(), tz);
    const since = addDays(today, -(Math.max(PROJECT_STATS_ACTIVITY_DAYS, days) - 1));
    const columns = await db.query.boardColumns.findMany({ where: eq(boardColumns.projectId, projectId), columns: { id: true, name: true } });
    const closed = new Set(columns.filter((column) => columnBucket(column.name) === "closed").map((column) => column.id));
    const done = JSON.stringify(columns.filter((column) => isDoneColumn(column.name)).map((column) => column.id));

    const counts = await db.execute(sql`
        SELECT column_id AS "columnId", count(*)::int AS count
        FROM issues
        WHERE project_id = ${projectId} AND deleted_at IS NULL
        GROUP BY column_id`);
    const openIssues = (counts.rows as Array<{ columnId: string; count: number }>).filter((row) => !closed.has(row.columnId)).reduce((sum, row) => sum + row.count, 0);

    const activity = await db.execute(sql`
        SELECT
            to_char(a.created_at AT TIME ZONE ${tz}, 'YYYY-MM-DD') AS day,
            count(*) FILTER (WHERE a.type = 'created')::int AS created,
            count(*) FILTER (WHERE a.type = 'created' AND a.source IS NOT NULL)::int AS "createdMcp",
            count(*) FILTER (WHERE a.type = 'status_changed' AND a.payload->>'to' IN (SELECT jsonb_array_elements_text(${done}::jsonb)))::int AS completed,
            count(*)::int AS total
        FROM issue_activities a
        JOIN issues i ON i.id = a.issue_id
        WHERE i.project_id = ${projectId}
            AND i.deleted_at IS NULL
            AND a.created_at >= (${since}::date::timestamp AT TIME ZONE ${tz})
        GROUP BY 1`);

    return buildProjectStats({ today, timeZone: tz, days, openIssues, rows: activity.rows as unknown as ActivityRow[] });
}
