import assert from "node:assert/strict";
import { afterEach, mock, spyOn, test } from "bun:test";
import { createDocumentSchema, updateDocumentSchema } from "@rinia/shared";
import { db } from "../src/db";
import { projectDocuments, projectMembers } from "../src/db/schema";
import {
  deleteDocument,
  getDocument,
  updateDocument,
} from "../src/features/documents/documents.service";
import { HttpError } from "../src/lib/http-error";

afterEach(() => mock.restore());

const projectId = "11111111-1111-4111-8111-111111111111";
const documentId = "22222222-2222-4222-8222-222222222222";
const authorId = "33333333-3333-4333-8333-333333333333";
const otherId = "44444444-4444-4444-8444-444444444444";
const legacy = {
  type: "doc" as const,
  content: [
    {
      type: "paragraph",
      content: [{ type: "text", text: "Keep every existing node." }],
    },
  ],
};
const page = {
  id: documentId,
  projectId,
  title: "Overview notes",
  contentJson: legacy,
  createdBy: authorId,
  createdAt: new Date("2026-01-01"),
  updatedAt: new Date("2026-01-01"),
  revision: 1,
};

function sqlParameters(value: unknown): string[] {
  if (!value || typeof value !== "object") return [];
  if (Array.isArray(value)) return value.flatMap(sqlParameters);
  const record = value as Record<string, unknown>;
  return [
    ...(typeof record.value === "string" ? [record.value] : []),
    ...(Array.isArray(record.queryChunks)
      ? record.queryChunks.flatMap(sqlParameters)
      : []),
  ];
}

test("document schemas preserve existing JSON and allow localized empty-title fallback", () => {
  const parsed = createDocumentSchema.parse({
    title: "  ",
    contentJson: legacy,
  });
  // The service chooses the fallback title from the user's locale.
  assert.equal(parsed.title, "");
  assert.deepEqual(parsed.contentJson, legacy);
  // Content is edited through the realtime socket, so a save carries only the title and icon.
  assert.deepEqual(updateDocumentSchema.parse({ title: " x ", contentJson: legacy, expectedRevision: 1 }), { title: "x" });
  assert.equal(updateDocumentSchema.safeParse({ title: "y".repeat(201) }).success, false);
});

test("document appearance accepts catalog, emoji, and remote image icons", () => {
  const base = { contentJson: legacy };
  assert.equal(createDocumentSchema.safeParse({ ...base, iconAppearance: { type: "icon", key: "rocket" } }).success, true);
  assert.equal(createDocumentSchema.safeParse({ ...base, iconAppearance: { type: "emoji", value: "👩🏽‍💻" } }).success, true);
  assert.equal(createDocumentSchema.safeParse({ ...base, iconAppearance: { type: "image", url: "https://images.example.test/icon.png" } }).success, true);
  assert.equal(createDocumentSchema.safeParse({ ...base, iconAppearance: { type: "image", url: "data:image/png;base64,x" } }).success, false);
});

test("document schemas accept URL images and reject non-HTTP schemes", () => {
  const contentJson = {
    type: "doc" as const,
    content: [
      {
        type: "image",
        attrs: { src: "https://images.example.test/a.png", alt: "A" },
      },
    ],
  };
  assert.equal(createDocumentSchema.safeParse({ contentJson }).success, true);
  assert.equal(
    createDocumentSchema.safeParse({
      contentJson: {
        type: "doc",
        content: [{ type: "image", attrs: { src: "/api/files/11111111-1111-4111-8111-111111111111" } }],
      },
    }).success,
    true,
  );
  assert.equal(
    createDocumentSchema.safeParse({
      contentJson: {
        ...contentJson,
        content: [
          { type: "image", attrs: { src: "data:image/png;base64,AAAA" } },
        ],
      },
    }).success,
    false,
  );
  assert.equal(
    createDocumentSchema.safeParse({
      contentJson: {
        type: "doc",
        content: [{ type: "image", attrs: { src: "" } }],
      },
    }).success,
    true,
  );
});

test("document lookup is scoped by both project and document", async () => {
  const find = spyOn(db.query.projectDocuments, "findFirst").mockImplementation(
    async () => undefined,
  );
  await assert.rejects(
    getDocument(projectId, documentId),
    (error: unknown) => error instanceof HttpError && error.statusCode === 404,
  );
  const condition = find.mock.calls[0][0].where;
  const uuids = sqlParameters(condition).filter((value) =>
    [projectId, documentId].includes(value),
  );
  assert.deepEqual(uuids, [projectId, documentId]);
});

test("renaming a page saves the title and icon, bumps the revision, and leaves the content alone", async () => {
  spyOn(db.query.users, "findFirst").mockImplementation(async () => ({ locale: "en" }) as never);
  spyOn(db.query.projectDocuments, "findFirst").mockImplementation(async () => ({ ...page, title: "Updated", revision: 2 }) as never);
  let values: Record<string, unknown> = {};
  const update = spyOn(db, "update").mockImplementation(
    () =>
      ({
        set: (next: Record<string, unknown>) => {
          values = next;
          return { where: () => ({ returning: async () => [{ ...page, title: "Updated", revision: 2 }] }) };
        },
      }) as never,
  );
  const result = await updateDocument(projectId, documentId, authorId, { title: "Updated", iconAppearance: { type: "icon", key: "rocket" } });
  assert.equal(result.revision, 2);
  assert.equal(update.mock.calls.length, 1);
  assert.equal(values.title, "Updated");
  assert.deepEqual(values.iconAppearance, { type: "icon", key: "rocket" });
  assert.equal("contentJson" in values, false);
  assert.equal("yjsState" in values, false);
});

test("renaming a missing page returns 404", async () => {
  spyOn(db.query.users, "findFirst").mockImplementation(async () => ({ locale: "en" }) as never);
  spyOn(db, "update").mockImplementation(() => ({ set: () => ({ where: () => ({ returning: async () => [] }) }) }) as never);
  await assert.rejects(updateDocument(projectId, documentId, authorId, { title: "New" }), (error: unknown) => error instanceof HttpError && error.statusCode === 404);
});

test("only the author, project owner, or admin can delete a page", async () => {
  const findDocument = spyOn(db.query.projectDocuments, "findFirst").mockImplementation(
    async () => page,
  );
  const findMembership = spyOn(db.query.projectMembers, "findFirst").mockImplementation(
    async () => undefined,
  );
  // Deleting is soft: the page is marked and removed for good after the undo window.
  const deleted = spyOn(db, "update").mockImplementation(
    () => ({ set: () => ({ where: async () => undefined }) }) as never,
  );
  await assert.rejects(
    deleteDocument(projectId, documentId, otherId, false),
    (error: unknown) => error instanceof HttpError && error.statusCode === 403,
  );
  assert.equal(findDocument.mock.calls.length, 1);
  assert.equal(findMembership.mock.calls.length, 1);
  assert.equal(deleted.mock.calls.length, 0);

  findMembership.mockImplementation(
    async () => ({ role: "owner" }) as typeof projectMembers.$inferSelect,
  );
  await deleteDocument(projectId, documentId, otherId, false);
  await deleteDocument(projectId, documentId, otherId, true);
  await deleteDocument(projectId, documentId, authorId, false);
  assert.equal(deleted.mock.calls.length, 3);
  assert.equal(projectDocuments.id.name, "id");
});
