import assert from "node:assert/strict";
import type { Server } from "node:http";
import { afterAll, afterEach, beforeAll, beforeEach, mock, spyOn, test } from "bun:test";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import { bulkUpdateIssuesSchema, issueListQuerySchema, nextLabels, positionsAtTop, updateIssueSchema } from "@rinia/shared";
import { db } from "../src/db";
import { sessionCookie, stubSessionAccounts } from "./fixtures/sessions";
import { stubProjectAccess, stubRole } from "./fixtures/project-membership";
import { issueActivities, issueLabels, issues } from "../src/db/schema";
import { bulkDeleteIssues, listIssues, updateIssue } from "../src/features/issues/issues.service";
import { HttpError } from "../src/lib/http-error";

// The app reads its settings on import; give it what it needs without a local .env.
process.env.JWT_SECRET ??= "test-secret";
process.env.DATABASE_URL ??= "postgres://localhost/unused";
process.env.SPECIAL_REGISTRATION_CODE ??= "test-code";
const { app } = await import("../src/app");
const { SESSION_COOKIE_NAME } = await import("../src/lib/cookies");

// Stub the database boundary: these tests never connect to or mutate a development database.
afterEach(() => mock.restore());
// Every account behind a session cookie exists and is active, unless a test says otherwise.
beforeEach(() => void stubSessionAccounts());

const ana = "5e3f7a91-0000-4000-8000-000000000001";
const projectId = "5e3f7a91-0000-4000-8000-0000000000aa";
const bug = "5e3f7a91-0000-4000-8000-0000000000b1";
const design = "5e3f7a91-0000-4000-8000-0000000000b2";
const infra = "5e3f7a91-0000-4000-8000-0000000000b3";
const done = "5e3f7a91-0000-4000-8000-0000000000c1";
const ids = Array.from({ length: 20 }, (_, index) => `5e3f7a91-0000-4000-8000-${String(index).padStart(12, "0")}`);
const isHttp = (status: number) => (error: unknown) => error instanceof HttpError && error.statusCode === status;
const render = (condition: SQL) => new PgDialect().sqlToQuery(condition);
const label = (id: string, name = id) => ({ categoryId: id, category: { id, name, color: null } });

let server: Server;
let baseUrl = "";
beforeAll(async () => {
    server = app.listen(0);
    await new Promise((resolve) => server.once("listening", resolve));
    const address = server.address();
    baseUrl = `http://127.0.0.1:${typeof address === "object" && address ? address.port : 0}`;
});
afterAll(() => server.close());

function call(method: string, path: string, body?: unknown) {
    return fetch(`${baseUrl}/api${path}`, {
        method,
        headers: { "Content-Type": "application/json", Cookie: sessionCookie(ana) },
        body: body === undefined ? undefined : JSON.stringify(body),
    });
}

function issueRow(id: string, overrides: Record<string, unknown> = {}) {
    return { id, projectId, number: ids.indexOf(id) + 1, columnId: "todo", priority: "none", assigneeId: null, estimate: null, dueDate: null, labels: [label(bug, "Bug")], ...overrides };
}

/** The project exists and `member` decides whether the caller belongs to it. */
function stubProject(member: boolean) {
    spyOn(db.query.projects, "findFirst").mockImplementation(async () => ({ id: projectId, issueKey: "RIN" }) as never);
    spyOn(db.query.projectMembers, "findFirst").mockImplementation(async () => (member ? ({ id: "membership", role: "member" } as never) : undefined));
    stubProjectAccess([{ membership: member ? { id: "membership", role: "member" } : null }]);
    spyOn(db.query.boardColumns, "findFirst").mockImplementation(async () => ({ id: done }) as never);
    // A moved card's neighbours are looked up to see whether the order needs spreading out; here none are close.
    spyOn(db, "execute").mockImplementation(async () => ({ rows: [] }) as never);
    spyOn(db.query.categories, "findMany").mockImplementation((async (config: { where: SQL }) => render(config.where).params.filter((param) => param !== projectId).map((id) => ({ id }))) as never);
}

