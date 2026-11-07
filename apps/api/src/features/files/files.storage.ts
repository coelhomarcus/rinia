import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { UPLOAD_CHUNK_BYTES } from "@rinia/shared";
import { HttpError } from "../../lib/http-error";

export { UPLOAD_CHUNK_BYTES };

/** A file nobody references is removed once it has been sitting this long. */
export const FILE_RETENTION_MS = 24 * 60 * 60 * 1000;
/** Images pasted into a description. */
export const IMAGE_MAX_BYTES = 10 * 1024 * 1024;
/** Other attachments on an issue. */
export const FILE_MAX_BYTES = 25 * 1024 * 1024;
/** Multipart overhead on top of the largest file. */
export const MULTIPART_MAX_BYTES = FILE_MAX_BYTES + 1024 * 1024;

const FILE_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUploadId(value: string) {
    return FILE_ID.test(value);
}
const BLOCKED_EXTENSIONS = new Set([".exe", ".dll", ".bat", ".cmd", ".com", ".scr", ".msi", ".app", ".dmg", ".pkg", ".apk", ".deb", ".rpm", ".sh", ".bash", ".bin", ".so", ".dylib"]);

/**
 * Where uploads are written. In Dokploy set `UPLOAD_DIR=/data/uploads` and bind-mount a host
 * directory there. Without it, development writes `uploads` in the API's working directory.
 */
export function uploadDirectory() {
    const configured = process.env.UPLOAD_DIR?.trim();
    return configured ? path.resolve(configured) : path.resolve(process.cwd(), "uploads");
}

/** One profile photo per user, outside the project files table. */
export function avatarFilePath(userId: string) {
    if (!FILE_ID.test(userId)) throw new HttpError(400, "Invalid file");
    const root = path.resolve(uploadDirectory(), "avatars");
    const file = path.resolve(root, userId);
    if (file !== path.join(root, userId)) throw new HttpError(400, "Invalid file");
    return file;
}

/** The on-disk name is the id only, so the client's filename cannot leave this directory. */
export function storedFilePath(id: string) {
    if (!FILE_ID.test(id)) throw new HttpError(400, "Invalid file");
    const root = uploadDirectory();
    const file = path.resolve(root, id);
    if (file !== path.join(root, id)) throw new HttpError(400, "Invalid file");
    return file;
}

function textLike(bytes: Buffer) {
    return bytes.length > 0 && !bytes.subarray(0, 8192).includes(0);
}

function imageMagic(type: string, bytes: Buffer) {
    if (type === "image/png") return bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
    if (type === "image/jpeg") return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
    if (type === "image/gif") {
        const header = bytes.subarray(0, 6).toString("ascii");
        return header === "GIF87a" || header === "GIF89a";
    }
    if (type === "image/webp") return bytes.length >= 12 && bytes.subarray(0, 4).toString("ascii") === "RIFF" && bytes.subarray(8, 12).toString("ascii") === "WEBP";
    return false;
}

function otherMagic(type: string, bytes: Buffer) {
    if (type === "application/pdf") return bytes.subarray(0, 5).toString("ascii") === "%PDF-";
    if (type === "application/zip" || type === "application/x-zip-compressed") return bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b;
    if (type === "text/plain" || type === "text/markdown" || type === "text/x-markdown" || type === "text/csv" || type === "application/json") return textLike(bytes);
    return false;
}

function looksExecutable(bytes: Buffer) {
    if (bytes.length >= 2 && bytes[0] === 0x4d && bytes[1] === 0x5a) return true;
    if (bytes.length >= 4 && bytes[0] === 0x7f && bytes[1] === 0x45 && bytes[2] === 0x4c && bytes[3] === 0x46) return true;
    if (bytes.length >= 4) {
        const head = bytes.subarray(0, 4);
        if (
            head.equals(Buffer.from([0xfe, 0xed, 0xfa, 0xce])) ||
            head.equals(Buffer.from([0xfe, 0xed, 0xfa, 0xcf])) ||
            head.equals(Buffer.from([0xca, 0xfe, 0xba, 0xbe])) ||
            head.equals(Buffer.from([0xcf, 0xfa, 0xed, 0xfe]))
        ) {
            return true;
        }
    }
    return bytes.length >= 2 && bytes[0] === 0x23 && bytes[1] === 0x21;
}

