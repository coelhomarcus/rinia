import { createHash, randomBytes } from "node:crypto";
import { API_TOKEN_PREFIX, DEFAULT_API_TOKEN_EXPIRY_DAYS, type ApiTokenAccess, type CreateApiTokenInput } from "@rinia/shared";
import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "../../db";
import { apiTokenProjects, apiTokens, projectMembers } from "../../db/schema";
import { HttpError } from "../../lib/http-error";
import type { JwtPayload } from "../../lib/jwt";
import { logFor } from "../../lib/request-context";

/** How much of a token the list shows: the prefix and four random characters. */
const VISIBLE_LENGTH = API_TOKEN_PREFIX.length + 4;
/** Saving every use would write on each request; to the minute is precise enough for "last used". */
const LAST_USED_PRECISION_MS = 60_000;

const PUBLIC_COLUMNS = { id: true, name: true, prefix: true, access: true, expiresAt: true, lastUsedAt: true, createdAt: true, projectScoped: true } as const;
const DAY_MS = 24 * 60 * 60 * 1000;

export function hashApiToken(token: string) {
    return createHash("sha256").update(token).digest("hex");
}

/** 32 random bytes: too many to guess, so a fast hash is enough and tokens can be looked up by it. */
export function generateApiToken() {
    return `${API_TOKEN_PREFIX}${randomBytes(32).toString("base64url")}`;
}

/** What the list shows of a token: when it expires, and the projects it is limited to (null for all of them). */
function present<T extends { projectScoped: boolean }>({ projectScoped, ...token }: T, projectIds: string[]) {
    return { ...token, projectIds: projectScoped ? projectIds : null };
}

/** The user's tokens, with the app behind each one that came from signing in with OAuth. Expired ones stay listed, so they can be seen and revoked. */
export async function listApiTokens(userId: string) {
    const rows = await db.query.apiTokens.findMany({
        where: eq(apiTokens.userId, userId),
        columns: PUBLIC_COLUMNS,
        orderBy: [desc(apiTokens.createdAt)],
        with: { oauthClient: { columns: { clientId: true } }, projects: { columns: { projectId: true } } },
    });
    return rows.map(({ oauthClient, projects, ...token }) => ({ ...present(token, projects.map((row) => row.projectId)), oauth: !!oauthClient }));
}

/**
 * Creates a token and returns it in full. This is the only time it is readable: only its hash is stored. `oauthClientId`
 * marks a token handed to an app at the end of an OAuth sign-in. A token lives `expiresInDays` days, or forever when that is
 * null, and is limited to `projectIds` when there are any, which must be projects its owner belongs to.
 */
export async function createApiToken(userId: string, input: CreateApiTokenInput, oauthClientId?: string, now = new Date()) {
    const projectIds = input.projectIds ?? [];
    if (projectIds.length > 0) {
        const memberships = await db.select({ projectId: projectMembers.projectId }).from(projectMembers).where(and(eq(projectMembers.userId, userId), inArray(projectMembers.projectId, projectIds)));
        if (memberships.length !== projectIds.length) throw new HttpError(400, "A token can only be limited to projects you belong to");
    }
    const expiresInDays = input.expiresInDays === undefined ? DEFAULT_API_TOKEN_EXPIRY_DAYS : input.expiresInDays;
    const expiresAt = expiresInDays === null ? null : new Date(now.getTime() + expiresInDays * DAY_MS);
    const secret = generateApiToken();
    // Two inserts without a transaction are safe: a scoped token with no project rows reaches nothing.
    const [token] = await db
        .insert(apiTokens)
        .values({ userId, name: input.name, access: input.access, expiresAt, projectScoped: projectIds.length > 0, oauthClientId: oauthClientId ?? null, tokenHash: hashApiToken(secret), prefix: secret.slice(0, VISIBLE_LENGTH) })
        .returning({ id: apiTokens.id, name: apiTokens.name, prefix: apiTokens.prefix, access: apiTokens.access, expiresAt: apiTokens.expiresAt, projectScoped: apiTokens.projectScoped, lastUsedAt: apiTokens.lastUsedAt, createdAt: apiTokens.createdAt });
    if (projectIds.length > 0) await db.insert(apiTokenProjects).values(projectIds.map((projectId) => ({ tokenId: token.id, projectId })));
    logFor("audit").info(
        { event: "api_token.created", userId, tokenId: token.id, access: input.access, expiresAt, projectIds: projectIds.length > 0 ? projectIds : undefined, oauthClientId },
        "API token created",
    );
    return { token: { ...present(token, projectIds), oauth: !!oauthClientId }, secret };
}

/** Deletes the token, so the next request made with it is refused. */
export async function revokeApiToken(userId: string, tokenId: string) {
    const [deleted] = await db.delete(apiTokens).where(and(eq(apiTokens.id, tokenId), eq(apiTokens.userId, userId))).returning({ id: apiTokens.id });
    if (!deleted) throw new HttpError(404, "API token not found");
    logFor("audit").info({ event: "api_token.revoked", userId, tokenId }, "API token revoked");
}

/** Who an API token acts as, what it may do, and the projects it is limited to (null for all of them). */
export interface AuthenticatedApiToken {
    user: JwtPayload;
    access: ApiTokenAccess;
    projectIds: string[] | null;
}

/**
 * Who a token acts as and what it may do, read from the user on every request so a changed admin flag applies at
 * once. Null for an unknown, revoked or expired token.
 */
export async function authenticateApiToken(token: string, now = new Date()): Promise<AuthenticatedApiToken | null> {
    if (!token.startsWith(API_TOKEN_PREFIX)) return null;
    const row = await db.query.apiTokens.findFirst({
        where: eq(apiTokens.tokenHash, hashApiToken(token)),
        columns: { id: true, access: true, lastUsedAt: true, expiresAt: true, projectScoped: true },
        with: { user: { columns: { id: true, username: true, isAdmin: true, suspendedAt: true } }, projects: { columns: { projectId: true } } },
    });
    // A suspended account's tokens stop working with it, and work again if it is restored.
    if (!row || row.user.suspendedAt) return null;
    if (row.expiresAt && row.expiresAt.getTime() <= now.getTime()) return null;
    if (!row.lastUsedAt || now.getTime() - row.lastUsedAt.getTime() >= LAST_USED_PRECISION_MS) {
        await db
            .update(apiTokens)
            .set({ lastUsedAt: now })
            .where(eq(apiTokens.id, row.id))
            .catch((error: unknown) => logFor("api-tokens").error({ err: error, tokenId: row.id }, "could not record API token use"));
    }
    return {
        user: { sub: row.user.id, username: row.user.username, isAdmin: row.user.isAdmin },
        access: row.access ?? "write",
        // A scoped token whose projects were all deleted reaches nothing, not everything.
        projectIds: row.projectScoped ? (row.projects ?? []).map((project) => project.projectId) : null,
    };
}
