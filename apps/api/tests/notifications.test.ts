import assert from "node:assert/strict";
import type { Server } from "node:http";
import { afterAll, afterEach, beforeAll, mock, spyOn, test } from "bun:test";
import { PgDialect, PgSelectBase } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import { db } from "../src/db";
import { issueComments, issueSubscriptions, notifications } from "../src/db/schema";
import { mentionedUserIds, newMentions, planIssueChange, plainTextExcerpt } from "../src/features/notifications/notifications.service";

// The app reads its settings on import; give it what it needs without a local .env.
process.env.JWT_SECRET ??= "test-secret";
process.env.DATABASE_URL ??= "postgres://localhost/unused";
process.env.SPECIAL_REGISTRATION_CODE ??= "test-code";
const { app } = await import("../src/app");
const { signToken } = await import("../src/lib/jwt");
const { SESSION_COOKIE_NAME } = await import("../src/lib/cookies");

// Stub the database boundary: these tests never connect to or mutate a development database.
afterEach(() => mock.restore());

const author = "1b6f0c2e-0000-4000-8000-000000000001";
const creator = "1b6f0c2e-0000-4000-8000-000000000002";
const ana = "1b6f0c2e-0000-4000-8000-000000000003";
const outsider = "1b6f0c2e-0000-4000-8000-000000000004";
const projectId = "1b6f0c2e-0000-4000-8000-0000000000aa";
const issueId = "1b6f0c2e-0000-4000-8000-0000000000bb";
const commentId = "1b6f0c2e-0000-4000-8000-0000000000cc";

const mention = (id: string, label = id) => ({ type: "mention", attrs: { id, label } });
const doc = (...inline: Array<Record<string, unknown>>) => ({ type: "doc" as const, content: [{ type: "paragraph", content: inline }] });
const types = (plan: ReturnType<typeof planIssueChange>) => Object.fromEntries(plan.notifications.map((item) => [item.userId, item.type]));

let server: Server;
let baseUrl = "";
beforeAll(async () => {
    server = app.listen(0);
    await new Promise((resolve) => server.once("listening", resolve));
    const address = server.address();
    baseUrl = `http://127.0.0.1:${typeof address === "object" && address ? address.port : 0}`;
});
afterAll(() => server.close());

