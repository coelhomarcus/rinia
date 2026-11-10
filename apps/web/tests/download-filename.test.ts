import { describe, expect, test } from "bun:test";
import { downloadFilename } from "../src/features/documents/api";

describe("downloadFilename", () => {
    test("prefers the utf-8 name", () => {
        expect(downloadFilename(`attachment; filename="notes.md"; filename*=UTF-8''overview-notes.md`, "page.md")).toBe("overview-notes.md");
    });

    test("falls back when the header is missing", () => {
        expect(downloadFilename(null, "pages.zip")).toBe("pages.zip");
    });
});
