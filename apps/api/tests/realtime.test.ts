import assert from "node:assert/strict";
import type { Server } from "node:http";
import { afterAll, afterEach, beforeAll, mock, spyOn, test } from "bun:test";
import { PRESENCE_TTL_MS, REALTIME_CLIENT_HEADER, REALTIME_PATH, realtimeClientMessageSchema, type RealtimeServerMessage } from "@rinia/shared";
import WebSocket from "ws";
import { db } from "../src/db";
import { HttpError } from "../src/lib/http-error";

// The app reads its settings on import; give it what it needs without a local .env.
process.env.JWT_SECRET ??= "test-secret";
process.env.DATABASE_URL ??= "postgres://localhost/unused";
process.env.SPECIAL_REGISTRATION_CODE ??= "test-code";
const { app } = await import("../src/app");
const { signToken } = await import("../src/lib/jwt");
const { SESSION_COOKIE_NAME } = await import("../src/lib/cookies");
const { attachRealtime, sameOrigin, sessionToken } = await import("../src/features/realtime/realtime.socket");
const { RealtimeHub, authorizeChannel, channelsFor, realtimeHub } = await import("../src/features/realtime/realtime.service");
const { updateDocument } = await import("../src/features/documents/documents.service");
const { bulkDeleteIssues } = await import("../src/features/issues/issues.service");

// Stub the database boundary: these tests never connect to or mutate a development database.
afterEach(() => mock.restore());

const projectId = "7a1c0e55-0000-4000-8000-0000000000aa";
const issueId = "7a1c0e55-0000-4000-8000-0000000000b1";
const documentId = "7a1c0e55-0000-4000-8000-0000000000d1";
const ana = { id: "7a1c0e55-0000-4000-8000-000000000001", name: "Ana Souza", username: "ana", avatarUrl: null };
const bruno = { id: "7a1c0e55-0000-4000-8000-000000000002", name: "Bruno Lima", username: "bruno", avatarUrl: null };
const isHttp = (status: number) => (error: unknown) => error instanceof HttpError && error.statusCode === status;

/** A socket that keeps what the hub sends it. */
function fakeSocket() {
    const messages: RealtimeServerMessage[] = [];
    return { messages, send: (data: string) => void messages.push(JSON.parse(data) as RealtimeServerMessage) };
}
const ofType = <T extends RealtimeServerMessage["type"]>(messages: RealtimeServerMessage[], type: T) => messages.filter((message): message is Extract<RealtimeServerMessage, { type: T }> => message.type === type);

test("an event reaches each listening tab once, and no one outside its channels", () => {
    const hub = new RealtimeHub();
    const both = fakeSocket();
    const projectOnly = fakeSocket();
    const elsewhere = fakeSocket();
    const first = hub.connect(both, ana);
    hub.subscribe(first, `project:${projectId}`, projectId);
    hub.subscribe(first, `issue:${issueId}`, projectId);
    hub.subscribe(hub.connect(projectOnly, bruno), `project:${projectId}`, projectId);
    hub.subscribe(hub.connect(elsewhere, bruno), "project:7a1c0e55-0000-4000-8000-0000000000ff", "7a1c0e55-0000-4000-8000-0000000000ff");

    const event = { type: "issue.updated" as const, projectId, id: issueId, actorId: ana.id, clientId: "tab-a" };
    hub.publish(event, channelsFor(event));
    assert.deepEqual(ofType(both.messages, "event").map((message) => message.event), [event]);
    assert.equal(ofType(projectOnly.messages, "event").length, 1);
    assert.equal(elsewhere.messages.length, 0);
});

test("comments and relations go to their issue; issues and documents also reach their own page", () => {
    assert.deepEqual(channelsFor({ type: "comment.created", projectId, id: "c", issueId }), [`issue:${issueId}`]);
    assert.deepEqual(channelsFor({ type: "relation.deleted", projectId, id: "r", issueId }), [`issue:${issueId}`]);
    assert.deepEqual(channelsFor({ type: "issue.deleted", projectId, id: issueId }), [`project:${projectId}`, `issue:${issueId}`]);
    assert.deepEqual(channelsFor({ type: "document.updated", projectId, id: documentId }), [`project:${projectId}`, `document:${documentId}`]);
    assert.deepEqual(channelsFor({ type: "view.created", projectId, id: "v" }), [`project:${projectId}`]);
});