/** A transaction whose writes are recorded by table; `failOn` makes writes to that table throw. */
function stubTransaction(failOn?: unknown) {
    const writes: Array<{ kind: string; table: unknown; values?: unknown; where?: SQL }> = [];
    const record = (kind: string, table: unknown, extra: { values?: unknown; where?: SQL }) => {
        if (table === failOn) throw new Error("write failed");
        writes.push({ kind, table, ...extra });
    };
    const tx = {
        update: (table: unknown) => ({ set: (values: unknown) => ({ where: async (where: SQL) => record("update", table, { values, where }) }) }),
        delete: (table: unknown) => ({ where: async (where: SQL) => record("delete", table, { where }) }),
        insert: (table: unknown) => ({
            values: (values: unknown) => Object.assign(Promise.resolve().then(() => record("insert", table, { values })), { onConflictDoNothing: async () => record("insert", table, { values }) }),
        }),
    };
    const transaction = spyOn(db, "transaction").mockImplementation((async (work: (tx: unknown) => Promise<unknown>) => work(tx)) as never);
    // Outside the transaction nothing may be written.
    for (const method of ["insert", "update", "delete"] as const) spyOn(db, method).mockImplementation((() => { throw new Error(`db.${method} outside the transaction`); }) as never);
    return { writes, transaction };
}

test("labels are a list of distinct ids, at most twenty", () => {
    assert.deepEqual(updateIssueSchema.parse({ categoryIds: [bug, bug, design] }).categoryIds, [bug, design]);
    assert.equal(updateIssueSchema.safeParse({ categoryIds: Array.from({ length: 21 }, (_, index) => ids[index % 20].replace(/.$/, String(index % 10))) }).success, false);
    assert.equal(updateIssueSchema.safeParse({ categoryId: bug }).success, false, "the single label field is gone");
    assert.deepEqual(issueListQuerySchema.parse({ categoryIds: `${bug},${design}` }).categoryIds, [bug, design]);
});

test("filtering by several labels matches issues with any of them", async () => {
    let where: SQL | undefined;
    spyOn(db.query.issues, "findMany").mockImplementation(((config: { where: SQL }) => ((where = config.where), Promise.resolve([]))) as never);
    spyOn(db.query.projects, "findFirst").mockImplementation(async () => ({ issueKey: "RIN" }) as never);
    await listIssues(projectId, { orderBy: "position", categoryIds: [bug, design] }, { userId: ana, role: "member" });
    const query = render(where!);
    assert.match(query.sql, /"issue_labels"\."category_id" in \(\$\d+, \$\d+\)/);
    assert.deepEqual(query.params.slice(-2), [bug, design]);
});

test("changing an issue's labels records each one added and removed", async () => {
    spyOn(db.query.issues, "findFirst").mockImplementation(async () => ({ ...issueRow(ids[0], { labels: [label(bug, "Bug"), label(design, "Design")] }), project: { id: projectId, name: "Rinia", issueKey: "RIN" } }) as never);
    stubProject(true);
    spyOn(db, "update").mockImplementation((() => ({ set: (values: unknown) => ({ where: () => ({ returning: async () => [{ ...(values as object), id: ids[0], number: 1 }] }) }) })) as never);
    const deletes: SQL[] = [];
    spyOn(db, "delete").mockImplementation((() => ({ where: async (where: SQL) => void deletes.push(where) })) as never);
    const inserts = new Map<unknown, unknown[]>();
    spyOn(db, "insert").mockImplementation(((table: unknown) => ({
        values: (values: unknown[]) => {
            inserts.set(table, [...(inserts.get(table) ?? []), ...values]);
            return Object.assign(Promise.resolve(), { onConflictDoNothing: async () => undefined });
        },
    })) as never);

    const updated = await updateIssue(ids[0], { categoryIds: [design, infra] }, ana);
    assert.deepEqual(updated.categoryIds, [design, infra]);
    assert.deepEqual(inserts.get(issueLabels), [{ issueId: ids[0], categoryId: infra }]);
    assert.deepEqual(render(deletes[0]).params, [ids[0], bug]);
    assert.deepEqual(inserts.get(issueActivities), [
        { issueId: ids[0], actorId: ana, type: "label_added", payload: { categoryId: infra } },
        { issueId: ids[0], actorId: ana, type: "label_removed", payload: { categoryId: bug } },
    ]);
});

test("bulk label changes replace, add, and remove", () => {
    assert.deepEqual(nextLabels([bug], { addCategoryIds: [design] }), [bug, design]);
    assert.deepEqual(nextLabels([bug, design], { removeCategoryIds: [bug] }), [design]);
    assert.deepEqual(nextLabels([bug], { categoryIds: [infra], addCategoryIds: [design] }), [infra, design]);
    assert.equal(bulkUpdateIssuesSchema.safeParse({ issueIds: [ids[0]], patch: {} }).success, false);
    assert.equal(bulkUpdateIssuesSchema.safeParse({ issueIds: [], patch: { priority: "high" } }).success, false);
});

