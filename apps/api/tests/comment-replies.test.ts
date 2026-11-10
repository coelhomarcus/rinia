import assert from "node:assert/strict";
import { afterEach, mock, spyOn, test } from "bun:test";
import { PgSelectBase } from "drizzle-orm/pg-core";
import { db } from "../src/db";
import { issueComments, notifications } from "../src/db/schema";
import { createIssueComment } from "../src/features/issues/issues.service";
import { planIssueChange } from "../src/features/notifications/notifications.service";
import { HttpError } from "../src/lib/http-error";

// Stub the database boundary: these tests never connect to or mutate a development database.
afterEach(() => mock.restore());

const ana = "7b5c9d13-0000-4000-8000-000000000001";
const bruno = "7b5c9d13-0000-4000-8000-000000000002";
const carla = "7b5c9d13-0000-4000-8000-000000000003";
const dani = "7b5c9d13-0000-4000-8000-000000000004";
const projectId = "7b5c9d13-0000-4000-8000-0000000000aa";
const issueId = "7b5c9d13-0000-4000-8000-0000000000bb";
const thread = "7b5c9d13-0000-4000-8000-0000000000c1";
const earlierReply = "7b5c9d13-0000-4000-8000-0000000000c2";
const newReply = "7b5c9d13-0000-4000-8000-0000000000c3";
const isHttp = (status: number) => (error: unknown) => error instanceof HttpError && error.statusCode === status;
const doc = (...inline: Array<Record<string, unknown>>) => ({ type: "doc" as const, content: [{ type: "paragraph", content: inline }] });

function stubIssue() {
    spyOn(db.query.issues, "findFirst").mockImplementation(async () => ({ id: issueId, projectId, number: 1, labels: [], project: { id: projectId, name: "Rinia", issueKey: "RIN" } }) as never);
}

/** The rows each select returns, in order. The first is the caller's membership, which every comment checks. */
function stubSelects(...answers: unknown[][]) {
    const queue = [[{ issueKey: "RIN", membership: { id: "membership", role: "member" } }], ...answers];
    spyOn(PgSelectBase.prototype, "_prepare").mockImplementation(() => ({ execute: async () => queue.shift() ?? [] }) as never);
}

/** Records every insert, by table. */
function stubInserts() {
    const writes = new Map<unknown, Array<Record<string, unknown>>>();
    spyOn(db, "insert").mockImplementation(((table: unknown) => ({
        values: (values: Record<string, unknown> | Array<Record<string, unknown>>) => {
            const rows = Array.isArray(values) ? values : [values];
            writes.set(table, [...(writes.get(table) ?? []), ...rows]);
            return Object.assign(Promise.resolve([]), { onConflictDoNothing: async () => [], returning: async () => [{ ...rows[0], id: newReply }] });
        },
    })) as never);
    return writes;
}

test("a reply notifies everyone in the thread, followers hear about it as a comment, and the author hears nothing", () => {
    const plan = planIssueChange(
        { actorId: ana, comment: { id: newReply, created: true }, threadParticipantIds: [bruno, ana, carla], mentionedIds: [carla] },
        [ana, bruno, dani],
        new Set([ana, bruno, carla, dani]),
    );
    assert.deepEqual(Object.fromEntries(plan.notifications.map((item) => [item.userId, item.type])), { [carla]: "mentioned", [bruno]: "replied", [dani]: "commented" });
    assert.ok(plan.notifications.every((item) => item.commentId === newReply));
});

test("replying to a reply joins the thread it belongs to", async () => {
    stubIssue();
    spyOn(db.query.issueComments, "findFirst")
        .mockImplementationOnce(async () => ({ id: earlierReply, parentCommentId: thread }) as never)
        .mockImplementation(async () => ({ id: newReply, parentCommentId: thread, author: { id: ana } }) as never);
    spyOn(db.query.issueComments, "findMany").mockImplementation(async () => [{ authorId: bruno }, { authorId: carla }, { authorId: bruno }] as never);
    // Followers of the issue: nobody; who can see the issue: everyone involved.
    stubSelects([], [ana, bruno, carla].map((id) => ({ id, role: "member", assigneeId: null, shareId: null })));
    const writes = stubInserts();

    const reply = await createIssueComment(issueId, { contentJson: doc({ type: "text", text: "Agreed" }), parentCommentId: earlierReply }, ana);
    assert.equal(reply?.parentCommentId, thread);
    assert.equal(writes.get(issueComments)?.[0].parentCommentId, thread);
    assert.deepEqual(writes.get(notifications)?.map((row) => [row.userId, row.type]), [[bruno, "replied"], [carla, "replied"]]);
});

test("a reply to a comment from another issue is refused", async () => {
    stubIssue();
    spyOn(db.query.issueComments, "findFirst").mockImplementation(async () => undefined);
    stubSelects();
    const writes = stubInserts();
    await assert.rejects(createIssueComment(issueId, { contentJson: doc({ type: "text", text: "Hi" }), parentCommentId: thread }, ana), isHttp(404));
    assert.equal(writes.size, 0);
});

test("comments without a parent still open their own thread", async () => {
    stubIssue();
    spyOn(db.query.issueComments, "findFirst").mockImplementation(async () => ({ id: newReply, parentCommentId: null }) as never);
    const findMany = spyOn(db.query.issueComments, "findMany");
    stubSelects();
    const writes = stubInserts();
    await createIssueComment(issueId, { contentJson: doc({ type: "text", text: "New thread" }) }, ana);
    assert.equal(writes.get(issueComments)?.[0].parentCommentId, null);
    assert.equal(findMany.mock.calls.length, 0, "no thread to look up");
});
