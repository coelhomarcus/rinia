import type { PoolClient } from "pg";
import { pool } from "../db";
import { logger } from "./logger";

const log = logger.child({ module: "single-instance" });

// Arbitrary key shared by every Rinia process that talks to the same database.
const INSTANCE_LOCK_KEY = 5_746_001;

/** The connection that holds the lock. It is checked out of the pool, so the pool cannot close while it is. */
let lockClient: PoolClient | undefined;

/** Hands the lock's connection back, for shutting down: the pool can then close it, which releases the lock. */
export function releaseInstanceLock() {
    lockClient?.release();
    lockClient = undefined;
}

/**
 * Rinia keeps realtime, document rooms and rate limits in process memory, so it must run as one instance.
 * Takes a session-level Postgres advisory lock on a connection kept for the life of the process; if another
 * process already holds it, logs a warning. Never throws: a failure here must not stop the API from starting.
 * During a rolling deploy the old and the new process overlap briefly, so a warning then is expected.
 */
export async function warnIfAnotherInstanceRuns(): Promise<void> {
    try {
        const client = await pool.connect();
        const { rows } = await client.query<{ locked: boolean }>("select pg_try_advisory_lock($1) as locked", [INSTANCE_LOCK_KEY]);
        if (rows[0]?.locked) {
            // the client stays checked out: the lock lives as long as its connection
            lockClient = client;
            return;
        }
        client.release();
        log.warn(
            { event: "instance.duplicate" },
            "another Rinia instance is connected to this database; realtime, document rooms and rate limits are in memory and need a single instance",
        );
    } catch (error) {
        log.warn({ event: "instance.check_failed", err: error }, "could not check for another running instance");
    }
}
