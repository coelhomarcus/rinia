import { DOCUMENT_FRAGMENT, documentSchema } from "@rinia/shared/src/document-extensions";
import { isAllowedImageSource, type PresenceViewer, type RealtimeChannel, type TiptapDocument } from "@rinia/shared";
import { prosemirrorJSONToYDoc, yDocToProsemirrorJSON } from "@tiptap/y-tiptap";
import { and, eq, isNull, sql } from "drizzle-orm";
import * as decoding from "lib0/decoding";
import * as encoding from "lib0/encoding";
import * as awarenessProtocol from "y-protocols/awareness";
import * as syncProtocol from "y-protocols/sync";
import * as Y from "yjs";
import { db } from "../../db";
import { projectDocuments } from "../../db/schema";

const MESSAGE_SYNC = 0;
const MESSAGE_AWARENESS = 1;

/** Edits are saved this long after the last one, and never later than `MAX_WAIT_MS` after the first unsaved one. */
const SAVE_DELAY_MS = 2_000;
const MAX_WAIT_MS = 10_000;
/** A page nobody has open stays in memory this long, so someone reopening it right away does not read it again. */
const IDLE_MS = 30_000;
/** One tab uses one Yjs client; this leaves room for a reload racing its own previous session. */
const MAX_CLIENTS_PER_CONNECTION = 4;
const COLOR_PATTERN = /^#[0-9a-f]{6}$/i;

/** The part of a realtime connection a page room needs. */
export interface RoomConnection {
    socket: { send(data: string): void };
    user: PresenceViewer["user"];
    channels: Map<RealtimeChannel, string>;
}

const channelOf = (documentId: string) => `document:${documentId}` as RealtimeChannel;
/** Changes the server makes itself, such as loading the page or cleaning what a client put in it. */
const LOADED = Symbol("loaded");
const SERVER = Symbol("server");

/**
 * A page being edited together: its Yjs document in memory, who is in it, and where the cursors are. The document
 * is the source of truth while the page is open and is written back to the database a moment after each edit.
 */
class DocumentRoom {
    readonly doc = new Y.Doc();
    readonly awareness = new awarenessProtocol.Awareness(this.doc);
    /** The awareness clients each connection controls, so closing a tab removes its cursor. */
    readonly connections = new Map<RoomConnection, Set<number>>();
    /** The other way round: which connection controls each awareness client, checked on every cursor move. */
    private owners = new Map<number, RoomConnection>();
    private saveTimer?: ReturnType<typeof setTimeout>;
    private idleTimer?: ReturnType<typeof setTimeout>;
    private unsavedSince?: number;
    private saving?: Promise<void>;
    private closed = false;
    /** The page was deleted: edits are kept in memory but not saved until someone undoes the delete. */
    private onHold = false;

    constructor(
        readonly documentId: string,
        private onIdle: (room: DocumentRoom) => void,
    ) {
        this.awareness.setLocalState(null);
        this.doc.on("update", (update: Uint8Array, origin: unknown) => {
            // Reading the page from the database is not an edit: nobody is there yet and nothing needs saving.
            if (origin === LOADED) return;
            const encoder = encoding.createEncoder();
            encoding.writeVarUint(encoder, MESSAGE_SYNC);
            syncProtocol.writeUpdate(encoder, update);
            this.broadcast(encoding.toUint8Array(encoder), origin as RoomConnection | undefined);
            this.scheduleSave();
        });
        this.awareness.on("update", ({ added, updated, removed }: { added: number[]; updated: number[]; removed: number[] }, origin: unknown) => {
            const owner = this.connections.has(origin as RoomConnection) ? (origin as RoomConnection) : undefined;
            for (const id of added) {
                if (!owner) continue;
                this.connections.get(owner)!.add(id);
                this.owners.set(id, owner);
            }
            // Removed by its tab, by the tab leaving, or because it stopped renewing itself.
            for (const id of removed) {
                this.connections.get(this.owners.get(id)!)?.delete(id);
                this.owners.delete(id);
            }
            const encoder = encoding.createEncoder();
            encoding.writeVarUint(encoder, MESSAGE_AWARENESS);
            encoding.writeVarUint8Array(encoder, awarenessProtocol.encodeAwarenessUpdate(this.awareness, [...added, ...updated, ...removed]));
            this.broadcast(encoding.toUint8Array(encoder), owner);
        });
    }

