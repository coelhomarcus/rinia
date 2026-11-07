import { index, integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { issues } from "./issues";
import { projects } from "./projects";
import { users } from "./users";

/**
 * One uploaded file. The bytes live on disk under `UPLOAD_DIR`, named by this id alone,
 * so a client filename can never choose a path. Deleting an issue leaves the bytes in place.
 */
export const files = pgTable(
    "files",
    {
        id: uuid("id").primaryKey().defaultRandom(),
        projectId: uuid("project_id")
            .notNull()
            .references(() => projects.id, { onDelete: "cascade" }),
        issueId: uuid("issue_id").references(() => issues.id, { onDelete: "set null" }),
        uploadedBy: uuid("uploaded_by")
            .notNull()
            .references(() => users.id),
        filename: text("filename").notNull(),
        contentType: text("content_type").notNull(),
        byteSize: integer("byte_size").notNull(),
        createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    },
    (table) => [index("files_project_id_idx").on(table.projectId), index("files_issue_id_idx").on(table.issueId)],
);
