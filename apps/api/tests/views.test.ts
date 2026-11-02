import assert from "node:assert/strict";
import { afterEach, mock, spyOn, test } from "bun:test";
import { createViewSchema, duplicateViewSchema, savedViewFiltersSchema, updateViewSchema } from "@rinia/shared";
import { db } from "../src/db";
import { addFavorite, listFavorites } from "../src/features/favorites/favorites.service";
import { deleteView, duplicateView, listViews, restoreView, updateView, type ViewActor } from "../src/features/views/views.service";
import { HttpError } from "../src/lib/http-error";

// Stub the database boundary: these tests never connect to or mutate a development database.
afterEach(() => mock.restore());

const projectId = "5b3c1a90-0000-4000-8000-000000000001";
const viewId = "5b3c1a90-0000-4000-8000-000000000002";
const statusId = "5b3c1a90-0000-4000-8000-000000000003";
const ownerId = "5b3c1a90-0000-4000-8000-0000000000a1";
const memberId = "5b3c1a90-0000-4000-8000-0000000000a2";
const isHttp = (status: number) => (error: unknown) => error instanceof HttpError && error.statusCode === status;

const owner: ViewActor = { userId: ownerId, isProjectOwner: false };
const member: ViewActor = { userId: memberId, isProjectOwner: false };
const projectOwner: ViewActor = { userId: "5b3c1a90-0000-4000-8000-0000000000a3", isProjectOwner: true };

function row(overrides: Record<string, unknown> = {}) {
    return {
        id: viewId,
        projectId,
        ownerId,
        owner: { id: ownerId, name: "Owner" },
        name: "Bugs urgentes",
        shared: false,
        filters: { priority: "urgent", view: "board" },
        createdAt: new Date(0),
        updatedAt: new Date(0),
        deletedAt: null,
        ...overrides,
    };
}

function stubView(value: unknown) {
    return spyOn(db.query.views, "findFirst").mockImplementation((async () => value) as never);
}

/** Records what `db.update(...).set(...)` is asked to write. */
function stubUpdate(returned: unknown[] = [{ id: viewId }]) {
    const sets: Array<Record<string, unknown>> = [];
    spyOn(db, "update").mockImplementation((() => ({ set: (values: Record<string, unknown>) => { sets.push(values); return { where: () => ({ returning: async () => returned, then: (resolve: (value: unknown) => void) => resolve(undefined) }) }; } })) as never);
    return sets;
}

test("a saved view only keeps parameters the issue page understands", () => {
    assert.equal(savedViewFiltersSchema.safeParse({ q: "login", priority: "urgent", status: statusId, group: "none", order: "due", view: "board", scope: "all", due: "overdue" }).success, true);
    assert.equal(savedViewFiltersSchema.safeParse({ priority: "critical" }).success, false);
    assert.equal(savedViewFiltersSchema.safeParse({ status: "not-a-uuid" }).success, false);
    assert.equal(savedViewFiltersSchema.safeParse({ view: "calendar" }).success, false);
    assert.equal(savedViewFiltersSchema.safeParse({ unknown: "x" }).success, false);
    assert.equal(savedViewFiltersSchema.safeParse({ label: `${statusId},${viewId}` }).success, true);
    assert.equal(savedViewFiltersSchema.safeParse({ label: `${statusId},nope` }).success, false);
});

test("views need a name, and an update must change something", () => {
    assert.equal(createViewSchema.parse({ name: "  Mine  ", filters: {} }).name, "Mine");
    assert.equal(createViewSchema.parse({ name: "Mine", filters: {} }).shared, false);
    assert.equal(createViewSchema.safeParse({ name: "   ", filters: {} }).success, false);
    assert.equal(createViewSchema.safeParse({ name: "x".repeat(81), filters: {} }).success, false);
    assert.equal(updateViewSchema.safeParse({}).success, false);
    assert.equal(updateViewSchema.safeParse({ shared: true }).success, true);
    assert.equal(duplicateViewSchema.safeParse({}).success, true);
});

test("members see their own views and the shared ones, with what they may edit", async () => {
    spyOn(db.query.views, "findMany").mockImplementation((async () => [row({ id: "mine", ownerId: memberId }), row({ id: "shared", shared: true })]) as never);
    const listed = await listViews(projectId, member);
    assert.deepEqual(listed.map((view) => [view.id, view.canEdit]), [["mine", true], ["shared", false]]);
    const asProjectOwner = await listViews(projectId, projectOwner);
    assert.deepEqual(asProjectOwner.map((view) => view.canEdit), [false, true]);
});

test("a view whose saved filters no longer parse opens unfiltered", async () => {
    spyOn(db.query.views, "findMany").mockImplementation((async () => [row({ filters: { priority: "retired" } })]) as never);
    assert.deepEqual((await listViews(projectId, owner))[0].filters, {});
});