test("changing twenty issues takes one request and one transaction, with an activity for each issue that changed", async () => {
    stubProject(true);
    // Two issues are already done, so only eighteen change state.
    spyOn(db.query.issues, "findMany").mockImplementation(async () => ids.map((id, index) => issueRow(id, index < 2 ? { columnId: done } : {})) as never);
    spyOn(db.query.issueSubscriptions, "findFirst").mockImplementation(async () => undefined);
    const select = spyOn(db, "select").mockImplementation((() => ({
        from: () => ({
            where: async () => [],
            leftJoin: () => ({
                where: async () => [{ membership: { id: "membership", role: "member" } }],
            }),
        }),
    })) as never);
    const { writes, transaction } = stubTransaction();

    const response = await call("PATCH", `/projects/${projectId}/issues/bulk`, { issueIds: ids, patch: { columnId: done, addCategoryIds: [design] } });
    assert.equal(response.status, 200);
    assert.equal(transaction.mock.calls.length, 1);
    const update = writes.find((write) => write.kind === "update" && write.table === issues)!;
    assert.equal((update.values as { columnId: string }).columnId, done);
    assert.deepEqual(render(update.where!).params.slice(1), ids, "one statement updates every issue");
    const activities = writes.find((write) => write.table === issueActivities)!.values as Array<{ type: string }>;
    assert.equal(activities.filter((activity) => activity.type === "status_changed").length, 18);
    assert.equal(activities.filter((activity) => activity.type === "label_added").length, 20);
    assert.ok(select.mock.calls.length > 0, "notifications are recorded after the change");
});

test("people outside the project cannot change its issues in bulk", async () => {
    stubProject(false);
    const { writes, transaction } = stubTransaction();
    const response = await call("PATCH", `/projects/${projectId}/issues/bulk`, { issueIds: ids, patch: { priority: "high" } });
    assert.equal(response.status, 403);
    assert.equal(transaction.mock.calls.length, 0);
    assert.equal(writes.length, 0);
    assert.equal((await call("POST", `/projects/${projectId}/issues/bulk-delete`, { issueIds: ids })).status, 403);
});

test("an issue from another project stops the whole change", async () => {
    stubProject(true);
    spyOn(db.query.issues, "findMany").mockImplementation(async () => ids.slice(1).map((id) => issueRow(id)) as never);
    const { writes, transaction } = stubTransaction();
    const response = await call("PATCH", `/projects/${projectId}/issues/bulk`, { issueIds: ids, patch: { priority: "high" } });
    assert.equal(response.status, 404);
    assert.equal(transaction.mock.calls.length, 0);
    assert.equal(writes.length, 0);
});

test("a write failing inside the transaction fails the request and notifies no one", async () => {
    stubProject(true);
    spyOn(db.query.issues, "findMany").mockImplementation(async () => ids.map((id) => issueRow(id)) as never);
    let selects = 0;
    const select = spyOn(db, "select").mockImplementation((() => {
        selects += 1;
        // The route checks the role, and the service checks it again for callers that skip the route.
        if (selects <= 2) {
            return {
                from: () => ({
                    leftJoin: () => ({
                        where: async () => [{ membership: { id: "membership", role: "member" } }],
                    }),
                }),
            };
        }
        throw new Error("Must not notify");
    }) as never);
    const { writes } = stubTransaction(issueActivities);
    const error = spyOn(console, "error").mockImplementation(() => undefined);

    const response = await call("PATCH", `/projects/${projectId}/issues/bulk`, { issueIds: ids, patch: { assigneeId: ana } });
    assert.equal(response.status, 500);
    assert.ok(writes.every((write) => write.table !== issueActivities));
    assert.equal(selects, 2, "membership is checked; notifications are not");
    error.mockRestore();
});

test("deleting in bulk refuses to leave sub-issues without their parent", async () => {
    spyOn(db.query.issues, "findMany")
        .mockImplementationOnce(async () => [issueRow(ids[0])] as never)
        .mockImplementationOnce(async () => [{ id: ids[5] }] as never);
    const { transaction } = stubTransaction();
    stubRole("member");
    await assert.rejects(bulkDeleteIssues(projectId, [ids[0]], ana), isHttp(409));
    assert.equal(transaction.mock.calls.length, 0);
});

