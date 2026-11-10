import type { ApiTokenAccess } from "@rinia/shared";
import { boolean, index, pgTable, primaryKey, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { oauthClients } from "./oauth";
import { projects } from "./projects";
import { users } from "./users";

/**
 * Personal tokens for scripts and tools such as the MCP server, and the access tokens OAuth hands to MCP clients.
 * Only a SHA-256 hash of each token is kept.
 */
export const apiTokens = pgTable(
    "api_tokens",
    {
        id: uuid("id").primaryKey().defaultRandom(),
        userId: uuid("user_id")
            .notNull()
            .references(() => users.id, { onDelete: "cascade" }),
        name: text("name").notNull(),
        tokenHash: text("token_hash").notNull().unique(),
        /** The first characters of the token, shown in the list so people can tell their tokens apart. */
        prefix: text("prefix").notNull(),
        access: text("access").$type<ApiTokenAccess>().notNull().default("write"),
        /** The app that got this token by signing in with OAuth; null for a token made by hand. */
        oauthClientId: text("oauth_client_id").references(() => oauthClients.clientId, { onDelete: "cascade" }),
        /** When the token stops working; null for one that never expires. */
        expiresAt: timestamp("expires_at", { withTimezone: true }),
        /**
         * Whether the token is limited to the projects in `api_token_projects`. A flag of its own, because an empty
         * list means "every project": without it, deleting the last project a token was limited to would widen it.
         */
        projectScoped: boolean("project_scoped").notNull().default(false),
        lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
        createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    },
    (table) => [index("api_tokens_user_id_idx").on(table.userId)],
);

/** The projects a project-scoped token may reach. */
export const apiTokenProjects = pgTable(
    "api_token_projects",
    {
        tokenId: uuid("token_id")
            .notNull()
            .references(() => apiTokens.id, { onDelete: "cascade" }),
        projectId: uuid("project_id")
            .notNull()
            .references(() => projects.id, { onDelete: "cascade" }),
    },
    (table) => [primaryKey({ columns: [table.tokenId, table.projectId] }), index("api_token_projects_project_id_idx").on(table.projectId)],
);