    /** Starts from a saved Yjs state, or from the page's Tiptap JSON when it was never opened for editing. */
    async load(): Promise<void> {
        const row = await db.query.projectDocuments.findFirst({
            where: and(eq(projectDocuments.id, this.documentId), isNull(projectDocuments.deletedAt)),
            columns: { contentJson: true, yjsState: true },
        });
        if (!row) throw new Error("Document not found");
        if (row.yjsState) return void Y.applyUpdate(this.doc, row.yjsState, LOADED);
        const seed = prosemirrorJSONToYDoc(documentSchema, row.contentJson, DOCUMENT_FRAGMENT);
        Y.applyUpdate(this.doc, Y.encodeStateAsUpdate(seed), LOADED);
        seed.destroy();
        // Saved before anyone joins: a second seed from the same JSON would double the page.
        const seeded = await db
            .update(projectDocuments)
            .set({ yjsState: Y.encodeStateAsUpdate(this.doc) })
            .where(and(eq(projectDocuments.id, this.documentId), isNull(projectDocuments.yjsState)))
            .returning({ id: projectDocuments.id });
        // Another process seeded it first, so the next attempt reads theirs.
        if (!seeded.length) throw new Error("Document was seeded elsewhere");
    }

    /** Frees a room that never opened, without saving anything it holds. */
    discard() {
        this.closed = true;
        clearTimeout(this.saveTimer);
        clearTimeout(this.idleTimer);
        // Destroying the document also stops the awareness timer.
        this.doc.destroy();
    }

    json(): TiptapDocument {
        return yDocToProsemirrorJSON(this.doc, DOCUMENT_FRAGMENT) as unknown as TiptapDocument;
    }

    add(connection: RoomConnection) {
        clearTimeout(this.idleTimer);
        this.connections.set(connection, new Set());
    }

    remove(connection: RoomConnection) {
        const clients = this.connections.get(connection);
        if (!clients) return;
        this.connections.delete(connection);
        if (clients.size) awarenessProtocol.removeAwarenessStates(this.awareness, [...clients], connection);
        if (this.connections.size > 0) return;
        void this.flush();
        this.idleTimer = setTimeout(() => this.onIdle(this), IDLE_MS);
        this.idleTimer.unref?.();
    }

    receive(connection: RoomConnection, message: Uint8Array) {
        if (!this.connections.has(connection)) return;
        const decoder = decoding.createDecoder(message);
        switch (decoding.readVarUint(decoder)) {
            case MESSAGE_SYNC: {
                const encoder = encoding.createEncoder();
                encoding.writeVarUint(encoder, MESSAGE_SYNC);
                const step = syncProtocol.readSyncMessage(decoder, encoder, this.doc, connection);
                // Only a request for state has an answer.
                if (encoding.length(encoder) > 1) this.send(connection, encoding.toUint8Array(encoder));
                // A tab asking for the page is (re)joining it: ask it back for what it has that the page does not,
                // which is how edits made offline get in, and show it where everyone's cursor is. The tab always
                // starts this itself, so it cannot miss the question however its subscription came about.
                if (step === syncProtocol.messageYjsSyncStep1) this.greet(connection);
                break;
            }
            case MESSAGE_AWARENESS: {
                const update = this.vouch(connection, decoding.readVarUint8Array(decoder));
                if (update) awarenessProtocol.applyAwarenessUpdate(this.awareness, update, connection);
                break;
            }
        }
    }

    private greet(connection: RoomConnection) {
        const sync = encoding.createEncoder();
        encoding.writeVarUint(sync, MESSAGE_SYNC);
        syncProtocol.writeSyncStep1(sync, this.doc);
        this.send(connection, encoding.toUint8Array(sync));
        const cursors = [...this.awareness.getStates().keys()];
        if (!cursors.length) return;
        const awareness = encoding.createEncoder();
        encoding.writeVarUint(awareness, MESSAGE_AWARENESS);
        encoding.writeVarUint8Array(awareness, awarenessProtocol.encodeAwarenessUpdate(this.awareness, cursors));
        this.send(connection, encoding.toUint8Array(awareness));
    }

