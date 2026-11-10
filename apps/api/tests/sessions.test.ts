import assert from "node:assert/strict";
import type { Server } from "node:http";
import { afterAll, afterEach, beforeAll, mock, spyOn, test } from "bun:test";
import { sessionCookie } from "./fixtures/sessions";
import { db } from "../src/db";
import { app } from "../src/app";
import { clearSessionCache, resolveSession, revokeSessions, SESSION_CACHE_MS } from "../src/features/auth/sessions.service";
import { realtimeHub } from "../src/features/realtime/realtime.service";

// Stub the database boundary: these tests never connect to or mutate a development database.
afterEach(() => {
    mock.restore();
    clearSessionCache();
});

const userId = "7a1e2f3a-0000-4000-8000-000000000001";
const sid = "7a1e2f3a-0000-4000-8000-0000000000aa";
const token = { sub: userId, sid };

function stubRow(overrides: Record<string, unknown> = {}, user: Record<string, unknown> = {}) {
    return spyOn(db.query.sessions, "findFirst").mockImplementation((async () => ({
        userId,
        revokedAt: null,
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
        lastSeenAt: new Date(),
        ...overrides,
        user: { username: "ana", isAdmin: false, suspendedAt: null, ...user },
    })) as never);
}

test("a live session resolves to its user, with admin rights read from the account", async () => {
    stubRow({}, { isAdmin: true });
    assert.deepEqual(await resolveSession(token), { sub: userId, username: "ana", isAdmin: true, sid });
});

test("revoked, expired, suspended, unknown or borrowed sessions are refused", async () => {
    const find = stubRow({ revokedAt: new Date() });
    assert.equal(await resolveSession(token), null);
    clearSessionCache();
    find.mockImplementation((async () => ({ userId, revokedAt: null, expiresAt: new Date(Date.now() - 1000), lastSeenAt: new Date(), user: { username: "ana", isAdmin: false, suspendedAt: null } })) as never);
    assert.equal(await resolveSession(token), null);
    clearSessionCache();
    find.mockImplementation((async () => ({ userId, revokedAt: null, expiresAt: new Date(Date.now() + 60_000), lastSeenAt: new Date(), user: { username: "ana", isAdmin: false, suspendedAt: new Date() } })) as never);
    assert.equal(await resolveSession(token), null);
    clearSessionCache();
    find.mockImplementation((async () => undefined) as never);
    assert.equal(await resolveSession(token), null);
    clearSessionCache();
    stubRow({ userId: "someone-else" });
    assert.equal(await resolveSession(token), null);
});

test("a checked session is cached for a short while, then asked about again", async () => {
    const find = stubRow();
    const start = new Date();
    await resolveSession(token, start);
    await resolveSession(token, new Date(start.getTime() + SESSION_CACHE_MS - 1));
    assert.equal(find.mock.calls.length, 1);
    await resolveSession(token, new Date(start.getTime() + SESSION_CACHE_MS));
    assert.equal(find.mock.calls.length, 2);
});

test("revoking a session forgets it at once and closes its sockets with 4401", async () => {
    stubRow();
    assert.ok(await resolveSession(token));
    spyOn(db, "update").mockImplementation((() => ({ set: () => ({ where: () => ({ returning: async () => [{ id: sid }] }) }) })) as never);
    const closed: Array<[number | undefined, string | undefined]> = [];
    const other: Array<number | undefined> = [];
    const mine = realtimeHub.connect({ send: () => undefined, close: (code, reason) => void closed.push([code, reason]) }, { id: userId, name: "Ana", username: "ana", avatarUrl: null }, sid);
    const elsewhere = realtimeHub.connect({ send: () => undefined, close: (code) => void other.push(code) }, { id: userId, name: "Ana", username: "ana", avatarUrl: null }, "another-session");
    try {
        assert.equal(await revokeSessions(userId, { only: sid }), 1);
        assert.deepEqual(closed, [[4401, "Session ended"]]);
        assert.deepEqual(other, []);
        // The next request asks the database, which now says revoked.
        stubRow({ revokedAt: new Date() });
        assert.equal(await resolveSession(token), null);
    } finally {
        realtimeHub.disconnect(mine);
        realtimeHub.disconnect(elsewhere);
    }
});

test("last seen moves at most once a minute", async () => {
    stubRow({ lastSeenAt: new Date(Date.now() - 2 * 60_000) });
    const update = spyOn(db, "update").mockImplementation((() => ({ set: () => ({ where: () => Promise.resolve() }) })) as never);
    await resolveSession(token);
    await resolveSession(token);
    assert.equal(update.mock.calls.length, 1);
});

let server: Server;
let baseUrl = "";
beforeAll(async () => {
    server = app.listen(0);
    await new Promise((resolve) => server.once("listening", resolve));
    const address = server.address();
    baseUrl = `http://127.0.0.1:${typeof address === "object" && address ? address.port : 0}`;
});
afterAll(() => server.close());

test("after logout, the old cookie no longer works", async () => {
    // In tests a session's id is its user's id.
    const cookie = sessionCookie(userId);
    let revoked: Date | null = null;
    spyOn(db.query.sessions, "findFirst").mockImplementation((async () => ({
        userId,
        revokedAt: revoked,
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
        lastSeenAt: new Date(),
        user: { username: "ana", isAdmin: false, suspendedAt: null },
    })) as never);
    spyOn(db.query.users, "findFirst").mockImplementation((async () => ({ id: userId, name: "Ana", username: "ana", email: "ana@rinia.local", passwordHash: "x", locale: "pt-BR", isAdmin: false })) as never);
    const update = spyOn(db, "update").mockImplementation((() => ({
        set: (values: { revokedAt?: Date }) => ((revoked = values.revokedAt ?? revoked), { where: () => ({ returning: async () => [{ id: userId }] }) }),
    })) as never);
    assert.equal((await fetch(`${baseUrl}/api/auth/me`, { headers: { Cookie: cookie } })).status, 200);
    const logout = await fetch(`${baseUrl}/api/auth/logout`, { method: "POST", headers: { Cookie: cookie } });
    assert.equal(logout.status, 204);
    assert.equal(update.mock.calls.length, 1);
    assert.equal((await fetch(`${baseUrl}/api/auth/me`, { headers: { Cookie: cookie } })).status, 401);
});
