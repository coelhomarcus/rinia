import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, spyOn, test } from "bun:test";
import jpeg from "jpeg-js";
import { PNG } from "pngjs";
import { UPLOAD_CHUNK_BYTES } from "@rinia/shared";
import { crc32 } from "../src/lib/zip";

process.env.JWT_SECRET ??= "test-secret";
process.env.DATABASE_URL ??= "postgres://localhost/unused";
process.env.SPECIAL_REGISTRATION_CODE ??= "test-code";

const { sanitizeUploadedImage } = await import("../src/features/files/image-metadata");
const { avatarFilePath } = await import("../src/features/files/files.storage");
const { beginChunkedUpload, finishChunkedUpload } = await import("../src/features/files/files.uploads");
const storage = await import("../src/features/files/files.storage");
const service = await import("../src/features/files/files.service");
const { saveAvatar } = await import("../src/features/users/avatar.service");
const { db } = await import("../src/db");

const previousUploadDir = process.env.UPLOAD_DIR;
afterEach(() => {
    if (previousUploadDir === undefined) delete process.env.UPLOAD_DIR;
    else process.env.UPLOAD_DIR = previousUploadDir;
});

function tiff(orientation: number) {
    const description = Buffer.from("GPS: 10.5,20.5\0");
    const directory = 2 + 2 * 12 + 4;
    const buffer = Buffer.alloc(8 + directory + description.length);
    buffer.write("II", 0, "ascii");
    buffer.writeUInt16LE(42, 2);
    buffer.writeUInt32LE(8, 4);
    buffer.writeUInt16LE(2, 8);
    buffer.writeUInt16LE(0x0112, 10);
    buffer.writeUInt16LE(3, 12);
    buffer.writeUInt32LE(1, 14);
    buffer.writeUInt16LE(orientation, 18);
    buffer.writeUInt16LE(0x010e, 22);
    buffer.writeUInt16LE(2, 24);
    buffer.writeUInt32LE(description.length, 26);
    buffer.writeUInt32LE(8 + directory, 30);
    description.copy(buffer, 8 + directory);
    return buffer;
}

function jpegWithGps(orientation: number) {
    const image = jpeg.encode({ data: Buffer.from([255, 0, 0, 255, 0, 0, 255, 255]), width: 2, height: 1 }, 90);
    const payload = Buffer.concat([Buffer.from("Exif\0\0"), tiff(orientation)]);
    const app1 = Buffer.alloc(4 + payload.length);
    app1[0] = 0xff;
    app1[1] = 0xe1;
    app1.writeUInt16BE(payload.length + 2, 2);
    payload.copy(app1, 4);
    const encoded = Buffer.from(image.data);
    return Buffer.concat([encoded.subarray(0, 2), app1, encoded.subarray(2)]);
}

function pngChunk(type: string, data: Buffer) {
    const name = Buffer.from(type);
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length);
    const checksum = Buffer.alloc(4);
    checksum.writeUInt32BE(crc32(Buffer.concat([name, data])) >>> 0);
    return Buffer.concat([length, name, data, checksum]);
}

function pngWithMetadata(orientation: number) {
    const image = new PNG({ width: 2, height: 1 });
    image.data = Buffer.from([255, 0, 0, 255, 0, 0, 255, 255]);
    const raw = PNG.sync.write(image);
    const extra = Buffer.concat([
        pngChunk("tEXt", Buffer.from("Comment\0GPS: 10.5,20.5")),
        pngChunk("eXIf", tiff(orientation)),
        pngChunk("fdAT", Buffer.from("frame")),
    ]);
    return Buffer.concat([raw.subarray(0, raw.length - 12), extra, raw.subarray(raw.length - 12)]);
}

function webpChunk(type: string, data: Buffer) {
    const header = Buffer.alloc(8);
    header.write(type, 0, "ascii");
    header.writeUInt32LE(data.length, 4);
    const pad = data.length % 2 === 1 ? Buffer.from([0]) : Buffer.alloc(0);
    return Buffer.concat([header, data, pad]);
}

function animatedWebp() {
    const flags = Buffer.alloc(10);
    flags[0] = 0x08 | 0x20;
    const exif = Buffer.concat([Buffer.from("Exif\0\0"), tiff(1)]);
    const body = Buffer.concat([webpChunk("VP8X", flags), webpChunk("EXIF", exif), webpChunk("ANIM", Buffer.from("anim")), webpChunk("ANMF", Buffer.from("frame")), webpChunk("VP8 ", Buffer.from("image"))]);
    const header = Buffer.alloc(12);
    header.write("RIFF", 0, "ascii");
    header.writeUInt32LE(body.length + 4, 4);
    header.write("WEBP", 8, "ascii");
    return Buffer.concat([header, body]);
}