test("someone else's private view cannot be found, changed, duplicated, or deleted", async () => {
    stubView(row());
    const write = spyOn(db, "update").mockImplementation(() => { throw new Error("Must not update"); });
    const insert = spyOn(db, "insert").mockImplementation(() => { throw new Error("Must not insert"); });
    await assert.rejects(updateView(projectId, viewId, member, { name: "Mine now" }), isHttp(404));
    await assert.rejects(duplicateView(projectId, viewId, member, {}), isHttp(404));
    await assert.rejects(deleteView(projectId, viewId, projectOwner), isHttp(404));
    assert.equal(write.mock.calls.length + insert.mock.calls.length, 0);
});

test("a shared view is edited by its owner and the project owner, not other members", async () => {
    stubView(row({ shared: true }));
    const sets = stubUpdate();
    await assert.rejects(updateView(projectId, viewId, member, { name: "Hijacked" }), isHttp(403));
    await assert.rejects(deleteView(projectId, viewId, member), isHttp(403));
    assert.equal(sets.length, 0);

    await updateView(projectId, viewId, projectOwner, { name: "Renamed" });
    assert.equal(sets[0].name, "Renamed");
    assert.equal("shared" in sets[0], false);
});

test("only the owner decides who sees a view", async () => {
    stubView(row({ shared: true }));
    const sets = stubUpdate();
    await assert.rejects(updateView(projectId, viewId, projectOwner, { shared: false }), isHttp(403));
    assert.equal(sets.length, 0);
    await updateView(projectId, viewId, owner, { shared: false });
    assert.equal(sets[0].shared, false);
});

test("duplicating makes a private copy owned by the person who duplicated it", async () => {
    stubView(row({ shared: true, name: "Shared bugs" }));
    const inserted: Array<Record<string, unknown>> = [];
    spyOn(db, "insert").mockImplementation((() => ({ values: (values: Record<string, unknown>) => { inserted.push(values); return { returning: async () => [{ id: viewId }] }; } })) as never);
    await duplicateView(projectId, viewId, member, {});
    assert.equal(inserted.length, 1);
    assert.equal(inserted[0].ownerId, memberId);
    assert.equal(inserted[0].shared, false);
    assert.equal(inserted[0].name, "Shared bugs (copy)");
    assert.deepEqual(inserted[0].filters, { priority: "urgent", view: "board" });
});

test("a long name still fits after the copy suffix", async () => {
    stubView(row({ name: "n".repeat(80) }));
    const inserted: Array<Record<string, unknown>> = [];
    spyOn(db, "insert").mockImplementation((() => ({ values: (values: Record<string, unknown>) => { inserted.push(values); return { returning: async () => [{ id: viewId }] }; } })) as never);
    await duplicateView(projectId, viewId, owner, {});
    assert.equal((inserted[0].name as string).length, 80);
    assert.ok((inserted[0].name as string).endsWith(" (copy)"));
});

test("a deleted view can be restored only inside the undo window", async () => {
    const stale = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
    const write = spyOn(db, "update").mockImplementation(() => { throw new Error("Must not update"); });
    await assert.rejects(restoreView(projectId, viewId, owner, stale), isHttp(404));
    assert.equal(write.mock.calls.length, 0);

    const deletedAt = new Date();
    stubView(row({ deletedAt }));
    write.mockRestore();
    const sets = stubUpdate();
    assert.deepEqual(await restoreView(projectId, viewId, owner, deletedAt), { restored: true });
    assert.equal(sets[0].deletedAt, null);
});

test("a view can be favorited by anyone who can see it, and only them", async () => {
    spyOn(db.query.projectMembers, "findFirst").mockImplementation((async () => ({ role: "member" })) as never);
    const insert = spyOn(db, "insert").mockImplementation(() => { throw new Error("Must not insert"); });
    spyOn(db.query.views, "findFirst").mockImplementation((async () => undefined) as never);
    await assert.rejects(addFavorite(memberId, { kind: "view", projectId, viewId }), isHttp(404));
    spyOn(db.query.views, "findFirst").mockImplementation((async () => ({ shared: false, ownerId })) as never);
    await assert.rejects(addFavorite(memberId, { kind: "view", projectId, viewId }), isHttp(404));
    assert.equal(insert.mock.calls.length, 0);
});

test("a favorited view disappears when it is deleted or made private by its owner", async () => {
    const favorite = (id: string, view: Record<string, unknown>) => ({ id, kind: "view", projectId, documentId: null, issueId: null, viewId, createdAt: new Date(), project: { id: projectId, name: "P", issueKey: "KEY", icon: null, iconAppearance: null }, document: null, issue: null, view: { id: viewId, name: "V", ...view } });
    spyOn(db.query.favorites, "findMany").mockImplementation((async () => [
        favorite("shared", { shared: true, ownerId, deletedAt: null }),
        favorite("deleted", { shared: true, ownerId, deletedAt: new Date() }),
        favorite("private", { shared: false, ownerId, deletedAt: null }),
        favorite("own", { shared: false, ownerId: memberId, deletedAt: null }),
    ]) as never);
    spyOn(db.query.projectMembers, "findMany").mockImplementation((async () => [{ projectId }]) as never);
    assert.deepEqual((await listFavorites(memberId)).map((item) => item.id), ["shared", "own"]);
});
