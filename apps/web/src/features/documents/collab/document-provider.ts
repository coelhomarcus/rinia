import * as decoding from "lib0/decoding";
import * as encoding from "lib0/encoding";
import { IndexeddbPersistence } from "y-indexeddb";
import * as awarenessProtocol from "y-protocols/awareness";
import * as syncProtocol from "y-protocols/sync";
import * as Y from "yjs";
import { DOCUMENT_FRAGMENT } from "@rinia/shared/src/rich-text-schema";
import type { RealtimeClient } from "@/features/realtime/realtime-client";

const MESSAGE_SYNC = 0;
const MESSAGE_AWARENESS = 1;

export interface DocumentProviderState {
    /** The socket is open and the server accepted this page's channel. */
    connected: boolean;
    /** This tab and the server have exchanged what each was missing. */
    synced: boolean;
    /** The copy kept in this browser has been read. */
    restored: boolean;
    /** Something was typed that the server has not been given yet, because the tab is offline. */
    unsynced: boolean;
    /** The server could not open the page for editing. It is tried again on the next connection. */
    failed: boolean;
    /** The page can be shown and edited: the server's copy arrived, or this browser has one to start from. */
    ready: boolean;
}

/** The IndexedDB database that keeps a page's Yjs state in this browser, so offline edits survive a reload. */
export const localDatabasePrefix = (userId: string, projectId?: string) => `rinia-doc:${userId}:${projectId ? `${projectId}:` : ""}`;
export const localDatabaseName = (userId: string, projectId: string, documentId: string) => `${localDatabasePrefix(userId, projectId)}${documentId}`;

/**
 * The names of the databases this browser created, for signing out where `indexedDB.databases()` does not exist. Losing
 * the list only means relying on `databases()`; the copies are keyed by user, so nobody else reads them anyway.
 */
const LOCAL_DATABASES_KEY = "rinia-doc-databases";
export function rememberedLocalDatabases(): string[] {
    try {
        const names: unknown = JSON.parse(localStorage.getItem(LOCAL_DATABASES_KEY) ?? "[]");
        return Array.isArray(names) ? names.filter((name): name is string => typeof name === "string") : [];
    } catch {
        return [];
    }
}
export function forgetLocalDatabases(names: string[]) {
    try {
        localStorage.setItem(LOCAL_DATABASES_KEY, JSON.stringify(rememberedLocalDatabases().filter((name) => !names.includes(name))));
    } catch {
        /* See rememberedLocalDatabases. */
    }
}
function rememberLocalDatabase(name: string) {
    try {
        const names = rememberedLocalDatabases();
        if (!names.includes(name)) localStorage.setItem(LOCAL_DATABASES_KEY, JSON.stringify([...names, name]));
    } catch {
        /* See rememberedLocalDatabases. */
    }
}

/**
 * Keeps one page's Yjs document in step with the server over the realtime socket, with the same sync and awareness
 * messages as y-websocket. Cursors travel as awareness, which Tiptap's collaboration caret reads from `awareness`.
 */
export class DocumentProvider {
    readonly doc = new Y.Doc();
    readonly awareness = new awarenessProtocol.Awareness(this.doc);
    private state: DocumentProviderState = { connected: false, synced: false, restored: false, unsynced: false, failed: false, ready: false };
    private listeners = new Set<() => void>();
    private channel: `document:${string}`;
    private detach: () => void;
    private persistence?: IndexeddbPersistence;
    private destroyed = false;

    constructor(
        userId: string,
        projectId: string,
        documentId: string,
        private client: Pick<RealtimeClient, "attachDocument" | "sendDocument">,
    ) {
        this.channel = `document:${documentId}`;
        this.doc.on("update", this.onDocumentUpdate);
        this.awareness.on("update", this.onAwarenessUpdate);
        try {
            if (typeof indexedDB === "undefined") throw new Error("No local storage");
            const name = localDatabaseName(userId, projectId, documentId);
            rememberLocalDatabase(name);
            this.persistence = new IndexeddbPersistence(name, this.doc);
            const restored = () => !this.destroyed && this.set({ restored: true });
            // Storage that is blocked or full only costs the offline copy; the server still has the page.
            this.persistence.whenSynced.then(restored, restored);
        } catch {
            this.set({ restored: true });
        }
        this.detach = this.client.attachDocument(this.channel, {
            attached: () => this.attached(),
            detached: () => this.detached(),
            denied: () => {
                this.detached();
                if (!this.destroyed) this.set({ failed: true });
            },
            message: (bytes) => this.receive(bytes),
        });
    }

