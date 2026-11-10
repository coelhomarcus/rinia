import assert from "node:assert/strict";
import { afterEach, mock, spyOn, test } from "bun:test";
import type { ProjectRole, RealtimeChannel } from "@rinia/shared";
import { DOCUMENT_FRAGMENT } from "@rinia/shared/src/rich-text-schema";
import { yDocToProsemirrorJSON } from "@tiptap/y-tiptap";
import type * as Y from "yjs";
import { DocumentProvider } from "../../web/src/features/documents/collab/document-provider";
import { fromBase64 } from "../../web/src/lib/base64";

process.env.JWT_SECRET ??= "test-secret";
process.env.DATABASE_URL ??= "postgres://localhost/unused";
process.env.SPECIAL_REGISTRATION_CODE ??= "test-code";
const { db } = await import("../src/db");
const { DocumentRooms } = await import("../src/features/documents/document-rooms");

afterEach(() => mock.restore());

const documentId = "7a1c0e55-0000-4000-8000-0000000000d1";
const channel = `document:${documentId}` as RealtimeChannel;
const ana = { id: "7a1c0e55-0000-4000-8000-000000000001", name: "Ana Souza", username: "ana", avatarUrl: null };
const bruno = { id: "7a1c0e55-0000-4000-8000-000000000002", name: "Bruno Lima", username: "bruno", avatarUrl: null };
const saved = { type: "doc" as const, content: [{ type: "paragraph", content: [{ type: "text", text: "Hello" }] }] };

type Handler = Parameters<ConstructorParameters<typeof DocumentProvider>[3]["attachDocument"]>[1];

/**
 * The browser's realtime client, wired straight to the server's rooms. Like the real socket, the server speaks first
 * when a tab joins (it asks for what the tab has) and only then confirms the subscription.
 */
function browser(rooms: InstanceType<typeof DocumentRooms>, user: typeof ana) {
    const handlers = new Map<RealtimeChannel, Handler>();
    let open = false;
    const connection = {
        socket: { send: (data: string) => handlers.get(channel)?.message(fromBase64(JSON.parse(data).data)) },
        user,
        channels: new Map<RealtimeChannel, string>(),
        roles: new Map<string, ProjectRole>([["project", "member"]]),
    };
    return {
        client: {
            attachDocument(_channel: RealtimeChannel, handler: Handler) {
                handlers.set(_channel, handler);
                return () => void handlers.delete(_channel);
            },
            sendDocument(_channel: RealtimeChannel, bytes: Uint8Array) {
                if (!open) return false;
                void rooms.receive(connection, _channel, bytes);
                return true;
            },
        },
        async connect() {
            open = true;
            connection.channels.set(channel, "project");
            await rooms.join(connection, documentId);
            handlers.get(channel)?.attached();
        },
        /** The editor's provider attaching after the subscription was confirmed, as `attachDocument` does. */
        async attach() {
            handlers.get(channel)?.attached();
        },
        deny() {
            handlers.get(channel)?.denied();
        },
        disconnect() {
            open = false;
            rooms.leave(connection, channel);
            connection.channels.clear();
            handlers.get(channel)?.detached();
        },
    };
}

const textOf = (doc: Y.Doc) => JSON.stringify(yDocToProsemirrorJSON(doc, DOCUMENT_FRAGMENT));
const settle = () => Bun.sleep(10);

function database() {
    spyOn(db.query.projectDocuments, "findFirst").mockImplementation(async () => ({ contentJson: saved, yjsState: null }) as never);
    spyOn(db, "update").mockImplementation((() => ({ set: () => ({ where: () => Object.assign(Promise.resolve(), { returning: async () => [{ id: documentId }] }) }) })) as never);
}

test("a page opens with the saved content once it syncs, and is not ready before", async () => {
    database();
    const rooms = new DocumentRooms();
    const tab = browser(rooms, ana);
    const provider = new DocumentProvider(ana.id, "project", documentId, tab.client);
    assert.equal(provider.getSnapshot().ready, false);
    await tab.connect();
    await settle();
    assert.equal(provider.getSnapshot().synced, true);
    assert.equal(provider.getSnapshot().ready, true);
    assert.match(textOf(provider.doc), /Hello/);
    provider.destroy();
    await rooms.closeAll();
});

test("edits made while offline reach the server and the other tab when the connection comes back", async () => {
    database();
    const rooms = new DocumentRooms();
    const first = browser(rooms, ana);
    const second = browser(rooms, bruno);
    const mine = new DocumentProvider(ana.id, "project", documentId, first.client);
    const theirs = new DocumentProvider(bruno.id, "project", documentId, second.client);
    await first.connect();
    await second.connect();
    await settle();

    first.disconnect();
    const paragraph = mine.doc.getXmlFragment(DOCUMENT_FRAGMENT).get(0) as Y.XmlElement;
    (paragraph.get(0) as Y.XmlText).insert(5, " from the train");
    assert.equal(mine.getSnapshot().unsynced, true, "the tab knows the server has not seen this yet");
    assert.doesNotMatch(textOf(theirs.doc), /train/);

    await first.connect();
    await settle();
    assert.match(textOf(theirs.doc), /Hello from the train/);
    assert.equal(mine.getSnapshot().unsynced, false);
    mine.destroy();
    theirs.destroy();
    await rooms.closeAll();
});

test("a page that joins a channel the tab already listens to still hands over what it typed offline", async () => {
    database();
    const rooms = new DocumentRooms();
    const first = browser(rooms, ana);
    const second = browser(rooms, bruno);
    const theirs = new DocumentProvider(bruno.id, "project", documentId, second.client);
    await second.connect();

    // The header's presence subscribed first, so the server joined this tab before the editor existed.
    await first.connect();
    const mine = new DocumentProvider(ana.id, "project", documentId, first.client);
    // As if restored from this browser's copy before the sync: offline text the server has never seen.
    mine.doc.getXmlFragment(DOCUMENT_FRAGMENT).insert(0, [new (await import("yjs")).XmlElement("paragraph")]);
    assert.equal(mine.getSnapshot().unsynced, true);
    await first.attach();
    await settle();
    assert.equal(mine.getSnapshot().unsynced, false);
    assert.equal(theirs.doc.getXmlFragment(DOCUMENT_FRAGMENT).length, 2, "the other tab has the offline paragraph");
    mine.destroy();
    theirs.destroy();
    await rooms.closeAll();
});

test("a page the server cannot open says so instead of loading forever", () => {
    const tab = browser(new DocumentRooms(), ana);
    const provider = new DocumentProvider(ana.id, "project", documentId, tab.client);
    tab.deny();
    assert.equal(provider.getSnapshot().failed, true);
    assert.equal(provider.getSnapshot().ready, false);
    provider.destroy();
});

test("a cursor reaches the other tab and goes away when the page closes", async () => {
    database();
    const rooms = new DocumentRooms();
    const first = browser(rooms, ana);
    const second = browser(rooms, bruno);
    const mine = new DocumentProvider(ana.id, "project", documentId, first.client);
    const theirs = new DocumentProvider(bruno.id, "project", documentId, second.client);
    await first.connect();
    await second.connect();
    await settle();

    mine.awareness.setLocalStateField("user", { id: ana.id, name: ana.name });
    await settle();
    assert.equal((theirs.awareness.getStates().get(mine.doc.clientID) as { user: { name: string } }).user.name, "Ana Souza");

    const clientId = mine.doc.clientID;
    mine.destroy();
    await settle();
    assert.equal(theirs.awareness.getStates().has(clientId), false);
    theirs.destroy();
    await rooms.closeAll();
});
