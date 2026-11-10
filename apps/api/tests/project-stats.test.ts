import assert from "node:assert/strict";
import { afterEach, mock, spyOn, test } from "bun:test";
import type { NextFunction, Request, Response } from "express";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import { PROJECT_STATS_ACTIVITY_DAYS, projectStatsQuerySchema } from "@rinia/shared";
import { db } from "../src/db";
import { HttpError } from "../src/lib/http-error";
import { addDays, buildPeopleStats, buildProjectStats, dayInZone, daysBetween, getProjectStats, periodStartFor, type ActivityRow } from "../src/features/projects/project-stats.service";

// The routes read the app settings on import; give them what they need without a local .env.
process.env.JWT_SECRET ??= "test-secret";
process.env.DATABASE_URL ??= "postgres://localhost/unused";
process.env.SPECIAL_REGISTRATION_CODE ??= "test-code";
const { projectsRouter } = await import("../src/features/projects/projects.routes");
const { requireProjectMember } = await import("../src/middleware/project-membership.middleware");
const { stubProjectAccess } = await import("./fixtures/project-membership");

// Stub the database boundary: these tests never connect to or mutate a development database.
afterEach(() => mock.restore());

const today = "2026-11-03";
const row = (day: string, values: Partial<ActivityRow>): ActivityRow => ({ day, created: 0, createdMcp: 0, completed: 0, total: 0, ...values });

test("days are counted in the viewer's time zone and move across months and years", () => {
    const lateEvening = new Date("2026-11-04T01:30:00Z");
    assert.equal(dayInZone(lateEvening, "UTC"), "2026-11-04");
    assert.equal(dayInZone(lateEvening, "America/Sao_Paulo"), "2026-11-03");
    assert.equal(addDays("2026-03-01", -1), "2026-02-28");
    assert.equal(addDays("2026-12-31", 1), "2027-01-01");
    assert.equal(addDays("2028-03-01", -1), "2028-02-29");
    assert.equal(daysBetween("2026-11-03", "2026-11-03"), 1);
    assert.equal(daysBetween("2025-11-04", "2026-11-03"), 365);
});

test("the charts start the day the project was created, or a week back for a newer project", () => {
    assert.equal(periodStartFor("2026-10-12", today), "2026-10-12");
    assert.equal(periodStartFor("2024-01-01", today), "2024-01-01");
    assert.equal(periodStartFor("2026-11-02", today), "2026-10-28");
    assert.equal(periodStartFor(today, today), "2026-10-28");
});

test("every day is filled in, oldest first, ending today", () => {
    const stats = buildProjectStats({ today, timeZone: "UTC", periodStart: "2026-10-12", openIssues: 4, rows: [row("2026-11-01", { created: 2, completed: 1, total: 5 })] });
    assert.equal(stats.activity.length, PROJECT_STATS_ACTIVITY_DAYS);
    assert.equal(stats.activity.at(-1)?.date, today);
    assert.equal(stats.activity[0]?.date, addDays(today, -(PROJECT_STATS_ACTIVITY_DAYS - 1)));
    assert.equal(stats.periodStart, "2026-10-12");
    assert.equal(stats.period.length, 23);
    assert.equal(stats.period[0]?.date, "2026-10-12");
    assert.equal(stats.period.at(-1)?.date, today);
    // Created and completed are their own counts; everything else in the day is an update.
    assert.deepEqual(stats.activity.find((day) => day.date === "2026-11-01"), { date: "2026-11-01", created: 2, completed: 1, updated: 2 });
    assert.equal(stats.openIssues, 4);
});

test("a project older than a year gets every day since it was created", () => {
    const stats = buildProjectStats({ today, timeZone: "UTC", periodStart: "2024-11-04", openIssues: 0, rows: [row("2025-01-10", { completed: 3, total: 3 })] });
    assert.equal(stats.period.length, 730);
    assert.equal(stats.activity.length, PROJECT_STATS_ACTIVITY_DAYS);
    assert.equal(stats.completedInPeriod, 3, "completions from before the contribution map still count");
});

