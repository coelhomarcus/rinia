import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, spyOn, test } from "bun:test";
import type { Request } from "express";
import { randomUUID } from "node:crypto";

process.env.JWT_SECRET ??= "test-secret";
process.env.DATABASE_URL ??= "postgres://localhost/unused";
process.env.SPECIAL_REGISTRATION_CODE ??= "test-code";

const { IMAGE_MAX_BYTES, assemblePartial, inspectUpload, parseContentRange, storedFilePath, uniqueFilename, writeStoredFile } = await import("../src/features/files/files.storage");
const { assertCanReadFile } = await import("../src/features/files/files.service");
const { readMultipart } = await import("../src/features/files/files.http");
const { validateIssueImageUrls } = await import("../src/features/issues/issues.service");
const membership = await import("../src/middleware/project-membership.middleware");
const { HttpError } = await import("../src/lib/http-error");

const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x00]);
const previousUploadDir = process.env.UPLOAD_DIR;

afterEach(() => {
    if (previousUploadDir === undefined) delete process.env.UPLOAD_DIR;
    else process.env.UPLOAD_DIR = previousUploadDir;
});

test("an upload is written under UPLOAD_DIR and read back from that id", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "rinia-uploads-"));
    process.env.UPLOAD_DIR = dir;
    const id = randomUUID();
    try {
        await writeStoredFile(id, png);
        assert.deepEqual(await readFile(storedFilePath(id)), png);
        assert.equal(path.dirname(storedFilePath(id)), path.resolve(dir));
    } finally {
        await rm(dir, { recursive: true, force: true });
    }
});

test("a name that leaves the upload directory is refused, and so is an executable", () => {
    assert.throws(() => inspectUpload({ filename: "../secret.png", contentType: "image/png", bytes: png }), (error: unknown) => error instanceof HttpError && error.statusCode === 400);
    assert.throws(() => inspectUpload({ filename: "run.exe", contentType: "application/octet-stream", bytes: Buffer.from("MZ") }), (error: unknown) => error instanceof HttpError && error.statusCode === 400);
    assert.throws(() => inspectUpload({ filename: "notes.txt", contentType: "text/plain", bytes: Buffer.from("#!/bin/sh\n") }), (error: unknown) => error instanceof HttpError && error.statusCode === 400);
    assert.equal(inspectUpload({ filename: "shot.png", contentType: "image/png", bytes: png }).filename, "shot.png");
    assert.throws(() => inspectUpload({ filename: "huge.png", contentType: "image/png", bytes: Buffer.alloc(IMAGE_MAX_BYTES + 1) }), (error: unknown) => error instanceof HttpError && error.statusCode === 413);
});

test("a stored file id cannot be used as a path", () => {
    assert.throws(() => storedFilePath("../etc/passwd"), (error: unknown) => error instanceof HttpError && error.statusCode === 400);
    assert.throws(() => storedFilePath("not-a-uuid"), (error: unknown) => error instanceof HttpError && error.statusCode === 400);
});

test("a project member can read a file and someone outside the project cannot", async () => {
    const refused = spyOn(membership, "assertProjectMembership").mockImplementation((async () => {
        throw new HttpError(403, "You are not a member of this project");
    }) as never);
    await assert.rejects(() => assertCanReadFile("outsider", { id: "file", issueId: null, projectId: "8b2d1f66-0000-4000-8000-0000000000aa", issueDeleted: false }), (error: unknown) => error instanceof HttpError && error.statusCode === 403);
    refused.mockImplementation((async () => undefined) as never);
    await assertCanReadFile("member", { id: "file", issueId: null, projectId: "8b2d1f66-0000-4000-8000-0000000000aa", issueDeleted: false });
    await assert.rejects(() => assertCanReadFile("member", { id: "file", issueId: null, projectId: "8b2d1f66-0000-4000-8000-0000000000aa", issueDeleted: true }), (error: unknown) => error instanceof HttpError && error.statusCode === 404);
    refused.mockRestore();
});

test("a description may use an uploaded file, and file:// is still refused", () => {
    const id = "11111111-2222-4333-8444-555555555555";
    validateIssueImageUrls({ type: "doc", content: [{ type: "paragraph", content: [{ type: "image", attrs: { src: `/api/files/${id}` } }] }] });
    assert.throws(() => validateIssueImageUrls({ type: "doc", content: [{ type: "image", attrs: { src: "file:///etc/passwd" } }] }), (error: unknown) => error instanceof HttpError && /HTTP or HTTPS/.test((error as HttpError).message));
    assert.throws(() => validateIssueImageUrls({ type: "doc", content: [{ type: "image", attrs: { src: "javascript:alert(1)" } }] }), (error: unknown) => error instanceof HttpError);
    assert.throws(() => validateIssueImageUrls({ type: "doc", content: [{ type: "image", attrs: { src: "data:image/png;base64,aaaa" } }] }), (error: unknown) => error instanceof HttpError);
});

test("a repeated name on the same issue is numbered, and the extension stays put", () => {
    assert.equal(uniqueFilename("notes.pdf", []), "notes.pdf");
    assert.equal(uniqueFilename("notes.pdf", ["notes.pdf"]), "notes (2).pdf");
    assert.equal(uniqueFilename("notes.pdf", ["notes.pdf", "notes (2).pdf"]), "notes (3).pdf");
    assert.equal(uniqueFilename("notes (2).pdf", ["notes (2).pdf"]), "notes (3).pdf");
    assert.equal(uniqueFilename("README", ["README"]), "README (2)");
});

test("a chunk range has to cover one whole piece, and the pieces join back into the file", async () => {
    assert.deepEqual(parseContentRange("bytes 0-79/100", 100, 80), { start: 0, end: 79 });
    assert.deepEqual(parseContentRange("bytes 80-99/100", 100, 80), { start: 80, end: 99 });
    assert.throws(() => parseContentRange("bytes 1-2/100", 100, 80), (error: unknown) => error instanceof HttpError);
    const dir = await mkdtemp(path.join(tmpdir(), "rinia-chunks-"));
    try {
        await mkdir(dir, { recursive: true });
        await writeFile(path.join(dir, "0"), Buffer.from("abc"));
        await writeFile(path.join(dir, "3"), Buffer.from("de"));
        assert.equal((await assemblePartial(dir, 5, 3)).toString(), "abcde");
        await assert.rejects(() => assemblePartial(dir, 8, 3), (error: unknown) => error instanceof HttpError && error.statusCode === 400);
    } finally {
        await rm(dir, { recursive: true, force: true });
    }
});

test("multipart upload keeps the file and the issue id", async () => {
    const boundary = "----rinia";
    const issueId = "11111111-2222-4333-8444-555555555555";
    const body = Buffer.concat([
        Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="shot.png"\r\nContent-Type: image/png\r\n\r\n`),
        png,
        Buffer.from(`\r\n--${boundary}\r\nContent-Disposition: form-data; name="issueId"\r\n\r\n${issueId}\r\n--${boundary}--\r\n`),
    ]);
    const req = {
        headers: { "content-type": `multipart/form-data; boundary=${boundary}`, "content-length": String(body.length) },
        async *[Symbol.asyncIterator]() {
            yield body;
        },
    } as unknown as Request;
    const parsed = await readMultipart(req);
    const file = parsed.get("file");
    assert.ok(file instanceof File);
    assert.equal(file.name, "shot.png");
    assert.equal(parsed.get("issueId"), issueId);
});
