import assert from "node:assert/strict";
import type { Server } from "node:http";
import { afterAll, afterEach, beforeAll, mock, spyOn, test } from "bun:test";
import { db } from "../src/db";
import { stubSessionAccounts } from "./fixtures/sessions";

// The app reads its settings on import; give it what it needs without a local .env.
process.env.JWT_SECRET ??= "test-secret";
process.env.DATABASE_URL ??= "postgres://localhost/unused";
process.env.SPECIAL_REGISTRATION_CODE ??= "test-code";
const { app } = await import("../src/app");
const { signToken } = await import("../src/lib/jwt");
const { SESSION_COOKIE_NAME } = await import("../src/lib/cookies");

// Stub the database boundary: these tests never connect to or mutate a development database.
afterEach(() => mock.restore());

const adminId = "2c7a1d3f-0000-4000-8000-000000000001";
const ana = { id: "2c7a1d3f-0000-4000-8000-000000000002", name: "Ana Souza", username: "ana", avatarUrl: null };
const projectId = "2c7a1d3f-0000-4000-8000-0000000000aa";

let server: Server;
let baseUrl = "";
beforeAll(async () => {
    server = app.listen(0);
    await new Promise((resolve) => server.once("listening", resolve));
    const address = server.address();
    baseUrl = `http://127.0.0.1:${typeof address === "object" && address ? address.port : 0}`;
});
afterAll(() => server.close());

/** Admin rights are read from the account on each request, so the cookie claims them and the account decides. */
const get = (path: string, isAdmin: boolean) => {
    stubSessionAccounts(isAdmin ? [adminId] : []);
    return fetch(`${baseUrl}/api${path}`, { headers: { Cookie: `${SESSION_COOKIE_NAME}=${signToken({ sub: adminId, username: "admin", isAdmin: true })}` } });
};

/** Answers the per-project count queries: one issue count, one document count. */
function stubCounts(issueCount: number, documentCount: number) {
    const results = [[{ projectId, value: issueCount }], [{ projectId, value: documentCount }]];
    spyOn(db, "select").mockImplementation((() => ({ from: () => ({ where: () => ({ groupBy: async () => results.shift() ?? [] }) }) })) as never);
}

/** Every column the query asks for, the nested ones included, so a test can tell no written text was read. */
function requestedColumns(config: unknown): string[] {
    const found: string[] = [];
    const walk = (node: unknown) => {
        if (!node || typeof node !== "object") return;
        const { columns, with: relations } = node as { columns?: object; with?: object };
        if (columns) found.push(...Object.keys(columns));
        if (relations) Object.values(relations).forEach(walk);
    };
    walk(config);
    return found;
}

const WRITTEN = ["description", "pageContent", "contentJson", "yjsState", "title", "email"];

test("only site admins reach the admin pages", async () => {
    assert.equal((await get("/admin/projects", false)).status, 403);
    assert.equal((await get(`/admin/projects/${projectId}`, false)).status, 403);
});

test("admins see every project's people and size, never what anyone wrote in it", async () => {
    const findMany = spyOn(db.query.projects, "findMany").mockImplementation((async () => [
        { id: projectId, name: "Site", issueKey: "SITE", icon: null, iconAppearance: null, createdAt: new Date(0), updatedAt: new Date(0), creator: ana, members: [{ role: "owner", user: ana }, { role: "member", user: { ...ana, id: adminId } }] },
    ]) as never);
    stubCounts(7, 2);
    const response = await get("/admin/projects", true);
    assert.equal(response.status, 200);
    const { projects } = (await response.json()) as { projects: Array<Record<string, unknown>> };
    assert.deepEqual(
        { ...projects[0], createdAt: undefined, updatedAt: undefined },
        { id: projectId, name: "Site", issueKey: "SITE", icon: null, iconAppearance: null, createdAt: undefined, updatedAt: undefined, createdBy: ana, owner: ana, memberCount: 2, issueCount: 7, documentCount: 2 },
    );
    const columns = requestedColumns(findMany.mock.calls[0][0]);
    for (const field of WRITTEN) assert.ok(!columns.includes(field), `must not read ${field}`);
});

