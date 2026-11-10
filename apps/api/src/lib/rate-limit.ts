/**
 * In-memory budgets. One map per group, so a Postgres or Redis store can replace `windows` later
 * without each route growing its own counter. Numbers stay high enough that typing, dragging and an
 * MCP agent at work do not reach them.
 */
export const RATE_LIMITS = {
    writes: { limit: 240, windowMs: 60_000 },
    uploads: { limit: 300, windowMs: 10 * 60_000 },
    search: { limit: 120, windowMs: 60_000 },
    mcp: { limit: 300, windowMs: 60_000 },
    oauth: { limit: 30, windowMs: 15 * 60_000 },
    comments: { limit: 120, windowMs: 10 * 60_000 },
    invalidBearer: { limit: 30, windowMs: 15 * 60_000 },
    /** A socket may burst, then keep a pace well above keystrokes and cursors. A flood that stays over the budget is closed. */
    realtime: { capacity: 200, refillPerSecond: 80, sustainedMs: 5_000 },
} as const;

export type RateGroup = keyof Omit<typeof RATE_LIMITS, "realtime">;

interface WindowBucket {
    count: number;
    resetAt: number;
}

const windows = new Map<string, WindowBucket>();

interface SocketBucket {
    tokens: number;
    updatedAt: number;
    deniedSince: number | null;
}

const sockets = new Map<string, SocketBucket>();

export interface RateDecision {
    allowed: boolean;
    retryAfterSeconds: number;
    remaining: number;
}

function windowKey(group: RateGroup, key: string) {
    return `${group}:${key}`;
}

function prune(now: number) {
    if (windows.size < 5000) return;
    for (const [key, bucket] of windows) if (now >= bucket.resetAt) windows.delete(key);
}

/** Seconds until another attempt is allowed, or null while the budget still has room. Does not count this attempt. */
export function rateLimitRetry(group: RateGroup, key: string, now = Date.now()) {
    const bucket = windows.get(windowKey(group, key));
    if (!bucket || now >= bucket.resetAt || bucket.count < RATE_LIMITS[group].limit) return null;
    return Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
}

export function consumeRateLimit(group: RateGroup, key: string, now = Date.now()): RateDecision {
    prune(now);
    const id = windowKey(group, key);
    const { limit, windowMs } = RATE_LIMITS[group];
    let bucket = windows.get(id);
    if (!bucket || now >= bucket.resetAt) {
        bucket = { count: 0, resetAt: now + windowMs };
        windows.set(id, bucket);
    }
    bucket.count += 1;
    const retryAfterSeconds = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
    if (bucket.count > limit) return { allowed: false, retryAfterSeconds, remaining: 0 };
    return { allowed: true, retryAfterSeconds, remaining: limit - bucket.count };
}

/** One token per message. `close` becomes true only after the socket has stayed over the budget. */
export function takeRealtimeMessage(id: string, now = Date.now()) {
    const { capacity, refillPerSecond, sustainedMs } = RATE_LIMITS.realtime;
    let bucket = sockets.get(id);
    if (!bucket) {
        bucket = { tokens: capacity, updatedAt: now, deniedSince: null };
        sockets.set(id, bucket);
    }
    const elapsed = Math.max(0, (now - bucket.updatedAt) / 1000);
    bucket.tokens = Math.min(capacity, bucket.tokens + elapsed * refillPerSecond);
    bucket.updatedAt = now;
    if (bucket.tokens >= 1) {
        bucket.tokens -= 1;
        // A short burst is forgiven once the socket has room again. A flood never climbs back.
        if (bucket.tokens >= capacity / 2) bucket.deniedSince = null;
        return { ok: true, close: false };
    }
    if (bucket.deniedSince == null) bucket.deniedSince = now;
    return { ok: false, close: now - bucket.deniedSince >= sustainedMs };
}

export function forgetRealtime(id: string) {
    sockets.delete(id);
}

export function resetRateLimits() {
    windows.clear();
    sockets.clear();
}

const WRITE_EXCEPTIONS = ["/password", "/forgot-password", "/reset-password", "/confirm-email", "/email-change"];

/** Which budget a request spends, or none for ordinary reads. */
export function requestRateGroup(method: string, url: string): RateGroup | null {
    const path = url.split("?")[0] ?? url;
    if (path.startsWith("/api/oauth")) return "oauth";
    if (path.startsWith("/api/mcp")) return method === "POST" ? "mcp" : null;
    if (method === "GET" || method === "HEAD" || method === "OPTIONS") return null;
    if (path.startsWith("/api/auth")) return null;
    if (WRITE_EXCEPTIONS.some((part) => path.includes(part))) return null;
    if (path.includes("/files") || path.includes("/uploads")) return "uploads";
    if (path.includes("/comments") || path.includes("/reactions")) return "comments";
    return "writes";
}