test("deleting a parent and its sub-issue together works in one transaction", async () => {
    spyOn(db.query.issues, "findMany")
        .mockImplementationOnce(async () => [issueRow(ids[0]), issueRow(ids[1], { parentIssueId: ids[0] })] as never)
        .mockImplementationOnce(async () => [{ id: ids[1] }] as never);
    const writes: Array<{ kind: string }> = [];
    spyOn(db, "update").mockImplementation((() => ({ set: () => ({ where: async () => void writes.push({ kind: "update" }) }) })) as never);
    stubRole("member");
    await bulkDeleteIssues(projectId, [ids[0], ids[1]], ana);
    assert.deepEqual(writes.map((write) => write.kind), ["update"]);
});

test("cards moved without a place picked go to the top of the column, keeping their order", () => {
    assert.deepEqual(positionsAtTop(3000, 1), [2000]);
    assert.deepEqual(positionsAtTop(3000, 3), [0, 1000, 2000]);
    assert.deepEqual(positionsAtTop(null, 2), [1000, 2000], "an empty column starts at the usual spacing");
});

/** Stubs a single-issue update and returns the values it wrote; the column's top card is at `top`. */
function stubSingleMove(top: number | null) {
    spyOn(db.query.issues, "findFirst").mockImplementation(async () => ({ ...issueRow(ids[0], { position: 50_000 }), project: { id: projectId, name: "Rinia", issueKey: "RIN" } }) as never);
    stubProject(true);
    const tops: SQL[] = [];
    spyOn(db, "select").mockImplementation((() => ({
        from: () => ({
            where: async (where: SQL) => (tops.push(where), [{ position: top }]),
            leftJoin: () => ({ where: async () => [{ membership: { id: "membership", role: "member" } }] }),
        }),
    })) as never);
    let written: Record<string, unknown> = {};
    spyOn(db, "update").mockImplementation((() => ({ set: (values: Record<string, unknown>) => ((written = values), { where: () => ({ returning: async () => [{ ...issueRow(ids[0]), ...values }] }) }) })) as never);
    spyOn(db, "insert").mockImplementation((() => ({ values: () => Object.assign(Promise.resolve(), { onConflictDoNothing: async () => undefined }) })) as never);
    return { written: () => written, tops };
}

test("moving an issue to another column from a menu puts it above that column's top card", async () => {
    const { written, tops } = stubSingleMove(3000);
    await updateIssue(ids[0], { columnId: done }, ana);
    assert.equal(written().position, 2000);
    assert.ok(render(tops[0]).params.includes(done), "the top is looked up in the target column");
    assert.ok(render(tops[0]).params.includes(ids[0]), "the issue itself is left out of that lookup");
});

test("a position picked by dragging is kept, and a change that keeps the column leaves the position alone", async () => {
    const { written } = stubSingleMove(3000);
    await updateIssue(ids[0], { columnId: done, position: 4500 }, ana);
    assert.equal(written().position, 4500);
    await updateIssue(ids[0], { columnId: "todo" }, ana);
    assert.equal("position" in written(), false);
});

test("moving issues in bulk stacks the ones that change column at its top, in their order", async () => {
    stubProject(true);
    // The first is already done; the others come in reverse board order, which the stack must undo.
    const rows = [issueRow(ids[0], { columnId: done, position: 100 }), issueRow(ids[1], { position: 9000 }), issueRow(ids[2], { position: 7000 })];
    spyOn(db.query.issues, "findMany").mockImplementation(async () => rows as never);
    spyOn(db.query.issueSubscriptions, "findFirst").mockImplementation(async () => undefined);
    spyOn(db, "select").mockImplementation((() => ({
        from: () => ({
            where: async () => [{ position: 3000 }],
            leftJoin: () => ({
                where: async () => [{ membership: { id: "membership", role: "member" } }],
            }),
        }),
    })) as never);
    const { writes } = stubTransaction();

    const response = await call("PATCH", `/projects/${projectId}/issues/bulk`, { issueIds: ids.slice(0, 3), patch: { columnId: done } });
    assert.equal(response.status, 200);
    const placed = writes
        .filter((write) => write.table === issues && (write.values as { position?: number }).position !== undefined)
        .map((write) => [render(write.where!).params[0], (write.values as { position: number }).position]);
    assert.deepEqual(placed, [
        [ids[2], 1000],
        [ids[1], 2000],
    ]);
});
