import type { ActionSource } from "@rinia/shared";
import { index, jsonb, pgTable, timestamp, uuid, type AnyPgColumn } from "drizzle-orm/pg-core";
import { issues, type TiptapDocument } from "./issues";
import { users } from "./users";

/**
 * A comment on an issue. A reply points at the comment that opened its thread; threads are one level deep, so a
 * reply never has replies of its own. Deleting a comment deletes its replies.
 */
export const issueComments = pgTable(
    "issue_comments",
    {
        id: uuid("id").primaryKey().defaultRandom(),
        issueId: uuid("issue_id")
            .notNull()
            .references(() => issues.id, { onDelete: "cascade" }),
        authorId: uuid("author_id")
            .notNull()
            .references(() => users.id),
        parentCommentId: uuid("parent_comment_id").references((): AnyPgColumn => issueComments.id, { onDelete: "cascade" }),
        contentJson: jsonb("content_json").$type<TiptapDocument>().notNull(),
        source: jsonb("source").$type<ActionSource>(),
        createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
        updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
        deletedAt: timestamp("deleted_at", { withTimezone: true }),
    },
    (table) => [index("issue_comments_parent_comment_id_idx").on(table.parentCommentId), index("issue_comments_deleted_at_idx").on(table.deletedAt)],
);