test("issues created through MCP are split from the ones created in the app", () => {
    const stats = buildProjectStats({ today, timeZone: "UTC", periodStart: "2026-10-28", openIssues: 0, rows: [row(today, { created: 5, createdMcp: 2, total: 5 })] });
    assert.deepEqual(stats.period.at(-1), { date: today, completed: 0, createdWeb: 3, createdMcp: 2 });
});

test("completed counts and streaks", () => {
    const rows = [
        // A three-day run a week ago, and a two-day run ending yesterday; nothing yet today.
        ...["2026-10-25", "2026-10-26", "2026-10-27"].map((day) => row(day, { completed: 1, total: 1 })),
        row("2026-11-01", { completed: 2, total: 2 }),
        row("2026-11-02", { completed: 1, total: 1 }),
        // Before the project's period: not counted as completed in it.
        row("2026-09-01", { completed: 4, total: 4 }),
    ];
    const stats = buildProjectStats({ today, timeZone: "UTC", periodStart: "2026-10-28", openIssues: 0, rows });
    assert.equal(stats.completedInPeriod, 3);
    assert.equal(stats.longestStreak, 3);
    assert.equal(stats.currentStreak, 2, "a quiet today keeps the streak that ran to yesterday");

    const broken = buildProjectStats({ today, timeZone: "UTC", periodStart: "2026-10-28", openIssues: 0, rows: [row("2026-11-01", { completed: 1, total: 1 })] });
    assert.equal(broken.currentStreak, 0, "a gap yesterday ends the streak");

    // A streak older than a year still counts as the longest.
    const old = buildProjectStats({ today, timeZone: "UTC", periodStart: "2024-01-01", openIssues: 0, rows: ["2024-03-01", "2024-03-02", "2024-03-03", "2024-03-04"].map((day) => row(day, { completed: 1, total: 1 })) });
    assert.equal(old.longestStreak, 4);

    const empty = buildProjectStats({ today, timeZone: "UTC", periodStart: "2026-10-28", openIssues: 0, rows: [] });
    assert.deepEqual([empty.completedInPeriod, empty.longestStreak, empty.currentStreak], [0, 0, 0]);
});

test("the query takes a real time zone", () => {
    assert.deepEqual(projectStatsQuerySchema.parse({}), { tz: "UTC" });
    assert.deepEqual(projectStatsQuerySchema.parse({ tz: "America/Sao_Paulo" }), { tz: "America/Sao_Paulo" });
    for (const query of [{ tz: "Mars/Olympus" }, { tz: "'; DROP TABLE issues; --" }]) {
        assert.equal(projectStatsQuerySchema.safeParse(query).success, false, JSON.stringify(query));
    }
});

test("the period starts on the day the project was created, in the viewer's time zone", async () => {
    // 01:30 UTC on 1 October is still 30 September in São Paulo.
    spyOn(db.query.projects, "findFirst").mockImplementation(async () => ({ createdAt: new Date("2025-10-01T01:30:00Z") }) as never);
    spyOn(db.query.projectMembers, "findMany").mockImplementation(async () => [{ userId: "ana" }, { userId: "bia" }] as never);
    spyOn(db.query.boardColumns, "findMany").mockImplementation(async () => [] as never);
    spyOn(db, "execute").mockImplementation((async () => ({ rows: [] })) as never);
    assert.equal((await getProjectStats("project", { tz: "America/Sao_Paulo" })).periodStart, "2025-09-30");
    assert.equal((await getProjectStats("project", { tz: "UTC" })).periodStart, "2025-10-01");
});

test("a missing project is a 404", async () => {
    spyOn(db.query.projects, "findFirst").mockImplementation(async () => undefined);
    await assert.rejects(getProjectStats("project", { tz: "UTC" }), (error: unknown) => error instanceof HttpError && error.statusCode === 404);
});

