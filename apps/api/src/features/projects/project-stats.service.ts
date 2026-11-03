import { columnBucket, isDoneColumn, PROJECT_STATS_ACTIVITY_DAYS, PROJECT_STATS_MIN_PERIOD_DAYS, type ProjectActivityDay, type ProjectPersonStats, type ProjectStats, type ProjectStatsQuery } from "@rinia/shared";
import { eq, sql } from "drizzle-orm";
import { db } from "../../db";
import { boardColumns, projectMembers, projects } from "../../db/schema";
import { HttpError } from "../../lib/http-error";

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

/** Calendar days from `from` to `to`, counting both. */
export function daysBetween(from: string, to: string): number {
    const [a, b] = [from, to].map((day) => {
        const [year, month, date] = day.split("-").map(Number);
        return Date.UTC(year!, month! - 1, date!);
    });
    return Math.round((b! - a!) / 86_400_000) + 1;
}

/** Where the charts start: the day the project was created, or a week before today for a newer project. */
export function periodStartFor(createdDay: string, today: string): string {
    const earliest = addDays(today, -(PROJECT_STATS_MIN_PERIOD_DAYS - 1));
    return createdDay < earliest ? createdDay : earliest;
}

/** Turns the per-day rows into the response: every day filled in, the period's series, the totals and the streaks. */
export function buildProjectStats({ today, timeZone, periodStart, openIssues, rows, people = [] }: { today: string; timeZone: string; periodStart: string; openIssues: number; rows: ActivityRow[]; people?: ProjectPersonStats[] }): ProjectStats {
    const byDay = new Map(rows.map((row) => [row.day, row]));
    const periodDays = Math.max(1, daysBetween(periodStart, today));
    const series = (length: number) => Array.from({ length }, (_, index) => addDays(today, index - length + 1));
    const day = (date: string): ProjectActivityDay => {
        const row = byDay.get(date);
        const created = row?.created ?? 0;
        const completed = row?.completed ?? 0;
        return { date, created, completed, updated: Math.max(0, (row?.total ?? 0) - created - completed) };
    };

    // Streaks run over the whole life of the project, or the whole map when that is longer.
    const everyDay = series(Math.max(PROJECT_STATS_ACTIVITY_DAYS, periodDays)).map(day);
    const activity = everyDay.slice(-PROJECT_STATS_ACTIVITY_DAYS);
    const period = series(periodDays).map((date) => {
        const row = byDay.get(date);
        const created = row?.created ?? 0;
        const createdMcp = Math.min(created, row?.createdMcp ?? 0);
        return { date, completed: row?.completed ?? 0, createdWeb: created - createdMcp, createdMcp };
    });

    let longestStreak = 0;
    let run = 0;
    for (const entry of everyDay) {
        run = entry.completed > 0 ? run + 1 : 0;
        longestStreak = Math.max(longestStreak, run);
    }
    // A streak still counts while today has nothing yet, as long as it ran up to yesterday.
    let currentStreak = 0;
    let index = everyDay.length - 1;
    if (everyDay[index]?.completed === 0) index -= 1;
    while (index >= 0 && everyDay[index]!.completed > 0) {
        currentStreak += 1;
        index -= 1;
    }

    return {
        today,
        timeZone,
        periodStart,
        openIssues,
        completedInPeriod: period.reduce((sum, entry) => sum + entry.completed, 0),
        longestStreak,
        currentStreak,
        activity,
        period,
        people,
    };
}

/** Open issues per assignee and column, as the counts query groups them. */
export interface OpenRow {
    columnId: string;
    assigneeId: string | null;
    count: number;
}

/** Per-person activity since the period began, as the people query groups it. */
export interface PersonRow {
    userId: string;
    created: number;
    completed: number;
}

/**
 * Every current member's numbers, most completed first, then most open, then most created. People who left the
 * project are not listed, even when their past work still counts in the project's totals.
 */