    getSnapshot = () => this.state;

    subscribe = (listener: () => void) => {
        this.listeners.add(listener);
        return () => void this.listeners.delete(listener);
    };

    destroy() {
        if (this.destroyed) return;
        // Tells everyone this cursor is gone before the channel closes.
        this.awareness.setLocalState(null);
        this.destroyed = true;
        this.detach();
        this.doc.off("update", this.onDocumentUpdate);
        this.awareness.off("update", this.onAwarenessUpdate);
        this.awareness.destroy();
        void this.persistence?.destroy();
        this.doc.destroy();
        this.listeners.clear();
    }

    private set(patch: Partial<DocumentProviderState>) {
        const next = { ...this.state, ...patch };
        next.ready = next.synced || (next.restored && this.doc.getXmlFragment(DOCUMENT_FRAGMENT).length > 0);
        if (Object.keys(next).every((key) => next[key as keyof DocumentProviderState] === this.state[key as keyof DocumentProviderState])) return;
        this.state = next;
        this.listeners.forEach((listener) => listener());
    }

    private send(message: Uint8Array) {
        return this.client.sendDocument(this.channel, message);
    }

    private attached() {
        if (this.destroyed) return;
        this.set({ connected: true, failed: false });
        const sync = encoding.createEncoder();
        encoding.writeVarUint(sync, MESSAGE_SYNC);
        syncProtocol.writeSyncStep1(sync, this.doc);
        this.send(encoding.toUint8Array(sync));
        if (this.awareness.getLocalState() !== null) this.sendAwareness([this.doc.clientID]);
    }

    private detached() {
        if (this.destroyed) return;
        // Cursors from before the drop are stale; the server sends the current ones after the next sync.
        const others = [...this.awareness.getStates().keys()].filter((id) => id !== this.doc.clientID);
        awarenessProtocol.removeAwarenessStates(this.awareness, others, this);
        this.set({ connected: false, synced: false });
    }

    private receive(bytes: Uint8Array) {
        if (this.destroyed) return;
        try {
            const decoder = decoding.createDecoder(bytes);
            const type = decoding.readVarUint(decoder);
            if (type === MESSAGE_SYNC) {
                const reply = encoding.createEncoder();
                encoding.writeVarUint(reply, MESSAGE_SYNC);
                const step = syncProtocol.readSyncMessage(decoder, reply, this.doc, this);
                const answered = encoding.length(reply) > 1 && this.send(encoding.toUint8Array(reply));
                if (step === syncProtocol.messageYjsSyncStep2) this.set({ synced: true });
                // The server asked for what this tab has: once that answer is out, nothing typed here is missing there.
                if (step === syncProtocol.messageYjsSyncStep1 && answered) this.set({ unsynced: false });
            } else if (type === MESSAGE_AWARENESS) {
                awarenessProtocol.applyAwarenessUpdate(this.awareness, decoding.readVarUint8Array(decoder), this);
            }
        } catch (error) {
            console.warn("Ignoring a bad collaboration message", error);
        }
    }

    private onDocumentUpdate = (update: Uint8Array, origin: unknown) => {
        // What came from the server is already there; what the local copy loaded from this browser syncs with the next handshake.
        if (origin === this) return;
        const encoder = encoding.createEncoder();
        encoding.writeVarUint(encoder, MESSAGE_SYNC);
        syncProtocol.writeUpdate(encoder, update);
        if (!(this.state.synced && this.send(encoding.toUint8Array(encoder)))) this.set({ unsynced: true });
    };

    private onAwarenessUpdate = ({ added, updated, removed }: { added: number[]; updated: number[]; removed: number[] }, origin: unknown) => {
        if (origin === this) return;
        this.sendAwareness([...added, ...updated, ...removed]);
    };

    private sendAwareness(clients: number[]) {
        const encoder = encoding.createEncoder();
        encoding.writeVarUint(encoder, MESSAGE_AWARENESS);
        encoding.writeVarUint8Array(encoder, awarenessProtocol.encodeAwarenessUpdate(this.awareness, clients));
        this.send(encoding.toUint8Array(encoder));
    }
}
