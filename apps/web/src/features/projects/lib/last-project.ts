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

/** The project the user was last in, used when leaving settings and as the default for new issues. */
export function readOpenProjectId(): string | null {
    try {
        return localStorage.getItem(LAST_PROJECT_KEY) || ([...readIdSet(OPEN_PROJECTS_KEY)].at(-1) ?? null);
    } catch {
        return null;
    }
}
