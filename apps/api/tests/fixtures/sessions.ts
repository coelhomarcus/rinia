import { spyOn } from "bun:test";
import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";

// The API reads its settings on import; give it what it needs without a local .env, before anything loads it.
process.env.JWT_SECRET ??= "test-secret";
process.env.DATABASE_URL ??= "postgres://localhost/unused";
process.env.SPECIAL_REGISTRATION_CODE ??= "test-code";
const { db } = await import("../../src/db");
const { clearSessionCache } = await import("../../src/features/auth/sessions.service");
const { SESSION_COOKIE_NAME } = await import("../../src/lib/cookies");
const { signToken } = await import("../../src/lib/jwt");

const dialect = new PgDialect();

/** In tests a session's id is its user's id, so a stub can tell whose session a cookie names. */
export const sessionToken = (userId: string) => signToken({ sub: userId, sid: userId });

export const sessionCookie = (userId: string) => `${SESSION_COOKIE_NAME}=${sessionToken(userId)}`;

/**
 * Answers the session check every request with a session cookie makes: each session is live and its account active,
 * and only the users in `admins` are site admins. Clears the session cache so earlier answers do not linger.
 */
export function stubSessionAccounts(admins: string[] = []) {
    clearSessionCache();
    return spyOn(db.query.sessions, "findFirst").mockImplementation((async (config: { where: SQL }) => {
        const [id] = dialect.sqlToQuery(config.where).params as string[];
        return {
            userId: id,
            revokedAt: null,
            expiresAt: new Date(Date.now() + 60 * 60 * 1000),
            lastSeenAt: new Date(),
            user: { username: "someone", isAdmin: admins.includes(id), suspendedAt: null },
        };
    }) as never);
}
