import type { Server, ServerResponse } from "node:http";
import type { Logger } from "./logger";

/** How long in-flight requests get to finish before their connections are destroyed. */
export const SHUTDOWN_TIMEOUT_MS = 10_000;
/** How long the pool gets to close once the requests are gone; a query that never returns would hold it open. */
const POOL_CLOSE_TIMEOUT_MS = 2_000;

/**
 * Keeps the responses still being written. The server's own `close` callback cannot say when they are done, since on
 * Bun it never fires once a WebSocket has been upgraded, and `closeAllConnections()` leaves a request that never
 * answers open. Call it before the server starts listening.
 */
export function trackRequests(server: Pick<Server, "on">) {
    const inFlight = new Set<ServerResponse>();
    let onEmpty: (() => void) | undefined;
    server.on("request", (_req, res: ServerResponse) => {
        inFlight.add(res);
        res.once("close", () => {
            inFlight.delete(res);
            if (!inFlight.size) onEmpty?.();
        });
    });
    return {
        get pending() {
            return inFlight.size;
        },
        /** Resolves once no request is in flight. */
        drained: () => new Promise<void>((resolve) => (inFlight.size ? (onEmpty = resolve) : resolve())),
        destroy() {
            // The socket, not `res.destroy()`: on Bun that answers with an empty 200, which a client would take as success.
            for (const res of [...inFlight]) (res.socket ?? res).destroy();
        },
    };
}

export interface ShutdownSteps {
    server: Pick<Server, "close" | "closeIdleConnections" | "closeAllConnections">;
    requests: Pick<ReturnType<typeof trackRequests>, "pending" | "drained" | "destroy">;
    /** Closes every realtime socket and resolves once they are gone. */
    closeSockets: () => Promise<void>;
    /** Saves the open pages. Called again after the requests finish, since one of them may have edited a page. */
    savePages: () => Promise<unknown>;
    /** Hands back connections the process keeps for itself, so the pool can close. */
    releaseConnections: () => void;
    closePool: () => Promise<void>;
    log: Logger;
    timeoutMs?: number;
}

/** Resolves with `fallback` if `work` takes longer than `ms`, and never rejects. */
function within<T>(work: Promise<T>, ms: number, fallback: T): Promise<T> {
    let timer: ReturnType<typeof setTimeout>;
    const timeout = new Promise<T>((resolve) => (timer = setTimeout(() => resolve(fallback), ms)));
    return Promise.race([work.catch(() => fallback), timeout]).finally(() => clearTimeout(timer));
}

/**
 * Stops the API without cutting anyone off: no new connections, realtime sockets told to reconnect, open pages saved,
 * in-flight requests given `timeoutMs` to finish, then the database pool closed. Resolves with the process exit code:
 * 0 for a clean stop, 1 if a request had to be destroyed or a step failed.
 */
export async function shutdown({ server, requests, closeSockets, savePages, releaseConnections, closePool, log, timeoutMs = SHUTDOWN_TIMEOUT_MS }: ShutdownSteps): Promise<number> {
    let clean = true;
    const step = async (name: string, work: () => Promise<unknown>) => {
        try {
            await work();
        } catch (error) {
            clean = false;
            log.error({ event: "server.stop_failed", step: name, err: error }, `shutdown step failed: ${name}`);
        }
    };

    // 1. No new connections. Requests already being served carry on.
    server.close();
    server.closeIdleConnections();

    // 2 and 3. Sockets leave first, so no edit arrives while the pages are saved.
    await step("sockets", closeSockets);
    await step("pages", savePages);

    // 4. In-flight requests finish, or are destroyed when the time is up.
    const finished = await within(requests.drained().then(() => true), timeoutMs, false);
    if (!finished) {
        clean = false;
        log.warn({ event: "server.stop_timeout", timeoutMs, requests: requests.pending }, "requests still running after the shutdown timeout; destroying their connections");
        requests.destroy();
        server.closeAllConnections();
    }
    // A request that finished in the meantime may have edited a page.
    await step("pages", savePages);

    // 5. The pool waits for every checked-out client, so the one the process holds for itself goes back first.
    releaseConnections();
    if (!(await within(closePool().then(() => true), POOL_CLOSE_TIMEOUT_MS, false))) {
        clean = false;
        log.warn({ event: "server.pool_timeout" }, "the database pool did not close in time");
    }

    return clean ? 0 : 1;
}
