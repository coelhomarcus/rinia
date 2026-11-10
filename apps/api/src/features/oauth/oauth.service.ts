import { createHash, randomBytes } from "node:crypto";
import type { OAuthRegisteredClientsStore } from "@modelcontextprotocol/sdk/server/auth/clients.js";
import { InvalidGrantError, InvalidTokenError, UnsupportedGrantTypeError } from "@modelcontextprotocol/sdk/server/auth/errors.js";
import { redirectUriMatches } from "@modelcontextprotocol/sdk/server/auth/handlers/authorize.js";
import type { AuthorizationParams, OAuthServerProvider } from "@modelcontextprotocol/sdk/server/auth/provider.js";
import type { OAuthClientInformationFull, OAuthTokens } from "@modelcontextprotocol/sdk/shared/auth.js";
import { DEFAULT_API_TOKEN_EXPIRY_DAYS, type ApiTokenAccess } from "@rinia/shared";
import { and, eq, gt, lt } from "drizzle-orm";
import type { Request, Response } from "express";
import { env } from "../../config/env";
import { db } from "../../db";
import { apiTokens, oauthClients, oauthCodes } from "../../db/schema";
import { HttpError } from "../../lib/http-error";
import { logFor } from "../../lib/request-context";
import { authenticateApiToken, createApiToken, hashApiToken } from "../api-tokens/api-tokens.service";

/** An authorization code is exchanged within seconds; ten minutes covers a slow client without keeping codes around. */
const CODE_LIFETIME_MS = 10 * 60 * 1000;
/** Scopes Rinia understands. `write` includes reading, as it does for API tokens. */
export const OAUTH_SCOPES: ApiTokenAccess[] = ["read", "write"];

import { appBaseUrl } from "../../lib/app-url";

export { appBaseUrl };

const hashCode = (code: string) => createHash("sha256").update(code).digest("hex");

/** Asking for `write`, or for nothing in particular, asks to change things; only `read` alone asks to look. */
export function accessForScopes(scopes: string[] | undefined): ApiTokenAccess {
    return scopes?.length && !scopes.includes("write") ? "read" : "write";
}

export async function findOAuthClient(clientId: string) {
    const row = await db.query.oauthClients.findFirst({ where: eq(oauthClients.clientId, clientId) });
    return row?.info;
}

/** MCP clients register themselves before they sign anyone in, so anything that can reach Rinia can register. */
const clientsStore: OAuthRegisteredClientsStore = {
    getClient: findOAuthClient,
    async registerClient(client) {
        const info = client as OAuthClientInformationFull;
        await db.insert(oauthClients).values({ clientId: info.client_id, info });
        logFor("oauth").info({ event: "oauth.client_registered", clientId: info.client_id, clientName: info.client_name }, "OAuth client registered");
        return info;
    },
};

/** The request for consent, as the sign-in page receives it and sends it back. */
export interface ConsentRequest {
    clientId: string;
    redirectUri: string;
    codeChallenge: string;
    state?: string;
    scope?: string;
    resource?: string;
}

/** What the consent page shows: which app asks, where it will be sent back, and what it asks for. */
export async function describeConsent(request: Pick<ConsentRequest, "clientId" | "redirectUri" | "scope">) {
    const client = await checkedClient(request.clientId, request.redirectUri);
    return {
        clientName: client.client_name ?? null,
        redirectHost: new URL(request.redirectUri).host,
        access: accessForScopes(request.scope?.split(" ").filter(Boolean)),
    };
}

/** The client, provided `redirectUri` is one it registered. The page's query string is checked again, since anyone can edit it. */
async function checkedClient(clientId: string, redirectUri: string) {
    const client = await findOAuthClient(clientId);
    if (!client) throw new HttpError(404, "This app is not registered with Rinia. Start the sign-in again from the app.");
    if (!client.redirect_uris.some((registered) => redirectUriMatches(redirectUri, registered))) throw new HttpError(400, "This app asked to be sent back to an address it did not register.");
    return client;
}

function redirectWith(redirectUri: string, params: Record<string, string | undefined>) {
    const target = new URL(redirectUri);
    for (const [key, value] of Object.entries(params)) if (value !== undefined) target.searchParams.set(key, value);
    return target.href;
}

/**
 * The person's answer on the consent page. Approving issues a single-use code for the app to exchange; `access` can
 * narrow what the app asked for, never widen it. Either way the answer is the address to send the browser back to.
 */
