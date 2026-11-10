import assert from "node:assert/strict";
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, describe, spyOn, test } from "bun:test";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";
import { positionAtIndex } from "@rinia/shared";

/**
 * Runs against a real PostgreSQL server. Set TEST_DATABASE_URL to a local server where this user may create
 * databases, for example postgres://postgres:postgres@localhost:5432/postgres. Each run creates a database of
 * its own, works only inside it, and drops it at the end; without the variable these tests are skipped.
 */
const adminUrl = process.env.TEST_DATABASE_URL;
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);
if (adminUrl && !LOCAL_HOSTS.has(new URL(adminUrl).hostname)) throw new Error("TEST_DATABASE_URL must point to a local server");

const MIGRATIONS = path.resolve(import.meta.dir, "../drizzle");
const LABELS_MIGRATION = 23;
const POSITIONS_MIGRATION = 34;
const databaseName = `rinia_test_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
const testUrl = adminUrl ? Object.assign(new URL(adminUrl), { pathname: `/${databaseName}` }).toString() : "";
const admin = adminUrl ? new Pool({ connectionString: adminUrl }) : null;
const direct = adminUrl ? new Pool({ connectionString: testUrl }) : null;

if (admin) {
    await admin.query(`CREATE DATABASE "${databaseName}"`);
    // The app's database module reads DATABASE_URL when first imported, which happens below.
    process.env.DATABASE_URL = testUrl;
    process.env.JWT_SECRET ??= "test-secret";
    process.env.SPECIAL_REGISTRATION_CODE ??= "test-code";
}

afterAll(async () => {
    if (!admin || !direct) return;
    await direct.end();
    const { db } = await import("../src/db");
    await (db.$client as Pool).end();
    await admin.query(`DROP DATABASE IF EXISTS "${databaseName}" WITH (FORCE)`);
    await admin.end();
});

/** A copy of the migrations folder that stops before `idx`, to rebuild the schema as it was. */
function migrationsBefore(idx: number) {
    const folder = mkdtempSync(path.join(tmpdir(), "rinia-migrations-"));
    cpSync(MIGRATIONS, folder, { recursive: true });
    const journalPath = path.join(folder, "meta/_journal.json");
    const journal = JSON.parse(readFileSync(journalPath, "utf8")) as { entries: Array<{ idx: number }> };
    journal.entries = journal.entries.filter((entry) => entry.idx < idx);
    writeFileSync(journalPath, JSON.stringify(journal));
    return folder;
}

const ids = {
    user: "6a4b8c02-0000-4000-8000-000000000001",
    project: "6a4b8c02-0000-4000-8000-000000000002",
    column: "6a4b8c02-0000-4000-8000-000000000003",
    bug: "6a4b8c02-0000-4000-8000-000000000004",
    design: "6a4b8c02-0000-4000-8000-000000000005",
    first: "6a4b8c02-0000-4000-8000-000000000011",
    second: "6a4b8c02-0000-4000-8000-000000000012",
    third: "6a4b8c02-0000-4000-8000-000000000013",
};

describe.skipIf(!adminUrl)("against PostgreSQL", () => {
    test("the labels migration keeps every existing label and removes the old column", async () => {
        const database = drizzle(direct!);
        const before = migrationsBefore(LABELS_MIGRATION);
        try {
            await migrate(database, { migrationsFolder: before });
        } finally {
            rmSync(before, { recursive: true, force: true });
        }

        await direct!.query(`INSERT INTO users (id, name, username, email, password_hash) VALUES ($1, 'Ana', 'ana', 'ana@test.local', 'x')`, [ids.user]);
        await direct!.query(`INSERT INTO projects (id, name, issue_key, created_by) VALUES ($1, 'Rinia', 'RIN', $2)`, [ids.project, ids.user]);
        await direct!.query(`INSERT INTO project_members (project_id, user_id, role) VALUES ($1, $2, 'owner')`, [ids.project, ids.user]);
        await direct!.query(`INSERT INTO board_columns (id, project_id, name, position) VALUES ($1, $2, 'To do', 1000)`, [ids.column, ids.project]);
        await direct!.query(`INSERT INTO categories (id, project_id, name, created_by) VALUES ($1, $3, 'Bug', $4), ($2, $3, 'Design', $4)`, [ids.bug, ids.design, ids.project, ids.user]);
        await direct!.query(
            `INSERT INTO issues (id, project_id, number, column_id, title, description_json, created_by, position, category_id) VALUES
                ($1, $4, 1, $5, 'First', '{"type":"doc","content":[]}', $6, 1000, $7),
                ($2, $4, 2, $5, 'Second', '{"type":"doc","content":[]}', $6, 2000, $8),
                ($3, $4, 3, $5, 'Third', '{"type":"doc","content":[]}', $6, 3000, NULL)`,
            [ids.first, ids.second, ids.third, ids.project, ids.column, ids.user, ids.bug, ids.design],
        );

        await migrate(database, { migrationsFolder: MIGRATIONS });

        const { rows: labels } = await direct!.query(`SELECT issue_id, category_id FROM issue_labels ORDER BY issue_id`);
        assert.deepEqual(labels, [
            { issue_id: ids.first, category_id: ids.bug },
            { issue_id: ids.second, category_id: ids.design },
        ]);
        const { rows: columns } = await direct!.query(`SELECT 1 FROM information_schema.columns WHERE table_name = 'issues' AND column_name = 'category_id'`);
        assert.equal(columns.length, 0);
        const { rows: types } = await direct!.query(`SELECT unnest(enum_range(NULL::issue_activity_type))::text AS type`);
        assert.ok(types.some((row) => row.type === "label_added") && types.some((row) => row.type === "label_removed"));
    });

    test("a bulk change applies to every issue, or to none when a write fails", async () => {
        const { db } = await import("../src/db");
        const { issueActivities } = await import("../src/db/schema");
        const { bulkUpdateIssues } = await import("../src/features/issues/issues.service");
        // Never touch anything but the throwaway database.
        const { rows: [{ name }] } = await (db.$client as Pool).query<{ name: string }>("SELECT current_database() AS name");
        assert.equal(name, databaseName);

        const issueIds = [ids.first, ids.second, ids.third];
        await bulkUpdateIssues(ids.project, { issueIds, patch: { priority: "high", addCategoryIds: [ids.design] } }, ids.user);
        const state = async () =>
            (await direct!.query(
                `SELECT i.id, i.priority, coalesce(array_agg(l.category_id ORDER BY l.category_id) FILTER (WHERE l.category_id IS NOT NULL), '{}') AS labels
                 FROM issues i LEFT JOIN issue_labels l ON l.issue_id = i.id GROUP BY i.id ORDER BY i.id`,
            )).rows;
        const saved = await state();
        assert.deepEqual(saved.map((row) => row.priority), ["high", "high", "high"]);
        assert.deepEqual(saved.map((row) => row.labels), [[ids.bug, ids.design], [ids.design], [ids.design]]);
        const { rows: [{ count }] } = await direct!.query(`SELECT count(*)::int FROM issue_activities WHERE type IN ('priority_changed', 'label_added')`);
        assert.equal(count, 5, "three priority changes and two labels added; the issue that had the label records nothing for it");

        // Make the activity insert fail after the issues and labels were already written inside the transaction.
        const transaction = db.transaction.bind(db);
        const spy = spyOn(db, "transaction").mockImplementation(((work: (tx: unknown) => Promise<unknown>) =>
            transaction((tx) =>
                work(new Proxy(tx, {
                    get(target, property) {
                        if (property === "insert") return (table: unknown) => {
                            if (table === issueActivities) throw new Error("activity write failed");
                            return target.insert(table as never);
                        };
                        const value = Reflect.get(target, property, target);
                        return typeof value === "function" ? value.bind(target) : value;
                    },
                })),
            )) as never);
        await assert.rejects(bulkUpdateIssues(ids.project, { issueIds, patch: { priority: "urgent", removeCategoryIds: [ids.design] } }, ids.user), /activity write failed/);
        spy.mockRestore();
        assert.deepEqual(await state(), saved, "nothing from the failed change was kept");
    });

    test("widening positions keeps each project's order and pulls apart the cards that collided", async () => {
        // A database of its own, still at the float4 schema.
        const name = `${databaseName}_positions`;
        await admin!.query(`CREATE DATABASE "${name}"`);
        const pool = new Pool({ connectionString: Object.assign(new URL(adminUrl!), { pathname: `/${name}` }).toString() });
        try {
            const before = migrationsBefore(POSITIONS_MIGRATION);
            try {
                await migrate(drizzle(pool), { migrationsFolder: before });
            } finally {
                rmSync(before, { recursive: true, force: true });
            }
            const { rows: [{ type: oldType }] } = await pool.query(`SELECT data_type AS type FROM information_schema.columns WHERE table_name = 'issues' AND column_name = 'position'`);
            assert.equal(oldType, "real");

            const one = "6a4b8c02-0000-4000-8000-0000000000a1";
            const two = "6a4b8c02-0000-4000-8000-0000000000a2";
            await pool.query(`INSERT INTO users (id, name, username, email, password_hash) VALUES ($1, 'Ana', 'ana', 'ana@test.local', 'x')`, [ids.user]);
            await pool.query(`INSERT INTO projects (id, name, issue_key, created_by) VALUES ($1, 'One', 'ONE', $3), ($2, 'Two', 'TWO', $3)`, [one, two, ids.user]);
            // Two columns share a position; the older one shows first.
            await pool.query(
                `INSERT INTO board_columns (project_id, name, position, created_at) VALUES
                    ($1, 'Done', 3000, '2026-01-01'), ($1, 'To do', 1000, '2026-01-02'), ($1, 'Doing', 1000, '2026-01-03'), ($2, 'Only', 7, '2026-01-01')`,
                [one, two],
            );
            const columnOf = async (projectId: string) => (await pool.query(`SELECT id FROM board_columns WHERE project_id = $1 ORDER BY created_at DESC LIMIT 1`, [projectId])).rows[0].id;
            // Cards 2 and 3 collided at 1000; card 4 sits one float4 step above them; card 5 went above zero.
            const cards: Array<[string, number, number]> = [[one, 1, 2000], [one, 2, 1000], [one, 3, 1000], [one, 4, 1000.00006103515625], [one, 5, -500], [two, 1, 10], [two, 2, 5]];
            for (const [projectId, number, position] of cards) {
                await pool.query(
                    `INSERT INTO issues (project_id, number, column_id, title, description_json, created_by, position) VALUES ($1, $2, $3, $4, '{"type":"doc","content":[]}', $5, $6)`,
                    [projectId, number, await columnOf(projectId), `Card ${number}`, ids.user, position],
                );
            }
            const issueOrder = async () => (await pool.query(`SELECT p.issue_key, i.number, i.position FROM issues i JOIN projects p ON p.id = i.project_id ORDER BY p.issue_key, i.position, i.number`)).rows;
            const columnOrder = async () => (await pool.query(`SELECT p.issue_key, c.name, c.position FROM board_columns c JOIN projects p ON p.id = c.project_id ORDER BY p.issue_key, c.position, c.created_at, c.id`)).rows;
            const issuesBefore = await issueOrder();
            const columnsBefore = await columnOrder();

            await migrate(drizzle(pool), { migrationsFolder: MIGRATIONS });

            const issuesAfter = await issueOrder();
            assert.deepEqual(issuesAfter.map((row) => `${row.issue_key}-${row.number}`), issuesBefore.map((row) => `${row.issue_key}-${row.number}`), "the order is the one shown before");
            assert.deepEqual(issuesAfter.map((row) => `${row.issue_key}-${row.number}`), ["ONE-5", "ONE-2", "ONE-3", "ONE-4", "ONE-1", "TWO-2", "TWO-1"]);
            assert.deepEqual(issuesAfter.map((row) => row.position), [1000, 2000, 3000, 4000, 5000, 1000, 2000], "each project is spread 1000 apart again");
            const columnsAfter = await columnOrder();
            assert.deepEqual(columnsAfter.map((row) => row.name), columnsBefore.map((row) => row.name));
            assert.deepEqual(columnsAfter.map((row) => `${row.name}:${row.position}`), ["To do:1000", "Doing:2000", "Done:3000", "Only:1000"]);
            const { rows: types } = await pool.query(`SELECT table_name, data_type FROM information_schema.columns WHERE column_name = 'position' AND table_name IN ('issues', 'board_columns') ORDER BY table_name`);
            assert.deepEqual(types.map((row) => row.data_type), ["double precision", "double precision"]);
        } finally {
            await pool.end();
            await admin!.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
        }
    }, 60_000);

    test("dropping a card between the same two cards 1,000 times keeps a strict, distinct order", async () => {
        const { updateIssue } = await import("../src/features/issues/issues.service");
        for (let number = 4; number <= 40; number++) {
            await direct!.query(
                `INSERT INTO issues (project_id, number, column_id, title, description_json, created_by, position) VALUES ($1, $2, $3, $4, '{"type":"doc","content":[]}', $5, $6)`,
                [ids.project, number, ids.column, `Card ${number}`, ids.user, number * 1000],
            );
        }
        const order = async () => (await direct!.query<{ number: number; position: number }>(`SELECT number, position FROM issues WHERE project_id = $1 AND deleted_at IS NULL ORDER BY position, number`, [ids.project])).rows;
        const expected = (await order()).map((row) => row.number);
        const [first, second] = expected;
        const respacedBefore = new Set<number>();
        for (let round = 1; round <= 1000; round++) {
            // Every drop puts the last card right after the first one, the tightest gap there is.
            const moving = expected.pop()!;
            expected.splice(1, 0, moving);
            const siblings = (await order()).filter((row) => row.number !== moving);
            const position = positionAtIndex(siblings, 1);
            const saved = await updateIssue(`RIN-${moving}`, { position }, ids.user);
            const rows = await order();
            assert.deepEqual(rows.map((row) => row.number), expected, `the order after drop ${round}`);
            for (let index = 1; index < rows.length; index++) assert.ok(rows[index - 1].position < rows[index].position, `after drop ${round}, RIN-${rows[index - 1].number} and RIN-${rows[index].number} share a position`);
            assert.equal(saved.position, rows.find((row) => row.number === moving)!.position, "the saved issue reports where it ended up");
            if (saved.position !== position) respacedBefore.add(round);
        }
        assert.equal(expected[0], first);
        assert.ok(respacedBefore.size > 0 && respacedBefore.size <= 40, `the order was spread out again now and then (${respacedBefore.size} times)`);
        assert.ok(expected.indexOf(second) > 0);
    }, 120_000);

    test("reordering columns between the same two 200 times keeps a strict, distinct order", async () => {
        const { updateColumn } = await import("../src/features/columns/columns.service");
        for (const [index, name] of ["Doing", "Review", "Done", "Archived"].entries()) {
            await direct!.query(`INSERT INTO board_columns (project_id, name, position) VALUES ($1, $2, $3)`, [ids.project, name, (index + 2) * 1000]);
        }
        const order = async () => (await direct!.query<{ id: string; position: number }>(`SELECT id, position FROM board_columns WHERE project_id = $1 ORDER BY position, created_at, id`, [ids.project])).rows;
        const expected = (await order()).map((row) => row.id);
        for (let round = 1; round <= 200; round++) {
            const moving = expected.pop()!;
            expected.splice(1, 0, moving);
            const siblings = (await order()).filter((row) => row.id !== moving);
            await updateColumn(ids.project, moving, { position: positionAtIndex(siblings, 1) });
            const rows = await order();
            assert.deepEqual(rows.map((row) => row.id), expected, `the order after move ${round}`);
            for (let index = 1; index < rows.length; index++) assert.ok(rows[index - 1].position < rows[index].position, `after move ${round}, two columns share a position`);
        }
    }, 60_000);

    test("an API token's expiry and project scope hold in the database, and losing every project leaves it reaching none", async () => {
        const { createApiToken, authenticateApiToken } = await import("../src/features/api-tokens/api-tokens.service");
        const now = new Date("2026-11-10T12:00:00Z");
        const second = "6a4b8c02-0000-4000-8000-000000000021";
        await direct!.query(`INSERT INTO projects (id, name, issue_key, created_by) VALUES ($1, 'Mobile', 'MOB', $2)`, [second, ids.user]);
        await direct!.query(`INSERT INTO project_members (project_id, user_id, role) VALUES ($1, $2, 'owner')`, [second, ids.user]);

        const open = await createApiToken(ids.user, { name: "all", access: "write", expiresInDays: null, projectIds: [] }, undefined, now);
        const scoped = await createApiToken(ids.user, { name: "one", access: "read", expiresInDays: 30, projectIds: [ids.project] }, undefined, now);
        assert.equal(open.token.projectIds, null);
        assert.deepEqual(scoped.token.projectIds, [ids.project]);

        assert.equal((await authenticateApiToken(open.secret, now))?.projectIds, null);
        assert.deepEqual((await authenticateApiToken(scoped.secret, now))?.projectIds, [ids.project]);
        // 30 days later the scoped token is gone; the one without an expiry is not.
        const later = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
        assert.equal(await authenticateApiToken(scoped.secret, later), null);
        assert.ok(await authenticateApiToken(open.secret, later));

        // Someone else's project cannot be put in a token's scope.
        await assert.rejects(createApiToken(ids.user, { name: "x", access: "read", expiresInDays: 30, projectIds: ["6a4b8c02-0000-4000-8000-0000000000ff"] }), /belong to/);

        // The project the token was limited to is deleted: it must not turn into a token for every project.
        await direct!.query(`DELETE FROM projects WHERE id = $1`, [ids.project]);
        assert.deepEqual((await authenticateApiToken(scoped.secret, now))?.projectIds, []);
    });

    test("a guest sees only the issues and pages shared with or assigned to them, in every list, search and inbox", async () => {
        const { listIssuePage, listMyIssues } = await import("../src/features/issues/issues.service");
        const { listDocuments } = await import("../src/features/documents/documents.service");
        const { searchWorkspace } = await import("../src/features/search/search.service");
        const { listNotifications } = await import("../src/features/notifications/notifications.service");
        const { assertDocumentAccess, assertIssueAccess } = await import("../src/lib/guest-access");
        const { HttpError } = await import("../src/lib/http-error");
        const { resetRateLimits } = await import("../src/lib/rate-limit");
        const g = {
            project: "6a4b8c02-0000-4000-8000-000000000031",
            guest: "6a4b8c02-0000-4000-8000-000000000032",
            viewer: "6a4b8c02-0000-4000-8000-000000000033",
            column: "6a4b8c02-0000-4000-8000-000000000034",
            shared: "6a4b8c02-0000-4000-8000-000000000035",
            assigned: "6a4b8c02-0000-4000-8000-000000000036",
            hidden: "6a4b8c02-0000-4000-8000-000000000037",
            sharedPage: "6a4b8c02-0000-4000-8000-000000000038",
            hiddenPage: "6a4b8c02-0000-4000-8000-000000000039",
        };
        const doc = (text: string) => JSON.stringify({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text }] }] });
        await direct!.query(`INSERT INTO users (id, name, username, email, password_hash) VALUES ($1, 'Gina', 'gina', 'gina@test.local', 'x'), ($2, 'Vera', 'vera', 'vera@test.local', 'x')`, [g.guest, g.viewer]);
        await direct!.query(`INSERT INTO projects (id, name, issue_key, created_by) VALUES ($1, 'Guests', 'GST', $2)`, [g.project, ids.user]);
        await direct!.query(`INSERT INTO project_members (project_id, user_id, role) VALUES ($1, $2, 'owner'), ($1, $3, 'guest'), ($1, $4, 'viewer')`, [g.project, ids.user, g.guest, g.viewer]);
        await direct!.query(`INSERT INTO board_columns (id, project_id, name, position) VALUES ($1, $2, 'To do', 1000)`, [g.column, g.project]);
        await direct!.query(
            `INSERT INTO issues (id, project_id, number, column_id, title, description_json, created_by, position, assignee_id) VALUES
                ($1, $4, 1, $5, 'Shared roadmap', $6, $7, 1000, NULL),
                ($2, $4, 2, $5, 'Assigned roadmap', $6, $7, 2000, $8),
                ($3, $4, 3, $5, 'Hidden roadmap', $6, $7, 3000, NULL)`,
            [g.shared, g.assigned, g.hidden, g.project, g.column, doc("roadmap"), ids.user, g.guest],
        );
        await direct!.query(
            `INSERT INTO project_documents (id, project_id, title, created_by, content_json) VALUES ($1, $3, 'Shared roadmap page', $4, $5), ($2, $3, 'Hidden roadmap page', $4, $5)`,
            [g.sharedPage, g.hiddenPage, g.project, ids.user, doc("roadmap")],
        );
        await direct!.query(`INSERT INTO project_shares (project_id, user_id, issue_id, document_id) VALUES ($1, $2, $3, NULL), ($1, $2, NULL, $4)`, [g.project, g.guest, g.shared, g.sharedPage]);
        // Left over from when the hidden issue was shared: the guest still follows it and has a notification about it.
        await direct!.query(`INSERT INTO issue_subscriptions (user_id, issue_id) VALUES ($1, $2), ($1, $3)`, [g.guest, g.shared, g.hidden]);
        await direct!.query(`INSERT INTO notifications (user_id, actor_id, type, project_id, issue_id) VALUES ($1, $2, 'commented', $3, $4), ($1, $2, 'commented', $3, $5)`, [g.guest, ids.user, g.project, g.shared, g.hidden]);

        const titles = (rows: Array<{ title: string }>) => rows.map((row) => row.title).sort();
        const guest = { userId: g.guest, role: "guest" as const };
        assert.deepEqual(titles((await listIssuePage(g.project, { orderBy: "position" }, guest)).issues), ["Assigned roadmap", "Shared roadmap"]);
        assert.deepEqual(titles((await listIssuePage(g.project, { orderBy: "position" }, { userId: g.viewer, role: "viewer" })).issues), ["Assigned roadmap", "Hidden roadmap", "Shared roadmap"]);
        assert.deepEqual(titles(await listDocuments(g.project, guest)), ["Shared roadmap page"]);

        resetRateLimits();
        const found = await searchWorkspace(g.guest, "roadmap");
        assert.deepEqual(titles(found.issues), ["Assigned roadmap", "Shared roadmap"]);
        assert.deepEqual(titles(found.documents), ["Shared roadmap page"]);
        assert.deepEqual(titles(await listMyIssues(g.guest, { filter: "following", orderBy: "position" } as never)), ["Shared roadmap"]);
        assert.deepEqual((await listNotifications(g.guest)).map((notification) => notification.issue.title), ["Shared roadmap"]);

        const notFound = (error: unknown) => error instanceof HttpError && error.statusCode === 404;
        const hidden = { id: g.hidden, projectId: g.project, assigneeId: null };
        await assert.rejects(assertIssueAccess(g.guest, hidden), notFound);
        await assert.rejects(assertDocumentAccess(g.guest, g.project, g.hiddenPage), notFound);
        assert.equal(await assertIssueAccess(g.guest, { id: g.shared, projectId: g.project, assigneeId: null }), "guest");
        assert.equal(await assertIssueAccess(g.guest, { id: g.assigned, projectId: g.project, assigneeId: g.guest }), "guest");

        // As a viewer the same person sees the whole project.
        await direct!.query(`UPDATE project_members SET role = 'viewer' WHERE project_id = $1 AND user_id = $2`, [g.project, g.guest]);
        resetRateLimits();
        assert.deepEqual(titles((await searchWorkspace(g.guest, "roadmap")).issues), ["Assigned roadmap", "Hidden roadmap", "Shared roadmap"]);
        assert.equal(await assertIssueAccess(g.guest, hidden), "viewer");
    });
});
