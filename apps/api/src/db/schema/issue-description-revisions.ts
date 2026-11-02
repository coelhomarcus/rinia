import type { ActionSource } from "@rinia/shared";
import { index, integer, jsonb, pgTable, timestamp, uuid, type AnyPgColumn } from "drizzle-orm/pg-core";
import { issues, type TiptapDocument } from "./issues";
import { users } from "./users";

/**
 * A saved version of an issue's description. Edits by the same author within a few minutes update one version
 * instead of adding another. `revision` is the issue's `description_revision` once the version was saved, and
 * `restored_from_id` marks a version that brought back an older one.
 */
export const issueDescriptionRevisions = pgTable(
    "issue_description_revisions",
    {
        id: uuid("id").primaryKey().defaultRandom(),
        issueId: uuid("issue_id")
            .notNull()
            .references(() => issues.id, { onDelete: "cascade" }),
        revision: integer("revision").notNull(),
        authorId: uuid("author_id")
            .notNull()
            .references(() => users.id, { onDelete: "cascade" }),
        contentJson: jsonb("content_json").$type<TiptapDocument>().notNull(),
        restoredFromId: uuid("restored_from_id").references((): AnyPgColumn => issueDescriptionRevisions.id, { onDelete: "set null" }),
        source: jsonb("source").$type<ActionSource>(),
        createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
        updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    },
    (table) => [index("issue_description_revisions_issue_id_created_at_idx").on(table.issueId, table.createdAt)],
);
