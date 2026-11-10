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
            /** What the API token may do. A session can do everything, so this is set only for tokens. */
            tokenAccess?: import("@rinia/shared").ApiTokenAccess;
            /** The projects the API token is limited to; unset for a session or a token that reaches every project. */
            tokenProjectIds?: readonly string[];
            projectMembership?: typeof projectMembers.$inferSelect;
        }
    }
}

export {};
