import { app } from "./app";
import { CONFIG_KEYS, env } from "./config/env";
import { cleanupExpiredDeletes } from "./db/soft-delete-cleanup";
import { cleanupOrphanFiles } from "./features/files/files.orphans";
import { documentRooms } from "./features/documents/document-rooms";
import { attachRealtime } from "./features/realtime/realtime.socket";
import { logger } from "./lib/logger";

const log = logger.child({ module: "server" });

// A crash is logged with its stack before the process goes; the container restarts it.
process.on("uncaughtException", (error) => {
    log.fatal({ event: "process.uncaught_exception", err: error }, "uncaught exception");
    process.exit(1);
});
process.on("unhandledRejection", (reason) => {
    log.fatal({ event: "process.unhandled_rejection", err: reason }, "unhandled promise rejection");
    process.exit(1);
});

const cleanupLog = logger.child({ module: "cleanup" });
const cleanup = () => {
    void cleanupExpiredDeletes().then(
        (removed) => cleanupLog.debug({ event: "cleanup.round", removed }, "expired deletions cleaned"),
        (error: unknown) => cleanupLog.error({ event: "cleanup.failed", err: error }, "could not clean expired undo records"),
    );
    void cleanupOrphanFiles().then(
        (removed) => cleanupLog.debug({ event: "cleanup.files", removed }, "unreferenced files cleaned"),
        (error: unknown) => cleanupLog.error({ event: "cleanup.files_failed", err: error }, "could not clean unreferenced files"),
    );
};
cleanup();
setInterval(cleanup, 60_000).unref();

const server = app.listen(env.PORT, () => {
    log.info(
        {
            event: "server.started",
            // Set by scripts/build.ts in the bundle, and by `bun run` in development.
            version: process.env.RINIA_VERSION ?? process.env.npm_package_version,
            nodeEnv: env.NODE_ENV,
            port: env.PORT,
            logLevel: logger.level,
            // Which settings are set, never their values.
            config: Object.fromEntries(CONFIG_KEYS.map((key) => [key, Boolean(process.env[key])])),
        },
        `API listening on port ${env.PORT}`,
    );
});
attachRealtime(server);

// Pages being edited are saved a moment after each edit; on shutdown the last moment is saved too.
for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.once(signal, () => {
        log.info({ event: "server.stopping", signal }, "shutting down");
        void documentRooms
            .closeAll()
            .catch((error: unknown) => log.error({ event: "server.stop_failed", err: error }, "could not save open pages on shutdown"))
            .finally(() => {
                log.info({ event: "server.stopped", signal }, "stopped");
                process.exit(0);
            });
    });
}