test("presence lists each person once, editing if any of their tabs is, and only subscribers can join", () => {
    const hub = new RealtimeHub();
    const channel = `document:${documentId}` as const;
    const watcher = fakeSocket();
    const watching = hub.connect(watcher, bruno);
    hub.subscribe(watching, channel, projectId);
    const tabs = [hub.connect(fakeSocket(), ana), hub.connect(fakeSocket(), ana)];
    for (const tab of tabs) hub.subscribe(tab, channel, projectId);
    const stranger = hub.connect(fakeSocket(), bruno);

    hub.heartbeat(tabs[0], channel, false, 0);
    hub.heartbeat(tabs[1], channel, true, 0);
    hub.heartbeat(stranger, channel, false, 0);
    assert.deepEqual(hub.viewers(channel), [{ user: ana, editing: true }]);
    // Joining and starting to edit each go out; a heartbeat that changes nothing does not.
    const before = ofType(watcher.messages, "presence").length;
    hub.heartbeat(tabs[1], channel, true, 1_000);
    assert.equal(ofType(watcher.messages, "presence").length, before);

    hub.leave(tabs[1], channel);
    assert.deepEqual(hub.viewers(channel), [{ user: ana, editing: false }]);
    hub.disconnect(tabs[0]);
    assert.deepEqual(hub.viewers(channel), []);
    assert.deepEqual(ofType(watcher.messages, "presence").at(-1)?.viewers, []);
});

test("someone arriving sees who is already on the page", () => {
    const hub = new RealtimeHub();
    const channel = `issue:${issueId}` as const;
    const first = hub.connect(fakeSocket(), ana);
    hub.subscribe(first, channel, projectId);
    hub.heartbeat(first, channel, false, 0);
    const late = fakeSocket();
    hub.subscribe(hub.connect(late, bruno), channel, projectId);
    assert.deepEqual(ofType(late.messages, "presence")[0]?.viewers, [{ user: ana, editing: false }]);
});

test("presence without a heartbeat expires and the others hear about it", () => {
    const hub = new RealtimeHub();
    const channel = `issue:${issueId}` as const;
    const watcher = fakeSocket();
    hub.subscribe(hub.connect(watcher, bruno), channel, projectId);
    const sleeping = hub.connect(fakeSocket(), ana);
    hub.subscribe(sleeping, channel, projectId);
    hub.heartbeat(sleeping, channel, false, 0);

    hub.expire(PRESENCE_TTL_MS - 1);
    assert.equal(hub.viewers(channel).length, 1);
    hub.expire(PRESENCE_TTL_MS);
    assert.deepEqual(hub.viewers(channel), []);
    assert.deepEqual(ofType(watcher.messages, "presence").at(-1)?.viewers, []);
});

test("removing someone from a project drops its channels from their sockets", () => {
    const hub = new RealtimeHub();
    const member = fakeSocket();
    const connection = hub.connect(member, bruno);
    hub.subscribe(connection, `project:${projectId}`, projectId);
    hub.subscribe(connection, `issue:${issueId}`, projectId);
    hub.subscribe(connection, "project:7a1c0e55-0000-4000-8000-0000000000ff", "7a1c0e55-0000-4000-8000-0000000000ff");

    hub.revoke(projectId, bruno.id);
    assert.deepEqual([...connection.channels.keys()], ["project:7a1c0e55-0000-4000-8000-0000000000ff"]);
    assert.deepEqual(ofType(member.messages, "denied").map((message) => message.channel), [`project:${projectId}`, `issue:${issueId}`]);
});

