import { projectRoleValues } from "@rinia/shared";
import { pgEnum, pgTable, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import { projects } from "./projects";
import { users } from "./users";

/** What each role may do is in `projectPermissions` in @rinia/shared. */
export const projectRoleEnum = pgEnum("project_role", projectRoleValues);

export const projectMembers = pgTable(
    "project_members",
    {
        id: uuid("id").primaryKey().defaultRandom(),
        projectId: uuid("project_id")
            .notNull()
            .references(() => projects.id, { onDelete: "cascade" }),
        userId: uuid("user_id")
            .notNull()
            .references(() => users.id, { onDelete: "cascade" }),
        role: projectRoleEnum("role").notNull().default("member"),
        joinedAt: timestamp("joined_at", { withTimezone: true }).notNull().defaultNow(),
    },
    (table) => [unique().on(table.projectId, table.userId)],
);