    /**
     * Cursors are shown to everyone, so what a client says about itself is replaced with what the server knows: the
     * name and avatar of the signed-in user. A client cannot speak for another connection's cursor either.
     */
    private vouch(connection: RoomConnection, update: Uint8Array): Uint8Array | null {
        const decoder = decoding.createDecoder(update);
        const owned = this.connections.get(connection)!;
        const states: Array<{ clientId: number; clock: number; state: unknown }> = [];
        for (let remaining = decoding.readVarUint(decoder); remaining > 0; remaining--) {
            const clientId = decoding.readVarUint(decoder);
            const clock = decoding.readVarUint(decoder);
            const state = JSON.parse(decoding.readVarString(decoder)) as unknown;
            const holder = this.owners.get(clientId);
            if ((holder && holder !== connection) || clientId === this.doc.clientID) continue;
            if (!owned.has(clientId) && owned.size >= MAX_CLIENTS_PER_CONNECTION) continue;
            states.push({ clientId, clock, state });
        }
        if (!states.length) return null;
        const encoder = encoding.createEncoder();
        encoding.writeVarUint(encoder, states.length);
        for (const { clientId, clock, state } of states) {
            encoding.writeVarUint(encoder, clientId);
            encoding.writeVarUint(encoder, clock);
            encoding.writeVarString(encoder, JSON.stringify(state === null ? null : this.identify(connection, state)));
        }
        return encoding.toUint8Array(encoder);
    }

    private identify(connection: RoomConnection, state: unknown) {
        const given = (state && typeof state === "object" ? state : {}) as { user?: { color?: unknown }; cursor?: unknown; typing?: unknown };
        const color = typeof given.user?.color === "string" && COLOR_PATTERN.test(given.user.color) ? given.user.color : undefined;
        const { id, name, username, avatarUrl } = connection.user;
        return { user: { id, name, username, avatarUrl, color }, cursor: given.cursor ?? null, typing: given.typing === true };
    }

    private broadcast(message: Uint8Array, except?: RoomConnection) {
        for (const connection of this.connections.keys()) if (connection !== except) this.send(connection, message);
    }

    private send(connection: RoomConnection, message: Uint8Array) {
        // A socket that closed between the lookup and the send must not fail the edit that triggered it.
        try {
            connection.socket.send(JSON.stringify({ type: "doc", channel: channelOf(this.documentId), data: toBase64(message) }));
        } catch {
            /* The close handler removes it. */
        }
    }

    /**
     * Content arrives as Yjs updates, which skip the checks a save over REST had, so what no page may hold is taken out
     * here, for everyone: images must load over HTTP(S), and only nodes the editor knows are kept.
     */
    private clean() {
        const doomed: Y.XmlElement[] = [];
        const blocked: Y.XmlElement[] = [];
        const visit = (parent: Y.XmlFragment | Y.XmlElement) => {
            for (const child of parent.toArray()) {
                if (!(child instanceof Y.XmlElement)) continue;
                if (!documentSchema.nodes[child.nodeName]) {
                    doomed.push(child);
                    continue;
                }
                if (child.nodeName === "image" && !isAllowedImageSource(child.getAttribute("src"))) blocked.push(child);
                visit(child);
            }
        };
        visit(this.doc.getXmlFragment(DOCUMENT_FRAGMENT));
        if (!doomed.length && !blocked.length) return;
        this.doc.transact(() => {
            for (const element of blocked) element.removeAttribute("src");
            for (const element of doomed) {
                const parent = element.parent as Y.XmlElement | Y.XmlFragment | null;
                const index = parent?.toArray().indexOf(element) ?? -1;
                if (parent && index >= 0) parent.delete(index, 1);
            }
        }, SERVER);
    }

    private scheduleSave() {
        this.unsavedSince ??= Date.now();
        if (this.onHold) return;
        clearTimeout(this.saveTimer);
        const wait = Math.min(SAVE_DELAY_MS, Math.max(0, this.unsavedSince + MAX_WAIT_MS - Date.now()));
        this.saveTimer = setTimeout(() => void this.flush(), wait);
    }