export function buildPeopleStats(memberIds: string[], openRows: OpenRow[], closedColumns: Set<string>, personRows: PersonRow[]): ProjectPersonStats[] {
    const people = new Map(memberIds.map((userId) => [userId, { userId, completed: 0, created: 0, open: 0 }]));
    for (const row of openRows) {
        const person = row.assigneeId ? people.get(row.assigneeId) : undefined;
        if (person && !closedColumns.has(row.columnId)) person.open += row.count;
    }
    for (const row of personRows) {
        const person = people.get(row.userId);
        if (!person) continue;
        person.completed += row.completed;
        person.created += row.created;
    }
    return [...people.values()].sort((a, b) => b.completed - a.completed || b.open - a.open || b.created - a.created);
}

/**
 * The overview's numbers for one project: open issues, and per-day created, completed and other changes from the
 * activity log, from the day the project was created. Deleted issues are left out, and days are counted in the
 * viewer's time zone.
 */
export async function getProjectStats(projectId: string, { tz }: ProjectStatsQuery): Promise<ProjectStats> {
    const project = await db.query.projects.findFirst({ where: eq(projects.id, projectId), columns: { createdAt: true } });
    if (!project) throw new HttpError(404, "Project not found");
    const today = dayInZone(new Date(), tz);
    const periodStart = periodStartFor(dayInZone(project.createdAt, tz), today);
    const since = addDays(today, -(Math.max(PROJECT_STATS_ACTIVITY_DAYS, daysBetween(periodStart, today)) - 1));
    const columns = await db.query.boardColumns.findMany({ where: eq(boardColumns.projectId, projectId), columns: { id: true, name: true } });
    const closed = new Set(columns.filter((column) => columnBucket(column.name) === "closed").map((column) => column.id));
    const done = JSON.stringify(columns.filter((column) => isDoneColumn(column.name)).map((column) => column.id));

    const counts = await db.execute(sql`
        SELECT column_id AS "columnId", assignee_id AS "assigneeId", count(*)::int AS count
        FROM issues
        WHERE project_id = ${projectId} AND deleted_at IS NULL
        GROUP BY column_id, assignee_id`);
    const openRows = counts.rows as unknown as OpenRow[];
    const openIssues = openRows.filter((row) => !closed.has(row.columnId)).reduce((sum, row) => sum + row.count, 0);

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

    // A completion counts for the issue's assignee, so moving someone else's card does not take their credit; with
    // nobody assigned, it counts for whoever completed it.
    const perPerson = await db.execute(sql`
        SELECT person AS "userId", sum(created)::int AS created, sum(completed)::int AS completed
        FROM (
            SELECT a.actor_id AS person, 1 AS created, 0 AS completed
            FROM issue_activities a
            JOIN issues i ON i.id = a.issue_id
            WHERE i.project_id = ${projectId} AND i.deleted_at IS NULL AND a.type = 'created'
                AND a.created_at >= (${periodStart}::date::timestamp AT TIME ZONE ${tz})
            UNION ALL
            SELECT COALESCE(i.assignee_id, a.actor_id) AS person, 0 AS created, 1 AS completed
            FROM issue_activities a
            JOIN issues i ON i.id = a.issue_id
            WHERE i.project_id = ${projectId} AND i.deleted_at IS NULL AND a.type = 'status_changed'
                AND a.payload->>'to' IN (SELECT jsonb_array_elements_text(${done}::jsonb))
                AND a.created_at >= (${periodStart}::date::timestamp AT TIME ZONE ${tz})
        ) AS work
        GROUP BY person`);
    const members = await db.query.projectMembers.findMany({ where: eq(projectMembers.projectId, projectId), columns: { userId: true } });
    const people = buildPeopleStats(members.map((member) => member.userId), openRows, closed, perPerson.rows as unknown as PersonRow[]);

    return buildProjectStats({ today, timeZone: tz, periodStart, openIssues, rows: activity.rows as unknown as ActivityRow[], people });
}
