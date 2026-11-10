import assert from "node:assert/strict";
import type { Server } from "node:http";
import { afterAll, afterEach, beforeAll, beforeEach, mock, spyOn, test } from "bun:test";
import { markdownToTiptap, tiptapToMarkdown } from "@rinia/shared";
import type { SQL } from "drizzle-orm";
import { db } from "../src/db";
import { sessionCookie, stubSessionAccounts } from "./fixtures/sessions";

// The app reads its settings on import; give it what it needs without a local .env.
process.env.JWT_SECRET ??= "test-secret";
process.env.DATABASE_URL ??= "postgres://localhost/unused";
process.env.SPECIAL_REGISTRATION_CODE ??= "test-code";
const { app } = await import("../src/app");
const { SESSION_COOKIE_NAME } = await import("../src/lib/cookies");
const { bearerToken } = await import("../src/middleware/auth.middleware");
const { generateApiToken, hashApiToken } = await import("../src/features/api-tokens/api-tokens.service");
const { getIssueOrThrow } = await import("../src/features/issues/issues.service");
const { realtimeHub } = await import("../src/features/realtime/realtime.service");

// Stub the database boundary: these tests never connect to or mutate a development database.
afterEach(() => mock.restore());
// Every account behind a session cookie exists and is active, unless a test says otherwise.
beforeEach(() => void stubSessionAccounts());

const memberProjectId = "8b2d1f66-0000-4000-8000-0000000000aa";
const otherProjectId = "8b2d1f66-0000-4000-8000-0000000000bb";
const ana = { id: "8b2d1f66-0000-4000-8000-000000000001", username: "ana", name: "Ana Souza", isAdmin: false };
const bruno = { id: "8b2d1f66-0000-4000-8000-000000000002", username: "bruno", name: "Bruno Lima", isAdmin: false };

/** The values a stubbed query was called with, in order, such as the hash in `eq(apiTokens.tokenHash, …)`. */
const params = (where: SQL) => (db as unknown as { dialect: { sqlToQuery: (sql: SQL) => { params: unknown[] } } }).dialect.sqlToQuery(where).params;

/** Stored tokens by hash, read and deleted through stubs of the queries the token service makes. */
function stubTokenStore() {
    const rows = new Map<string, { id: string; userId: string; lastUsedAt: Date | null; expiresAt: Date | null; projectScoped: boolean; projects: Array<{ projectId: string }>; user: typeof ana }>();
    spyOn(db.query.apiTokens, "findFirst").mockImplementation((async (config: { where: SQL }) => rows.get(params(config.where)[0] as string)) as never);
    spyOn(db, "update").mockImplementation((() => ({ set: () => ({ where: () => Promise.resolve() }) })) as never);
    spyOn(db, "delete").mockImplementation((() => ({
        where: (where: SQL) => ({
            returning: async () => {
                const [id, userId] = params(where);
                const entry = [...rows].find(([, row]) => row.id === id && row.userId === userId);
                if (entry) rows.delete(entry[0]);
                return entry ? [{ id }] : [];
            },
        }),
    })) as never);
    return {
        /** `projectIds` limits the token to those projects; `expiresAt` makes it expire. */
        add(user: typeof ana, options: { expiresAt?: Date | null; projectIds?: string[] } = {}) {
            const secret = generateApiToken();
            const id = crypto.randomUUID();
            const projectIds = options.projectIds ?? [];
            rows.set(hashApiToken(secret), { id, userId: user.id, lastUsedAt: null, expiresAt: options.expiresAt ?? null, projectScoped: projectIds.length > 0, projects: projectIds.map((projectId) => ({ projectId })), user });
            return { id, secret };
        },
    };
}

let server: Server;
let baseUrl = "";
beforeAll(async () => {
    server = app.listen(0);
    await new Promise((resolve) => server.once("listening", resolve));
    const address = server.address();
    baseUrl = `http://127.0.0.1:${typeof address === "object" && address ? address.port : 0}`;
});
afterAll(() => server.close());

