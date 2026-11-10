import jpeg from "jpeg-js";
import { PNG } from "pngjs";
import { HttpError } from "../../lib/http-error";

/** A decoded photo larger than this is refused instead of expanded in memory. */
const MAX_PIXELS = 40_000_000;
const DROP_PNG_CHUNKS = new Set(["tEXt", "zTXt", "iTXt", "eXIf", "tIME"]);

/**
 * Removes location, device and author metadata from an uploaded image.
 * JPEG and PNG are turned upright from the EXIF orientation tag, then written again without that tag.
 * GIF and WebP only lose their metadata blocks, so an animation stays frame for frame.
 */
export function sanitizeUploadedImage(contentType: string, bytes: Buffer): Buffer {
    try {
        if (contentType === "image/jpeg") return stripJpeg(bytes);
        if (contentType === "image/png") return stripPng(bytes);
        if (contentType === "image/gif") return stripGif(bytes);
        if (contentType === "image/webp") return stripWebp(bytes);
    } catch (error) {
        if (error instanceof HttpError) throw error;
        throw new HttpError(400, "Could not read this image");
    }
    return bytes;
}

/** EXIF orientation 1–8. TIFF offsets are relative to the start of the TIFF header. */
export function exifOrientation(segment: Buffer): number {
    const marker = segment.indexOf(Buffer.from("Exif\0\0"));
    const tiff = marker >= 0 ? segment.subarray(marker + 6) : segment;
    if (tiff.length < 8) return 1;
    const little = tiff[0] === 0x49 && tiff[1] === 0x49;
    const big = tiff[0] === 0x4d && tiff[1] === 0x4d;
    if (!little && !big) return 1;
    const u16 = (offset: number) => (little ? tiff.readUInt16LE(offset) : tiff.readUInt16BE(offset));
    const u32 = (offset: number) => (little ? tiff.readUInt32LE(offset) : tiff.readUInt32BE(offset));
    if (u16(2) !== 42) return 1;
    const start = u32(4);
    if (start + 2 > tiff.length) return 1;
    const count = u16(start);
    for (let index = 0; index < count; index += 1) {
        const entry = start + 2 + index * 12;
        if (entry + 12 > tiff.length) break;
        if (u16(entry) !== 0x0112) continue;
        const value = u16(entry + 8);
        return value >= 1 && value <= 8 ? value : 1;
    }
    return 1;
}

function orientPixels(source: Uint8Array | Buffer, width: number, height: number, orientation: number) {
    if (orientation <= 1 || orientation > 8) return { data: Buffer.from(source), width, height };
    const turned = orientation >= 5;
    const destWidth = turned ? height : width;
    const destHeight = turned ? width : height;
    const dest = new Uint8Array(destWidth * destHeight * 4);
    for (let y = 0; y < height; y += 1) {
        for (let x = 0; x < width; x += 1) {
            let nextX = x;
            let nextY = y;
            if (orientation === 2) nextX = width - 1 - x;
            else if (orientation === 3) {
                nextX = width - 1 - x;
                nextY = height - 1 - y;
            } else if (orientation === 4) nextY = height - 1 - y;
            else if (orientation === 5) {
                nextX = y;
                nextY = x;
            } else if (orientation === 6) {
                nextX = height - 1 - y;
                nextY = x;
            } else if (orientation === 7) {
                nextX = height - 1 - y;
                nextY = width - 1 - x;
            } else if (orientation === 8) {
                nextX = y;
                nextY = width - 1 - x;
            }
            const from = (y * width + x) * 4;
            const to = (nextY * destWidth + nextX) * 4;
            dest[to] = source[from]!;
            dest[to + 1] = source[from + 1]!;
            dest[to + 2] = source[from + 2]!;
            dest[to + 3] = source[from + 3]!;
        }
    }
    return { data: Buffer.from(dest), width: destWidth, height: destHeight };
}

function stripJpeg(bytes: Buffer) {
    const orientation = exifOrientation(bytes);
    const decoded = jpeg.decode(bytes, { useTArray: true, formatAsRGBA: true, maxResolutionInMP: MAX_PIXELS / 1_000_000, maxMemoryUsageInMB: 128 });
    if (!decoded.width || !decoded.height) throw new HttpError(400, "Could not read this image");
    const turned = orientPixels(decoded.data, decoded.width, decoded.height, orientation);
    return Buffer.from(jpeg.encode({ data: turned.data, width: turned.width, height: turned.height }, 90).data);
}