function call(method: string, path: string, userId: string | null, body?: unknown, isAdmin = false) {
    const headers: Record<string, string> = body === undefined ? {} : { "Content-Type": "application/json" };
    if (userId) headers.Cookie = `${SESSION_COOKIE_NAME}=${signToken({ sub: userId, username: "someone", isAdmin })}`;
    return fetch(`${baseUrl}/api${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
}

/**
 * Answers executed `db.select(...)` queries in order, one queued result per query, and keeps each query's `where`.
 * The queries are still built for real, so subqueries inside them render as SQL.
 */
function stubSelects(...results: unknown[][]) {
    const wheres: SQL[] = [];
    spyOn(PgSelectBase.prototype, "_prepare").mockImplementation(function (this: { config: { where: SQL } }) {
        const where = this.config.where;
        return {
            execute: async () => {
                wheres.push(where);
                return results.shift() ?? [];
            },
        } as never;
    });
    return wheres;
}

/** Records every `db.insert(table).values(...)`, by table. */
function stubInserts(returning: Record<string, unknown> = {}) {
    const writes = new Map<unknown, unknown[]>();
    spyOn(db, "insert").mockImplementation(((table: unknown) => ({
        values: (values: unknown) => {
            writes.set(table, [...(writes.get(table) ?? []), ...(Array.isArray(values) ? values : [values])]);
            const result = Promise.resolve([]);
            return Object.assign(result, { onConflictDoNothing: async () => [], returning: async () => [{ ...(values as object), ...returning }] });
        },
    })) as never);
    return writes;
}

test("mentions are read from anywhere in the document, once each", () => {
    const nested = { type: "doc" as const, content: [{ type: "bulletList", content: [{ type: "listItem", content: [doc(mention(ana), mention(creator)).content[0]] }] }, doc(mention(ana), { type: "mention", attrs: {} }).content[0]] };
    assert.deepEqual(mentionedUserIds(nested), [ana, creator]);
    assert.deepEqual(mentionedUserIds(undefined), []);
    assert.deepEqual(newMentions(doc(mention(ana)), doc(mention(ana), mention(creator))), [creator]);
    assert.equal(plainTextExcerpt(doc({ type: "text", text: "Ping " }, mention(ana, "ana"))), "Ping @ana");
});

test("assigning someone notifies them and makes them follow, but assigning yourself notifies no one", () => {
    const audience = new Set([author, ana]);
    const plan = planIssueChange({ actorId: author, assigneeId: ana }, [author], audience);
    assert.deepEqual(types(plan), { [ana]: "assigned" });
    assert.deepEqual(plan.follow, [ana]);

    const self = planIssueChange({ actorId: author, assigneeId: author }, [], audience);
    assert.deepEqual(self.notifications, []);
    assert.deepEqual(self.follow, [author]);
});

test("a comment notifies followers and the mentioned, once each, never the author or people outside the project", () => {
    const plan = planIssueChange(
        { actorId: author, comment: { id: commentId, created: true }, mentionedIds: [ana, author, outsider] },
        [creator, ana, author],
        new Set([author, creator, ana]),
    );
    assert.deepEqual(types(plan), { [ana]: "mentioned", [creator]: "commented" });
    assert.ok(plan.notifications.every((item) => item.commentId === commentId));
    assert.deepEqual(plan.follow.sort(), [ana, author].sort());
});

test("a state change notifies followers except whoever moved the issue", () => {
    const plan = planIssueChange({ actorId: creator, status: { from: "todo", to: "done" } }, [creator, ana], new Set([creator, ana]));
    assert.deepEqual(plan.notifications, [{ userId: ana, type: "status_changed", commentId: null, payload: { from: "todo", to: "done" } }]);
});

test("editing a comment only notifies people it newly mentions", () => {
    const plan = planIssueChange({ actorId: author, comment: { id: commentId, created: false }, mentionedIds: [ana] }, [creator, ana], new Set([author, creator, ana]));
    assert.deepEqual(types(plan), { [ana]: "mentioned" });
});

test("commenting through the API notifies the right people and records who follows", async () => {
    spyOn(db.query.issues, "findFirst").mockImplementation(async () => ({ id: issueId, projectId, number: 1, labels: [], project: { id: projectId, name: "Rinia", issueKey: "RIN" } }) as never);
    spyOn(db.query.projectMembers, "findFirst").mockImplementation(async () => ({ id: "membership" }) as never);
    spyOn(db.query.issueComments, "findFirst").mockImplementation(async () => ({ id: commentId }) as never);
    // Followers of the issue, then who among the candidates can see the project (the outsider cannot).
    stubSelects([{ userId: creator }, { userId: author }], [{ id: author }, { id: creator }, { id: ana }]);
    const writes = stubInserts({ id: commentId });

    const response = await call("POST", `/issues/${issueId}/comments`, author, { contentJson: doc({ type: "text", text: "Look " }, mention(ana), mention(outsider)) });
    assert.equal(response.status, 201);
    assert.equal(writes.get(issueComments)?.length, 1);
    assert.deepEqual(
        (writes.get(notifications) as Array<Record<string, unknown>>).map(({ userId, type, actorId, issueId: issue, projectId: project }) => ({ userId, type, actorId, issue, project })),
        [
            { userId: ana, type: "mentioned", actorId: author, issue: issueId, project: projectId },
            { userId: creator, type: "commented", actorId: author, issue: issueId, project: projectId },
        ],
    );
    assert.deepEqual((writes.get(issueSubscriptions) as Array<{ userId: string }>).map((row) => row.userId).sort(), [ana, author].sort());
});

test("the inbox needs a session", async () => {
    assert.equal((await call("GET", "/notifications", null)).status, 401);
    assert.equal((await call("GET", "/notifications/unread-count", null)).status, 401);
});

test("the unread count skips projects the user has left, for site admins too", async () => {
    const dialect = new PgDialect();
    const wheres = stubSelects([{ value: 3 }], [{ value: 3 }]);
    assert.deepEqual(await (await call("GET", "/notifications/unread-count", ana)).json(), { count: 3 });
    assert.deepEqual(await (await call("GET", "/notifications/unread-count", ana, undefined, true)).json(), { count: 3 });
    for (const where of wheres) {
        const sql = dialect.sqlToQuery(where).sql;
        assert.match(sql, /"read_at" is null/);
        assert.match(sql, /"project_members"/);
    }
});

test("people cannot read or unread someone else's notification", async () => {
    let where: SQL | undefined;
    spyOn(db, "update").mockImplementation((() => ({ set: () => ({ where: (condition: SQL) => ((where = condition), { returning: async () => [] }) }) })) as never);
    const response = await call("PATCH", `/notifications/${commentId}`, ana, { read: true });
    assert.equal(response.status, 404);
    const query = new PgDialect().sqlToQuery(where!);
    assert.match(query.sql, /"user_id" = \$\d/);
    assert.ok(query.params.includes(ana));
    assert.equal((await call("PATCH", `/notifications/${commentId}`, ana, { read: "yes" })).status, 400);
});

test("only project members can follow an issue", async () => {
    spyOn(db.query.issues, "findFirst").mockImplementation(async () => ({ id: issueId, projectId, number: 1, labels: [], project: { id: projectId, name: "Rinia", issueKey: "RIN" } }) as never);
    const membership = spyOn(db.query.projectMembers, "findFirst").mockImplementation(async () => undefined);
    const writes = stubInserts();
    spyOn(db, "delete").mockImplementation(() => { throw new Error("Must not delete"); });

    assert.equal((await call("PUT", `/issues/${issueId}/subscription`, outsider)).status, 403);
    assert.equal((await call("DELETE", `/issues/${issueId}/subscription`, outsider)).status, 403);
    assert.equal((await call("GET", `/issues/${issueId}/subscription`, outsider)).status, 403);
    assert.equal(writes.size, 0);

    membership.mockImplementation(async () => ({ id: "membership" }) as never);
    const response = await call("PUT", `/issues/${issueId}/subscription`, ana);
    assert.deepEqual(await response.json(), { subscription: { following: true } });
    assert.deepEqual(writes.get(issueSubscriptions), [{ userId: ana, issueId }]);
});

test("my issues only accepts known tabs", async () => {
    assert.equal((await call("GET", "/my-issues?filter=everything", ana)).status, 400);
    assert.equal((await call("GET", "/my-issues", null)).status, 401);
});
