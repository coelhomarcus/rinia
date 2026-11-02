import assert from "node:assert/strict";
import { afterEach, mock, spyOn, test } from "bun:test";
import { createFavoriteSchema } from "@rinia/shared";
import { db } from "../src/db";
import { addFavorite, listFavorites, removeFavorite } from "../src/features/favorites/favorites.service";
import { HttpError } from "../src/lib/http-error";

// Stub the database boundary: these tests never connect to or mutate a development database.
afterEach(() => mock.restore());

const projectId = "6f1d2c3b-0000-4000-8000-000000000001";
const otherProjectId = "6f1d2c3b-0000-4000-8000-000000000002";
const documentId = "6f1d2c3b-0000-4000-8000-000000000003";
const isHttp = (status: number) => (error: unknown) => error instanceof HttpError && error.statusCode === status;

function row(id: string, project: string) {
    return { id, kind: "project", projectId: project, documentId: null, issueId: null, createdAt: new Date(), project: { id: project, name: id, issueKey: "KEY", icon: null, iconAppearance: null }, document: null, issue: null };
}

test("favorite targets must name the document or issue they point at", () => {
    assert.equal(createFavoriteSchema.safeParse({ kind: "project", projectId }).success, true);
    assert.equal(createFavoriteSchema.safeParse({ kind: "document", projectId }).success, false);
    assert.equal(createFavoriteSchema.safeParse({ kind: "issue", projectId, issueId: "not-a-uuid" }).success, false);
    assert.equal(createFavoriteSchema.safeParse({ kind: "view", projectId }).success, false);
});

test("non-members cannot favorite something in a project", async () => {
    spyOn(db.query.projectMembers, "findFirst").mockImplementation(async () => undefined);
    const insert = spyOn(db, "insert").mockImplementation(() => { throw new Error("Must not insert"); });
    await assert.rejects(addFavorite("user", { kind: "project", projectId }), isHttp(403));
    assert.equal(insert.mock.calls.length, 0);
});

test("a document from another project cannot be favorited under this one", async () => {
    spyOn(db.query.projectMembers, "findFirst").mockImplementation(async () => ({ role: "member" }) as never);
    spyOn(db.query.projectDocuments, "findFirst").mockImplementation(async () => undefined);
    const insert = spyOn(db, "insert").mockImplementation(() => { throw new Error("Must not insert"); });
    await assert.rejects(addFavorite("user", { kind: "document", projectId, documentId }), isHttp(404));
    assert.equal(insert.mock.calls.length, 0);
});

test("favorites in projects the user has left are hidden", async () => {
    spyOn(db.query.favorites, "findMany").mockImplementation(async () => [row("kept", projectId), row("left", otherProjectId)] as never);
    spyOn(db.query.projectMembers, "findMany").mockImplementation(async () => [{ projectId }] as never);
    assert.deepEqual((await listFavorites("user")).map((favorite) => favorite.id), ["kept"]);
});

test("removing someone else's favorite reports it as missing", async () => {
    spyOn(db, "delete").mockImplementation(() => ({ where: () => ({ returning: async () => [] }) }) as never);
    await assert.rejects(removeFavorite("user", "favorite"), isHttp(404));
});