const cookieFor = (user: typeof ana) => sessionCookie(user.id);
const get = (path: string, headers: Record<string, string> = {}) => fetch(`${baseUrl}${path}`, { headers });

/** Calls an MCP tool over the streamable HTTP endpoint and returns its text result. */
async function callTool(secret: string, name: string, args: Record<string, unknown>) {
    const response = await fetch(`${baseUrl}/api/mcp`, {
        method: "POST",
        headers: { Authorization: `Bearer ${secret}`, "Content-Type": "application/json", Accept: "application/json, text/event-stream" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } }),
    });
    assert.equal(response.status, 200);
    const { result } = (await response.json()) as { result: { isError?: boolean; content: Array<{ text: string }> } };
    return { isError: result.isError ?? false, text: result.content[0].text };
}

function stubMe() {
    spyOn(db.query.users, "findFirst").mockImplementation((async (config: { where: SQL }) => [ana, bruno].find((user) => user.id === params(config.where)[0])) as never);
}

test("tokens carry the rinia_ prefix, are long and random, and only their hash is compared", () => {
    const [first, second] = [generateApiToken(), generateApiToken()];
    assert.match(first, /^rinia_[A-Za-z0-9_-]{43}$/);
    assert.notEqual(first, second);
    assert.match(hashApiToken(first), /^[0-9a-f]{64}$/);
    assert.equal(hashApiToken(first), hashApiToken(first));
});

test("the Authorization header is read only for the Bearer scheme", () => {
    assert.equal(bearerToken("Bearer rinia_abc"), "rinia_abc");
    assert.equal(bearerToken("bearer   rinia_abc  "), "rinia_abc");
    assert.equal(bearerToken("Bearer"), "");
    assert.equal(bearerToken("Basic dXNlcjpwYXNz"), undefined);
    assert.equal(bearerToken(undefined), undefined);
});

test("the session cookie and a bearer token both sign in, each as its own user", async () => {
    stubMe();
    const store = stubTokenStore();
    const { secret } = store.add(bruno);

    const viaCookie = await get("/api/auth/me", { Cookie: cookieFor(ana) });
    assert.equal(viaCookie.status, 200);
    assert.equal(((await viaCookie.json()) as { user: { username: string } }).user.username, "ana");

    const viaToken = await get("/api/auth/me", { Authorization: `Bearer ${secret}` });
    assert.equal(viaToken.status, 200);
    assert.equal(((await viaToken.json()) as { user: { username: string } }).user.username, "bruno");
});

test("unknown, malformed and empty tokens are refused, even next to a valid session", async () => {
    stubMe();
    const findToken = spyOn(db.query.apiTokens, "findFirst").mockImplementation(async () => undefined);
    for (const authorization of [`Bearer ${generateApiToken()}`, "Bearer not-a-rinia-token", "Bearer"]) {
        const response = await get("/api/auth/me", { Authorization: authorization, Cookie: cookieFor(ana) });
        assert.equal(response.status, 401, authorization);
    }
    // A token without the prefix never reaches the database.
    assert.equal(findToken.mock.calls.length, 1);
    assert.equal((await get("/api/auth/me")).status, 401);
});

test("a revoked token stops working on the very next request", async () => {
    stubMe();
    const store = stubTokenStore();
    const { id, secret } = store.add(ana);
    assert.equal((await get("/api/auth/me", { Authorization: `Bearer ${secret}` })).status, 200);

    const revoked = await fetch(`${baseUrl}/api/api-tokens/${id}`, { method: "DELETE", headers: { Cookie: cookieFor(ana) } });
    assert.equal(revoked.status, 204);
    assert.equal((await get("/api/auth/me", { Authorization: `Bearer ${secret}` })).status, 401);
});

test("someone else's token cannot be revoked", async () => {
    const store = stubTokenStore();
    const { id, secret } = store.add(bruno);
    const response = await fetch(`${baseUrl}/api/api-tokens/${id}`, { method: "DELETE", headers: { Cookie: cookieFor(ana) } });
    assert.equal(response.status, 404);
    stubMe();
    assert.equal((await get("/api/auth/me", { Authorization: `Bearer ${secret}` })).status, 200);
});

