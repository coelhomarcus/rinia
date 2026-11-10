import { sql } from "drizzle-orm";
import { check, index, pgTable, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import { issues } from "./issues";
import { projectDocuments } from "./project-documents";
import { projects } from "./projects";
import { users } from "./users";

/**
 * One issue or page shared with a guest of the project. Guests see nothing else, apart from the issues assigned to
 * them. A share outlives a change of role but grants nothing to anyone who is no longer a guest.
 */
export const projectShares = pgTable(
    "project_shares",
    {
        id: uuid("id").primaryKey().defaultRandom(),
        projectId: uuid("project_id")
            .notNull()
            .references(() => projects.id, { onDelete: "cascade" }),
        userId: uuid("user_id")
            .notNull()
            .references(() => users.id, { onDelete: "cascade" }),
        issueId: uuid("issue_id").references(() => issues.id, { onDelete: "cascade" }),
        documentId: uuid("document_id").references(() => projectDocuments.id, { onDelete: "cascade" }),
        sharedBy: uuid("shared_by").references(() => users.id, { onDelete: "set null" }),
        createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    },
    (table) => [
        check("project_shares_one_target", sql`(${table.issueId} is null) <> (${table.documentId} is null)`),
        unique("project_shares_issue_unique").on(table.userId, table.issueId),
        unique("project_shares_document_unique").on(table.userId, table.documentId),
        index("project_shares_project_user_idx").on(table.projectId, table.userId),
    ],
);
