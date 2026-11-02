import assert from "node:assert/strict";
import { afterEach, mock, spyOn, test } from "bun:test";
import type { RealtimeChannel } from "@rinia/shared";
import { DOCUMENT_FRAGMENT } from "@rinia/shared/src/rich-text-schema";
import { yDocToProsemirrorJSON } from "@tiptap/y-tiptap";
import * as decoding from "lib0/decoding";
import * as encoding from "lib0/encoding";
import * as awarenessProtocol from "y-protocols/awareness";
import * as syncProtocol from "y-protocols/sync";
import * as Y from "yjs";

process.env.JWT_SECRET ??= "test-secret";
process.env.DATABASE_URL ??= "postgres://localhost/unused";
process.env.SPECIAL_REGISTRATION_CODE ??= "test-code";
const { db } = await import("../src/db");
const { DocumentRooms, fromBase64, toBase64 } = await import("../src/features/documents/document-rooms");

afterEach(() => mock.restore());

const documentId = "7a1c0e55-0000-4000-8000-0000000000d1";
const channel = `document:${documentId}` as RealtimeChannel;
const ana = { id: "7a1c0e55-0000-4000-8000-000000000001", name: "Ana Souza", username: "ana", avatarUrl: null };
const bruno = { id: "7a1c0e55-0000-4000-8000-000000000002", name: "Bruno Lima", username: "bruno", avatarUrl: null };
const saved = {
    type: "doc" as const,
    content: [
        { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Plan" }] },
        { type: "paragraph", content: [{ type: "text", text: "Ship it " }, { type: "text", marks: [{ type: "bold" }], text: "today" }] },
        { type: "taskList", content: [{ type: "taskItem", attrs: { checked: true }, content: [{ type: "paragraph", content: [{ type: "text", text: "Write tests" }] }] }] },
    ],
};

/** One browser tab: a Yjs document that speaks the same sync and awareness messages the web provider does. */
function tab(rooms: InstanceType<typeof DocumentRooms>, user: typeof ana) {
    const inbox: Uint8Array[] = [];
    const connection = { socket: { send: (data: string) => inbox.push(fromBase64(JSON.parse(data).data)) }, user, channels: new Map<RealtimeChannel, string>([[channel, "project"]]) };
    const doc = new Y.Doc();
    const awareness = new awarenessProtocol.Awareness(doc);
    const to = (build: (encoder: encoding.Encoder) => void) => {
        const encoder = encoding.createEncoder();
        build(encoder);
        return rooms.receive(connection, channel, encoding.toUint8Array(encoder));
    };
    doc.on("update", (update: Uint8Array, origin: unknown) => {
        if (origin !== "server") void to((encoder) => (encoding.writeVarUint(encoder, 0), syncProtocol.writeUpdate(encoder, update)));
    });
    awareness.on("update", (_changes: unknown, origin: unknown) => {
        if (origin === "server") return;
        void to((encoder) => (encoding.writeVarUint(encoder, 1), encoding.writeVarUint8Array(encoder, awarenessProtocol.encodeAwarenessUpdate(awareness, [doc.clientID]))));
    });
    return {
        connection,
        doc,
        awareness,
        pending: () => inbox.length,
        text: () => JSON.stringify(yDocToProsemirrorJSON(doc, DOCUMENT_FRAGMENT)),
        async join() {
            await rooms.join(connection, documentId);
            await to((encoder) => (encoding.writeVarUint(encoder, 0), syncProtocol.writeSyncStep1(encoder, doc)));
            await this.deliver();
        },
        /** Applies what the server sent since the last call, as the web provider does. */
        async deliver() {
            for (const bytes of inbox.splice(0)) {
                const decoder = decoding.createDecoder(bytes);
                const type = decoding.readVarUint(decoder);
                if (type === 0) {
                    const reply = encoding.createEncoder();
                    encoding.writeVarUint(reply, 0);
                    syncProtocol.readSyncMessage(decoder, reply, doc, "server");
                    if (encoding.length(reply) > 1) await rooms.receive(connection, channel, encoding.toUint8Array(reply));
                } else awarenessProtocol.applyAwarenessUpdate(awareness, decoding.readVarUint8Array(decoder), "server");
            }
        },
    };
}

function database(row: { contentJson: unknown; yjsState: Uint8Array | null }) {
    const writes: Array<Record<string, unknown>> = [];
    spyOn(db.query.projectDocuments, "findFirst").mockImplementation(async () => row as never);
    spyOn(db, "update").mockImplementation(
        (() => ({
            set: (values: Record<string, unknown>) => {
                writes.push(values);
                return { where: () => Object.assign(Promise.resolve(), { returning: async () => [{ id: documentId }] }) };
            },
        })) as never,
    );
    return writes;
}

test("a page never opened for editing starts from its saved JSON, and is stored before anyone joins", async () => {
    const writes = database({ contentJson: saved, yjsState: null });
    const rooms = new DocumentRooms();
    const ana1 = tab(rooms, ana);
    await ana1.join();
    assert.deepEqual(JSON.parse(ana1.text()), saved);
    assert.equal(writes.length, 1, "the seed is saved at once");
    assert.ok(writes[0].yjsState instanceof Uint8Array);
    await rooms.closeAll();
});

test("an edit reaches the other tab and is not echoed back", async () => {
    database({ contentJson: saved, yjsState: null });
    const rooms = new DocumentRooms();
    const first = tab(rooms, ana);
    const second = tab(rooms, bruno);
    await first.join();
    await second.join();
    assert.deepEqual(JSON.parse(second.text()), saved);

    const paragraph = first.doc.getXmlFragment(DOCUMENT_FRAGMENT).get(1) as Y.XmlElement;
    (paragraph.get(0) as Y.XmlText).insert(0, "Hey! ");
    await Bun.sleep(5);
    assert.equal(first.pending(), 0, "the tab that typed hears nothing back");
    assert.equal(second.pending() > 0, true);
    await second.deliver();
    assert.equal(second.text(), first.text());
    assert.match(second.text(), /Hey! Ship it /);
    await rooms.closeAll();
});

test("both tabs typing at once end with the same page", async () => {
    database({ contentJson: saved, yjsState: null });
    const rooms = new DocumentRooms();
    const first = tab(rooms, ana);
    const second = tab(rooms, bruno);
    await first.join();
    await second.join();
    const paragraph = (doc: Y.Doc) => doc.getXmlFragment(DOCUMENT_FRAGMENT).get(1) as Y.XmlElement;
    (paragraph(first.doc).get(0) as Y.XmlText).insert(0, "A");
    (paragraph(second.doc).get(0) as Y.XmlText).insert(0, "B");
    await Bun.sleep(5);
    await first.deliver();
    await second.deliver();
    assert.equal(first.text(), second.text());
    assert.match(first.text(), /(AB|BA)Ship it /);
    await rooms.closeAll();
});

test("a tab that edited offline gets its changes into the page when it joins again, and sees the cursors already there", async () => {
    database({ contentJson: saved, yjsState: null });
    const rooms = new DocumentRooms();
    const first = tab(rooms, ana);
    await first.join();
    first.awareness.setLocalStateField("user", { id: ana.id, name: ana.name });
    await Bun.sleep(5);

    // Bruno made a change while disconnected: it exists only in his copy until he joins.
    const second = tab(rooms, bruno);
    const paragraph = (doc: Y.Doc) => doc.getXmlFragment(DOCUMENT_FRAGMENT).get(1) as Y.XmlElement;
    Y.applyUpdate(second.doc, Y.encodeStateAsUpdate(first.doc), "server");
    (paragraph(second.doc).get(0) as Y.XmlText).insert(0, "Offline ");
    await second.join();
    await Bun.sleep(5);
    await first.deliver();
    assert.match(first.text(), /Offline Ship it /, "the page took the offline edit");
    assert.equal(second.awareness.getStates().has(first.doc.clientID), true, "the newcomer sees Ana's cursor straight away");
    await rooms.closeAll();
});

test("cursors carry the signed-in name, and disappear when the tab leaves", async () => {
    database({ contentJson: saved, yjsState: null });
    const rooms = new DocumentRooms();
    const first = tab(rooms, ana);
    const second = tab(rooms, bruno);
    await first.join();
    await second.join();

    // Ana's tab claims to be someone else; the other tab still sees her real name.
    first.awareness.setLocalStateField("user", { id: "someone-else", name: "The Boss" });
    first.awareness.setLocalStateField("cursor", { anchor: 1, head: 1 });
    await Bun.sleep(5);
    await second.deliver();
    const seen = second.awareness.getStates().get(first.doc.clientID) as { user: { id: string; name: string }; cursor: unknown };
    assert.equal(seen.user.name, "Ana Souza");
    assert.equal(seen.user.id, ana.id);
    assert.deepEqual(seen.cursor, { anchor: 1, head: 1 });

    rooms.leave(first.connection, channel);
    await Bun.sleep(5);
    await second.deliver();
    assert.equal(second.awareness.getStates().has(first.doc.clientID), false, "the cursor is removed with the tab");
    await rooms.closeAll();
});

test("a tab cannot move or remove another tab's cursor", async () => {
    database({ contentJson: saved, yjsState: null });
    const rooms = new DocumentRooms();
    const first = tab(rooms, ana);
    const second = tab(rooms, bruno);
    await first.join();
    await second.join();
    first.awareness.setLocalStateField("user", { id: ana.id, name: ana.name });
    await Bun.sleep(5);

    // Bruno's tab sends a state under Ana's client id.
    const update = encoding.createEncoder();
    encoding.writeVarUint(update, 1);
    const inner = encoding.createEncoder();
    encoding.writeVarUint(inner, 1);
    encoding.writeVarUint(inner, first.doc.clientID);
    encoding.writeVarUint(inner, 99);
    encoding.writeVarString(inner, JSON.stringify({ user: { name: "Forged" } }));
    encoding.writeVarUint8Array(update, encoding.toUint8Array(inner));
    await rooms.receive(second.connection, channel, encoding.toUint8Array(update));
    await Bun.sleep(5);
    await first.deliver();
    await second.deliver();
    assert.equal((second.awareness.getStates().get(first.doc.clientID) as { user: { name: string } }).user.name, "Ana Souza");
    await rooms.closeAll();
});

test("edits are saved a moment later as both the Yjs state and the JSON, and a reopened page has them", async () => {
    const writes = database({ contentJson: saved, yjsState: null });
    const rooms = new DocumentRooms();
    const first = tab(rooms, ana);
    await first.join();
    const paragraph = first.doc.getXmlFragment(DOCUMENT_FRAGMENT).get(1) as Y.XmlElement;
    (paragraph.get(0) as Y.XmlText).insert(0, "Edited ");
    await Bun.sleep(5);
    assert.equal(writes.length, 1, "not saved on every keystroke");
    await rooms.closeAll();
    assert.equal(writes.length, 2);
    const final = writes[1] as { yjsState: Uint8Array; contentJson: { content: Array<{ content?: Array<{ text?: string }> }> } };
    assert.match(JSON.stringify(final.contentJson), /Edited Ship it /);

    mock.restore();
    database({ contentJson: final.contentJson, yjsState: final.yjsState });
    const reopened = tab(new DocumentRooms(), bruno);
    await reopened.join();
    assert.deepEqual(JSON.parse(reopened.text()), final.contentJson);
});

test("a tab that left the page cannot change it", async () => {
    database({ contentJson: saved, yjsState: null });
    const rooms = new DocumentRooms();
    const first = tab(rooms, ana);
    const second = tab(rooms, bruno);
    await first.join();
    await second.join();
    rooms.leave(first.connection, channel);
    await Bun.sleep(5);
    ((first.doc.getXmlFragment(DOCUMENT_FRAGMENT).get(1) as Y.XmlElement).get(0) as Y.XmlText).insert(0, "Sneaky ");
    await Bun.sleep(5);
    await second.deliver();
    assert.doesNotMatch(second.text(), /Sneaky/);
    await rooms.closeAll();
});

test("base64 round-trips binary Yjs data", () => {
    const bytes = new Uint8Array([0, 1, 2, 250, 255]);
    assert.deepEqual(fromBase64(toBase64(bytes)), bytes);
});

test("typing goes on while a page is deleted, and is saved once the delete is undone", async () => {
    const writes = database({ contentJson: saved, yjsState: null });
    let deleted = false;
    // From here on, saves see the row as deleted until it is restored.
    spyOn(db, "update").mockImplementation(
        (() => ({
            set: (values: Record<string, unknown>) => ({
                where: () => Object.assign(Promise.resolve(), { returning: async () => (deleted ? [] : (writes.push(values), [{ id: documentId }])) }),
            }),
        })) as never,
    );
    const rooms = new DocumentRooms();
    const first = tab(rooms, ana);
    const second = tab(rooms, bruno);
    await first.join();
    await second.join();

    deleted = true;
    ((first.doc.getXmlFragment(DOCUMENT_FRAGMENT).get(1) as Y.XmlElement).get(0) as Y.XmlText).insert(0, "During delete ");
    await Bun.sleep(5);
    await rooms.flush(documentId);
    await second.deliver();
    assert.match(second.text(), /During delete /, "the other tab still receives edits");
    const before = writes.length;

    deleted = false;
    await rooms.flush(documentId);
    assert.equal(writes.length, before + 1, "restoring saves what was typed meanwhile");
    assert.match(JSON.stringify(writes.at(-1)!.contentJson), /During delete /);
    await rooms.closeAll();
});

test("images that do not load over HTTP(S) and unknown nodes are taken out of the page for everyone", async () => {
    database({ contentJson: saved, yjsState: null });
    const rooms = new DocumentRooms();
    const first = tab(rooms, ana);
    const second = tab(rooms, bruno);
    await first.join();
    await second.join();

    const fragment = first.doc.getXmlFragment(DOCUMENT_FRAGMENT);
    const bad = new Y.XmlElement("image");
    bad.setAttribute("src", "javascript:alert(1)");
    const good = new Y.XmlElement("image");
    good.setAttribute("src", "https://images.example.test/a.png");
    fragment.insert(fragment.length, [bad, good, new Y.XmlElement("script")]);
    await Bun.sleep(5);
    await rooms.flush(documentId);
    await first.deliver();
    await second.deliver();

    for (const view of [first, second]) {
        const json = JSON.parse(view.text()) as { content: Array<{ type: string; attrs?: { src?: string | null } }> };
        assert.equal(json.content.some((node) => node.type === "script"), false);
        const sources = json.content.filter((node) => node.type === "image").map((node) => node.attrs?.src ?? null);
        assert.deepEqual(sources, [null, "https://images.example.test/a.png"]);
    }
    await rooms.closeAll();
});

test("opening a page does not count as an edit", async () => {
    const writes = database({ contentJson: saved, yjsState: null });
    const rooms = new DocumentRooms();
    await tab(rooms, ana).join();
    await rooms.flush(documentId);
    assert.equal(writes.length, 1, "only the seed is written; the page's updatedAt is left alone");
    await rooms.closeAll();
});

test("a page that fails to load is not kept half open, and the next attempt loads it", async () => {
    spyOn(db.query.projectDocuments, "findFirst").mockImplementation(async () => {
        throw new Error("database down");
    });
    const rooms = new DocumentRooms();
    const first = tab(rooms, ana);
    await assert.rejects(first.join(), /database down/);

    mock.restore();
    database({ contentJson: saved, yjsState: null });
    const again = tab(rooms, ana);
    await again.join();
    assert.deepEqual(JSON.parse(again.text()), saved);
    await rooms.closeAll();
});
