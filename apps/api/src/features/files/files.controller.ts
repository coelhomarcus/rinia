import { createReadStream } from "node:fs";
import { access } from "node:fs/promises";
import { z } from "zod";
import { asyncHandler } from "../../middleware/async-handler";
import { HttpError } from "../../lib/http-error";
import { UPLOAD_CHUNK_BYTES } from "@rinia/shared";
import { contentDisposition, readMultipart, readRawBody } from "./files.http";
import { listIssueFiles, openStoredFile, storeProjectFile } from "./files.service";
import { beginChunkedUpload, finishChunkedUpload, writeChunk } from "./files.uploads";

export const upload = asyncHandler<{ projectId: string }>(async (req, res) => {
    const form = await readMultipart(req);
    const field = form.get("file");
    if (!(field instanceof File)) throw new HttpError(400, "Choose a file to upload");
    const issueField = form.get("issueId");
    const issueId = typeof issueField === "string" && issueField.length > 0 ? z.string().uuid().parse(issueField) : null;
    const file = await storeProjectFile({
        projectId: z.string().uuid().parse(req.params.projectId),
        userId: req.user!.sub,
        issueId,
        filename: field.name || "file",
        contentType: field.type || "application/octet-stream",
        bytes: Buffer.from(await field.arrayBuffer()),
    });
    res.status(201).json({ file });
});

export const begin = asyncHandler<{ projectId: string }>(async (req, res) => {
    const body = z.object({ filename: z.string(), contentType: z.string(), byteSize: z.number().int().positive(), issueId: z.string().uuid().nullable().optional() }).parse(req.body);
    res.status(201).json(await beginChunkedUpload({
        projectId: z.string().uuid().parse(req.params.projectId),
        userId: req.user!.sub,
        issueId: body.issueId ?? null,
        filename: body.filename,
        contentType: body.contentType,
        byteSize: body.byteSize,
    }));
});

export const chunk = asyncHandler<{ projectId: string; uploadId: string }>(async (req, res) => {
    const range = req.header("content-range");
    if (!range) throw new HttpError(400, "Missing the chunk range");
    await writeChunk({
        projectId: z.string().uuid().parse(req.params.projectId),
        userId: req.user!.sub,
        uploadId: z.string().uuid().parse(req.params.uploadId),
        range,
        bytes: await readRawBody(req, UPLOAD_CHUNK_BYTES),
    });
    res.status(204).end();
});

export const complete = asyncHandler<{ projectId: string; uploadId: string }>(async (req, res) => {
    const file = await finishChunkedUpload({
        projectId: z.string().uuid().parse(req.params.projectId),
        userId: req.user!.sub,
        uploadId: z.string().uuid().parse(req.params.uploadId),
    });
    res.status(201).json({ file });
});

export const list = asyncHandler<{ projectId: string }>(async (req, res) => {
    const issueId = z.string().uuid().parse(req.query.issueId);
    res.json({ files: await listIssueFiles(z.string().uuid().parse(req.params.projectId), issueId) });
});

export const download = asyncHandler<{ fileId: string }>(async (req, res) => {
    const file = await openStoredFile(z.string().uuid().parse(req.params.fileId), req.user!.sub);
    try {
        await access(file.path);
    } catch {
        throw new HttpError(404, "File not found");
    }
    res.setHeader("Content-Type", file.contentType);
    res.setHeader("Content-Disposition", contentDisposition(file.filename));
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Cache-Control", "private, max-age=3600");
    const stream = createReadStream(file.path);
    stream.on("error", () => {
        if (!res.headersSent) res.status(404).json({ error: "File not found" });
        else res.destroy();
    });
    stream.pipe(res);
});
