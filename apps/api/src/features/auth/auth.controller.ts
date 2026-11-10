import { confirmEmailChangeSchema, forgotPasswordSchema, loginSchema, registerSchema, resetPasswordSchema } from "@rinia/shared";
import { env } from "../../config/env";
import { z } from "zod";
import { asyncHandler } from "../../middleware/async-handler";
import { clearSessionCookie, SESSION_COOKIE_NAME, setSessionCookie } from "../../lib/cookies";
import { type SessionToken, verifyToken } from "../../lib/jwt";
import { HttpError } from "../../lib/http-error";
import { logFor } from "../../lib/request-context";
import { appBaseUrl } from "../../lib/app-url";
import { getUserById, loginUser, registerUser } from "./auth.service";
import { confirmEmailChange } from "../users/email-change.service";
import { requestPasswordReset, resetPassword } from "./password.service";
import { listSessions, revokeSessions, sessionMeta } from "./sessions.service";

/** People sign in with a username or an email; only a username is logged. */
const loggableUsername = (identifier: string) => (identifier.includes("@") ? undefined : identifier.trim().toLowerCase());

export const register = asyncHandler(async (req, res) => {
    const input = registerSchema.parse(req.body);
    const log = logFor("auth");
    try {
        const { user, token } = await registerUser(input, sessionMeta(req));
        log.info({ event: "auth.registered", userId: user.id, ip: req.ip }, "account registered");
        setSessionCookie(res, token);
        res.status(201).json({ user });
    } catch (error) {
        if (error instanceof HttpError && error.statusCode === 403) {
            log.warn({ event: "auth.register_denied", reason: "invalid_code", username: input.username, ip: req.ip }, "registration with an invalid code");
        }
        throw error;
    }
});

export const login = asyncHandler(async (req, res) => {
    const input = loginSchema.parse(req.body);
    const log = logFor("auth");
    try {
        const { user, token } = await loginUser(input, sessionMeta(req));
        log.info({ event: "auth.login", userId: user.id, username: user.username, ip: req.ip }, "signed in");
        setSessionCookie(res, token);
        res.json({ user });
    } catch (error) {
        if (error instanceof HttpError && error.statusCode === 401) {
            log.warn({ event: "auth.login_failed", username: loggableUsername(input.identifier), ip: req.ip }, "sign-in failed");
        }
        throw error;
    }
});

/** Ends this browser's session for good, so a copy of the cookie stops working too. */
export const logout = asyncHandler(async (req, res) => {
    const token = req.cookies?.[SESSION_COOKIE_NAME] as string | undefined;
    let session: SessionToken | undefined;
    try {
        session = token ? verifyToken(token) : undefined;
    } catch {
        // An expired or foreign cookie has nothing to revoke; it is cleared all the same.
    }
    if (session) {
        await revokeSessions(session.sub, { only: session.sid });
        logFor("auth").info({ event: "auth.logout", userId: session.sub, sessionId: session.sid }, "signed out");
    }
    clearSessionCookie(res);
    res.status(204).send();
});

export const me = asyncHandler(async (req, res) => {
    const user = await getUserById(req.user!.sub);
    res.json({ user });
});

/** What the sign-in page and the profile may offer. Both need email, which a server may not have set up. */
export const options = asyncHandler(async (_req, res) => {
    res.json({ passwordRecovery: env.emailLinksEnabled, emailChange: env.emailLinksEnabled });
});

/** Always answers the same way, so the form cannot tell anyone which accounts exist. */
export const forgotPassword = asyncHandler(async (req, res) => {
    const { identifier } = forgotPasswordSchema.parse(req.body);
    if (!env.emailLinksEnabled) throw new HttpError(503, "Email is not set up on this server");
    await requestPasswordReset(identifier, appBaseUrl(req));
    res.status(204).send();
});

export const resetPasswordWithLink = asyncHandler(async (req, res) => {
    const { token, password } = resetPasswordSchema.parse(req.body);
    await resetPassword(token, password);
    res.status(204).send();
});

/** Opened from the new inbox, signed in or not. */
export const confirmEmail = asyncHandler(async (req, res) => {
    const { token } = confirmEmailChangeSchema.parse(req.body);
    const user = await confirmEmailChange(token);
    res.json({ email: user.email });
});

/** Where the person is signed in, with the browser making this request marked. */
export const sessionsList = asyncHandler(async (req, res) => {
    const rows = await listSessions(req.user!.sub);
    res.json({ sessions: rows.map((row) => ({ ...row, current: row.id === req.user!.sid })) });
});

export const revokeSession = asyncHandler<{ sessionId: string }>(async (req, res) => {
    const sessionId = z.string().uuid().parse(req.params.sessionId);
    const revoked = await revokeSessions(req.user!.sub, { only: sessionId });
    if (revoked === 0) throw new HttpError(404, "Session not found");
    logFor("auth").info({ event: "auth.session_revoked", sessionId }, "session revoked by its owner");
    if (sessionId === req.user!.sid) clearSessionCookie(res);
    res.status(204).send();
});

export const revokeOtherSessions = asyncHandler(async (req, res) => {
    const revoked = await revokeSessions(req.user!.sub, { except: req.user!.sid });
    logFor("auth").info({ event: "auth.other_sessions_revoked", revoked }, "signed out of every other device");
    res.json({ revoked });
});