test("a token cannot list, create or revoke tokens, so a leaked one cannot mint more", async () => {
    const store = stubTokenStore();
    const { id, secret } = store.add(ana);
    const insert = spyOn(db, "insert").mockImplementation(() => {
        throw new Error("Must not insert");
    });
    const headers = { Authorization: `Bearer ${secret}`, "Content-Type": "application/json" };
    assert.equal((await get("/api/api-tokens", headers)).status, 403);
    assert.equal((await fetch(`${baseUrl}/api/api-tokens`, { method: "POST", headers, body: JSON.stringify({ name: "more" }) })).status, 403);
    assert.equal((await fetch(`${baseUrl}/api/api-tokens/${id}`, { method: "DELETE", headers })).status, 403);
    assert.equal(insert.mock.calls.length, 0);
});

/** Ana belongs to one project only; the other one exists but is not hers. */
function stubProjects() {
    const projects = [
        { id: memberProjectId, issueKey: "RIN", name: "Rinia" },
        { id: otherProjectId, issueKey: "AM", name: "App Mobile" },
    ];
    spyOn(db.query.projects, "findFirst").mockImplementation((async (config: { where: SQL }) => {
        const [value] = params(config.where);
        return projects.find((project) => project.id === value || project.issueKey === value);
    }) as never);
    spyOn(db.query.projectMembers, "findFirst").mockImplementation((async (config: { where: SQL }) => {
        const [projectId, userId] = params(config.where);
        return projectId === memberProjectId && userId === ana.id ? { id: "membership", projectId, userId, role: "member" } : undefined;
    }) as never);
}

test("over REST, a token reaches only the projects its owner is a member of", async () => {
    stubProjects();
    const { secret } = stubTokenStore().add(ana);
    spyOn(db.query.boardColumns, "findMany").mockImplementation(async () => []);
    assert.equal((await get(`/api/projects/${memberProjectId}/columns`, { Authorization: `Bearer ${secret}` })).status, 200);
    assert.equal((await get(`/api/projects/${otherProjectId}/columns`, { Authorization: `Bearer ${secret}` })).status, 403);
});

test("over MCP, tools refuse projects the token's owner is not a member of, before reading anything", async () => {
    stubProjects();
    const { secret } = stubTokenStore().add(ana);
    const readIssues = spyOn(db.query.issues, "findMany").mockImplementation(() => {
        throw new Error("Must not read issues");
    });
    const insert = spyOn(db, "insert").mockImplementation(() => {
        throw new Error("Must not insert");
    });

    for (const [name, args] of [
        ["list_issues", { project: "AM" }],
        ["search", { query: "login", project: "AM" }],
        ["get_document", { project: "AM", document: "Roadmap" }],
        ["create_issue", { project: "AM", title: "Sneaky" }],
        ["create_document", { project: "AM", title: "Sneaky" }],
    ] as const) {
        const result = await callTool(secret, name, args);
        assert.equal(result.isError, true, name);
        assert.match(result.text, /not a member/, name);
    }
    assert.equal(readIssues.mock.calls.length, 0);
    assert.equal(insert.mock.calls.length, 0);
});

test("over MCP, a write made with a token is published as its owner's change", async () => {
    stubProjects();
    const { secret } = stubTokenStore().add(ana);
    spyOn(db.query.boardColumns, "findMany").mockImplementation(async () => []);
    spyOn(db.query.categories, "findMany").mockImplementation(async () => []);
    spyOn(db.query.projectMembers, "findMany").mockImplementation(async () => []);
    spyOn(db.query.users, "findFirst").mockImplementation(async () => ({ locale: "pt-BR" }) as never);
    const documentId = "8b2d1f66-0000-4000-8000-0000000000d1";
    const values: Array<Record<string, unknown>> = [];
    spyOn(db, "insert").mockImplementation((() => ({
        values: (row: Record<string, unknown>) => {
            values.push(row);
            return { returning: async () => [{ ...row, id: documentId, yjsState: null }] };
        },
    })) as never);
    const publish = spyOn(realtimeHub, "publish");

    const result = await callTool(secret, "create_document", { project: "rin", title: "Notas", content: "# Plano\n\n- **um**" });
    assert.equal(result.isError, false, result.text);
    const created = JSON.parse(result.text) as { url: string };
    assert.equal(created.url, `${baseUrl}/project/RIN/docs/notas-8b2d1f660000`);
    assert.equal(values[0].createdBy, ana.id);
    assert.deepEqual(values[0].contentJson, markdownToTiptap("# Plano\n\n- **um**"));
    assert.deepEqual(publish.mock.calls.map(([event]) => [event.type, event.actorId]), [["document.created", ana.id]]);
});

