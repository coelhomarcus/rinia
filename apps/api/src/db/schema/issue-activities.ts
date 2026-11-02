import type { ActionSource } from "@rinia/shared";
import { jsonb, pgEnum, pgTable, timestamp, uuid } from "drizzle-orm/pg-core";
import { issues } from "./issues";
import { users } from "./users";

export const issueActivityTypeEnum = pgEnum("issue_activity_type", [
    "created",
    "status_changed",
    "priority_changed",
    "assignee_changed",
    "category_changed",
    "cycle_changed",
    "estimate_changed",
    "due_date_changed",
    "parent_changed",
    "relation_added",
    "relation_removed",
    "label_added",
    "label_removed",
]);

export const issueActivities = pgTable("issue_activities", {
    id: uuid("id").primaryKey().defaultRandom(),
    issueId: uuid("issue_id")
        .notNull()
        .references(() => issues.id, { onDelete: "cascade" }),
    actorId: uuid("actor_id")
        .notNull()
        .references(() => users.id),
    type: issueActivityTypeEnum("type").notNull(),
    /** Set when the change came through a tool such as MCP rather than the web app. */
    source: jsonb("source").$type<ActionSource>(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
