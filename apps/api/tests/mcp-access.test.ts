import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import type { Server } from "node:http";
import { afterAll, afterEach, beforeAll, mock, spyOn, test } from "bun:test";
import type { SQL } from "drizzle-orm";
import { db } from "../src/db";
import { sessionCookie, stubSessionAccounts } from "./fixtures/sessions";

// The app reads its settings on import; give it what it needs without a local .env.
process.env.JWT_SECRET ??= "test-secret";
process.env.DATABASE_URL ??= "postgres://localhost/unused";
process.env.SPECIAL_REGISTRATION_CODE ??= "test-code";
const { app } = await import("../src/app");
const { SESSION_COOKIE_NAME } = await import("../src/lib/cookies");
const { generateApiToken, hashApiToken } = await import("../src/features/api-tokens/api-tokens.service");
const { accessForScopes } = await import("../src/features/oauth/oauth.service");
const { apiTokens, oauthClients, oauthCodes } = await import("../src/db/schema");

// Stub the database boundary: these tests never connect to or mutate a development database.
afterEach(() => mock.restore());

const ana = { id: "8b2d1f66-0000-4000-8000-000000000001", username: "ana", name: "Ana Souza", isAdmin: false };
const client = { client_id: "client-1", client_name: "Claude", redirect_uris: ["https://claude.ai/api/mcp/auth_callback"], token_endpoint_auth_method: "none" };
const verifier = "a".repeat(43);
const challenge = createHash("sha256").update(verifier).digest("base64url");

/** The values a stubbed query was called with, in order. */
const params = (where: SQL) => (db as unknown as { dialect: { sqlToQuery: (sql: SQL) => { params: unknown[] } } }).dialect.sqlToQuery(where).params;

/** Inserts recorded by table, answered with the inserted row plus an id. */
function stubInserts() {
    const inserted: Array<{ table: unknown; values: Record<string, unknown> }> = [];
    spyOn(db, "insert").mockImplementation(((table: unknown) => ({
        values: (values: Record<string, unknown>) => {
            inserted.push({ table, values });
            const rows = [{ id: crypto.randomUUID(), lastUsedAt: null, createdAt: new Date(), ...values }];
            return { returning: async () => rows, then: (resolve: (value: unknown) => void) => resolve(undefined) };
        },
    })) as never);
    return inserted;
}

