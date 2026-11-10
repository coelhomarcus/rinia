import { spyOn } from "bun:test";
import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { db } from "../../src/db";

const dialect = new PgDialect();

/**
 * Answers the account check every request with a session cookie makes: each account exists and is active, and only
 * the ids in `admins` are site admins. A test that stubs `db.query.users.findFirst` itself answers that check too.
 */
export function stubSessionAccounts(admins: string[] = []) {
    return spyOn(db.query.users, "findFirst").mockImplementation((async (config: { where: SQL }) => {
        const [id] = dialect.sqlToQuery(config.where).params as string[];
        return { id, isAdmin: admins.includes(id), suspendedAt: null, sessionsRevokedAt: null };
    }) as never);
}
