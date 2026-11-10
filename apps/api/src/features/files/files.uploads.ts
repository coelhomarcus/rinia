import { randomUUID } from "node:crypto";
import { mkdir, readFile, readdir, stat, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { UPLOAD_CHUNK_BYTES } from "@rinia/shared";
import { HttpError } from "../../lib/http-error";
import { assertIssueInProject, insertStoredFile } from "./files.service";
import { sanitizeUploadedImage } from "./image-metadata";
import { assemblePartial, checkUploadDeclaration, FILE_RETENTION_MS, inspectUpload, parseContentRange, partialUploadDir, removePartial, storedFilePath, uploadDirectory, writeStoredFile } from "./files.storage";

interface UploadMeta {
    userId: string;
    projectId: string;
    issueId: string | null;
    filename: string;
    contentType: string;
    byteSize: number;
    createdAt: string;
}

function metaPath(id: string) {
    return path.join(partialUploadDir(id), "meta.json");
}

async function readMeta(id: string, projectId: string, userId: string) {
    const raw = await readFile(metaPath(id), "utf8").catch(() => {
        throw new HttpError(404, "Upload not found");
    });
    const meta = JSON.parse(raw) as UploadMeta;
    if (meta.projectId !== projectId || meta.userId !== userId) throw new HttpError(404, "Upload not found");
    if (Date.now() - Date.parse(meta.createdAt) > FILE_RETENTION_MS) {
        await removePartial(id);
        throw new HttpError(404, "Upload not found");
    }
    return meta;
}

/** Drops chunk directories that were never finished. A failure here does not stop the new upload. */
export async function sweepExpiredUploads(now = Date.now()) {
    const root = path.join(uploadDirectory(), "partials");
    const entries = await readdir(root).catch(() => []);
    let removed = 0;
    await Promise.all(entries.map(async (entry) => {
        const file = path.join(root, entry, "meta.json");
        const info = await stat(file).catch(() => null);
        if (!info || now - info.mtimeMs <= FILE_RETENTION_MS) return;
        await removePartial(entry).catch(() => undefined);
        removed += 1;
    }));
    return removed;
}

export async function beginChunkedUpload(input: { projectId: string; userId: string; issueId: string | null; filename: string; contentType: string; byteSize: number }) {
    const declared = checkUploadDeclaration(input);
    if (input.byteSize <= UPLOAD_CHUNK_BYTES) throw new HttpError(400, "This file fits in one request");
    if (input.issueId) await assertIssueInProject(input.projectId, input.issueId);
    await sweepExpiredUploads();
    const uploadId = randomUUID();
    const meta: UploadMeta = { userId: input.userId, projectId: input.projectId, issueId: input.issueId, filename: declared.filename, contentType: declared.contentType, byteSize: input.byteSize, createdAt: new Date().toISOString() };
    await mkdir(partialUploadDir(uploadId), { recursive: true });
    await writeFile(metaPath(uploadId), JSON.stringify(meta));
    return { uploadId, chunkSize: UPLOAD_CHUNK_BYTES };
}

export async function writeChunk(input: { projectId: string; userId: string; uploadId: string; range: string; bytes: Buffer }) {
    const meta = await readMeta(input.uploadId, input.projectId, input.userId);
    const { start, end } = parseContentRange(input.range, meta.byteSize);
    if (input.bytes.length !== end - start + 1) throw new HttpError(400, "This chunk is the wrong size");
    await writeFile(path.join(partialUploadDir(input.uploadId), String(start)), input.bytes);
}

export async function finishChunkedUpload(input: { projectId: string; userId: string; uploadId: string }) {
    const meta = await readMeta(input.uploadId, input.projectId, input.userId);
    const bytes = await assemblePartial(partialUploadDir(input.uploadId), meta.byteSize);
    let checked: { filename: string; contentType: string };
    let clean: Buffer;
    try {
        checked = inspectUpload({ filename: meta.filename, contentType: meta.contentType, bytes });
        clean = sanitizeUploadedImage(checked.contentType, bytes);
    } catch (error) {
        await removePartial(input.uploadId);
        throw error;
    }
    await writeStoredFile(input.uploadId, clean);
    try {
        const file = await insertStoredFile({ id: input.uploadId, projectId: meta.projectId, userId: meta.userId, issueId: meta.issueId, filename: checked.filename, contentType: checked.contentType, byteSize: clean.length });
        await removePartial(input.uploadId);
        return { id: file.id, filename: file.filename, contentType: file.contentType, byteSize: file.byteSize, url: `/api/files/${file.id}` };
    } catch (error) {
        await unlink(storedFilePath(input.uploadId)).catch(() => undefined);
        throw error;
    }
}