function stripPng(bytes: Buffer) {
    if (bytes.length < 8 || bytes[0] !== 0x89) throw new HttpError(400, "Could not read this image");
    const kept: Buffer[] = [bytes.subarray(0, 8)];
    let orientation = 1;
    let animated = false;
    let offset = 8;
    while (offset + 12 <= bytes.length) {
        const length = bytes.readUInt32BE(offset);
        const type = bytes.toString("ascii", offset + 4, offset + 8);
        const end = offset + 12 + length;
        if (end > bytes.length) throw new HttpError(400, "Could not read this image");
        if (type === "eXIf") orientation = exifOrientation(bytes.subarray(offset + 8, offset + 8 + length));
        if (type === "acTL") animated = true;
        if (!DROP_PNG_CHUNKS.has(type)) kept.push(bytes.subarray(offset, end));
        offset = end;
        if (type === "IEND") break;
    }
    if (orientation === 1 || animated) return Buffer.concat(kept);
    if (bytes.length < 24) throw new HttpError(400, "Could not read this image");
    const width = bytes.readUInt32BE(16);
    const height = bytes.readUInt32BE(20);
    if (width * height > MAX_PIXELS) throw new HttpError(400, "Could not read this image");
    const decoded = PNG.sync.read(bytes);
    const turned = orientPixels(decoded.data, decoded.width, decoded.height, orientation);
    const image = new PNG({ width: turned.width, height: turned.height });
    image.data = turned.data;
    return PNG.sync.write(image);
}

function stripGif(bytes: Buffer) {
    if (bytes.length < 13) throw new HttpError(400, "Could not read this image");
    const signature = bytes.toString("ascii", 0, 6);
    if (signature !== "GIF87a" && signature !== "GIF89a") throw new HttpError(400, "Could not read this image");
    const globalColors = bytes[10]! & 0x80 ? 3 * (1 << ((bytes[10]! & 7) + 1)) : 0;
    let offset = 13 + globalColors;
    if (offset > bytes.length) throw new HttpError(400, "Could not read this image");
    const parts = [bytes.subarray(0, offset)];
    while (offset < bytes.length) {
        const marker = bytes[offset];
        if (marker === 0x3b) {
            parts.push(bytes.subarray(offset, offset + 1));
            break;
        }
        if (marker === 0x21) {
            const label = bytes[offset + 1];
            const end = endOfBlocks(bytes, offset + 2);
            const application = label === 0xff && bytes[offset + 2] === 11 ? bytes.toString("ascii", offset + 3, offset + 14) : "";
            const metadata = label === 0xfe || application.startsWith("XMP Data") || application.startsWith("Exif");
            if (!metadata) parts.push(bytes.subarray(offset, end));
            offset = end;
            continue;
        }
        if (marker === 0x2c) {
            const end = endOfGifImage(bytes, offset);
            parts.push(bytes.subarray(offset, end));
            offset = end;
            continue;
        }
        throw new HttpError(400, "Could not read this image");
    }
    return Buffer.concat(parts);
}

function endOfBlocks(bytes: Buffer, offset: number) {
    while (offset < bytes.length) {
        const size = bytes[offset]!;
        offset += 1 + size;
        if (offset > bytes.length) throw new HttpError(400, "Could not read this image");
        if (size === 0) return offset;
    }
    throw new HttpError(400, "Could not read this image");
}

function endOfGifImage(bytes: Buffer, offset: number) {
    if (offset + 10 > bytes.length) throw new HttpError(400, "Could not read this image");
    const packed = bytes[offset + 9]!;
    let cursor = offset + 10;
    if (packed & 0x80) cursor += 3 * (1 << ((packed & 7) + 1));
    return endOfBlocks(bytes, cursor + 1);
}

function stripWebp(bytes: Buffer) {
    if (bytes.toString("ascii", 0, 4) !== "RIFF" || bytes.toString("ascii", 8, 12) !== "WEBP") throw new HttpError(400, "Could not read this image");
    const chunks: { type: string; data: Buffer }[] = [];
    let offset = 12;
    while (offset + 8 <= bytes.length) {
        const type = bytes.toString("ascii", offset, offset + 4);
        const size = bytes.readUInt32LE(offset + 4);
        const end = offset + 8 + size;
        if (end > bytes.length) throw new HttpError(400, "Could not read this image");
        chunks.push({ type, data: Buffer.from(bytes.subarray(offset + 8, end)) });
        offset = end + (size % 2);
    }
    const kept = chunks.filter((chunk) => chunk.type !== "EXIF" && chunk.type !== "XMP ");
    for (const chunk of kept) {
        if (chunk.type !== "VP8X" || chunk.data.length < 1) continue;
        const flags = Buffer.from(chunk.data);
        flags[0] = flags[0]! & ~0x18;
        chunk.data = flags;
    }
    const body = Buffer.concat(kept.map(webpChunk));
    const header = Buffer.alloc(12);
    header.write("RIFF", 0, "ascii");
    header.writeUInt32LE(body.length + 4, 4);
    header.write("WEBP", 8, "ascii");
    return Buffer.concat([header, body]);
}

function webpChunk(chunk: { type: string; data: Buffer }) {
    const header = Buffer.alloc(8);
    header.write(chunk.type, 0, "ascii");
    header.writeUInt32LE(chunk.data.length, 4);
    const pad = chunk.data.length % 2 === 1 ? Buffer.from([0]) : Buffer.alloc(0);
    return Buffer.concat([header, chunk.data, pad]);
}
