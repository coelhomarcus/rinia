import { resolveLocale, type CreateDocumentInput, type Locale, type UpdateDocumentInput } from "@rinia/shared";
import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { db } from "../../db";
import { projectDocuments, projectMembers, users } from "../../db/schema";
import { HttpError } from "../../lib/http-error";
import { requireUndoWindow } from "../../lib/soft-delete";
import { publishChange } from "../realtime/realtime.service";
import { documentRooms } from "./document-rooms";

const matchingDocument = (projectId: string, documentId: string) =>
    and(
    eq(projectDocuments.projectId, projectId),
    eq(projectDocuments.id, documentId),
    isNull(projectDocuments.deletedAt),
  );

const EMPTY_DOCUMENT_TITLES: Record<Locale, string> = {
  "pt-BR": "Sem título",
  en: "Untitled",
};

export function listDocuments(projectId: string) {
  return db.query.projectDocuments.findMany({
    where: and(eq(projectDocuments.projectId, projectId), isNull(projectDocuments.deletedAt)),
    columns: { contentJson: false, yjsState: false },
    orderBy: [asc(projectDocuments.createdAt), asc(projectDocuments.id)],
  });
}

export async function getDocument(projectId: string, documentId: string) {
  const document = await db.query.projectDocuments.findFirst({
    where: matchingDocument(projectId, documentId),
    columns: { yjsState: false },
  });
  if (!document) throw new HttpError(404, "Document not found");
  // Edits that people have made in the last few seconds may not be saved yet.
  const live = await documentRooms.live(documentId);
  return live ? { ...document, contentJson: live } : document;
}

export async function createDocument(
  projectId: string,
  userId: string,
  input: CreateDocumentInput,
) {
  const user = await db.query.users.findFirst({ where: eq(users.id, userId), columns: { locale: true } });
  const title = input.title?.trim() || EMPTY_DOCUMENT_TITLES[resolveLocale(user?.locale)];
  const [document] = await db
    .insert(projectDocuments)
    .values({ projectId, createdBy: userId, ...input, iconAppearance: input.iconAppearance ?? null, title })
    .returning();
  publishChange("document.created", { projectId, id: document.id });
  const { yjsState: _yjsState, ...page } = document;
  return page;
}

/** Changes the title and icon. The last save wins: two people renaming a page at once is not worth a conflict. */
export async function updateDocument(
  projectId: string,
  documentId: string,
  userId: string,
  input: UpdateDocumentInput,
) {
  const user = await db.query.users.findFirst({ where: eq(users.id, userId), columns: { locale: true } });
  const title = input.title.trim() || EMPTY_DOCUMENT_TITLES[resolveLocale(user?.locale)];
  const [document] = await db
    .update(projectDocuments)
    .set({
      title,
      ...(input.iconAppearance === undefined ? {} : { iconAppearance: input.iconAppearance }),
      updatedAt: new Date(),
      revision: sql`${projectDocuments.revision} + 1`,
    })
    .where(matchingDocument(projectId, documentId))
    .returning();
  if (!document) throw new HttpError(404, "Document not found");
  publishChange("document.updated", { projectId, id: documentId });
  return getDocument(projectId, documentId);
}

export async function deleteDocument(
  projectId: string,
  documentId: string,
  userId: string,
) {
  // Only the author is needed here, not the content a live room would have to convert.
  const document = await db.query.projectDocuments.findFirst({ where: matchingDocument(projectId, documentId), columns: { createdBy: true } });
  if (!document) throw new HttpError(404, "Document not found");
  if (document.createdBy !== userId) {
    const owner = await db.query.projectMembers.findFirst({
      where: and(
        eq(projectMembers.projectId, projectId),
        eq(projectMembers.userId, userId),
        eq(projectMembers.role, "owner"),
      ),
    });
    if (!owner)
      throw new HttpError(
        403,
        "Only the author or project owner can delete this page",
      );
  }
  // Saved before it is marked deleted, so undoing the delete brings back what people last typed.
  await documentRooms.flush(documentId);
  const deletedAt = new Date();
  await db.update(projectDocuments).set({ deletedAt }).where(matchingDocument(projectId, documentId));
  publishChange("document.deleted", { projectId, id: documentId });
  return { deletedAt: deletedAt.toISOString() };
}

export async function restoreDocument(projectId: string, documentId: string, deletedAt: Date) {
  requireUndoWindow(deletedAt);
  const [document] = await db.update(projectDocuments).set({ deletedAt: null }).where(and(
    eq(projectDocuments.projectId, projectId),
    eq(projectDocuments.id, documentId),
    eq(projectDocuments.deletedAt, deletedAt),
  )).returning({ id: projectDocuments.id });
  if (!document) throw new HttpError(404, "Document not found or undo window expired");
  // Anyone who kept typing in the open page while it was deleted has those edits saved now.
  await documentRooms.flush(documentId);
  publishChange("document.restored", { projectId, id: documentId });
  return { restored: true };
}
