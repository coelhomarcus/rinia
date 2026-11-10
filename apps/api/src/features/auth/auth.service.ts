import type { LoginInput, RegisterInput } from "@rinia/shared";
import { eq, or } from "drizzle-orm";
import { env } from "../../config/env";
import { db } from "../../db";
import { users } from "../../db/schema";
import { HttpError } from "../../lib/http-error";
import { type JwtPayload, signToken } from "../../lib/jwt";
import { hashPassword, verifyPassword } from "../../lib/password";

export function toPublicUser(user: typeof users.$inferSelect) {
    const { passwordHash: _passwordHash, sessionsRevokedAt: _sessionsRevokedAt, ...publicUser } = user;
    return publicUser;
}

/** Whether a session issued at `issuedAt` (seconds) was cut off by an admin signing the person out everywhere. */
export function sessionRevoked(issuedAt: number | undefined, revokedAt: Date | null | undefined): boolean {
    if (!revokedAt) return false;
    return (issuedAt ?? 0) < Math.floor(revokedAt.getTime() / 1000);
}

/**
 * The person a session cookie speaks for, read fresh: the account must still exist, not be suspended, and not have
 * been signed out everywhere since the token was issued. Admin rights come from the database, so a change takes effect
 * at once rather than when the cookie expires.
 */
export async function sessionUser(session: JwtPayload): Promise<JwtPayload | null> {
    const user = await db.query.users.findFirst({ where: eq(users.id, session.sub), columns: { id: true, isAdmin: true, suspendedAt: true, sessionsRevokedAt: true } });
    if (!user || user.suspendedAt || sessionRevoked(session.iat, user.sessionsRevokedAt)) return null;
    return { sub: session.sub, username: session.username, isAdmin: user.isAdmin === true, iat: session.iat };
}

export async function registerUser(input: RegisterInput) {
    if (input.specialCode !== env.SPECIAL_REGISTRATION_CODE) {
        throw new HttpError(403, "Invalid special code");
    }

    const existing = await db.query.users.findFirst({
        where: or(eq(users.username, input.username), eq(users.email, input.email)),
    });

    if (existing) {
        const conflictField = existing.username === input.username ? "username" : "email";
        throw new HttpError(409, `This ${conflictField} is already in use`);
    }

    const passwordHash = await hashPassword(input.password);
    const isAdmin = env.adminUsernames.includes(input.username);

    const [user] = await db
        .insert(users)
        .values({
            name: input.name,
            username: input.username,
            email: input.email,
            passwordHash,
            isAdmin,
            locale: input.locale,
        })
        .returning();

    const token = signToken({ sub: user.id, username: user.username, isAdmin: user.isAdmin });
    return { user: toPublicUser(user), token };
}

export async function loginUser(input: LoginInput) {
    const identifier = input.identifier.trim().toLowerCase();

    const user = await db.query.users.findFirst({
        where: or(eq(users.username, identifier), eq(users.email, identifier)),
    });

    if (!user || !(await verifyPassword(input.password, user.passwordHash))) {
        throw new HttpError(401, "Incorrect username or password");
    }
    // Checked only after the password, so the message never tells a stranger that an account exists.
    if (user.suspendedAt) throw new HttpError(403, "This account is suspended");

    const token = signToken({ sub: user.id, username: user.username, isAdmin: user.isAdmin });
    return { user: toPublicUser(user), token };
}

export async function getUserById(id: string) {
    const user = await db.query.users.findFirst({ where: eq(users.id, id) });

    if (!user) {
        throw new HttpError(401, "User not found");
    }

    return toPublicUser(user);
}
