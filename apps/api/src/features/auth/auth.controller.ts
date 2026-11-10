import { confirmEmailChangeSchema, forgotPasswordSchema, loginSchema, registerSchema, resetPasswordSchema } from "@rinia/shared";
import { env } from "../../config/env";
import { asyncHandler } from "../../middleware/async-handler";
import { clearSessionCookie, setSessionCookie } from "../../lib/cookies";
import { HttpError } from "../../lib/http-error";
import { logFor } from "../../lib/request-context";
import { appBaseUrl } from "../../lib/app-url";
import { getUserById, loginUser, registerUser } from "./auth.service";
import { confirmEmailChange } from "../users/email-change.service";
import { requestPasswordReset, resetPassword } from "./password.service";

/** People sign in with a username or an email; only a username is logged. */
const loggableUsername = (identifier: string) => (identifier.includes("@") ? undefined : identifier.trim().toLowerCase());

export const register = asyncHandler(async (req, res) => {
    const input = registerSchema.parse(req.body);
    const log = logFor("auth");
    try {
        const { user, token } = await registerUser(input);
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
        const { user, token } = await loginUser(input);
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

export const logout = asyncHandler(async (_req, res) => {
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
