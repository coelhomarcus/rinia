import assert from "node:assert/strict";
import { afterEach, mock, spyOn, test } from "bun:test";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import { createIssueSchema, updateIssueSchema } from "@rinia/shared";
import { db } from "../src/db";
import { stubRole } from "./fixtures/project-membership";
import { issueActivities } from "../src/db/schema";
import { listIssues, updateIssue } from "../src/features/issues/issues.service";

// Stub the database boundary: these tests never connect to or mutate a development database.
afterEach(() => mock.restore());

const ana = "4d2e6f80-0000-4000-8000-000000000001";
const projectId = "4d2e6f80-0000-4000-8000-0000000000aa";
const member = { userId: ana, role: "member" as const };
const issueId = "4d2e6f80-0000-4000-8000-0000000000bb";
const render = (condition: SQL) => new PgDialect().sqlToQuery(condition);

function stubIssue(overrides: Record<string, unknown> = {}) {
    const issue = { id: issueId, projectId, number: 4, columnId: "todo", labels: [], assigneeId: null, descriptionRevision: 3, dueDate: null, project: { id: projectId, name: "Rinia", issueKey: "RIN" }, ...overrides };
    spyOn(db.query.issues, "findFirst").mockImplementation(async () => issue as never);
    return issue;
}

function stubMembership(member: boolean) {
    return stubRole(member ? "member" : null);
}

/** Records every `db.insert(table).values(...)`, by table. */
function stubInserts() {
    const writes = new Map<unknown, Array<Record<string, unknown>>>();
    spyOn(db, "insert").mockImplementation(((table: unknown) => ({
        values: (values: Record<string, unknown>) => {
            writes.set(table, [...(writes.get(table) ?? []), values]);
            return Object.assign(Promise.resolve([]), { onConflictDoNothing: async () => [], returning: async () => [values] });
        },
    })) as never);
    return writes;
}

/** Answers `db.update(...).set(...).where(...).returning()` with the issue as saved. */
function stubUpdates(returned: Record<string, unknown> = {}) {
    spyOn(db, "update").mockImplementation((() => ({
        set: (values: Record<string, unknown>) => ({ where: () => ({ returning: async () => [{ ...returned, ...values }] }) }),
    })) as never);
}

test("due dates are calendar days or null", () => {
    assert.equal(updateIssueSchema.safeParse({ dueDate: "2026-11-03" }).success, true);
    assert.equal(updateIssueSchema.safeParse({ dueDate: null }).success, true);
    assert.equal(createIssueSchema.safeParse({ columnId: issueId, title: "Ship", dueDate: "2028-02-29" }).success, true);
    for (const dueDate of ["2026-02-30", "2026-11-3", "tomorrow", "2026-11-03T10:00:00Z"]) {
        assert.equal(updateIssueSchema.safeParse({ dueDate }).success, false, dueDate);
    }
});

test("changing the due date is recorded in the activity", async () => {
    stubIssue({ dueDate: "2026-11-03" });
    stubMembership(true);
    spyOn(db.query.projects, "findFirst").mockImplementation(async () => ({ issueKey: "RIN" }) as never);
    stubUpdates({ id: issueId, number: 4 });
    const writes = stubInserts();

    await updateIssue(issueId, { dueDate: "2026-11-10" }, ana);
    assert.deepEqual(writes.get(issueActivities), [{ issueId, actorId: ana, type: "due_date_changed", payload: { field: "dueDate", from: "2026-11-03", to: "2026-11-10" } }]);
});

test("ordering by due date puts the soonest first and undated issues last", async () => {
    let orderBy: SQL[] = [];
    spyOn(db.query.issues, "findMany").mockImplementation(((config: { orderBy: SQL[] }) => ((orderBy = config.orderBy), Promise.resolve([]))) as never);
    spyOn(db.query.projects, "findFirst").mockImplementation(async () => ({ issueKey: "RIN" }) as never);
    await listIssues(projectId, { orderBy: "due" }, member);
    assert.match(render(orderBy[0]).sql, /"due_date" asc nulls last/);
});
