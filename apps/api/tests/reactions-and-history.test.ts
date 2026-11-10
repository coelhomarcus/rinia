import assert from "node:assert/strict";
import type { Server } from "node:http";
import { afterAll, afterEach, beforeAll, beforeEach, mock, spyOn, test } from "bun:test";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import { commentReactionSchema } from "@rinia/shared";
import { db } from "../src/db";
import { sessionCookie, stubSessionAccounts } from "./fixtures/sessions";
import { stubProjectAccess } from "./fixtures/project-membership";
import { commentReactions, issueDescriptionRevisions } from "../src/db/schema";
import { DESCRIPTION_REVISION_WINDOW_MS, recordDescriptionRevision, restoreDescriptionRevision } from "../src/features/issues/issues.service";
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

const ana = "3c1d5e7f-0000-4000-8000-000000000001";
const bruno = "3c1d5e7f-0000-4000-8000-000000000002";
const projectId = "3c1d5e7f-0000-4000-8000-0000000000aa";
const issueId = "3c1d5e7f-0000-4000-8000-0000000000bb";
const commentId = "3c1d5e7f-0000-4000-8000-0000000000cc";
const versionId = "3c1d5e7f-0000-4000-8000-0000000000dd";
const doc = (text: string) => ({ type: "doc" as const, content: [{ type: "paragraph", content: [{ type: "text", text }] }] });
const isHttp = (status: number) => (error: unknown) => error instanceof HttpError && error.statusCode === status;
const render = (condition: SQL) => new PgDialect().sqlToQuery(condition);

let server: Server;
let baseUrl = "";
beforeAll(async () => {
    server = app.listen(0);
    await new Promise((resolve) => server.once("listening", resolve));
    const address = server.address();
    baseUrl = `http://127.0.0.1:${typeof address === "object" && address ? address.port : 0}`;
});
afterAll(() => server.close());

