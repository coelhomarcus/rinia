import assert from "node:assert/strict";
import { afterEach, mock, spyOn, test } from "bun:test";
import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";

process.env.JWT_SECRET ??= "test-secret";
process.env.DATABASE_URL ??= "postgres://localhost/unused";
process.env.SPECIAL_REGISTRATION_CODE ??= "test-code";

const { db } = await import("../src/db");
const { HttpError } = await import("../src/lib/http-error");
const { decodeIssueCursor, encodeIssueCursor, issueCursorFilter } = await import("../src/features/issues/issue-cursor");
const { listIssuePage } = await import("../src/features/issues/issues.service");

afterEach(() => mock.restore());

const projectId = "5e3f7a91-0000-4000-8000-0000000000aa";
const member = { userId: "5e3f7a91-0000-4000-8000-000000000001", role: "member" as const };
const render = (condition: SQL) => new PgDialect().sqlToQuery(condition);
const isHttp = (status: number) => (error: unknown) => error instanceof HttpError && error.statusCode === status;

const source = {
    number: 4,
    position: 1500,
    updatedAt: "2026-11-01T12:00:00.000Z",
    priority: "high" as const,
    dueDate: "2026-11-10",
};

test("a cursor round-trips the sort key and continues after that row", () => {
    const cursor = encodeIssueCursor("position", source);
    assert.deepEqual(decodeIssueCursor(cursor), { number: 4, position: 1500 });
    const query = render(issueCursorFilter("position", cursor));
    assert.match(query.sql, /"position" >/);
    assert.match(query.sql, /"number" >/);
    assert.ok(query.params.includes(1500));
    assert.ok(query.params.includes(4));

    const updated = render(issueCursorFilter("updated", encodeIssueCursor("updated", source)));
    assert.match(updated.sql, /"updated_at" </);
    const due = render(issueCursorFilter("due", encodeIssueCursor("due", { ...source, dueDate: null })));
    assert.match(due.sql, /"due_date" is null/);
    const priority = render(issueCursorFilter("priority", encodeIssueCursor("priority", source)));
    assert.match(priority.sql, /when 'urgent' then 0/);
});

test("a cursor that is not one of ours is rejected", async () => {
    await assert.rejects(() => listIssuePage(projectId, { orderBy: "position", limit: 10, cursor: "%%%" }, member), isHttp(400));
});

test("a limited page returns one extra row's worth of cursor and the full count", async () => {
    const rows = [1, 2, 3].map((number) => ({
        number,
        position: number * 1000,
        updatedAt: new Date("2026-11-01T12:00:00.000Z"),
        priority: "medium",
        dueDate: null,
        labels: [],
    }));
    let limit: number | undefined;
    spyOn(db.query.issues, "findMany").mockImplementation(((config: { limit?: number }) => ((limit = config.limit), Promise.resolve(rows))) as never);
    spyOn(db.query.projects, "findFirst").mockImplementation(async () => ({ issueKey: "RIN" }) as never);
    spyOn(db, "select").mockImplementation((() => ({ from: () => ({ where: async () => [{ value: 40 }] }) })) as never);

    const page = await listIssuePage(projectId, { orderBy: "position", limit: 2 }, member);
    assert.equal(limit, 3);
    assert.equal(page.issues.length, 2);
    assert.equal(page.issues[0]?.identifier, "RIN-1");
    assert.equal(page.total, 40);
    assert.equal(decodeIssueCursor(page.nextCursor!)?.number, 2);
    assert.equal(decodeIssueCursor(page.nextCursor!)?.position, 2000);
});

test("limit 0 counts without loading rows", async () => {
    const findMany = spyOn(db.query.issues, "findMany");
    spyOn(db.query.projects, "findFirst").mockImplementation(async () => ({ issueKey: "RIN" }) as never);
    spyOn(db, "select").mockImplementation((() => ({ from: () => ({ where: async () => [{ value: 12 }] }) })) as never);
    const page = await listIssuePage(projectId, { orderBy: "position", limit: 0, closed: "only" }, member);
    assert.equal(findMany.mock.calls.length, 0);
    assert.deepEqual(page, { issues: [], nextCursor: null, total: 12 });
});
