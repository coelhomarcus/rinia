import { z } from "zod";

/** Every API token starts with this, so a leaked one is easy to recognize and search for. */
export const API_TOKEN_PREFIX = "rinia_";

/** What a token may do: `read` only looks, `write` can also change things. OAuth scopes use the same names. */
export const apiTokenAccessValues = ["read", "write"] as const;
export type ApiTokenAccess = (typeof apiTokenAccessValues)[number];

export const createApiTokenSchema = z.object({ name: z.string().trim().min(1).max(80), access: z.enum(apiTokenAccessValues).default("write") }).strict();
export type CreateApiTokenInput = z.infer<typeof createApiTokenSchema>;
