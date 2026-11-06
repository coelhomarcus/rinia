export const OPEN_PROJECTS_KEY = "rinia-open-projects";
export const LAST_PROJECT_KEY = "rinia-last-project";

export function readIdSet(key: string): Set<string> {
    try {
        const stored = JSON.parse(localStorage.getItem(key) ?? "null");
        if (Array.isArray(stored)) return new Set(stored.filter((id): id is string => typeof id === "string"));
    } catch {
        /* ignore invalid storage */
    }
    return new Set();
}

/**
 * Projects whose sidebar groups should be open after arriving somewhere.
 * A favorite is a shortcut, so it leaves every group as the user left it.
 * Any other visit opens that project and leaves the rest alone.
 */
export function openProjectsAfterVisit(open: Set<string>, projectId: string, viaFavorite: boolean): Set<string> {
    if (!projectId || viaFavorite || open.has(projectId)) return open;
    const next = new Set(open);
    next.add(projectId);
    return next;
}

/** The project the user was last in, used when leaving settings and as the default for new issues. */
export function readOpenProjectId(): string | null {
    try {
        return localStorage.getItem(LAST_PROJECT_KEY) || ([...readIdSet(OPEN_PROJECTS_KEY)].at(-1) ?? null);
    } catch {
        return null;
    }
}
