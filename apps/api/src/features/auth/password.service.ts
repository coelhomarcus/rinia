import { createHash, randomBytes } from "node:crypto";
import { and, eq, gt, isNull, or } from "drizzle-orm";
import { env } from "../../config/env";
import { db } from "../../db";
import { passwordResetTokens, users } from "../../db/schema";
import { EmailError, sendEmail } from "../../lib/email";
import { HttpError } from "../../lib/http-error";
import { hashPassword, verifyPassword } from "../../lib/password";
import { logFor } from "../../lib/request-context";
import { realtimeHub } from "../realtime/realtime.service";
import { passwordChangedEmail, passwordResetEmail } from "./auth.emails";

/** A link someone asked for lasts an hour; one an admin sends lasts a day, since it may wait in an inbox. */
export const RESET_LIFETIME_MS = 60 * 60 * 1000;
export const ADMIN_RESET_LIFETIME_MS = 24 * 60 * 60 * 1000;
/** A second request this soon after the first sends nothing, so a form cannot be used to flood an inbox. */
const RESEND_COOLDOWN_MS = 60 * 1000;

const RECIPIENT = { id: true, name: true, username: true, email: true, locale: true, suspendedAt: true } as const;

export const hashResetToken = (token: string) => createHash("sha256").update(token).digest("hex");

/** The page that reads the token. It travels in the fragment, so it never reaches a server log or a Referer header. */
const resetLink = (baseUrl: string, token: string) => `${baseUrl.replace(/\/+$/, "")}/reset-password#${token}`;

async function issueResetLink(user: { id: string }, baseUrl: string, lifetimeMs: number) {
    const token = randomBytes(32).toString("base64url");
    await db.insert(passwordResetTokens).values({ userId: user.id, tokenHash: hashResetToken(token), expiresAt: new Date(Date.now() + lifetimeMs) });
    return resetLink(baseUrl, token);
}

/**
 * Emails a link to choose a new password. Says nothing about whether the account exists: an unknown name, a
 * suspended account and a request repeated within a minute all end quietly, exactly like a sent link.
 */
export async function requestPasswordReset(identifier: string, baseUrl: string) {
    const log = logFor("auth");
    const user = await db.query.users.findFirst({ where: or(eq(users.username, identifier), eq(users.email, identifier)), columns: RECIPIENT });
    if (!user || user.suspendedAt) {
        log.info({ event: "auth.password_reset_ignored", reason: user ? "suspended" : "unknown" }, "password reset asked for an account that cannot have one");
        return;
    }
    const recent = await db.query.passwordResetTokens.findFirst({
        where: and(eq(passwordResetTokens.userId, user.id), isNull(passwordResetTokens.usedAt), gt(passwordResetTokens.createdAt, new Date(Date.now() - RESEND_COOLDOWN_MS))),
        columns: { id: true },
    });
    if (recent) {
        log.info({ event: "auth.password_reset_ignored", reason: "cooldown", userId: user.id }, "password reset asked again too soon");
        return;
    }
    const link = await issueResetLink(user, baseUrl, RESET_LIFETIME_MS);
    log.info({ event: "auth.password_reset_requested", userId: user.id }, "password reset link issued");
    // Sent without waiting, so the answer takes as long whether or not the account exists.
    void sendEmail(passwordResetEmail(user, link, { hours: 1, byAdmin: false })).catch(() => undefined);
}

/** An admin sends someone the same link by email, instead of reading a temporary password out to them. */
export async function sendAdminResetLink(userId: string, baseUrl: string) {
    if (!env.emailLinksEnabled) throw new HttpError(503, "Email is not set up on this server");
    const user = await db.query.users.findFirst({ where: eq(users.id, userId), columns: RECIPIENT });
    if (!user) throw new HttpError(404, "User not found");
    const link = await issueResetLink(user, baseUrl, ADMIN_RESET_LIFETIME_MS);
    try {
        await sendEmail(passwordResetEmail(user, link, { hours: 24, byAdmin: true }));
    } catch (error) {
        if (error instanceof EmailError) throw new HttpError(502, "Could not send the email. Try again later.");
        throw error;
    }
    return { email: user.email };
}

/** Saves a new password and ends every session issued before now, then tells the person by email. */
async function setPassword(user: { id: string; name: string; username: string; email: string; locale: string }, password: string) {
    const changedAt = new Date();
    await db.update(users).set({ passwordHash: await hashPassword(password), sessionsRevokedAt: changedAt, updatedAt: changedAt }).where(eq(users.id, user.id));
    void sendEmail(passwordChangedEmail(user, changedAt)).catch(() => undefined);
}

/** Uses a link from the email: once, before it expires, and only for an account that is not suspended. */
export async function resetPassword(token: string, password: string) {
    const now = new Date();
    // Marking it used first makes the link single-use even when two submissions race.
    const [used] = await db
        .update(passwordResetTokens)
        .set({ usedAt: now })
        .where(and(eq(passwordResetTokens.tokenHash, hashResetToken(token)), isNull(passwordResetTokens.usedAt), gt(passwordResetTokens.expiresAt, now)))
        .returning({ userId: passwordResetTokens.userId });
    if (!used) throw new HttpError(400, "This link is invalid or has expired");
    const user = await db.query.users.findFirst({ where: eq(users.id, used.userId), columns: RECIPIENT });
    if (!user || user.suspendedAt) throw new HttpError(400, "This link is invalid or has expired");
    await setPassword(user, password);
    realtimeHub.closeUser(user.id);
    // Any other link still in the inbox would undo this change, so they stop working too.
    await db.delete(passwordResetTokens).where(and(eq(passwordResetTokens.userId, user.id), isNull(passwordResetTokens.usedAt)));
    logFor("auth").info({ event: "auth.password_reset", userId: user.id }, "password reset with an emailed link");
}

/**
 * Changes the password from the profile, after checking the current one. The caller gives this browser a fresh
 * session and then has every socket reconnect, so only the other devices are signed out.
 */
export async function changePassword(userId: string, currentPassword: string, newPassword: string) {
    const user = await db.query.users.findFirst({ where: eq(users.id, userId), columns: { ...RECIPIENT, passwordHash: true } });
    if (!user) throw new HttpError(404, "User not found");
    if (!(await verifyPassword(currentPassword, user.passwordHash))) throw new HttpError(400, "The current password is incorrect");
    await setPassword(user, newPassword);
    await db.delete(passwordResetTokens).where(and(eq(passwordResetTokens.userId, user.id), isNull(passwordResetTokens.usedAt)));
    logFor("auth").info({ event: "auth.password_changed", userId: user.id }, "password changed from the profile");
}
