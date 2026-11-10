import { createHash, randomBytes } from "node:crypto";
import { and, eq, gt, isNull, ne } from "drizzle-orm";
import { env } from "../../config/env";
import { db } from "../../db";
import { emailChangeTokens, users } from "../../db/schema";
import { EmailError, sendEmail } from "../../lib/email";
import { HttpError } from "../../lib/http-error";
import { verifyPassword } from "../../lib/password";
import { logFor } from "../../lib/request-context";
import { confirmEmailChangeEmail, emailChangedEmail } from "../auth/auth.emails";
import { toPublicUser } from "../auth/auth.service";

/** A confirmation link lasts a day, since it may wait in a new inbox. */
export const EMAIL_CHANGE_LIFETIME_MS = 24 * 60 * 60 * 1000;

const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

/** The token travels in the fragment, so it never reaches a server log or a Referer header. */
const confirmLink = (baseUrl: string, token: string) => `${baseUrl.replace(/\/+$/, "")}/confirm-email#${token}`;

/** Drizzle may wrap the PostgreSQL error in `cause`. */
function isEmailTaken(error: unknown): boolean {
    const seen = new Set<unknown>();
    while (error && typeof error === "object" && !seen.has(error)) {
        seen.add(error);
        const candidate = error as { code?: string; constraint?: string; cause?: unknown };
        if (candidate.code === "23505" && candidate.constraint === "users_email_unique") return true;
        error = candidate.cause;
    }
    return false;
}

async function assertEmailFree(userId: string, email: string) {
    const taken = await db.query.users.findFirst({ where: and(eq(users.email, email), ne(users.id, userId)), columns: { id: true } });
    if (taken) throw new HttpError(409, "This email is already in use");
}

/**
 * Sends a confirmation link to the new address, after checking the password. The account keeps its email until the
 * link is opened; asking again replaces the earlier request.
 */
export async function requestEmailChange(userId: string, input: { newEmail: string; currentPassword: string }, baseUrl: string) {
    if (!env.emailLinksEnabled) throw new HttpError(503, "Email is not set up on this server");
    const user = await db.query.users.findFirst({ where: eq(users.id, userId), columns: { id: true, name: true, username: true, email: true, locale: true, passwordHash: true } });
    if (!user) throw new HttpError(404, "User not found");
    if (!(await verifyPassword(input.currentPassword, user.passwordHash))) throw new HttpError(400, "The current password is incorrect");
    if (input.newEmail === user.email) throw new HttpError(400, "This is already your email");
    await assertEmailFree(user.id, input.newEmail);

    await db.delete(emailChangeTokens).where(and(eq(emailChangeTokens.userId, user.id), isNull(emailChangeTokens.usedAt)));
    const token = randomBytes(32).toString("base64url");
    const expiresAt = new Date(Date.now() + EMAIL_CHANGE_LIFETIME_MS);
    await db.insert(emailChangeTokens).values({ userId: user.id, newEmail: input.newEmail, tokenHash: hashToken(token), expiresAt });
    try {
        await sendEmail(confirmEmailChangeEmail(user, input.newEmail, confirmLink(baseUrl, token)));
    } catch (error) {
        if (error instanceof EmailError) throw new HttpError(502, "Could not send the email. Try again later.");
        throw error;
    }
    logFor("auth").info({ event: "auth.email_change_requested", userId: user.id }, "email change confirmation sent");
    return { email: input.newEmail, expiresAt };
}

/** The change waiting for confirmation, if any, so the profile can say where the link went. */
export async function pendingEmailChange(userId: string) {
    const row = await db.query.emailChangeTokens.findFirst({
        where: and(eq(emailChangeTokens.userId, userId), isNull(emailChangeTokens.usedAt), gt(emailChangeTokens.expiresAt, new Date())),
        columns: { newEmail: true, expiresAt: true },
        orderBy: (table, { desc }) => [desc(table.createdAt)],
    });
    return row ? { email: row.newEmail, expiresAt: row.expiresAt } : null;
}

export async function cancelEmailChange(userId: string) {
    await db.delete(emailChangeTokens).where(and(eq(emailChangeTokens.userId, userId), isNull(emailChangeTokens.usedAt)));
}

/**
 * Opens the link from the new inbox. It works without being signed in, since the inbox may be on another device, and
 * once only. The old address is told about the change.
 */
export async function confirmEmailChange(token: string) {
    const now = new Date();
    // Marking it used first makes the link single-use even when two clicks race.
    const [used] = await db
        .update(emailChangeTokens)
        .set({ usedAt: now })
        .where(and(eq(emailChangeTokens.tokenHash, hashToken(token)), isNull(emailChangeTokens.usedAt), gt(emailChangeTokens.expiresAt, now)))
        .returning({ userId: emailChangeTokens.userId, newEmail: emailChangeTokens.newEmail });
    if (!used) throw new HttpError(400, "This link is invalid or has expired");
    const user = await db.query.users.findFirst({ where: eq(users.id, used.userId), columns: { id: true, name: true, username: true, email: true, locale: true, suspendedAt: true } });
    if (!user || user.suspendedAt) throw new HttpError(400, "This link is invalid or has expired");
    // Someone may have taken the address while the link waited.
    await assertEmailFree(user.id, used.newEmail);
    let updated;
    try {
        [updated] = await db.update(users).set({ email: used.newEmail, updatedAt: now }).where(eq(users.id, user.id)).returning();
    } catch (error) {
        if (isEmailTaken(error)) throw new HttpError(409, "This email is already in use");
        throw error;
    }
    await db.delete(emailChangeTokens).where(and(eq(emailChangeTokens.userId, user.id), isNull(emailChangeTokens.usedAt)));
    void sendEmail(emailChangedEmail(user, user.email, used.newEmail)).catch(() => undefined);
    logFor("auth").info({ event: "auth.email_changed", userId: user.id }, "email changed after confirmation");
    return toPublicUser(updated!);
}
