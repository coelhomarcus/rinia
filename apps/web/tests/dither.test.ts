import { describe, expect, test } from "bun:test";
import { DITHER_TILES, ditherRuns } from "../src/features/projects/components/overview/dither";

const litPixels = (path: string) => (path.match(/M/g) ?? []).length;

describe("DITHER_TILES", () => {
    test("lights as many of the tile's 16 pixels as its level", () => {
        DITHER_TILES.forEach((path, level) => expect(litPixels(path)).toBe(level));
    });

    test("keeps every pixel lit at one level lit at the next, so shades only ever add pixels", () => {
        for (let level = 1; level < 16; level++) {
            for (const square of DITHER_TILES[level]!.match(/M[^M]+/g)!) expect(DITHER_TILES[level + 1]).toContain(square);
        }
    });
});

describe("ditherRuns", () => {
    test("covers exactly the filled pixels, run after run", () => {
        for (const filled of [1, 7, 40, 233]) {
            const runs = ditherRuns(filled);
            expect(runs.reduce((sum, run) => sum + run.width, 0)).toBe(filled);
            runs.forEach((run, index) => expect(run.x).toBe(index ? runs[index - 1]!.x + runs[index - 1]!.width : 0));
        }
    });

    test("rises from sparse to solid at the tip", () => {
        const runs = ditherRuns(100);
        expect(runs[0]!.level).toBeLessThan(6);
        expect(runs.at(-1)!.level).toBe(16);
        runs.slice(1).forEach((run, index) => expect(run.level).toBeGreaterThan(runs[index]!.level));
    });

    test("draws nothing for an empty bar", () => {
        expect(ditherRuns(0)).toEqual([]);
    });
});