test("open issues leave out closed states, and the activity skips deleted issues and counts only done states as completed", async () => {
    spyOn(db.query.projects, "findFirst").mockImplementation(async () => ({ createdAt: new Date("2026-10-01T12:00:00Z") }) as never);
    spyOn(db.query.projectMembers, "findMany").mockImplementation(async () => [{ userId: "ana" }, { userId: "bia" }] as never);
    spyOn(db.query.boardColumns, "findMany").mockImplementation(async () => [
        { id: "todo", name: "A fazer" },
        { id: "doing", name: "Em andamento" },
        { id: "done", name: "Concluído" },
        { id: "cancelled", name: "Cancelado" },
    ] as never);
    const queries: SQL[] = [];
    spyOn(db, "execute").mockImplementation((async (query: SQL) => {
        queries.push(query);
        if (queries.length === 1) return { rows: [{ columnId: "todo", count: 3 }, { columnId: "doing", count: 2 }, { columnId: "done", count: 7 }, { columnId: "cancelled", count: 1 }] };
        return { rows: [] };
    }) as never);

    const stats = await getProjectStats("project", { tz: "America/Sao_Paulo" });
    assert.equal(stats.openIssues, 5);
    assert.equal(stats.timeZone, "America/Sao_Paulo");

    const [counts, activity, perPerson] = queries.map((query) => new PgDialect().sqlToQuery(query));
    assert.match(counts!.sql, /deleted_at IS NULL/);
    assert.match(activity!.sql, /i\.deleted_at IS NULL/);
    assert.ok(activity!.params.includes("project"));
    assert.ok(activity!.params.includes("America/Sao_Paulo"), "the time zone is a bound parameter, never spliced into the SQL");
    // Only the done state completes an issue; cancelling does not.
    assert.ok(activity!.params.includes(JSON.stringify(["done"])));
    // People: completions go to the assignee, falling back to whoever completed it; deleted issues are left out.
    assert.match(perPerson!.sql, /COALESCE\(i\.assignee_id, a\.actor_id\)/);
    assert.equal(perPerson!.sql.match(/i\.deleted_at IS NULL/g)?.length, 2);
    assert.deepEqual(stats.people.map((person) => person.userId), ["ana", "bia"]);
});

test("each member's numbers: open counts only open states, and people who left are not listed", () => {
    const closed = new Set(["done"]);
    const people = buildPeopleStats(
        ["ana", "bia", "caio"],
        [
            { columnId: "todo", assigneeId: "ana", count: 2 },
            { columnId: "done", assigneeId: "ana", count: 5 },
            { columnId: "todo", assigneeId: "bia", count: 1 },
            { columnId: "todo", assigneeId: null, count: 4 },
            { columnId: "todo", assigneeId: "left", count: 3 },
        ],
        closed,
        [
            { userId: "bia", created: 2, completed: 6 },
            { userId: "ana", created: 7, completed: 1 },
            { userId: "left", created: 9, completed: 9 },
        ],
    );
    assert.deepEqual(people, [
        { userId: "bia", completed: 6, created: 2, open: 1 },
        { userId: "ana", completed: 1, created: 7, open: 2 },
        { userId: "caio", completed: 0, created: 0, open: 0 },
    ]);
});

function guard(member: boolean): Promise<number> {
    stubProjectAccess([{ membership: member ? { id: "membership", role: "member" } : null }]);
    return new Promise((resolve, reject) => {
        let status = 200;
        const response = { status(code: number) { status = code; return this; }, json() { resolve(status); } };
        const next: NextFunction = (error?: unknown) => (error ? reject(error) : resolve(200));
        requireProjectMember({ params: { projectId: "project" }, user: { sub: "user" } } as unknown as Request<{ projectId: string }>, response as unknown as Response, next);
    });
}

test("only project members can read the stats", async () => {
    const layer = (projectsRouter.stack as Array<{ route?: { path: string; stack: Array<{ handle: unknown }> } }>).find((entry) => entry.route?.path === "/:projectId/stats");
    assert.ok(layer?.route, "the stats route exists");
    assert.ok(layer.route.stack.some((entry) => entry.handle === requireProjectMember), "the stats route requires membership");
    assert.equal(await guard(false), 403);
    assert.equal(await guard(true), 200);
});
