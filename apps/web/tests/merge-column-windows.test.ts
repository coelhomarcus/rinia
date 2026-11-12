import { describe, expect, test } from "bun:test";
import { mergeColumnWindows } from "../src/features/board/merge-column-windows";

describe("mergeColumnWindows", () => {
    test("flattens every column's cards", () => {
        const windows = new Map([
            ["todo", [{ id: "a", columnId: "todo" }]],
            ["doing", [{ id: "b", columnId: "doing" }]],
        ]);
        expect(mergeColumnWindows(windows).map((issue) => issue.id)).toEqual(["a", "b"]);
    });

    test("keeps one copy of a card that is in two windows after a move", () => {
        const stale = { id: "a", columnId: "doing", title: "old window" };
        const fresh = { id: "a", columnId: "doing", title: "new window" };
        const windows = new Map([
            ["todo", [stale]],
            ["doing", [fresh]],
        ]);
        expect(mergeColumnWindows(windows)).toEqual([fresh]);
    });

    test("prefers the copy from the card's column whichever window comes first", () => {
        const fresh = { id: "a", columnId: "doing", title: "new window" };
        const stale = { id: "a", columnId: "doing", title: "old window" };
        const windows = new Map([
            ["doing", [fresh]],
            ["todo", [stale]],
        ]);
        expect(mergeColumnWindows(windows)).toEqual([fresh]);
    });
});
