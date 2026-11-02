import type { projectMembers } from "../db/schema";
import type { JwtPayload } from "../lib/jwt";
import type { Logger } from "../lib/logger";

declare global {
    namespace Express {
        interface Request {
            /** This request's id, sent back as `X-Request-Id` and on every line it logs. */
            id: string;
            /** A logger carrying the request id, and the user once `requireAuth` knows them. */
            log: Logger;
            user?: JwtPayload;
            /** How `user` signed in: the browser session cookie or an API token. */
            authMethod?: "session" | "token";
            projectMembership?: typeof projectMembers.$inferSelect;
        }
    }
}

export {};
