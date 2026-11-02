import type { ApiTokenAccess } from "@rinia/shared";
import type { OAuthClientInformationFull } from "@modelcontextprotocol/sdk/shared/auth.js";
import { index, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { users } from "./users";

/** MCP clients that registered themselves (OAuth dynamic client registration), as the registration returned them. */
export const oauthClients = pgTable("oauth_clients", {
    clientId: text("client_id").primaryKey(),
    info: jsonb("info").$type<OAuthClientInformationFull>().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Authorization codes waiting to be exchanged for a token. Each is used once and lives for minutes; only its hash is kept. */
export const oauthCodes = pgTable(
    "oauth_codes",
    {
        codeHash: text("code_hash").primaryKey(),
        clientId: text("client_id")
            .notNull()
            .references(() => oauthClients.clientId, { onDelete: "cascade" }),
        userId: uuid("user_id")
            .notNull()
            .references(() => users.id, { onDelete: "cascade" }),
        codeChallenge: text("code_challenge").notNull(),
        redirectUri: text("redirect_uri").notNull(),
        access: text("access").$type<ApiTokenAccess>().notNull(),
        resource: text("resource"),
        expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
        createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    },
    (table) => [index("oauth_codes_expires_at_idx").on(table.expiresAt)],
);