/** The declared name, type and size, before the bytes are available. */
export function checkUploadDeclaration(input: { filename: string; contentType: string; byteSize: number }) {
    const filename = input.filename.trim();
    const flat = filename.replaceAll("\\", "/");
    const base = flat.split("/").pop() ?? "";
    if (!filename || base !== flat || base === "." || base === ".." || filename.includes("\0") || base.length > 200) {
        throw new HttpError(400, "Choose a file name that stays inside the upload folder");
    }
    if (BLOCKED_EXTENSIONS.has(path.extname(base).toLowerCase())) throw new HttpError(400, "This file type cannot be uploaded");
    const type = input.contentType.split(";")[0]?.trim().toLowerCase().replace("image/jpg", "image/jpeg") ?? "";
    const image = type === "image/png" || type === "image/jpeg" || type === "image/gif" || type === "image/webp";
    const allowed = image || type === "application/pdf" || type === "application/zip" || type === "application/x-zip-compressed" || type === "text/plain" || type === "text/markdown" || type === "text/x-markdown" || type === "text/csv" || type === "application/json";
    if (!allowed) throw new HttpError(400, "This file type cannot be uploaded");
    if (!Number.isInteger(input.byteSize) || input.byteSize <= 0) throw new HttpError(400, "Choose a file to upload");
    const limit = image ? IMAGE_MAX_BYTES : FILE_MAX_BYTES;
    if (input.byteSize > limit) throw new HttpError(413, image ? "Images must be 10 MB or smaller" : "Files must be 25 MB or smaller");
    return { filename: base, contentType: type, image };
}

/** Checks the name, the type and the bytes before anything is written. */
export function inspectUpload(input: { filename: string; contentType: string; bytes: Buffer }) {
    const declared = checkUploadDeclaration({ filename: input.filename, contentType: input.contentType, byteSize: input.bytes.length });
    if (looksExecutable(input.bytes) || !(declared.image ? imageMagic(declared.contentType, input.bytes) : otherMagic(declared.contentType, input.bytes))) {
        throw new HttpError(400, declared.image || !looksExecutable(input.bytes) ? "The file contents do not match its type" : "This file type cannot be uploaded");
    }
    return { filename: declared.filename, contentType: declared.contentType };
}

/**
 * Another file on the same issue already uses this name. `notes.pdf` becomes `notes (2).pdf`,
 * then `notes (3).pdf`. The disk name stays the id, so this only changes what people see.
 */
export function uniqueFilename(filename: string, taken: Iterable<string>): string {
    const used = new Set(taken);
    if (!used.has(filename)) return filename;
    const dot = filename.lastIndexOf(".");
    const ext = dot > 0 ? filename.slice(dot) : "";
    const stem = (dot > 0 ? filename.slice(0, dot) : filename).replace(/ \(\d+\)$/, "");
    for (let number = 2; number < 10000; number += 1) {
        const suffix = ` (${number})`;
        const room = 200 - suffix.length - ext.length;
        if (room < 1) break;
        const candidate = `${stem.slice(0, room)}${suffix}${ext}`;
        if (!used.has(candidate)) return candidate;
    }
    throw new HttpError(409, "Too many files already use this name");
}

/** `bytes 0-7/10` for one piece of a chunked upload. The piece must start on a chunk boundary. */
export function parseContentRange(header: string, byteSize: number, chunkSize = UPLOAD_CHUNK_BYTES) {
    const match = /^bytes (\d+)-(\d+)\/(\d+)$/.exec(header.trim());
    if (!match) throw new HttpError(400, "Missing the chunk range");
    const start = Number(match[1]);
    const end = Number(match[2]);
    const total = Number(match[3]);
    const expectedEnd = Math.min(start + chunkSize, byteSize) - 1;
    if (total !== byteSize || start % chunkSize !== 0 || end !== expectedEnd || start >= byteSize) throw new HttpError(400, "This chunk is out of range");
    return { start, end };
}

export function partialUploadDir(id: string) {
    if (!FILE_ID.test(id)) throw new HttpError(400, "Invalid file");
    const root = path.resolve(uploadDirectory(), "partials");
    const dir = path.resolve(root, id);
    if (dir !== path.join(root, id)) throw new HttpError(400, "Invalid file");
    return dir;
}

/** Reads the pieces in order. A missing or short piece is refused, so a gap never becomes a file. */
export async function assemblePartial(dir: string, byteSize: number, chunkSize = UPLOAD_CHUNK_BYTES) {
    const parts: Buffer[] = [];
    for (let offset = 0; offset < byteSize; ) {
        const length = Math.min(chunkSize, byteSize - offset);
        const chunk = await readFile(path.join(dir, String(offset))).catch(() => {
            throw new HttpError(400, "A chunk is missing");
        });
        if (chunk.length !== length) throw new HttpError(400, "A chunk is the wrong size");
        parts.push(chunk);
        offset += length;
    }
    return Buffer.concat(parts);
}

export async function removePartial(id: string) {
    await rm(partialUploadDir(id), { recursive: true, force: true });
}

export async function writeStoredFile(id: string, bytes: Buffer) {
    const file = storedFilePath(id);
    await mkdir(uploadDirectory(), { recursive: true });
    await writeFile(file, bytes);
    return file;
}
