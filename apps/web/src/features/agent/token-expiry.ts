const DAY_MS = 24 * 60 * 60 * 1000;

/** Whether an API token has stopped working, and how many whole days it has left otherwise. */
export function tokenExpiry(expiresAt: string | null, now = Date.now()): { state: "never" } | { state: "expired" } | { state: "active"; days: number } {
    if (!expiresAt) return { state: "never" };
    const left = new Date(expiresAt).getTime() - now;
    return left <= 0 ? { state: "expired" } : { state: "active", days: Math.floor(left / DAY_MS) };
}
