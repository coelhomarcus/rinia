import { forgetLocalDatabases, localDatabasePrefix, rememberedLocalDatabases } from "./collab/local-databases";

/** What a page's editing session offers the rest of the app: stop it while something else changes the page, and carry on. */
export interface RegisteredSession {
    pause(): Promise<void>;
    resume(): void;
}

/**
 * The open editing sessions, by user, project and page. They are created by `sessions.ts`, which carries the editor's
 * sync code; this part has no dependency on it, so the sign-out and delete flows can reach the sessions (none, when the
 * documents were never opened) without loading the editor.
 */
export const sessionRegistry = new Map<string, RegisteredSession>();
export const sessionKey = (userId: string, projectId: string, documentId: string) => `${userId}:${projectId}:${documentId}`;

export async function pauseDocumentSession(userId: string, projectId: string, documentId: string) {
    const session = sessionRegistry.get(sessionKey(userId, projectId, documentId));
    if (!session) return undefined;
    await session.pause();
    return () => session.resume();
}

/** Forgets the unsaved titles and the offline copies of pages kept in this browser, when someone signs out or a project is deleted. */
export async function clearDocumentDrafts(userId: string, projectId?: string) {
    const prefix = `${userId}:${projectId ? `${projectId}:` : ""}`;
    for (const [key, session] of sessionRegistry)
        if (key.startsWith(prefix)) {
            await session.pause();
            sessionRegistry.delete(key);
        }
    const local = localDatabasePrefix(userId, projectId);
    const listed = (await indexedDB.databases?.().catch(() => undefined)) ?? [];
    const names = [...new Set([...listed.map((database) => database.name ?? ""), ...rememberedLocalDatabases()])].filter((name) => name.startsWith(local));
    await Promise.all([...names, LEGACY_DRAFTS_DATABASE].map(deleteDatabase));
    forgetLocalDatabases(names);
}

/** Drafts from before pages were edited together. Nothing reads them anymore, but they hold page content. */
export const LEGACY_DRAFTS_DATABASE = "rinia-document-drafts";

export function deleteDatabase(name: string) {
    return new Promise<void>((resolve) => {
        const request = indexedDB.deleteDatabase(name);
        // A tab with the page still open blocks the delete until it closes it; the request finishes then.
        request.onsuccess = request.onerror = request.onblocked = () => resolve();
    });
}