test("a project's admin page lists its members and counts, and a missing project is a 404", async () => {
    const findFirst = spyOn(db.query.projects, "findFirst").mockImplementation((async () => ({
        id: projectId,
        name: "Site",
        issueKey: "SITE",
        icon: null,
        iconAppearance: null,
        createdAt: new Date(0),
        updatedAt: new Date(0),
        creator: ana,
        members: [{ role: "owner", joinedAt: new Date(0), user: ana }],
    })) as never);
    stubCounts(3, 0);
    const { project } = (await (await get(`/admin/projects/${projectId}`, true)).json()) as { project: Record<string, unknown> };
    assert.deepEqual(project.members, [{ ...ana, role: "owner", joinedAt: new Date(0).toISOString() }]);
    assert.equal(project.issueCount, 3);
    assert.equal(project.documentCount, 0);
    const columns = requestedColumns(findFirst.mock.calls[0][0]);
    for (const field of WRITTEN) assert.ok(!columns.includes(field), `must not read ${field}`);

    findFirst.mockImplementation((async () => undefined) as never);
    assert.equal((await get(`/admin/projects/${projectId}`, true)).status, 404);
});

const send = (method: string, path: string, body?: unknown) =>
    fetch(`${baseUrl}/api${path}`, {
        method,
        headers: { "Content-Type": "application/json", Cookie: `${SESSION_COOKIE_NAME}=${signToken({ sub: adminId, username: "admin", isAdmin: true })}` },
        body: body === undefined ? undefined : JSON.stringify(body),
    });

test("the user list shows who each person is and where they work, never a password", async () => {
    stubSessionAccounts([adminId]);
    const findMany = spyOn(db.query.users, "findMany").mockImplementation((async () => [
        { id: ana.id, name: ana.name, username: "ana", email: "ana@rinia.local", avatarUrl: null, isAdmin: false, suspendedAt: null, createdAt: new Date(0) },
    ]) as never);
    spyOn(db, "select").mockImplementation((() => ({ from: () => ({ groupBy: async () => [{ userId: ana.id, value: 4 }] }) })) as never);
    const response = await send("GET", "/admin/users");
    assert.equal(response.status, 200);
    const { users } = (await response.json()) as { users: Array<Record<string, unknown>> };
    assert.equal(users[0].projectCount, 4);
    const columns = Object.keys((findMany.mock.calls[0][0] as { columns: object }).columns);
    for (const field of ["passwordHash", "sessionsRevokedAt"]) assert.ok(!columns.includes(field), `must not read ${field}`);
});

test("admins cannot suspend, demote or reset their own account", async () => {
    stubSessionAccounts([adminId]);
    const update = spyOn(db, "update");
    assert.equal((await send("PATCH", `/admin/users/${adminId}`, { suspended: true })).status, 403);
    assert.equal((await send("PATCH", `/admin/users/${adminId}`, { isAdmin: false })).status, 403);
    assert.equal((await send("POST", `/admin/users/${adminId}/password`)).status, 403);
    assert.equal((await send("POST", `/admin/users/${adminId}/sessions/revoke`)).status, 403);
    assert.equal(update.mock.calls.length, 0);
    assert.equal((await send("PATCH", `/admin/users/${ana.id}`, {})).status, 400);
});

test("a reset password is returned once, stored hashed, and ends the person's sessions", async () => {
    stubSessionAccounts([adminId]);
    let saved: Record<string, unknown> = {};
    spyOn(db, "update").mockImplementation((() => ({ set: (values: Record<string, unknown>) => ((saved = values), { where: () => ({ returning: async () => [{ id: ana.id }] }) }) })) as never);
    const response = await send("POST", `/admin/users/${ana.id}/password`);
    assert.equal(response.status, 200);
    const { password } = (await response.json()) as { password: string };
    assert.ok(password.length >= 12);
    assert.notEqual(saved.passwordHash, password);
    assert.ok(saved.sessionsRevokedAt instanceof Date);
});

test("a suspended account, or a session from before a sign-out everywhere, is refused", async () => {
    const { sessionRevoked } = await import("../src/features/auth/auth.service");
    spyOn(db.query.users, "findFirst").mockImplementation((async () => ({ id: adminId, isAdmin: true, suspendedAt: new Date(), sessionsRevokedAt: null })) as never);
    assert.equal((await send("GET", "/admin/users")).status, 401);
    assert.equal(sessionRevoked(100, new Date(101_000)), true);
    assert.equal(sessionRevoked(101, new Date(101_000)), false);
    assert.equal(sessionRevoked(100, null), false);
});
