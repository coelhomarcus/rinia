/**
 * Fails when the migrations, the latest snapshot in drizzle/meta, and the schema in src/db/schema disagree.
 *
 * 1. The snapshot of the latest migration must exist and match the schema, so `bun run db:generate` with no
 *    schema change writes nothing. A hand-written migration that skips its snapshot fails here.
 * 2. A database built by the migrations must match one that `drizzle-kit push` builds from the schema. Both start
 *    empty on the server in DATABASE_URL and are dropped afterwards. A migration that adds what the schema does not
 *    describe, or the other way round, fails here.
 *
 * Needs a local PostgreSQL: DATABASE_URL names the server, and the database in it is only used to connect.
 */
import path from "path";
import { generateDrizzleJson, generateMigration, type DrizzleSnapshotJSON } from "drizzle-kit/api";
import { Client } from "pg";
import { assertDevelopmentDatabase } from "../src/db/dev-guard";
import * as schema from "../src/db/schema";

/** In the database on purpose but left out of the schema, each with the reason. */
const KNOWN_DIFFERENCES: Record<string, string> = {
  // Markdown descriptions from before 0007. src/db/migrate.ts still converts them on start, and keeping the column
  // out of the schema keeps it out of every issue the API returns.
  "column issues.description text": "legacy Markdown description",
};

const apiDir = path.resolve(import.meta.dir, "..");
const migrationsDir = path.join(apiDir, "drizzle");

assertDevelopmentDatabase("check the schema for drift");
const serverUrl = process.env.DATABASE_URL!;

let failed = false;
function fail(title: string, lines: string[]) {
  failed = true;
  console.error(`\n✗ ${title}`);
  for (const line of lines) console.error(`  ${line}`);
}

async function checkSnapshot() {
  const journal = (await Bun.file(path.join(migrationsDir, "meta/_journal.json")).json()) as { entries: Array<{ idx: number; tag: string }> };
  const latest = journal.entries.at(-1)!;
  const prefix = latest.tag.split("_")[0];
  const snapshotFile = Bun.file(path.join(migrationsDir, "meta", `${prefix}_snapshot.json`));
  if (!(await snapshotFile.exists())) {
    fail(`drizzle/meta has no snapshot for the latest migration, ${latest.tag}.`, [
      "drizzle-kit generate diffs the schema against the latest snapshot, so the next migration would redo older ones.",
      `Add drizzle/meta/${prefix}_snapshot.json; see "Database migrations" in AGENTS.md.`,
    ]);
    return;
  }
  const snapshot = (await snapshotFile.json()) as DrizzleSnapshotJSON;
  const statements = await generateMigration(snapshot, generateDrizzleJson(schema, snapshot.prevId));
  if (statements.length) {
    fail(`drizzle/meta/${prefix}_snapshot.json does not match src/db/schema. drizzle-kit generate would write:`, statements);
  } else {
    console.log(`✓ drizzle/meta/${prefix}_snapshot.json matches src/db/schema`);
  }
}

function databaseUrl(name: string) {
  const url = new URL(serverUrl);
  url.pathname = `/${name}`;
  return url.toString();
}

async function run(command: string[], env: Record<string, string>) {
  const child = Bun.spawn(command, { cwd: apiDir, env: { ...process.env, ...env }, stdin: "ignore", stdout: "pipe", stderr: "pipe" });
  // drizzle-kit asks before anything it cannot decide alone; on an empty database it never should, so a wait means trouble.
  const timer = setTimeout(() => child.kill(), 120_000);
  const [stdout, stderr, code] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited]);
  clearTimeout(timer);
  if (code !== 0) throw new Error(`${command.join(" ")} exited with ${code}\n${stdout}\n${stderr}`);
}

/** Every column, constraint, index and enum in the public schema, one line each, independent of creation order. */
async function describe(url: string) {
  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    const { rows } = await client.query<{ line: string }>(`
      SELECT format('column %s.%s %s%s%s', c.relname, a.attname, format_type(a.atttypid, a.atttypmod),
                    CASE WHEN a.attnotnull THEN ' not null' ELSE '' END,
                    coalesce(' default ' || pg_get_expr(d.adbin, d.adrelid), '')) AS line
      FROM pg_attribute a
      JOIN pg_class c ON c.oid = a.attrelid AND c.relkind = 'r'
      JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'public'
      LEFT JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
      WHERE a.attnum > 0 AND NOT a.attisdropped
      UNION ALL
      SELECT format('constraint %s.%s %s', c.relname, con.conname, pg_get_constraintdef(con.oid))
      FROM pg_constraint con
      JOIN pg_class c ON c.oid = con.conrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'public'
      UNION ALL
      SELECT format('index %s', indexdef) FROM pg_indexes WHERE schemaname = 'public'
      UNION ALL
      SELECT format('enum %s (%s)', t.typname, string_agg(e.enumlabel, ', ' ORDER BY e.enumsortorder))
      FROM pg_type t
      JOIN pg_enum e ON e.enumtypid = t.oid
      JOIN pg_namespace n ON n.oid = t.typnamespace AND n.nspname = 'public'
      GROUP BY t.typname
    `);
    return new Set(rows.map((row) => row.line));
  } finally {
    await client.end();
  }
}

async function checkMigrations() {
  const suffix = `${process.pid}_${Date.now()}`;
  const migrated = `rinia_drift_migrated_${suffix}`;
  const pushed = `rinia_drift_pushed_${suffix}`;
  const admin = new Client({ connectionString: serverUrl });
  await admin.connect();
  try {
    await admin.query(`CREATE DATABASE "${migrated}"`);
    await admin.query(`CREATE DATABASE "${pushed}"`);
    await run(["bun", "src/db/migrate.ts"], { DATABASE_URL: databaseUrl(migrated), LOG_LEVEL: "silent" });
    await run(["bun", "--bun", "drizzle-kit", "push", "--force"], { DATABASE_URL: databaseUrl(pushed) });

    const [fromMigrations, fromSchema] = await Promise.all([describe(databaseUrl(migrated)), describe(databaseUrl(pushed))]);
    const known = new Set(Object.keys(KNOWN_DIFFERENCES));
    const onlyMigrations = [...fromMigrations].filter((line) => !fromSchema.has(line) && !known.has(line)).sort();
    const onlySchema = [...fromSchema].filter((line) => !fromMigrations.has(line)).sort();
    const staleKnown = [...known].filter((line) => !fromMigrations.has(line) || fromSchema.has(line));
    if (onlyMigrations.length || onlySchema.length) {
      fail("The database the migrations build does not match src/db/schema.", [
        ...onlyMigrations.map((line) => `- migrations only: ${line}`),
        ...onlySchema.map((line) => `+ schema only:     ${line}`),
        "Fix the schema or add a migration, then update the latest snapshot.",
      ]);
    } else if (staleKnown.length) {
      fail("KNOWN_DIFFERENCES in scripts/check-schema-drift.ts lists differences that are gone:", staleKnown);
    } else {
      console.log("✓ the migrated database matches src/db/schema");
    }
  } finally {
    await admin.query(`DROP DATABASE IF EXISTS "${migrated}" WITH (FORCE)`);
    await admin.query(`DROP DATABASE IF EXISTS "${pushed}" WITH (FORCE)`);
    await admin.end();
  }
}

await checkSnapshot();
await checkMigrations();
if (failed) process.exit(1);
