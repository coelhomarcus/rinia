import { createHash, randomBytes } from "node:crypto";
import { API_TOKEN_PREFIX, type CreateApiTokenInput } from "@rinia/shared";
import { and, desc, eq } from "drizzle-orm";
import { db } from "../../db";
import { apiTokens } from "../../db/schema";
import { HttpError } from "../../lib/http-error";
import type { JwtPayload } from "../../lib/jwt";
import { logFor } from "../../lib/request-context";

/** How much of a token the list shows: the prefix and four random characters. */
const VISIBLE_LENGTH = API_TOKEN_PREFIX.length + 4;
/** Saving every use would write on each request; to the minute is precise enough for "last used". */
const LAST_USED_PRECISION_MS = 60_000;

const PUBLIC_COLUMNS = { id: true, name: true, prefix: true, lastUsedAt: true, createdAt: true } as const;

export function hashApiToken(token: string) {
    return createHash("sha256").update(token).digest("hex");
}

/** 32 random bytes: too many to guess, so a fast hash is enough and tokens can be looked up by it. */
export function generateApiToken() {
    return `${API_TOKEN_PREFIX}${randomBytes(32).toString("base64url")}`;
}

export function listApiTokens(userId: string) {
    return db.query.apiTokens.findMany({ where: eq(apiTokens.userId, userId), columns: PUBLIC_COLUMNS, orderBy: [desc(apiTokens.createdAt)] });
}

/** Creates a token and returns it in full. This is the only time it is readable: only its hash is stored. */
export async function createApiToken(userId: string, input: CreateApiTokenInput) {
    const secret = generateApiToken();
    const [token] = await db
        .insert(apiTokens)
        .values({ userId, name: input.name, tokenHash: hashApiToken(secret), prefix: secret.slice(0, VISIBLE_LENGTH) })
        .returning({ id: apiTokens.id, name: apiTokens.name, prefix: apiTokens.prefix, lastUsedAt: apiTokens.lastUsedAt, createdAt: apiTokens.createdAt });
    logFor("audit").info({ event: "api_token.created", userId, tokenId: token.id }, "API token created");
    return { token, secret };
}

/** Deletes the token, so the next request made with it is refused. */
export async function revokeApiToken(userId: string, tokenId: string) {
    const [deleted] = await db.delete(apiTokens).where(and(eq(apiTokens.id, tokenId), eq(apiTokens.userId, userId))).returning({ id: apiTokens.id });
    if (!deleted) throw new HttpError(404, "API token not found");
    logFor("audit").info({ event: "api_token.revoked", userId, tokenId }, "API token revoked");
}

/** Who a token acts as, read from the user on every request so a changed admin flag applies at once. Null for an unknown or revoked token. */
export async function authenticateApiToken(token: string, now = new Date()): Promise<JwtPayload | null> {
    if (!token.startsWith(API_TOKEN_PREFIX)) return null;
    const row = await db.query.apiTokens.findFirst({
        where: eq(apiTokens.tokenHash, hashApiToken(token)),
        columns: { id: true, lastUsedAt: true },
        with: { user: { columns: { id: true, username: true, isAdmin: true } } },
    });
    if (!row) return null;
    if (!row.lastUsedAt || now.getTime() - row.lastUsedAt.getTime() >= LAST_USED_PRECISION_MS) {
        await db
            .update(apiTokens)
            .set({ lastUsedAt: now })
            .where(eq(apiTokens.id, row.id))
            .catch((error: unknown) => logFor("api-tokens").error({ err: error, tokenId: row.id }, "could not record API token use"));
    }
    return { sub: row.user.id, username: row.user.username, isAdmin: row.user.isAdmin };
}