function call(method: string, path: string, userId: string, body?: unknown) {
    const headers: Record<string, string> = { Cookie: sessionCookie(userId) };
    if (body !== undefined) headers["Content-Type"] = "application/json";
    return fetch(`${baseUrl}/api${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
}

function stubIssue(overrides: Record<string, unknown> = {}) {
    const issue = { id: issueId, projectId, number: 4, columnId: "todo", labels: [], assigneeId: null, descriptionJson: doc("Before"), descriptionRevision: 3, dueDate: null, project: { id: projectId, name: "Rinia", issueKey: "RIN" }, ...overrides };
    spyOn(db.query.issues, "findFirst").mockImplementation(async () => issue as never);
    return issue;
}

function stubMembership(member: boolean) {
    return stubProjectAccess([{ membership: member ? { id: "membership", role: "member" } : null }]);
}

/** Records every `db.insert(table).values(...)`, by table. */
function stubInserts() {
    const writes = new Map<unknown, Array<Record<string, unknown>>>();
    spyOn(db, "insert").mockImplementation(((table: unknown) => ({
        values: (values: Record<string, unknown>) => {
            writes.set(table, [...(writes.get(table) ?? []), values]);
            return Object.assign(Promise.resolve([]), { onConflictDoNothing: async () => [], returning: async () => [values] });
        },
    })) as never);
    return writes;
}

/** Records every `db.update(table).set(...).where(...)` and answers `returning()` with `returned`. */
function stubUpdates(returned: Record<string, unknown> = {}) {
    const updates: Array<{ table: unknown; values: Record<string, unknown>; where: SQL }> = [];
    spyOn(db, "update").mockImplementation(((table: unknown) => ({
        set: (values: Record<string, unknown>) => ({
            where: (where: SQL) => {
                updates.push({ table, values, where });
                return Object.assign(Promise.resolve([]), { returning: async () => [{ ...returned, ...values, descriptionRevision: 4 }] });
            },
        }),
    })) as never);
    return updates;
}

test("reactions accept a single emoji", () => {
    for (const emoji of ["👍", "❤️", "👍🏽", "🇧🇷"]) assert.equal(commentReactionSchema.safeParse({ emoji }).success, true, emoji);
    for (const emoji of ["", "a", ":+1:", "👍👍", "👍 nice"]) assert.equal(commentReactionSchema.safeParse({ emoji }).success, false, emoji);
});

test("reacting saves the reaction once and returns everyone's reactions", async () => {
    spyOn(db.query.issueComments, "findFirst").mockImplementation(async () => ({ id: commentId, issue: { projectId } }) as never);
    stubMembership(true);
    const writes = stubInserts();
    spyOn(db.query.commentReactions, "findMany").mockImplementation(async () => [
        { emoji: "👍", user: { id: bruno, name: "Bruno" } },
        { emoji: "🎉", user: { id: bruno, name: "Bruno" } },
        { emoji: "👍", user: { id: ana, name: "Ana" } },
    ] as never);

    const response = await call("POST", `/comments/${commentId}/reactions`, ana, { emoji: "👍" });
    assert.equal(response.status, 201);
    assert.deepEqual(writes.get(commentReactions), [{ commentId, userId: ana, emoji: "👍" }]);
    const { reactions } = await response.json();
    assert.deepEqual(reactions.map((group: { emoji: string; users: Array<{ id: string }> }) => [group.emoji, group.users.map((user) => user.id)]), [["👍", [bruno, ana]], ["🎉", [bruno]]]);
});

test("removing a reaction only removes your own", async () => {
    spyOn(db.query.issueComments, "findFirst").mockImplementation(async () => ({ id: commentId, issue: { projectId } }) as never);
    stubMembership(true);
    spyOn(db.query.commentReactions, "findMany").mockImplementation(async () => []);
    let where: SQL | undefined;
    spyOn(db, "delete").mockImplementation((() => ({ where: async (condition: SQL) => void (where = condition) })) as never);

    const response = await call("DELETE", `/comments/${commentId}/reactions/${encodeURIComponent("👍")}`, ana);
    assert.equal(response.status, 200);
    const query = render(where!);
    assert.match(query.sql, /"user_id" = \$\d/);
    assert.deepEqual(query.params, [commentId, ana, "👍"]);
});

test("people outside the project cannot react", async () => {
    spyOn(db.query.issueComments, "findFirst").mockImplementation(async () => ({ id: commentId, issue: { projectId } }) as never);
    stubMembership(false);
    const writes = stubInserts();
    const response = await call("POST", `/comments/${commentId}/reactions`, bruno, { emoji: "👍" });
    assert.ok(response.status >= 400 && response.status < 500);
    assert.equal(writes.size, 0);
});

test("description saves by the same author within a few minutes update one version", async () => {
    const now = new Date("2026-11-01T12:00:00Z");
    const latest = { id: versionId, authorId: ana, restoredFromId: null, createdAt: new Date(now.getTime() - DESCRIPTION_REVISION_WINDOW_MS + 1000) };
    const find = spyOn(db.query.issueDescriptionRevisions, "findFirst").mockImplementation(async () => latest as never);
    const updates = stubUpdates();
    const writes = stubInserts();

    await recordDescriptionRevision({ issueId, revision: 5, authorId: ana, contentJson: doc("Typing") }, now);
    assert.equal(updates.length, 1);
    assert.deepEqual(updates[0].values, { contentJson: doc("Typing"), revision: 5, updatedAt: now });
    assert.equal(writes.size, 0);

    // Another author, an older version, or a version that was a restore each start a new version.
    for (const other of [{ ...latest, authorId: bruno }, { ...latest, createdAt: new Date(now.getTime() - DESCRIPTION_REVISION_WINDOW_MS - 1) }, { ...latest, restoredFromId: "older" }]) {
        find.mockImplementation(async () => other as never);
        await recordDescriptionRevision({ issueId, revision: 6, authorId: ana, contentJson: doc("Typing") }, now);
    }
    assert.equal(updates.length, 1);
    assert.equal(writes.get(issueDescriptionRevisions)?.length, 3);
});

test("restoring a version adds a new version and keeps the older ones", async () => {
    stubIssue();
    stubMembership(true);
    spyOn(db.query.issueDescriptionRevisions, "findFirst").mockImplementation(async () => ({ id: versionId, issueId, contentJson: doc("Original") }) as never);
    const updates = stubUpdates({ id: issueId, number: 4 });
    const writes = stubInserts();
    const remove = spyOn(db, "delete").mockImplementation(() => { throw new Error("Must not delete history"); });

    const restored = await restoreDescriptionRevision(issueId, versionId, ana);
    assert.deepEqual(restored.descriptionJson, doc("Original"));
    assert.equal(restored.identifier, "RIN-4");
    assert.equal(updates.length, 1, "only the issue is updated, no version is overwritten");
    const [version] = writes.get(issueDescriptionRevisions) ?? [];
    assert.equal(version.restoredFromId, versionId);
    assert.equal(version.authorId, ana);
    assert.equal(version.revision, 4);
    assert.equal(remove.mock.calls.length, 0);
});

test("a version from another issue cannot be restored", async () => {
    stubIssue();
    stubMembership(true);
    spyOn(db.query.issueDescriptionRevisions, "findFirst").mockImplementation(async () => undefined);
    const updates = stubUpdates();
    await assert.rejects(restoreDescriptionRevision(issueId, versionId, ana), isHttp(404));
    assert.equal(updates.length, 0);
});
