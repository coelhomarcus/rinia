import type { Request } from "express";
import { HttpError } from "../../lib/http-error";
import { MULTIPART_MAX_BYTES } from "./files.storage";

/** Reads a multipart body the JSON parser left alone. */
export async function readMultipart(req: Request): Promise<FormData> {
    const contentType = req.headers["content-type"];
    if (typeof contentType !== "string" || !contentType.toLowerCase().includes("multipart/form-data")) {
        throw new HttpError(400, "Upload a file as multipart form data");
    }
    const declared = Number(req.headers["content-length"] ?? 0);
    if (Number.isFinite(declared) && declared > MULTIPART_MAX_BYTES) throw new HttpError(413, "File is too large");
    const chunks: Buffer[] = [];
    let total = 0;
    for await (const chunk of req) {
        const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        total += buffer.length;
        if (total > MULTIPART_MAX_BYTES) throw new HttpError(413, "File is too large");
        chunks.push(buffer);
    }
    const request = new Request("http://localhost/upload", { method: "POST", headers: { "content-type": contentType }, body: new Uint8Array(Buffer.concat(chunks)) });
    return request.formData() as unknown as Promise<FormData>;
}

/** A raw chunk. The JSON parser leaves an octet-stream body unread. */
export async function readRawBody(req: Request, maxBytes: number): Promise<Buffer> {
    const declared = Number(req.headers["content-length"] ?? 0);
    if (Number.isFinite(declared) && declared > maxBytes) throw new HttpError(413, "File is too large");
    const chunks: Buffer[] = [];
    let total = 0;
    for await (const chunk of req) {
        const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        total += buffer.length;
        if (total > maxBytes) throw new HttpError(413, "File is too large");
        chunks.push(buffer);
    }
    return Buffer.concat(chunks);
}

export function contentDisposition(filename: string) {
    const ascii = filename.replace(/[^\x20-\x7E]/g, "_").replace(/["\\]/g, "_");
    return `inline; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}
