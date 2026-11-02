import {
  customType,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { projects } from "./projects";
import { users } from "./users";
import type { TiptapDocument } from "./issues";
import type { ActionSource, EntityIcon } from "@rinia/shared";

const bytea = customType<{ data: Uint8Array; driverData: Buffer }>({
  dataType: () => "bytea",
  toDriver: (value) => Buffer.from(value),
  fromDriver: (value) => new Uint8Array(value),
});

export const projectDocuments = pgTable(
  "project_documents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    title: text("title").notNull().default("Untitled"),
    iconAppearance: jsonb("icon_appearance").$type<EntityIcon | null>(),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    /** The tool that created the page, when it was not made in the web app. */
    source: jsonb("source").$type<ActionSource>(),
    revision: integer("revision").notNull().default(1),
    /** A snapshot of the page as Tiptap JSON, rewritten from `yjsState` whenever people edit it. */
    contentJson: jsonb("content_json").$type<TiptapDocument>().notNull(),
    /** The collaborative Yjs document, which is the source of truth for the content. Null until the page is first opened for editing. */
    yjsState: bytea("yjs_state"),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => ({
    projectCreated: index("project_documents_project_created_idx").on(
      table.projectId,
      table.createdAt,
      table.id,
    ),
      deletedAt: index("project_documents_deleted_at_idx").on(table.deletedAt),
  }),
);