function animatedGif() {
    const header = Buffer.from("GIF89a");
    const screen = Buffer.from([0x01, 0x00, 0x01, 0x00, 0x80, 0x00, 0x00]);
    const colors = Buffer.from([0, 0, 0, 255, 255, 255]);
    const comment = Buffer.from([0x21, 0xfe, 0x03, 0x47, 0x50, 0x53, 0x00]);
    const loop = Buffer.concat([Buffer.from([0x21, 0xff, 0x0b]), Buffer.from("NETSCAPE2.0"), Buffer.from([0x03, 0x01, 0x00, 0x00, 0x00])]);
    const image = Buffer.from([0x2c, 0x00, 0x00, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00, 0x02, 0x02, 0x4c, 0x01, 0x00, 0x3b]);
    return Buffer.concat([header, screen, colors, comment, loop, image]);
}

function hasJpegExif(bytes: Buffer) {
    return bytes.includes(Buffer.from("Exif\0\0")) || bytes.includes(Buffer.from([0xff, 0xe1]));
}

test("a JPEG loses its GPS tag and keeps the orientation in the pixels", () => {
    const stored = sanitizeUploadedImage("image/jpeg", jpegWithGps(6));
    assert.equal(hasJpegExif(stored), false);
    assert.equal(stored.includes(Buffer.from("GPS:")), false);
    const decoded = jpeg.decode(stored, { formatAsRGBA: true });
    assert.equal(decoded.width, 1);
    assert.equal(decoded.height, 2);
    assert.ok(decoded.data[0]! > decoded.data[2]!);
    assert.ok(decoded.data[6]! > decoded.data[4]!);
});

test("a PNG loses text and EXIF, and a turned photo is stored upright", () => {
    const flat = sanitizeUploadedImage("image/png", pngWithMetadata(1));
    assert.equal(flat.includes(Buffer.from("GPS:")), false);
    assert.equal(flat.includes(Buffer.from("eXIf")), false);
    assert.equal(flat.includes(Buffer.from("fdAT")), true);
    const turned = PNG.sync.read(sanitizeUploadedImage("image/png", pngWithMetadata(6)));
    assert.equal(turned.width, 1);
    assert.equal(turned.height, 2);
    assert.equal(turned.data[0], 255);
    assert.equal(turned.data[6], 255);
});

test("an animated WebP drops EXIF and keeps every frame chunk", () => {
    const stored = sanitizeUploadedImage("image/webp", animatedWebp());
    assert.equal(stored.includes(Buffer.from("EXIF")), false);
    assert.equal(stored.includes(Buffer.from("Exif\0\0")), false);
    assert.equal(stored.includes(Buffer.from("ANIM")), true);
    assert.equal(stored.includes(Buffer.from("ANMF")), true);
    assert.equal(stored.includes(Buffer.from("frame")), true);
    assert.equal(stored.includes(Buffer.from("image")), true);
    const flags = stored[stored.indexOf(Buffer.from("VP8X")) + 8]!;
    assert.equal(flags & 0x08, 0);
    assert.equal(flags & 0x20, 0x20);
});

test("a GIF comment is removed and the animation loop stays", () => {
    const stored = sanitizeUploadedImage("image/gif", animatedGif());
    assert.equal(stored.includes(Buffer.from("GPS")), false);
    assert.equal(stored.includes(Buffer.from("NETSCAPE2.0")), true);
    assert.equal(stored[0], 0x47);
    assert.equal(stored[stored.length - 1], 0x3b);
});

test("an avatar and a finished chunked upload are stored without EXIF", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "rinia-exif-"));
    process.env.UPLOAD_DIR = dir;
    const userId = randomUUID();
    const projectId = randomUUID();
    const dirty = jpegWithGps(6);
    const update = spyOn(db, "update").mockReturnValue({
        set() {
            return this;
        },
        where() {
            return this;
        },
        async returning() {
            return [{ id: userId, passwordHash: "hash" }];
        },
    } as never);
    const assembled = spyOn(storage, "assemblePartial").mockResolvedValue(dirty);
    const inserted = spyOn(service, "insertStoredFile").mockImplementation(async (input) => input as never);
    try {
        await saveAvatar(userId, dirty, "image/jpeg");
        const avatar = await readFile(avatarFilePath(userId));
        assert.equal(hasJpegExif(avatar), false);
        assert.equal(jpeg.decode(avatar).width, 1);

        const upload = await beginChunkedUpload({ projectId, userId, issueId: null, filename: "photo.jpg", contentType: "image/jpeg", byteSize: UPLOAD_CHUNK_BYTES + 1 });
        const finished = await finishChunkedUpload({ projectId, userId, uploadId: upload.uploadId });
        const stored = await readFile(storage.storedFilePath(upload.uploadId));
        assert.equal(hasJpegExif(stored), false);
        assert.equal(finished.byteSize, stored.length);
        assert.equal(jpeg.decode(stored).height, 2);
    } finally {
        update.mockRestore();
        assembled.mockRestore();
        inserted.mockRestore();
        await rm(dir, { recursive: true, force: true });
    }
});