export async function answerConsent(userId: string, request: ConsentRequest, answer: { approve: boolean; access?: ApiTokenAccess }) {
    await checkedClient(request.clientId, request.redirectUri);
    if (!answer.approve) {
        logFor("oauth").info({ event: "oauth.denied", clientId: request.clientId }, "OAuth sign-in denied");
        return { redirectTo: redirectWith(request.redirectUri, { error: "access_denied", error_description: "The person did not allow access", state: request.state }) };
    }
    const asked = accessForScopes(request.scope?.split(" ").filter(Boolean));
    const access = asked === "read" ? "read" : (answer.access ?? asked);
    const code = randomBytes(32).toString("base64url");
    await db.insert(oauthCodes).values({
        codeHash: hashCode(code),
        clientId: request.clientId,
        userId,
        codeChallenge: request.codeChallenge,
        redirectUri: request.redirectUri,
        access,
        resource: request.resource ?? null,
        expiresAt: new Date(Date.now() + CODE_LIFETIME_MS),
    });
    logFor("oauth").info({ event: "oauth.approved", clientId: request.clientId, access }, "OAuth sign-in approved");
    return { redirectTo: redirectWith(request.redirectUri, { code, state: request.state }) };
}

async function liveCode(client: OAuthClientInformationFull, code: string) {
    const row = await db.query.oauthCodes.findFirst({ where: and(eq(oauthCodes.codeHash, hashCode(code)), eq(oauthCodes.clientId, client.client_id), gt(oauthCodes.expiresAt, new Date())) });
    if (!row) throw new InvalidGrantError("The authorization code is invalid, expired or already used");
    return row;
}

/** Codes nobody exchanged, past their lifetime. Cheap enough to run on each exchange. */
async function dropExpiredCodes() {
    await db.delete(oauthCodes).where(lt(oauthCodes.expiresAt, new Date()));
}

/**
 * Rinia as an OAuth authorization server for MCP clients. Signing in happens on Rinia's own consent page, and what
 * the app gets is an ordinary API token tied to it: it shows in the person's API tokens, where it can be revoked.
 * The token expires after `DEFAULT_API_TOKEN_EXPIRY_DAYS`; the app signs in again then, so there are no refresh tokens yet.
 */
export const oauthProvider: OAuthServerProvider = {
    clientsStore,

    async authorize(client: OAuthClientInformationFull, params: AuthorizationParams, res: Response) {
        const page = new URL("/oauth/authorize", appBaseUrl(res.req));
        const query: Record<string, string | undefined> = {
            client_id: client.client_id,
            redirect_uri: params.redirectUri,
            code_challenge: params.codeChallenge,
            state: params.state,
            scope: params.scopes?.join(" "),
            resource: params.resource?.href,
        };
        for (const [key, value] of Object.entries(query)) if (value !== undefined) page.searchParams.set(key, value);
        res.redirect(page.href);
    },

    async challengeForAuthorizationCode(client, authorizationCode) {
        return (await liveCode(client, authorizationCode)).codeChallenge;
    },

    async exchangeAuthorizationCode(client, authorizationCode, _codeVerifier, redirectUri): Promise<OAuthTokens> {
        const row = await liveCode(client, authorizationCode);
        if (redirectUri !== undefined && redirectUri !== row.redirectUri) throw new InvalidGrantError("redirect_uri does not match the one used to sign in");
        // Deleting first makes the code single-use even when two exchanges race.
        const [used] = await db.delete(oauthCodes).where(eq(oauthCodes.codeHash, row.codeHash)).returning({ codeHash: oauthCodes.codeHash });
        if (!used) throw new InvalidGrantError("The authorization code was already used");
        void dropExpiredCodes().catch((error: unknown) => logFor("oauth").error({ err: error }, "could not drop expired OAuth codes"));
        const { secret } = await createApiToken(row.userId, { name: client.client_name?.trim().slice(0, 80) || "MCP client", access: row.access, expiresInDays: DEFAULT_API_TOKEN_EXPIRY_DAYS, projectIds: [] }, client.client_id);
        return { access_token: secret, token_type: "bearer", scope: row.access, expires_in: DEFAULT_API_TOKEN_EXPIRY_DAYS * 24 * 60 * 60 };
    },

    async exchangeRefreshToken() {
        throw new UnsupportedGrantTypeError("Rinia issues no refresh tokens: sign in again when the token expires");
    },

    async verifyAccessToken(token) {
        const authenticated = await authenticateApiToken(token);
        if (!authenticated) throw new InvalidTokenError("Invalid, expired or revoked token");
        return { token, clientId: "", scopes: [authenticated.access] };
    },

    /** Revokes a token the app holds, and only one that was issued to that app. */
    async revokeToken(client, request) {
        await db.delete(apiTokens).where(and(eq(apiTokens.tokenHash, hashApiToken(request.token)), eq(apiTokens.oauthClientId, client.client_id)));
    },
};
