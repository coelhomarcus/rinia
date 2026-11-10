import { z } from "zod";

/** Every API token starts with this, so a leaked one is easy to recognize and search for. */
export const API_TOKEN_PREFIX = "rinia_";

/** What a token may do: `read` only looks, `write` can also change things. OAuth scopes use the same names. */
export const apiTokenAccessValues = ["read", "write"] as const;
export type ApiTokenAccess = (typeof apiTokenAccessValues)[number];

/** How long a new token lives, in days. `null` asks for a token that never expires. */
export const API_TOKEN_EXPIRY_DAYS = [30, 90, 365] as const;
export type ApiTokenExpiryDays = (typeof API_TOKEN_EXPIRY_DAYS)[number];
/** What a token gets when nothing is asked, and what OAuth hands to MCP clients. */
export const DEFAULT_API_TOKEN_EXPIRY_DAYS: ApiTokenExpiryDays = 90;
/** More projects than anyone belongs to; a token that should reach more is better left unscoped. */
export const MAX_API_TOKEN_PROJECTS = 50;

export const createApiTokenSchema = z
    .object({
        name: z.string().trim().min(1).max(80),
        access: z.enum(apiTokenAccessValues).default("write"),
        expiresInDays: z.union([z.literal(30), z.literal(90), z.literal(365), z.null()]).default(DEFAULT_API_TOKEN_EXPIRY_DAYS),
        /** The projects the token may reach. Empty means every project its owner belongs to. */
        projectIds: z
            .array(z.string().uuid())
            .max(MAX_API_TOKEN_PROJECTS)
            .default([])
            .transform((ids) => [...new Set(ids)]),
    })
    .strict();
export type CreateApiTokenInput = z.infer<typeof createApiTokenSchema>;
