import { describe, expect, test } from "bun:test";
import { nearestColumnIndex, resolveBoardColumnId, writeColumnParam } from "../src/features/board/column-scroll";

describe("nearestColumnIndex", () => {
    test("picks the column whose start is closest to the snap origin", () => {
        expect(nearestColumnIndex(0, [0, 320, 640])).toBe(0);
        expect(nearestColumnIndex(300, [0, 320, 640])).toBe(1);
        expect(nearestColumnIndex(640, [0, 320, 640])).toBe(2);
    });

    test("returns 0 when there are no columns", () => {
        expect(nearestColumnIndex(120, [])).toBe(0);
    });
});

describe("resolveBoardColumnId", () => {
    test("keeps a requested column that is still on the board", () => {
        expect(resolveBoardColumnId("b", ["a", "b", "c"])).toBe("b");
    });

    test("falls back to the first column when the requested one is hidden or gone", () => {
        expect(resolveBoardColumnId("gone", ["a", "b"])).toBe("a");
        expect(resolveBoardColumnId(null, ["a", "b"])).toBe("a");
        expect(resolveBoardColumnId("a", [])).toBe(null);
    });
});

describe("writeColumnParam", () => {
    test("writes column without dropping the rest of the query", () => {
        const next = writeColumnParam(new URLSearchParams("q=bug&view=board"), "col-1");
        expect(next.get("column")).toBe("col-1");
        expect(next.get("q")).toBe("bug");
        expect(next.get("view")).toBe("board");
    });

    test("leaves the query unchanged when the column is already set", () => {
        const current = new URLSearchParams("column=col-1&q=bug");
        expect(writeColumnParam(current, "col-1")).toBe(current);
    });
});
