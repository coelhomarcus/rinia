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
export function rememberLocalDatabase(name: string) {
    try {
        const names = rememberedLocalDatabases();
        if (!names.includes(name)) localStorage.setItem(LOCAL_DATABASES_KEY, JSON.stringify([...names, name]));
    } catch {
        /* See rememberedLocalDatabases. */
    }
}