    /** Writes the page now. Calls queue behind a save in progress, so edits made meanwhile are not lost. */
    async flush(): Promise<void> {
        clearTimeout(this.saveTimer);
        this.onHold = false;
        if (this.saving) {
            await this.saving;
            if (this.unsavedSince === undefined) return;
        }
        if (this.unsavedSince === undefined || this.closed) return;
        this.clean();
        const since = this.unsavedSince;
        this.unsavedSince = undefined;
        clearTimeout(this.saveTimer);
        this.saving = (async () => {
            try {
                const saved = await db
                    .update(projectDocuments)
                    .set({ yjsState: Y.encodeStateAsUpdate(this.doc), contentJson: this.json(), updatedAt: new Date(), revision: sql`${projectDocuments.revision} + 1` })
                    .where(and(eq(projectDocuments.id, this.documentId), isNull(projectDocuments.deletedAt)))
                    .returning({ id: projectDocuments.id });
                // A deleted page keeps what was typed after the delete, and saves it if the delete is undone.
                if (!saved.length) {
                    this.unsavedSince ??= since;
                    this.onHold = true;
                }
            } catch (error) {
                console.error("Could not save a collaborative page", error);
                this.unsavedSince ??= Date.now();
                this.scheduleSave();
            } finally {
                this.saving = undefined;
            }
        })();
        await this.saving;
    }

    async close() {
        await this.flush();
        this.closed = true;
        clearTimeout(this.saveTimer);
        clearTimeout(this.idleTimer);
        this.awareness.destroy();
        this.doc.destroy();
    }
}

export const toBase64 = (bytes: Uint8Array) => Buffer.from(bytes).toString("base64");
export const fromBase64 = (data: string) => new Uint8Array(Buffer.from(data, "base64"));

/** Every page being edited in this process. Like the realtime hub, it would need a shared broker to run on more than one instance. */
export class DocumentRooms {
    private rooms = new Map<string, Promise<DocumentRoom>>();

    /** Puts a connection into a page's room, loading the page first if nobody has it open. */
    async join(connection: RoomConnection, documentId: string) {
        const channel = channelOf(documentId);
        let pending = this.rooms.get(documentId);
        if (!pending) {
            const room = new DocumentRoom(documentId, (idle) => void this.drop(idle));
            pending = room.load().then(
                () => room,
                (error: unknown) => {
                    room.discard();
                    throw error;
                },
            );
            this.rooms.set(documentId, pending);
            pending.catch(() => this.rooms.get(documentId) === pending && this.rooms.delete(documentId));
        }
        const room = await pending;
        // The tab may have left while the page loaded.
        if (connection.channels.has(channel)) room.add(connection);
    }

    leave(connection: RoomConnection, channel: RealtimeChannel) {
        const documentId = channel.startsWith("document:") ? channel.slice("document:".length) : undefined;
        if (!documentId) return;
        void this.rooms.get(documentId)?.then((room) => room.remove(connection), () => undefined);
    }

    async receive(connection: RoomConnection, channel: RealtimeChannel, message: Uint8Array) {
        const room = await this.rooms.get(channel.slice("document:".length))?.catch(() => undefined);
        try {
            room?.receive(connection, message);
        } catch (error) {
            // A malformed message from one client must not stop the others.
            console.warn("Ignoring a bad collaboration message", error);
        }
    }

    /** The page as Tiptap JSON, including edits not yet saved, if someone has it open. */
    async live(documentId: string): Promise<TiptapDocument | undefined> {
        const room = await this.rooms.get(documentId)?.catch(() => undefined);
        return room?.json();
    }

    /**
     * Saves a page now, if anyone has it open. Deleting a page saves first, so undoing it brings back what people last
     * typed; the room stays, with everyone in it, so their edits keep syncing and are saved again once it is restored.
     */
    async flush(documentId: string) {
        const room = await this.rooms.get(documentId)?.catch(() => undefined);
        await room?.flush();
    }

    /** Saves and closes every page, for shutting down. */
    async closeAll() {
        const rooms = await Promise.all([...this.rooms.values()].map((pending) => pending.catch(() => undefined)));
        this.rooms.clear();
        await Promise.all(rooms.map((room) => room?.close()));
    }

    private async drop(room: DocumentRoom) {
        // Someone may have come back while the idle timer was running.
        if (room.connections.size > 0) return;
        this.rooms.delete(room.documentId);
        await room.close();
    }
}

export const documentRooms = new DocumentRooms();
