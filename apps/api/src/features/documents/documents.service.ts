import { resolveLocale, type ActionSource, type CreateDocumentInput, type Locale, type TiptapDocument, type UpdateDocumentInput } from "@rinia/shared";
import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { db } from "../../db";
import { projectDocuments, projectMembers, projects, users } from "../../db/schema";
import { HttpError } from "../../lib/http-error";
import { assertRichText } from "../../lib/rich-text";
import { requireUndoWindow } from "../../lib/soft-delete";
import { publishChange } from "../realtime/realtime.service";
import { projectExportFilename, projectMarkdownZip } from "./document-export";
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

/** Every page in the project, including edits still open in a room. There is no nesting, so the archive is flat. */
export async function exportProjectZip(projectId: string) {
    const documents = await db.query.projectDocuments.findMany({
        where: and(eq(projectDocuments.projectId, projectId), isNull(projectDocuments.deletedAt)),
        columns: { id: true, title: true, contentJson: true },
        orderBy: [asc(projectDocuments.createdAt), asc(projectDocuments.id)],
    });
    const pages = [];
    for (const document of documents) {
        const live = await documentRooms.live(document.id);
        pages.push({ id: document.id, title: document.title, contentJson: live ?? document.contentJson });
    }
    const project = await db.query.projects.findFirst({ where: eq(projects.id, projectId), columns: { issueKey: true } });
    return { filename: projectExportFilename(project?.issueKey), body: projectMarkdownZip(pages) };
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

/**
 * The page with its revision matching its content: edits still in memory are saved first, so a revision read here is
 * the one `writeDocumentContent` compares against.
 */
export async function getSavedDocument(projectId: string, documentId: string) {
  await documentRooms.flush(documentId);
  return getDocument(projectId, documentId);
}

export async function createDocument(
  projectId: string,
  userId: string,
  input: CreateDocumentInput,
  source?: ActionSource,
) {
  assertRichText(input.contentJson, "document");
  const user = await db.query.users.findFirst({ where: eq(users.id, userId), columns: { locale: true } });
  const title = input.title?.trim() || EMPTY_DOCUMENT_TITLES[resolveLocale(user?.locale)];
  const [document] = await db
    .insert(projectDocuments)
    .values({ projectId, createdBy: userId, ...input, iconAppearance: input.iconAppearance ?? null, title, source: source ?? null })
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

/**
 * Rewrites a page's content from outside the editor, as the MCP server does. It goes through the page's live room, so
 * people who have it open see the change arrive. With `expectedRevision`, a page saved since that revision is left
 * alone, so a change based on an old read cannot undo what someone wrote in between.
 */
export async function writeDocumentContent(projectId: string, documentId: string, input: { contentJson: TiptapDocument; expectedRevision?: number }) {
  assertRichText(input.contentJson, "document");
  const found = await db.query.projectDocuments.findFirst({ where: matchingDocument(projectId, documentId), columns: { id: true } });
  if (!found) throw new HttpError(404, "Document not found");
  if (input.expectedRevision !== undefined) {
    // Edits still in memory count as changes since the revision the caller read.
    await documentRooms.flush(documentId);
    const current = await db.query.projectDocuments.findFirst({ where: matchingDocument(projectId, documentId), columns: { revision: true } });
    if (current && current.revision !== input.expectedRevision) {
      throw new HttpError(409, `This page changed after revision ${input.expectedRevision} and is now at revision ${current.revision}. Read it again and reapply your change.`);
    }
  }
  await documentRooms.replace(documentId, input.contentJson);
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
