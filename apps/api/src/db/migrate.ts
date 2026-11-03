import path from "path";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";
import { sql } from "drizzle-orm";
import { markdownToTiptap, repairLegacyMarkdownTables, type TiptapDocument } from "@rinia/shared";
import { logger } from "../lib/logger";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const db = drizzle(pool);
const log = logger.child({ module: "migrate" });

/** How many migrations the database has recorded; none before the first run creates Drizzle's table. */
async function appliedCount() {
  try {
    const result = await db.execute(sql`SELECT count(*)::int AS count FROM drizzle.__drizzle_migrations`);
    return (result.rows[0] as { count: number }).count;
  } catch {
    return 0;
  }
}

async function main() {
  const startedAt = performance.now();
  const before = await appliedCount();
  // Resolved from cwd (not __dirname) so it works the same in development (bun, cwd=apps/api)
  // and in the production bundle (scripts/build.ts flattens src/db/migrate.ts into dist/migrate.js,
  // which would change __dirname's relative depth); the Dockerfile sets WORKDIR=/app/apps/api.
  await migrate(db, {
    migrationsFolder: path.resolve(process.cwd(), "drizzle"),
  });
  const applied = (await appliedCount()) - before;
  const legacyDescriptions = await migrateLegacyMarkdown();
  const repairedTables = await repairLegacyTables();
  await pool.end();
  log.info(
    { event: "db.migrated", applied, total: before + applied, legacyDescriptions, repairedTables, durationMs: Math.round(performance.now() - startedAt) },
    applied ? `applied ${applied} migration${applied === 1 ? "" : "s"}` : "database already up to date",
  );
}

async function migrateLegacyMarkdown() {
  const legacyIssues = await db.execute(
    sql`SELECT id, description FROM issues WHERE description IS NOT NULL AND description <> '' AND description_json->'content'->0->>'text' = description`,
  );
  for (const row of legacyIssues.rows as Array<{
    id: string;
    description: string;
  }>) {
    await db.execute(
      sql`UPDATE issues SET description_json = ${JSON.stringify(markdownToTiptap(row.description, "description"))}::jsonb WHERE id = ${row.id}`,
    );
  }

  // Existing document JSON is authoritative. Migration 0008 preserves it byte-for-byte
  // at the JSONB value level; do not reconstruct pages from legacy page_content.
  return legacyIssues.rows.length;
}

/**
 * Issue descriptions and comments written through the first MCP server, before Markdown tables were supported,
 * saved each table as a paragraph of pipes. They are rebuilt as tables; rows that are already fine are left alone.
 */
async function repairLegacyTables() {
  let repaired = 0;
  const targets = [
    { table: sql.raw("issues"), column: sql.raw("description_json"), profile: "description" },
    { table: sql.raw("issue_comments"), column: sql.raw("content_json"), profile: "comment" },
  ] as const;
  for (const { table, column, profile } of targets) {
    // Only rows with a pipe can hold a table; the precise check runs in JavaScript.
    const rows = await db.execute(sql`SELECT id, ${column} AS content FROM ${table} WHERE ${column}::text LIKE '%|%'`);
    for (const row of rows.rows as Array<{ id: string; content: TiptapDocument }>) {
      const fixed = repairLegacyMarkdownTables(row.content, profile);
      if (!fixed) continue;
      await db.execute(sql`UPDATE ${table} SET ${column} = ${JSON.stringify(fixed)}::jsonb WHERE id = ${row.id}`);
      repaired += 1;
    }
  }
  return repaired;
}

main().catch((error: unknown) => {
  log.fatal({ event: "db.migrate_failed", err: error }, "migrations failed");
  process.exit(1);
});