test("a channel is open to project members only, and deleted issues have none", async () => {
    spyOn(db.query.issues, "findFirst").mockImplementation(async () => ({ projectId }) as never);
    const membership = spyOn(db.query.projectMembers, "findFirst").mockImplementation(async () => ({ id: "membership", role: "member" }) as never);
    assert.equal(await authorizeChannel(`issue:${issueId}`, { id: ana.id }), projectId);

    membership.mockImplementation(async () => undefined);
    await assert.rejects(authorizeChannel(`issue:${issueId}`, { id: bruno.id }), isHttp(403));

    spyOn(db.query.projectDocuments, "findFirst").mockImplementation(async () => undefined);
    await assert.rejects(authorizeChannel(`document:${documentId}`, { id: ana.id }), isHttp(404));
});

test("clients may only name project, issue and document channels, and presence is per issue or document", () => {
    assert.equal(realtimeClientMessageSchema.safeParse({ type: "subscribe", channel: `project:${projectId}` }).success, true);
    assert.equal(realtimeClientMessageSchema.safeParse({ type: "subscribe", channel: "user:me" }).success, false);
    assert.equal(realtimeClientMessageSchema.safeParse({ type: "subscribe", channel: "project:*" }).success, false);
    assert.equal(realtimeClientMessageSchema.safeParse({ type: "presence", channel: `project:${projectId}` }).success, false);
    assert.equal(realtimeClientMessageSchema.parse({ type: "presence", channel: `issue:${issueId}` }).type === "presence", true);
});

test("the socket reads the session cookie and refuses other sites", () => {
    assert.equal(sessionToken(`theme=dark; ${SESSION_COOKIE_NAME}=abc.def%3D; other=1`), "abc.def=");
    assert.equal(sessionToken("theme=dark"), undefined);
    assert.equal(sameOrigin({ headers: { host: "rinia.app", origin: "https://rinia.app" } }), true);
    assert.equal(sameOrigin({ headers: { host: "api:3000", "x-forwarded-host": "rinia.app", origin: "https://rinia.app" } }), true);
    assert.equal(sameOrigin({ headers: { host: "rinia.app", origin: "https://evil.example" } }), false);
    assert.equal(sameOrigin({ headers: { host: "rinia.app" } }), true, "non-browser clients still need the cookie");
});

test("a renamed document is published once; a missing one is not", async () => {
    const publish = spyOn(realtimeHub, "publish").mockImplementation(() => undefined);
    spyOn(db.query.users, "findFirst").mockImplementation(async () => ({ locale: "en" }) as never);
    const returned: unknown[][] = [[{ id: documentId, projectId, revision: 2 }], []];
    spyOn(db, "update").mockImplementation((() => ({ set: () => ({ where: () => ({ returning: async () => returned.shift() }) }) })) as never);
    spyOn(db.query.projectDocuments, "findFirst").mockImplementation(async () => ({ id: documentId, projectId }) as never);

    await updateDocument(projectId, documentId, ana.id, { title: "Notes" });
    await assert.rejects(updateDocument(projectId, documentId, ana.id, { title: "Notes" }), isHttp(404));
    assert.equal(publish.mock.calls.length, 1);
    const [event, channels] = publish.mock.calls[0];
    assert.equal(event.type, "document.updated");
    assert.equal(event.id, documentId);
    assert.deepEqual(channels, [`project:${projectId}`, `document:${documentId}`]);
});

test("a bulk delete names every issue it removed", async () => {
    const publish = spyOn(realtimeHub, "publish").mockImplementation(() => undefined);
    const ids = [issueId, "7a1c0e55-0000-4000-8000-0000000000b2"];
    spyOn(db.query.issues, "findMany")
        .mockImplementationOnce(async () => ids.map((id) => ({ id, projectId, labels: [] })) as never)
        .mockImplementationOnce(async () => [] as never);
    spyOn(db, "update").mockImplementation((() => ({ set: () => ({ where: async () => undefined }) })) as never);
    await bulkDeleteIssues(projectId, ids);
    assert.deepEqual(publish.mock.calls.map(([event]) => [event.type, event.id]), ids.map((id) => ["issue.deleted", id]));
});

