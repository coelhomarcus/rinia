import { loginSchema, registerSchema } from "@rinia/shared";
import { asyncHandler } from "../../middleware/async-handler";
import { clearSessionCookie, setSessionCookie } from "../../lib/cookies";
import { HttpError } from "../../lib/http-error";
import { logFor } from "../../lib/request-context";
import { getUserById, loginUser, registerUser } from "./auth.service";

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
