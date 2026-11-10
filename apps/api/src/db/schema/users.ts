import { boolean, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

export const users = pgTable("users", {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    username: text("username").notNull().unique(),
    email: text("email").notNull().unique(),
    passwordHash: text("password_hash").notNull(),
    avatarUrl: text("avatar_url"),
    locale: text("locale").notNull().default("pt-BR"),
    isAdmin: boolean("is_admin").notNull().default(false),
    /** Set while a site admin has suspended the account: it cannot sign in, and its sessions and API tokens stop working. */
    suspendedAt: timestamp("suspended_at", { withTimezone: true }),
    /** Sessions issued before this moment no longer work. Set when an admin signs the person out everywhere. */
    sessionsRevokedAt: timestamp("sessions_revoked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