let server: Server;
let socketUrl = "";
let baseUrl = "";
beforeAll(async () => {
    server = app.listen(0);
    attachRealtime(server);
    await new Promise((resolve) => server.once("listening", resolve));
    const address = server.address();
    const port = typeof address === "object" && address ? address.port : 0;
    baseUrl = `http://127.0.0.1:${port}`;
    socketUrl = `ws://127.0.0.1:${port}${REALTIME_PATH}`;
});
afterAll(() => server.close());

const cookieFor = (user: typeof ana) => `${SESSION_COOKIE_NAME}=${signToken({ sub: user.id, username: user.username, isAdmin: false })}`;

/** Opens a socket and collects what the server sends, with a way to wait for a message. */
function connect(headers: Record<string, string>) {
    const socket = new WebSocket(socketUrl, { headers });
    const messages: RealtimeServerMessage[] = [];
    const waiters: Array<() => void> = [];
    socket.on("message", (data) => {
        messages.push(JSON.parse(data.toString()) as RealtimeServerMessage);
        waiters.splice(0).forEach((wake) => wake());
    });
    const next = async (predicate: (message: RealtimeServerMessage) => boolean) => {
        for (const deadline = Date.now() + 2_000; Date.now() < deadline; ) {
            const found = messages.find(predicate);
            if (found) return found;
            await new Promise<void>((resolve) => {
                waiters.push(resolve);
                setTimeout(resolve, 50);
            });
        }
        throw new Error("No matching message");
    };
    return { socket, messages, next };
}

test("a socket without a session cookie is refused", async () => {
    const { socket } = connect({});
    const error = await new Promise<Error>((resolve) => socket.on("error", resolve));
    assert.ok(error);
});

test("over a real socket, another member sees a saved document at once, tagged with the tab that saved it", async () => {
    spyOn(db.query.users, "findFirst").mockImplementation(async () => ({ ...bruno, locale: "en" }) as never);
    spyOn(db.query.projects, "findFirst").mockImplementation(async () => ({ id: projectId }) as never);
    spyOn(db.query.projectMembers, "findFirst").mockImplementation(async () => ({ id: "membership", role: "member" }) as never);
    // Opening the page for editing loads it, and seeds its Yjs state from the saved JSON the first time.
    spyOn(db.query.projectDocuments, "findFirst").mockImplementation(async () => ({ id: documentId, projectId, contentJson: { type: "doc", content: [] }, yjsState: null }) as never);
    spyOn(db, "update").mockImplementation((() => ({ set: () => ({ where: () => ({ returning: async () => [{ id: documentId, projectId, revision: 2 }] }) }) })) as never);

    const watcher = connect({ cookie: cookieFor(bruno) });
    await watcher.next((message) => message.type === "ready");
    watcher.socket.send(JSON.stringify({ type: "subscribe", channel: `document:${documentId}` }));
    watcher.socket.send(JSON.stringify({ type: "presence", channel: `document:${documentId}`, editing: false }));
    await watcher.next((message) => message.type === "subscribed");
    const presence = await watcher.next((message) => message.type === "presence");
    assert.deepEqual(presence.type === "presence" && presence.viewers.map((viewer) => viewer.user.username), ["bruno"]);

    const response = await fetch(`${baseUrl}/api/projects/${projectId}/documents/${documentId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Cookie: cookieFor(ana), [REALTIME_CLIENT_HEADER]: "ana-tab" },
        body: JSON.stringify({ title: "Notes" }),
    });
    assert.equal(response.status, 200);
    const received = await watcher.next((message) => message.type === "event");
    assert.deepEqual(received.type === "event" && received.event, { type: "document.updated", projectId, id: documentId, actorId: ana.id, clientId: "ana-tab" });

    watcher.socket.close();
    await new Promise((resolve) => watcher.socket.once("close", resolve));
    await Bun.sleep(20);
    assert.deepEqual(realtimeHub.viewers(`document:${documentId}`), [], "closing the tab removes presence at once");
});
