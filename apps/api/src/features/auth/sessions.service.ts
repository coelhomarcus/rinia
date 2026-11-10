import { randomUUID } from "node:crypto";
import { and, eq, gt, isNull, lt, ne, or } from "drizzle-orm";
import type { Request } from "express";
import ms from "ms";
import { env } from "../../config/env";
import { db } from "../../db";
import { sessions } from "../../db/schema";
import { type JwtPayload, type SessionToken, signToken } from "../../lib/jwt";
import { logFor } from "../../lib/request-context";
import { realtimeHub } from "../realtime/realtime.service";

/** How long a checked session is trusted before the database is asked again. Revoking here clears it at once. */
export const SESSION_CACHE_MS = 30_000;
/** `lastSeenAt` moves at most this often, so a busy session does not write on every request. */
const LAST_SEEN_PRECISION_MS = 60_000;
/** Revoked rows are kept a day for the logs to make sense, then removed with the expired ones. */
const REVOKED_KEEP_MS = 24 * 60 * 60 * 1000;

interface SessionState {
    userId: string;
    username: string;
    isAdmin: boolean;
    valid: boolean;
    lastSeenAt: Date;
    expiresAt: Date;
    checkedAt: number;
}

const cache = new Map<string, SessionState>();

/** For tests, and for anything that changed a session behind this process's back. */
export function clearSessionCache() {
    cache.clear();
}

/** Drops what this process remembers about someone's sessions, so a change to their account applies on the next request. */
export function forgetUserSessions(userId: string) {
    for (const [id, state] of cache) if (state.userId === userId) cache.delete(id);
}

export interface SessionMeta {
    userAgent?: string;
    ip?: string;
}

/** What a sign-in records about the browser, for the person's list of sessions. */
export function sessionMeta(req: Request): SessionMeta {
    return { userAgent: req.get("user-agent"), ip: req.ip };
}

/** Starts a session for someone who just signed in, and returns the token for their cookie. */
export async function createSession(user: { id: string }, meta: SessionMeta) {
    const id = randomUUID();
    const now = new Date();
    await db.insert(sessions).values({
        id,
        userId: user.id,
        createdAt: now,
        lastSeenAt: now,
        expiresAt: new Date(now.getTime() + ms(env.JWT_EXPIRES_IN as ms.StringValue)),
        userAgent: meta.userAgent?.slice(0, 512) || null,
        ip: meta.ip ?? null,
    });
    return signToken({ sub: user.id, sid: id });
}

async function load(sessionId: string): Promise<SessionState> {
    const row = await db.query.sessions.findFirst({
        where: eq(sessions.id, sessionId),
        columns: { userId: true, revokedAt: true, expiresAt: true, lastSeenAt: true },
        with: { user: { columns: { username: true, isAdmin: true, suspendedAt: true } } },
    });
    const now = Date.now();
    if (!row) return { userId: "", username: "", isAdmin: false, valid: false, lastSeenAt: new Date(0), expiresAt: new Date(0), checkedAt: now };
    return {
        userId: row.userId,
        username: row.user.username,
        isAdmin: row.user.isAdmin === true,
        valid: !row.revokedAt && !row.user.suspendedAt,
        lastSeenAt: row.lastSeenAt,
        expiresAt: row.expiresAt,
        checkedAt: now,
    };
}

/**
 * The person a session cookie speaks for, or null once the session is revoked, expired, or its account suspended.
 * Admin rights come from the account, not the token. Answers come from a short cache, so most requests skip the
 * database; anything revoked in this process is dropped from it at once.
 */
export async function resolveSession(token: SessionToken, now = new Date()): Promise<JwtPayload | null> {
    let state = cache.get(token.sid);
    if (!state || now.getTime() - state.checkedAt >= SESSION_CACHE_MS) {
        state = await load(token.sid);
        cache.set(token.sid, state);
    }
    if (!state.valid || state.userId !== token.sub || state.expiresAt.getTime() <= now.getTime()) return null;
    if (now.getTime() - state.lastSeenAt.getTime() >= LAST_SEEN_PRECISION_MS) {
        state.lastSeenAt = now;
        void db
            .update(sessions)
            .set({ lastSeenAt: now })
            .where(eq(sessions.id, token.sid))
            .catch((error: unknown) => logFor("auth").error({ err: error, sessionId: token.sid }, "could not record session use"));
    }
    return { sub: token.sub, username: state.username, isAdmin: state.isAdmin, sid: token.sid };
}

/**
 * Revokes sessions and closes their realtime sockets with 4401, so open tabs sign out. `only` limits it to one
 * session; `except` keeps one, such as the browser that just changed the password.
 */
export async function revokeSessions(userId: string, options: { only?: string; except?: string } = {}) {
    const conditions = [eq(sessions.userId, userId), isNull(sessions.revokedAt)];
    if (options.only) conditions.push(eq(sessions.id, options.only));
    if (options.except) conditions.push(ne(sessions.id, options.except));
    const revoked = await db
        .update(sessions)
        .set({ revokedAt: new Date() })
        .where(and(...conditions))
        .returning({ id: sessions.id });
    const ids = new Set(revoked.map((row) => row.id));
    for (const id of ids) cache.delete(id);
    // Rows already revoked elsewhere may still be cached here.
    if (options.only) cache.delete(options.only);
    else forgetUserSessions(userId);
    realtimeHub.closeSessions(ids);
    return ids.size;
}

/** Where someone is signed in right now, most recently used first. */
export async function listSessions(userId: string, now = new Date()) {
    return db.query.sessions.findMany({
        where: and(eq(sessions.userId, userId), isNull(sessions.revokedAt), gt(sessions.expiresAt, now)),
        columns: { id: true, createdAt: true, lastSeenAt: true, userAgent: true, ip: true },
        orderBy: (table, { desc }) => [desc(table.lastSeenAt)],
    });
}

/** Removes expired sessions, and revoked ones after a day. Runs in the server's cleanup loop. */
export async function cleanupSessions(now = new Date()) {
    for (const [id, state] of cache) if (now.getTime() - state.checkedAt >= SESSION_CACHE_MS) cache.delete(id);
    const removed = await db
        .delete(sessions)
        .where(or(lt(sessions.expiresAt, now), lt(sessions.revokedAt, new Date(now.getTime() - REVOKED_KEEP_MS))))
        .returning({ id: sessions.id });
    return removed.length;
}
