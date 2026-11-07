import { randomUUID } from "node:crypto";
import { unlink } from "node:fs/promises";
import { storedFileIds } from "@rinia/shared";
import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";
import { db } from "../../db";
import { files, issues } from "../../db/schema";
import { HttpError } from "../../lib/http-error";
import { assertProjectMembership } from "../../middleware/project-membership.middleware";
import { inspectUpload, storedFilePath, uniqueFilename, writeStoredFile } from "./files.storage";

export interface StoredFileRecord {
    id: string;
    filename: string;
    contentType: string;
    byteSize: number;
    url: string;
}

function present(row: { id: string; filename: string; contentType: string; byteSize: number }): StoredFileRecord {
    return { id: row.id, filename: row.filename, contentType: row.contentType, byteSize: row.byteSize, url: `/api/files/${row.id}` };
}

/** A member may read the file. A deleted issue stops serving the files that belonged to it. */
export async function assertCanReadFile(userId: string, file: { projectId: string; issueDeleted: boolean }) {
    await assertProjectMembership(file.projectId, userId);
    if (file.issueDeleted) throw new HttpError(404, "File not found");
}

async function namesOnIssue(projectId: string, issueId: string | null) {
    const rows = await db
        .select({ filename: files.filename })
        .from(files)
        .where(and(eq(files.projectId, projectId), issueId ? eq(files.issueId, issueId) : isNull(files.issueId)));
    return rows.map((row) => row.filename);
}

/** Inserts the row with a name that is free on this issue. Two uploads of the same name at once stay distinct. */
export async function insertStoredFile(input: { id: string; projectId: string; userId: string; issueId: string | null; filename: string; contentType: string; byteSize: number }) {
    return db.transaction(async (tx) => {
        await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`${input.projectId}:files`}))`);
        const rows = await tx
            .select({ filename: files.filename })
            .from(files)
            .where(and(eq(files.projectId, input.projectId), input.issueId ? eq(files.issueId, input.issueId) : isNull(files.issueId)));
        const filename = uniqueFilename(input.filename, rows.map((row) => row.filename));
        const [row] = await tx
            .insert(files)
            .values({ id: input.id, projectId: input.projectId, issueId: input.issueId, uploadedBy: input.userId, filename, contentType: input.contentType, byteSize: input.byteSize })
            .returning();
        if (!row) throw new HttpError(500, "Could not store the file");
        return row;
    });
}

export async function storeProjectFile(input: { projectId: string; userId: string; issueId: string | null; filename: string; contentType: string; bytes: Buffer }) {
    const checked = inspectUpload(input);
    if (input.issueId) await assertIssueInProject(input.projectId, input.issueId);
    const id = randomUUID();
    await writeStoredFile(id, input.bytes);
    try {
        return present(await insertStoredFile({ id, projectId: input.projectId, userId: input.userId, issueId: input.issueId, filename: checked.filename, contentType: checked.contentType, byteSize: input.bytes.length }));
    } catch (error) {
        await unlink(storedFilePath(id)).catch(() => undefined);
        throw error;
    }
}

export async function assertIssueInProject(projectId: string, issueId: string) {
    const issue = await db.query.issues.findFirst({
        where: and(eq(issues.id, issueId), eq(issues.projectId, projectId)),
        columns: { id: true, deletedAt: true },
    });
    if (!issue || issue.deletedAt) throw new HttpError(400, "That issue is not in this project");
}

/** Files shown on the issue. Inline images uploaded with the issue id are included. */
export async function listIssueFiles(projectId: string, issueId: string) {
    const rows = await db
        .select({ id: files.id, filename: files.filename, contentType: files.contentType, byteSize: files.byteSize })
        .from(files)
        .innerJoin(issues, eq(files.issueId, issues.id))
        .where(and(eq(files.projectId, projectId), eq(files.issueId, issueId), isNull(issues.deletedAt)))
        .orderBy(asc(files.createdAt));
    return rows.map(present);
}

export async function openStoredFile(id: string, userId: string) {
    const row = await db.query.files.findFirst({
        where: eq(files.id, id),
        with: { issue: { columns: { deletedAt: true } } },
    });
    if (!row) throw new HttpError(404, "File not found");
    await assertCanReadFile(userId, { projectId: row.projectId, issueDeleted: Boolean(row.issue?.deletedAt) });
    return { ...present(row), path: storedFilePath(row.id) };
}

/** Links files that were uploaded before the issue existed, such as from quick create. A name already on the issue is numbered. */
export async function attachReferencedFiles(projectId: string, issueId: string, document: { content?: unknown[] } | null | undefined) {
    const ids = storedFileIds(document);
    if (ids.length === 0) return;
    await db.transaction(async (tx) => {
        await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`${projectId}:files`}))`);
        const taken = new Set(await namesOnIssue(projectId, issueId));
        const rows = await tx
            .select({ id: files.id, filename: files.filename })
            .from(files)
            .where(and(eq(files.projectId, projectId), isNull(files.issueId), inArray(files.id, ids)));
        for (const row of rows) {
            const filename = uniqueFilename(row.filename, taken);
            taken.add(filename);
            await tx.update(files).set({ issueId, filename }).where(and(eq(files.id, row.id), isNull(files.issueId)));
        }
    });
}
