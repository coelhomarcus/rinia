import { index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { users } from "./users";

/**
 * A new email waiting to be confirmed. The account keeps its old address until the link sent to the new one is
 * opened. Only a hash of the token is kept, and each works once.
 */
export const emailChangeTokens = pgTable(
    "email_change_tokens",
    {
        id: uuid("id").primaryKey().defaultRandom(),
        userId: uuid("user_id")
            .notNull()
            .references(() => users.id, { onDelete: "cascade" }),
        newEmail: text("new_email").notNull(),
        tokenHash: text("token_hash").notNull().unique(),
        expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
        usedAt: timestamp("used_at", { withTimezone: true }),
        createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    },
    (table) => [index("email_change_tokens_user_id_idx").on(table.userId)],
);