test("the MCP endpoint asks for a bearer token and only takes POST", async () => {
    const refused = await fetch(`${baseUrl}/api/mcp`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
    assert.equal(refused.status, 401);
    assert.match(refused.headers.get("www-authenticate") ?? "", /^Bearer/);

    const { secret } = stubTokenStore().add(ana);
    assert.equal((await get("/api/mcp", { Authorization: `Bearer ${secret}` })).status, 405);
});

test("an identifier that matches no issue is a 404, not a database error", async () => {
    const chain = { from: () => chain, innerJoin: () => chain, where: async () => [] };
    spyOn(db, "select").mockImplementation((() => chain) as never);
    const findIssue = spyOn(db.query.issues, "findFirst");
    await assert.rejects(getIssueOrThrow("RIN-999"), (error: { statusCode?: number }) => error.statusCode === 404);
    assert.equal(findIssue.mock.calls.length, 0);
});

test("Markdown survives a round trip through the editor's JSON", () => {
    const markdown = "## Escopo\n\nUm **atalho** com `Cmd+K` e [link](https://example.com).\n\n- [x] feito\n- [ ] falta\n\n1. um\n2. dois\n\n> citação\n\n```ts\nconst a = 1;\n```";
    assert.equal(tiptapToMarkdown(markdownToTiptap(markdown)), markdown);
    assert.equal(tiptapToMarkdown({ content: [{ type: "paragraph", content: [{ type: "mention", attrs: { id: ana.id, label: "ana" } }, { type: "text", text: " olha" }] }] }), `[@ id="${ana.id}" label="ana"] olha`);
});

const day = 24 * 60 * 60 * 1000;
/** An issue in the project a scoped token must not reach. */
const secretIssue = {
    id: "8b2d1f66-0000-4000-8000-0000000000e1",
    projectId: otherProjectId,
    number: 4,
    title: "Secret",
    labels: [],
    project: { id: otherProjectId, issueKey: "AM", name: "App Mobile" },
};

/** What a stubbed query was called with, including the values inside a subquery such as the projects a user can reach. */
const deepParams = (where: SQL): unknown[] =>
    params(where).flatMap((value) => (value && typeof value === "object" && "toSQL" in value ? (value as { toSQL: () => { params: unknown[] } }).toSQL().params : [value]));

test("an expired token is refused with 401 over REST and MCP, and one that has not expired works", async () => {
    stubMe();
    const store = stubTokenStore();
    const expired = store.add(ana, { expiresAt: new Date(Date.now() - 1000) });
    const valid = store.add(ana, { expiresAt: new Date(Date.now() + 30 * day) });
    const forever = store.add(ana, { expiresAt: null });

    const refused = await get("/api/auth/me", { Authorization: `Bearer ${expired.secret}` });
    assert.equal(refused.status, 401);
    assert.match(((await refused.json()) as { error: string }).error, /expired/);
    const mcp = await fetch(`${baseUrl}/api/mcp`, {
        method: "POST",
        headers: { Authorization: `Bearer ${expired.secret}`, "Content-Type": "application/json", Accept: "application/json, text/event-stream" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
    });
    assert.equal(mcp.status, 401);
    assert.match(mcp.headers.get("www-authenticate") ?? "", /^Bearer/);

    assert.equal((await get("/api/auth/me", { Authorization: `Bearer ${valid.secret}` })).status, 200);
    assert.equal((await get("/api/auth/me", { Authorization: `Bearer ${forever.secret}` })).status, 200);
});

test("a token stops working at the moment it expires", async () => {
    stubMe();
    const { authenticateApiToken } = await import("../src/features/api-tokens/api-tokens.service");
    const expiresAt = new Date("2027-01-01T00:00:00Z");
    const { secret } = stubTokenStore().add(ana, { expiresAt });
    assert.ok(await authenticateApiToken(secret, new Date(expiresAt.getTime() - 1)));
    assert.equal(await authenticateApiToken(secret, expiresAt), null);
});

test("a new token expires after the chosen number of days, 90 by default, or never", async () => {
    const { createApiToken } = await import("../src/features/api-tokens/api-tokens.service");
    const { createApiTokenSchema } = await import("@rinia/shared");
    const inserted: Array<Record<string, unknown>> = [];
    spyOn(db, "insert").mockImplementation((() => ({
        values: (values: Record<string, unknown>) => {
            inserted.push(values);
            return { returning: async () => [{ id: "t1", lastUsedAt: null, createdAt: new Date(), ...values }] };
        },
    })) as never);
    const now = new Date("2026-11-10T12:00:00Z");

    await createApiToken(ana.id, createApiTokenSchema.parse({ name: "default" }), undefined, now);
    await createApiToken(ana.id, createApiTokenSchema.parse({ name: "month", expiresInDays: 30 }), undefined, now);
    await createApiToken(ana.id, createApiTokenSchema.parse({ name: "forever", expiresInDays: null }), undefined, now);
    assert.equal((inserted[0].expiresAt as Date).toISOString(), "2027-02-08T12:00:00.000Z");
    assert.equal((inserted[1].expiresAt as Date).toISOString(), "2026-12-10T12:00:00.000Z");
    assert.equal(inserted[2].expiresAt, null);

    // Only the offered lifetimes are accepted.
    assert.equal(createApiTokenSchema.safeParse({ name: "odd", expiresInDays: 45 }).success, false);
    assert.equal(createApiTokenSchema.safeParse({ name: "odd", projectIds: ["not-a-uuid"] }).success, false);
});

test("a token can only be limited to projects its owner belongs to", async () => {
    const { createApiToken } = await import("../src/features/api-tokens/api-tokens.service");
    // The owner belongs to the first project only.
    spyOn(db, "select").mockImplementation((() => ({ from: () => ({ where: async () => [{ projectId: memberProjectId }] }) })) as never);
    const insert = spyOn(db, "insert").mockImplementation(() => {
        throw new Error("Must not insert");
    });
    await assert.rejects(createApiToken(ana.id, { name: "x", access: "write", expiresInDays: 30, projectIds: [memberProjectId, otherProjectId] }), (error: { statusCode?: number }) => error.statusCode === 400);
    assert.equal(insert.mock.calls.length, 0);
});

/** Ana belongs to both projects, so only a token's scope can keep her out of the second. */
function stubBothProjects() {
    const projects = [
        { id: memberProjectId, issueKey: "RIN", name: "Rinia" },
        { id: otherProjectId, issueKey: "AM", name: "App Mobile" },
    ];
    spyOn(db.query.projects, "findFirst").mockImplementation((async (config: { where: SQL }) => {
        const [value] = params(config.where);
        return projects.find((project) => project.id === value || project.issueKey === value);
    }) as never);
    spyOn(db.query.projectMembers, "findFirst").mockImplementation((async (config: { where: SQL }) => {
        const [projectId, userId] = params(config.where);
        return userId === ana.id ? { id: "membership", projectId, userId, role: "owner" } : undefined;
    }) as never);
}

test("over REST, a token scoped to one project cannot reach another, wherever the project is named", async () => {
    stubBothProjects();
    const { secret } = stubTokenStore().add(ana, { projectIds: [memberProjectId] });
    const auth = { Authorization: `Bearer ${secret}`, "Content-Type": "application/json" };
    spyOn(db.query.boardColumns, "findMany").mockImplementation(async () => []);
    spyOn(db, "select").mockImplementation((() => ({ from: () => ({ innerJoin: () => ({ where: async () => [{ id: secretIssue.id }] }) }) })) as never);
    spyOn(db.query.issues, "findFirst").mockImplementation((async () => secretIssue) as never);
    const write = spyOn(db, "insert").mockImplementation(() => {
        throw new Error("Must not insert");
    });

    assert.equal((await get(`/api/projects/${memberProjectId}/columns`, auth)).status, 200);
    for (const [method, path] of [
        ["GET", `/api/projects/${otherProjectId}`],
        ["GET", `/api/projects/${otherProjectId}/columns`],
        ["GET", `/api/projects/${otherProjectId}/categories`],
        ["GET", `/api/projects/${otherProjectId}/issues`],
        ["POST", `/api/projects/${otherProjectId}/issues`],
        ["PATCH", `/api/projects/${otherProjectId}/issues/bulk`],
        ["GET", `/api/projects/${otherProjectId}/documents`],
        ["GET", `/api/projects/${otherProjectId}/files`],
        ["GET", `/api/projects/${otherProjectId}/members`],
        ["PATCH", `/api/projects/${otherProjectId}`],
        ["DELETE", `/api/projects/${otherProjectId}`],
        ["GET", "/api/projects/by-key/AM"],
        ["GET", "/api/issues/AM-4"],
        ["PATCH", "/api/issues/AM-4"],
        ["DELETE", "/api/issues/AM-4"],
        ["GET", "/api/issues/AM-4/comments"],
        ["POST", "/api/issues/AM-4/comments"],
        ["PUT", "/api/issues/AM-4/subscription"],
        ["POST", "/api/projects"],
        ["GET", "/api/admin/projects"],
    ] as const) {
        const response = await fetch(`${baseUrl}${path}`, { method, headers: auth, body: method === "GET" || method === "DELETE" ? undefined : JSON.stringify(path.endsWith("/comments") ? { contentJson: markdownToTiptap("hello", "comment") } : {}) });
        assert.equal(response.status, 403, `${method} ${path}`);
    }
    assert.equal(write.mock.calls.length, 0);
});

test("a scoped token is limited in every list: projects, my issues and notifications", async () => {
    stubBothProjects();
    const { secret } = stubTokenStore().add(ana, { projectIds: [memberProjectId] });
    const auth = { Authorization: `Bearer ${secret}` };
    const lookups: unknown[][] = [];
    const record = async (config: { where: SQL }) => (lookups.push(deepParams(config.where)), []);
    spyOn(db.query.projectMembers, "findMany").mockImplementation(record as never);
    spyOn(db.query.issues, "findMany").mockImplementation(record as never);
    spyOn(db.query.notifications, "findMany").mockImplementation(record as never);

    for (const path of ["/api/projects", "/api/my-issues", "/api/notifications"]) assert.equal((await get(path, auth)).status, 200, path);
    // Each one asked for its owner's projects narrowed to the token's, and none for the other project.
    assert.equal(lookups.length, 3);
    for (const values of lookups) {
        assert.ok(values.includes(memberProjectId), JSON.stringify(values));
        assert.ok(!values.includes(otherProjectId), JSON.stringify(values));
    }
});

test("the shared project filters narrow to a token's scope, only for the token's own user", () => {
    const { requestContext } = require("../src/lib/request-context") as typeof import("../src/lib/request-context");
    const { reachableProjectIds, withinTokenScope } = require("../src/lib/project-access") as typeof import("../src/lib/project-access");
    const { projectMembers } = require("../src/db/schema") as typeof import("../src/db/schema");
    const inRequest = (tokenProjectIds: string[] | undefined, work: () => void) =>
        requestContext({ user: { sub: ana.id }, tokenProjectIds } as never, {} as never, work);

    inRequest([memberProjectId], () => {
        assert.deepEqual(reachableProjectIds(ana.id).toSQL().params, [ana.id, memberProjectId]);
        // Someone else's projects, such as a notification's recipient's, are not narrowed by the requester's token.
        assert.deepEqual(reachableProjectIds(bruno.id).toSQL().params, [bruno.id]);
    });
    inRequest([], () => assert.match(reachableProjectIds(ana.id).toSQL().sql, /false/));
    inRequest(undefined, () => {
        assert.deepEqual(reachableProjectIds(ana.id).toSQL().params, [ana.id]);
        assert.equal(withinTokenScope(projectMembers.projectId, ana.id), undefined);
    });
    // Outside a request there is no token.
    assert.equal(withinTokenScope(projectMembers.projectId, ana.id), undefined);
});

test("a token scoped to projects that no longer exist reaches nothing, not everything", async () => {
    stubBothProjects();
    const { secret } = stubTokenStore().add(ana);
    // The same token, now flagged as scoped with its project rows gone.
    spyOn(db.query.apiTokens, "findFirst").mockImplementation((async () => ({ id: "t1", access: "write", lastUsedAt: new Date(), expiresAt: null, projectScoped: true, projects: [], user: ana })) as never);
    const auth = { Authorization: `Bearer ${secret}` };
    assert.equal((await get(`/api/projects/${memberProjectId}/columns`, auth)).status, 403);
    assert.equal((await get(`/api/projects/${otherProjectId}/columns`, auth)).status, 403);
});

test("over MCP, a token scoped to one project cannot read or change another, through any tool", async () => {
    stubBothProjects();
    const { secret } = stubTokenStore().add(ana, { projectIds: [memberProjectId] });
    spyOn(db, "select").mockImplementation((() => ({ from: () => ({ innerJoin: () => ({ where: async () => [{ id: secretIssue.id }] }) }) })) as never);
    spyOn(db.query.issues, "findFirst").mockImplementation((async () => secretIssue) as never);
    const readIssues = spyOn(db.query.issues, "findMany").mockImplementation(() => {
        throw new Error("Must not read issues");
    });
    const write = spyOn(db, "insert").mockImplementation(() => {
        throw new Error("Must not insert");
    });

    for (const [name, args] of [
        ["list_issues", { project: "AM" }],
        ["search", { query: "login", project: "AM" }],
        ["get_issue", { issue: "AM-4" }],
        ["update_issue", { issue: "AM-4", title: "Changed" }],
        ["delete_issue", { issue: "AM-4" }],
        ["restore_issue", { issue: "AM-4", deletedAt: new Date().toISOString() }],
        ["add_comment", { issue: "AM-4", body: "hello" }],
        ["add_relation", { issue: "AM-4", target: "AM-5", type: "blocks" }],
        ["create_issue", { project: "AM", title: "Sneaky" }],
        ["list_documents", { project: "AM" }],
        ["get_document", { project: "AM", document: "Roadmap" }],
        ["create_document", { project: "AM", title: "Sneaky" }],
        ["update_document", { project: "AM", document: "Roadmap", title: "Changed" }],
    ] as const) {
        const result = await callTool(secret, name, args);
        assert.equal(result.isError, true, name);
        assert.match(result.text, /cannot reach this project/, name);
    }
    assert.equal(readIssues.mock.calls.length, 0);
    assert.equal(write.mock.calls.length, 0);
});

test("over MCP, the projects a scoped token lists, searches and reads come from its scope only", async () => {
    stubBothProjects();
    const { secret } = stubTokenStore().add(ana, { projectIds: [memberProjectId] });
    const lookups: unknown[][] = [];
    spyOn(db.query.projectMembers, "findMany").mockImplementation((async (config: { where: SQL }) => {
        lookups.push(deepParams(config.where));
        return [];
    }) as never);
    const result = await callTool(secret, "list_projects", {});
    assert.equal(result.isError, false, result.text);
    assert.equal(lookups.length, 1);
    assert.ok(lookups[0].includes(memberProjectId));
    assert.ok(!lookups[0].includes(otherProjectId));

    // The tool that is allowed still works inside the scope.
    spyOn(db.query.boardColumns, "findMany").mockImplementation(async () => []);
    spyOn(db.query.categories, "findMany").mockImplementation(async () => []);
    assert.equal((await callTool(secret, "list_issues", { project: "RIN" })).isError, false);
});
