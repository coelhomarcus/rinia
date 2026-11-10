import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, mock, spyOn, test } from "bun:test";
import { REALTIME_PATH } from "@rinia/shared";
import WebSocket from "ws";
import { sessionCookie, stubSessionAccounts } from "./fixtures/sessions";

process.env.JWT_SECRET ??= "test-secret";
process.env.DATABASE_URL ??= "postgres://localhost/unused";
process.env.SPECIAL_REGISTRATION_CODE ??= "test-code";
const { db } = await import("../src/db");
const { shutdown, trackRequests } = await import("../src/lib/graceful-shutdown");
const { attachRealtime, SERVICE_RESTART } = await import("../src/features/realtime/realtime.socket");
const { logger } = await import("../src/lib/logger");

afterEach(() => mock.restore());

const log = logger.child({ module: "test" });
const tracked = new WeakMap<Server, ReturnType<typeof trackRequests>>();
const quiet = { ...log, info() {}, warn() {}, error() {} } as unknown as typeof log;
const listen = async (server: Server) => {
    tracked.set(server, trackRequests(server));
    server.listen(0, "127.0.0.1");
    await new Promise((resolve) => server.once("listening", resolve));
    return (server.address() as AddressInfo).port;
};

test("a request in flight finishes before the process stops, and the steps run in order", async () => {
    const order: string[] = [];
    let arrived!: () => void;
    const gate = new Promise<void>((resolve) => (arrived = resolve));
    const server = createServer((_req, res) => {
        arrived();
        setTimeout(() => res.end("done"), 150);
    });
    const port = await listen(server);
    const response = fetch(`http://127.0.0.1:${port}/`).then((r) => r.text());
    await gate;

    const code = await shutdown({
        server,
        requests: tracked.get(server)!,
        closeSockets: async () => void order.push("sockets"),
        savePages: async () => void order.push("pages"),
        releaseConnections: () => void order.push("release"),
        closePool: async () => void order.push("pool"),
        log: quiet,
    });

    assert.equal(await response, "done", "the response was not cut");
    assert.equal(code, 0);
    assert.deepEqual(order, ["sockets", "pages", "pages", "release", "pool"], "pages are saved again once the requests are done");
    assert.equal(server.listening, false);
});

test("a hanging request is destroyed at the timeout and the exit code says so", async () => {
    let arrived!: () => void;
    const gate = new Promise<void>((resolve) => (arrived = resolve));
    const server = createServer((_req, res) => {
        res.on("close", () => {}); // touching the response keeps Bun from finishing it; this one never answers
        arrived();
    });
    const port = await listen(server);
    // Destroyed before it wrote anything, the client sees a dropped connection or an error status, never a success.
    const hung = fetch(`http://127.0.0.1:${port}/`).then(
        (response) => (response.ok ? `answered ${response.status}` : "cut"),
        () => "cut",
    );
    await gate;

    const startedAt = Date.now();
    let closed = false;
    const code = await shutdown({ server, requests: tracked.get(server)!, closeSockets: async () => {}, savePages: async () => {}, releaseConnections: () => {}, closePool: async () => void (closed = true), log: quiet, timeoutMs: 300 });

    assert.equal(code, 1);
    assert.ok(Date.now() - startedAt < 2_000, "it did not wait for the request");
    assert.equal(await hung, "cut");
    assert.ok(closed, "the pool is still closed");
});

test("a pool that never closes does not hold the shutdown, and a failing step is reported", async () => {
    const server = createServer((_req, res) => res.end());
    await listen(server);
    const never = new Promise<void>(() => {});
    const startedAt = Date.now();
    const code = await shutdown({
        server,
        requests: tracked.get(server)!,
        closeSockets: async () => {
            throw new Error("boom");
        },
        savePages: async () => {},
        releaseConnections: () => {},
        closePool: () => never,
        log: quiet,
        timeoutMs: 300,
    });
    assert.equal(code, 1);
    assert.ok(Date.now() - startedAt < 4_000);
});

test("realtime sockets close with 1012 so clients reconnect, and no new socket is accepted", async () => {
    stubSessionAccounts();
    spyOn(db.query.users, "findFirst").mockImplementation(async () => ({ id: "u", name: "Ana", username: "ana", avatarUrl: null }) as never);
    const server = createServer((_req, res) => res.end());
    const realtime = attachRealtime(server);
    const port = await listen(server);

    const socket = new WebSocket(`ws://127.0.0.1:${port}${REALTIME_PATH}`, { headers: { cookie: sessionCookie("7a1c0e55-0000-4000-8000-000000000001") } });
    await new Promise((resolve) => socket.on("message", resolve));
    const closed = new Promise<{ code: number; reason: string }>((resolve) => socket.on("close", (code, reason) => resolve({ code, reason: reason.toString() })));

    const code = await shutdown({ server, requests: tracked.get(server)!, closeSockets: () => realtime.close(SERVICE_RESTART, "Server restarting"), savePages: async () => {}, releaseConnections: () => {}, closePool: async () => {}, log: quiet });

    assert.deepEqual(await closed, { code: 1012, reason: "Server restarting" });
    assert.equal(code, 0, "an open socket does not keep the server from closing");
    assert.equal(server.listening, false);
});
