import { describe, expect, test } from "bun:test";
import { isAllowedImageSource } from "@rinia/shared";
import { unreferencedFileIds } from "../src/features/files/files.orphans";

const id = "11111111-1111-4111-8111-111111111111";
const other = "22222222-2222-4222-8222-222222222222";
const cutoff = new Date("2026-11-06T00:00:00Z");
const old = new Date("2026-11-04T00:00:00Z");
const recent = new Date("2026-11-06T12:00:00Z");

describe("unreferenced files", () => {
    test("a stored page image is allowed, and a script URL is not", () => {
        expect(isAllowedImageSource(`/api/files/${id}`)).toBe(true);
        expect(isAllowedImageSource("")).toBe(true);
        expect(isAllowedImageSource("javascript:alert(1)")).toBe(false);
    });

    test("only an old file with no issue and no reference is removed", () => {
        const ids = unreferencedFileIds(
            [
                { id, issueId: null, createdAt: old },
                { id: other, issueId: null, createdAt: old },
                { id: "33333333-3333-4333-8333-333333333333", issueId: "44444444-4444-4444-8444-444444444444", createdAt: old },
                { id: "55555555-5555-4555-8555-555555555555", issueId: null, createdAt: recent },
            ],
            new Set([other]),
            cutoff,
        );
        expect(ids).toEqual([id]);
    });
});
