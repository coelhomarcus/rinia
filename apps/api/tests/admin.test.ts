import assert from "node:assert/strict";
import type { Server } from "node:http";
import { afterAll, afterEach, beforeAll, mock, spyOn, test } from "bun:test";
import { db } from "../src/db";

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

const get = (path: string, isAdmin: boolean) =>
    fetch(`${baseUrl}/api${path}`, { headers: { Cookie: `${SESSION_COOKIE_NAME}=${signToken({ sub: adminId, username: "admin", isAdmin })}` } });

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
