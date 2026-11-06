import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import { findNativeTitles } from "../scripts/native-titles.mjs";

describe("native title tooltips", () => {
    test("html hints use the project tooltip", () => {
        const root = join(import.meta.dir, "../src");
        expect(findNativeTitles(root)).toEqual([]);
    });
});
