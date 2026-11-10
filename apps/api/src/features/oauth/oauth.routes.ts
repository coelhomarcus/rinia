import { authorizationHandler } from "@modelcontextprotocol/sdk/server/auth/handlers/authorize.js";
import { metadataHandler } from "@modelcontextprotocol/sdk/server/auth/handlers/metadata.js";
import { clientRegistrationHandler } from "@modelcontextprotocol/sdk/server/auth/handlers/register.js";
import { revocationHandler } from "@modelcontextprotocol/sdk/server/auth/handlers/revoke.js";
import { tokenHandler } from "@modelcontextprotocol/sdk/server/auth/handlers/token.js";
import { apiTokenAccessValues } from "@rinia/shared";
import { Router, type Request } from "express";
import { z } from "zod";
import { asyncHandler } from "../../middleware/async-handler";
import { requireAuth, requireSession } from "../../middleware/auth.middleware";
import { answerConsent, appBaseUrl, describeConsent, OAUTH_SCOPES, oauthProvider } from "./oauth.service";

/** Where the MCP server lives, which is what OAuth calls the protected resource. */
export const MCP_PATH = "/api/mcp";

/** The protected resource metadata URL for the MCP endpoint, sent in `WWW-Authenticate` so clients can find the sign-in. */
export function resourceMetadataUrl(req: Request) {
    return new URL(`/.well-known/oauth-protected-resource${MCP_PATH}`, appBaseUrl(req)).href;
}

/**
 * The OAuth endpoints MCP clients use to sign someone in (RFC 6749 with PKCE, dynamic registration and revocation). They
 * live under /api/oauth rather than at the root, where /register is the web app's sign-up page.
 */
export const oauthRouter = Router();
oauthRouter.use("/authorize", authorizationHandler({ provider: oauthProvider }));
oauthRouter.use("/token", tokenHandler({ provider: oauthProvider }));
oauthRouter.use("/register", clientRegistrationHandler({ clientsStore: oauthProvider.clientsStore, clientSecretExpirySeconds: 0 }));
oauthRouter.use("/revoke", revocationHandler({ provider: oauthProvider }));

const consentRequestSchema = z.object({
    clientId: z.string().min(1).max(200),
    redirectUri: z.string().url().max(2048),
    codeChallenge: z.string().min(43).max(128),
    state: z.string().max(2048).optional(),
    scope: z.string().max(200).optional(),
    resource: z.string().url().max(2048).optional(),
});

// The consent page runs in a signed-in browser. A token cannot approve an app for itself.
oauthRouter.get(
    "/consent",
    requireAuth,
    requireSession,
    asyncHandler(async (req, res) => {
        res.json(await describeConsent(consentRequestSchema.pick({ clientId: true, redirectUri: true, scope: true }).parse(req.query)));
    }),
);

oauthRouter.post(
    "/consent",
    requireAuth,
    requireSession,
    asyncHandler(async (req, res) => {
        const body = consentRequestSchema.extend({ approve: z.boolean(), access: z.enum(apiTokenAccessValues).optional() }).parse(req.body);
        const { approve, access, ...request } = body;
        res.json(await answerConsent(req.user!.sub, request, { approve, access }));
    }),
);

/**
 * Discovery for MCP clients (RFC 8414 and RFC 9728). In production both documents use APP_URL. Outside production,
 * when it is unset, they name the address the request came in on, so they are built per request.
 */
export const oauthMetadataRouter = Router();

oauthMetadataRouter.use("/oauth-authorization-server", (req, res, next) => {
    const base = appBaseUrl(req);
    const at = (path: string) => new URL(`/api/oauth${path}`, base).href;
    metadataHandler({
        issuer: new URL(base).href,
        authorization_endpoint: at("/authorize"),
        token_endpoint: at("/token"),
        registration_endpoint: at("/register"),
        revocation_endpoint: at("/revoke"),
        response_types_supported: ["code"],
        grant_types_supported: ["authorization_code"],
        code_challenge_methods_supported: ["S256"],
        token_endpoint_auth_methods_supported: ["client_secret_post", "none"],
        revocation_endpoint_auth_methods_supported: ["client_secret_post", "none"],
        scopes_supported: OAUTH_SCOPES,
    })(req, res, next);
});

// Clients look for the resource's own path first and fall back to the root document.
oauthMetadataRouter.use([`/oauth-protected-resource${MCP_PATH}`, "/oauth-protected-resource"], (req, res, next) => {
    const base = appBaseUrl(req);
    metadataHandler({
        resource: new URL(MCP_PATH, base).href,
        authorization_servers: [new URL(base).href],
        scopes_supported: OAUTH_SCOPES,
        resource_name: "Rinia",
        bearer_methods_supported: ["header"],
    })(req, res, next);
});
