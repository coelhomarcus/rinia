import { AsyncResource } from "node:async_hooks";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool, type PoolClient } from "pg";
import { logger } from "../lib/logger";
import { logFor } from "../lib/request-context";
import * as schema from "./schema";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// Read here rather than from config/env, which the seed and reset scripts do not need to satisfy.
const parsedSlowQueryMs = Number(process.env.SLOW_QUERY_MS);
const SLOW_QUERY_MS = Number.isFinite(parsedSlowQueryMs) && parsedSlowQueryMs > 0 ? parsedSlowQueryMs : 500;

/** Logs a finished query: every one at debug, a slow one as a warning. The SQL is parameterised, so no values are logged. */
function logQuery(sql: string | undefined, startedAt: number, error?: unknown) {
    const durationMs = Math.round((performance.now() - startedAt) * 10) / 10;
    if (durationMs <= SLOW_QUERY_MS && !logger.isLevelEnabled("debug")) return;
    const log = logFor("db");
    const fields = { event: "db.query", sql, durationMs, ...(error ? { failed: true, code: (error as { code?: unknown }).code } : {}) };
    if (durationMs > SLOW_QUERY_MS) log.warn({ ...fields, slow: true }, `slow query (${Math.round(durationMs)}ms)`);
    else log.debug(fields, "query");
}

/** Wraps each pooled client's `query`, which both Drizzle and `pool.query` go through, to time it. */
function timeQueries(client: PoolClient) {
    const query = client.query.bind(client) as (...args: unknown[]) => unknown;
    client.query = ((...args: unknown[]) => {
        const first = args[0] as string | { text?: string } | undefined;
        const sql = typeof first === "string" ? first : first?.text;
        const startedAt = performance.now();
        const callback = args.at(-1);
        if (typeof callback === "function") {
            // Bound so the result, which arrives from the socket, is logged in the context of whoever asked.
            args[args.length - 1] = AsyncResource.bind((error: unknown, result: unknown) => {
                logQuery(sql, startedAt, error ?? undefined);
                callback(error, result);
            });
            return query(...args);
        }
        const result = query(...args);
        if (result instanceof Promise) result.then(() => logQuery(sql, startedAt), (error: unknown) => logQuery(sql, startedAt, error));
        return result;
    }) as PoolClient["query"];
}

pool.on("connect", timeQueries);
// `pool.query` runs its query in the callback `pool.connect` calls once a client is free, which would otherwise run
// outside the request that asked, and the query's log line would lose its request id.
const connect = pool.connect.bind(pool) as (callback?: (...args: unknown[]) => void) => unknown;
pool.connect = ((callback?: (...args: unknown[]) => void) => (callback ? connect(AsyncResource.bind(callback)) : connect())) as typeof pool.connect;
// An idle client losing its connection (the database restarting, a network blip) is reported here; without a listener
// it would crash the process, and the pool replaces the client on its own.
pool.on("error", (error) => logFor("db").error({ event: "db.pool_error", err: error }, "idle database client failed"));

export const db = drizzle(pool, { schema });