function stubToken(access: "read" | "write") {
    const secret = generateApiToken();
    spyOn(db.query.apiTokens, "findFirst").mockImplementation((async (config: { where: SQL }) =>
        params(config.where)[0] === hashApiToken(secret) ? { id: "t1", access, lastUsedAt: new Date(), expiresAt: null, projectScoped: false, projects: [], user: ana } : undefined) as never);
    spyOn(db.query.users, "findFirst").mockImplementation((async () => ana) as never);
    return secret;
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

const session = sessionCookie(ana.id);
const mcp = (secret: string, body: object) =>
    fetch(`${baseUrl}/api/mcp`, { method: "POST", headers: { Authorization: `Bearer ${secret}`, "Content-Type": "application/json", Accept: "application/json, text/event-stream" }, body: JSON.stringify(body) });

test("a read-only token reads but cannot change anything, over REST or MCP", async () => {
    const secret = stubToken("read");
    assert.equal((await fetch(`${baseUrl}/api/auth/me`, { headers: { Authorization: `Bearer ${secret}` } })).status, 200);

    const refused = await fetch(`${baseUrl}/api/projects`, { method: "POST", headers: { Authorization: `Bearer ${secret}`, "Content-Type": "application/json" }, body: JSON.stringify({ name: "Nope" }) });
    assert.equal(refused.status, 403);
    assert.match(((await refused.json()) as { error: string }).error, /can only read/);

    const listed = (await (await mcp(secret, { jsonrpc: "2.0", id: 1, method: "tools/list" })).json()) as { result: { tools: Array<{ name: string }> } };
    const names = listed.result.tools.map((tool) => tool.name);
    assert.ok(names.includes("list_issues"));
    assert.ok(!names.includes("create_issue"));
    assert.ok(!names.includes("update_document"));
});

test("a refused MCP request points the client at the OAuth sign-in", async () => {
    const response = await fetch(`${baseUrl}/api/mcp`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
    assert.equal(response.status, 401);
    assert.match(response.headers.get("www-authenticate") ?? "", new RegExp(`resource_metadata="${baseUrl}/\\.well-known/oauth-protected-resource/api/mcp"`));
});

test("discovery documents name the MCP endpoint and the OAuth endpoints under /api/oauth", async () => {
    const resource = (await (await fetch(`${baseUrl}/.well-known/oauth-protected-resource/api/mcp`)).json()) as { resource: string; authorization_servers: string[] };
    assert.equal(resource.resource, `${baseUrl}/api/mcp`);
    assert.deepEqual(resource.authorization_servers, [`${baseUrl}/`]);

    const server = (await (await fetch(`${baseUrl}/.well-known/oauth-authorization-server`)).json()) as Record<string, unknown>;
    assert.equal(server.authorization_endpoint, `${baseUrl}/api/oauth/authorize`);
    assert.equal(server.token_endpoint, `${baseUrl}/api/oauth/token`);
    assert.equal(server.registration_endpoint, `${baseUrl}/api/oauth/register`);
    assert.deepEqual(server.code_challenge_methods_supported, ["S256"]);
    assert.deepEqual(server.scopes_supported, ["read", "write"]);
});

test("asking for write, or for nothing, asks to change things; read alone asks to look", () => {
    assert.equal(accessForScopes(undefined), "write");
    assert.equal(accessForScopes([]), "write");
    assert.equal(accessForScopes(["read"]), "read");
    assert.equal(accessForScopes(["read", "write"]), "write");
});

test("a client registers itself, and signing in sends the person to the consent page", async () => {
    const inserted = stubInserts();
    const registered = await fetch(`${baseUrl}/api/oauth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ client_name: "Claude", redirect_uris: client.redirect_uris, token_endpoint_auth_method: "none" }),
    });
    assert.equal(registered.status, 201);
    const info = (await registered.json()) as { client_id: string };
    assert.equal(inserted[0].table, oauthClients);
    assert.equal(inserted[0].values.clientId, info.client_id);

    spyOn(db.query.oauthClients, "findFirst").mockImplementation((async () => ({ clientId: client.client_id, info: client })) as never);
    const query = new URLSearchParams({ client_id: client.client_id, redirect_uri: client.redirect_uris[0], response_type: "code", code_challenge: challenge, code_challenge_method: "S256", state: "xyz", scope: "write" });
    const authorize = await fetch(`${baseUrl}/api/oauth/authorize?${query}`, { redirect: "manual" });
    assert.equal(authorize.status, 302);
    const page = new URL(authorize.headers.get("location")!);
    assert.equal(page.pathname, "/oauth/authorize");
    assert.equal(page.searchParams.get("client_id"), client.client_id);
    assert.equal(page.searchParams.get("code_challenge"), challenge);
    assert.equal(page.searchParams.get("state"), "xyz");
});

test("only a signed-in browser answers the consent page, and it can narrow access to reading", async () => {
    spyOn(db.query.oauthClients, "findFirst").mockImplementation((async () => ({ clientId: client.client_id, info: client })) as never);
    const request = { clientId: client.client_id, redirectUri: client.redirect_uris[0], codeChallenge: challenge, state: "xyz", scope: "write" };
    const post = (headers: Record<string, string>, body: object) => fetch(`${baseUrl}/api/oauth/consent`, { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(body) });

    assert.equal((await post({ Authorization: `Bearer ${stubToken("write")}` }, { ...request, approve: true })).status, 403);

    const described = (await (await fetch(`${baseUrl}/api/oauth/consent?${new URLSearchParams({ clientId: request.clientId, redirectUri: request.redirectUri, scope: "write" })}`, { headers: { Cookie: session } })).json()) as Record<string, unknown>;
    assert.deepEqual(described, { clientName: "Claude", redirectHost: "claude.ai", access: "write" });

    const inserted = stubInserts();
    const approved = (await (await post({ Cookie: session }, { ...request, approve: true, access: "read" })).json()) as { redirectTo: string };
    const back = new URL(approved.redirectTo);
    assert.equal(back.origin + back.pathname, client.redirect_uris[0]);
    assert.equal(back.searchParams.get("state"), "xyz");
    assert.ok(back.searchParams.get("code"));
    assert.equal(inserted[0].table, oauthCodes);
    assert.equal(inserted[0].values.access, "read");
    assert.equal(inserted[0].values.userId, ana.id);

    const denied = (await (await post({ Cookie: session }, { ...request, approve: false })).json()) as { redirectTo: string };
    assert.equal(new URL(denied.redirectTo).searchParams.get("error"), "access_denied");

    const elsewhere = await post({ Cookie: session }, { ...request, redirectUri: "https://attacker.test/callback", approve: true });
    assert.equal(elsewhere.status, 400);
});

test("an authorization code becomes an API token for that app, once", async () => {
    spyOn(db.query.oauthClients, "findFirst").mockImplementation((async () => ({ clientId: client.client_id, info: client })) as never);
    const code = { codeHash: "hash", clientId: client.client_id, userId: ana.id, codeChallenge: challenge, redirectUri: client.redirect_uris[0], access: "read", expiresAt: new Date(Date.now() + 60_000) };
    spyOn(db.query.oauthCodes, "findFirst").mockImplementation((async () => code) as never);
    let deletions = 0;
    spyOn(db, "delete").mockImplementation(((table: unknown) => ({
        where: () => {
            const result = table === oauthCodes && deletions++ === 0 ? [{ codeHash: "hash" }] : [];
            return { returning: async () => result, then: (resolve: (value: unknown) => void) => resolve(undefined), catch: () => undefined };
        },
    })) as never);
    const inserted = stubInserts();
    const exchange = () =>
        fetch(`${baseUrl}/api/oauth/token`, {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({ grant_type: "authorization_code", code: "the-code", code_verifier: verifier, redirect_uri: client.redirect_uris[0], client_id: client.client_id }),
        });

    const response = await exchange();
    assert.equal(response.status, 200);
    const tokens = (await response.json()) as { access_token: string; token_type: string; scope: string; expires_in: number };
    assert.match(tokens.access_token, /^rinia_/);
    // OAuth tokens live 90 days, and the client is told so.
    assert.equal(tokens.expires_in, 90 * 24 * 60 * 60);
    assert.equal(tokens.token_type.toLowerCase(), "bearer");
    assert.equal(tokens.scope, "read");
    const token = inserted.find((entry) => entry.table === apiTokens)!;
    assert.deepEqual([token.values.name, token.values.access, token.values.oauthClientId, token.values.userId], ["Claude", "read", client.client_id, ana.id]);
    assert.equal(token.values.tokenHash, hashApiToken(tokens.access_token));
    const lifetime = (token.values.expiresAt as Date).getTime() - Date.now();
    assert.ok(Math.abs(lifetime - 90 * 24 * 60 * 60 * 1000) < 60_000, `expires in ${lifetime} ms`);
    assert.equal(token.values.projectScoped, false);

    assert.equal((await exchange()).status, 400);
});
