import { date, doublePrecision, index, integer, jsonb, pgEnum, pgTable, text, timestamp, uuid, type AnyPgColumn } from "drizzle-orm/pg-core";
import { boardColumns } from "./board-columns";
import { projects } from "./projects";
import { users } from "./users";

export type TiptapDocument = {
    type: "doc";
    content?: Array<Record<string, unknown>>;
};

export const issuePriorityEnum = pgEnum("issue_priority", ["none", "low", "medium", "high", "urgent"]);

export const issues = pgTable(
    "issues",
    {
        id: uuid("id").primaryKey().defaultRandom(),
        projectId: uuid("project_id")
            .notNull()
            .references(() => projects.id, { onDelete: "cascade" }),
        number: integer("number").notNull(),
        columnId: uuid("column_id")
            .notNull()
            .references(() => boardColumns.id, { onDelete: "cascade" }),
        title: text("title").notNull(),
        descriptionJson: jsonb("description_json").$type<TiptapDocument>().notNull(),
        descriptionRevision: integer("description_revision").notNull().default(0),
        assigneeId: uuid("assignee_id").references(() => users.id, { onDelete: "set null" }),
        priority: issuePriorityEnum("priority").notNull().default("medium"),
        createdBy: uuid("created_by")
            .notNull()
            .references(() => users.id),
        position: doublePrecision("position").notNull(),
        parentIssueId: uuid("parent_issue_id").references((): AnyPgColumn => issues.id, { onDelete: "restrict" }),
        estimate: integer("estimate"),
        dueDate: date("due_date", { mode: "string" }),
        createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
        updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
        deletedAt: timestamp("deleted_at", { withTimezone: true }),
    },
    (table) => [
        index("issues_project_id_idx").on(table.projectId),
        index("issues_column_id_idx").on(table.columnId),
        index("issues_assignee_id_idx").on(table.assigneeId),
        index("issues_parent_issue_id_idx").on(table.parentIssueId),
        index("issues_deleted_at_idx").on(table.deletedAt),
    ],
);
