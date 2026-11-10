import jwt from "jsonwebtoken";
import { env } from "../config/env";

/** Who a request acts for, as `requireAuth` sets it on `req.user`. */
export interface JwtPayload {
    sub: string;
    username: string;
    isAdmin: boolean;
    /** The session behind a browser request; API tokens have none. */
    sid?: string;
}

/**
 * What the session cookie carries: the user and the session row. Everything else, admin rights included, is read
 * from the database, so the token cannot vouch for anything that may change.
 */
export interface SessionToken {
    sub: string;
    sid: string;
    /** Seconds since the epoch; set by `jwt.sign`. */
    iat?: number;
    exp?: number;
}

export function signToken(payload: Pick<SessionToken, "sub" | "sid">): string {
    return jwt.sign({ sub: payload.sub, sid: payload.sid }, env.JWT_SECRET, { expiresIn: env.JWT_EXPIRES_IN as jwt.SignOptions["expiresIn"] });
}

/** Checks the signature and expiry. A token from before sessions had rows carries no `sid` and is refused. */
export function verifyToken(token: string): SessionToken {
    const payload = jwt.verify(token, env.JWT_SECRET) as Partial<SessionToken>;
    if (typeof payload.sub !== "string" || typeof payload.sid !== "string") throw new Error("Session token without a session");
    return payload as SessionToken;
}
