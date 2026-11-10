import { describe, expect, test } from "bun:test";
import { applyOptimisticIssueList, isIssueDetailKey, isIssueListKey } from "../src/features/issues/lib/patch-cached-issue";

const list = [
    { id: "a", identifier: "RIN-1", columnId: "todo", position: 1000, number: 1, title: "Stay" },
    { id: "b", identifier: "RIN-2", columnId: "done", position: 2000, number: 2, title: "Move" },
];

describe("cached issue patches", () => {
    test("recognises the lists and the issue, not its comments", () => {
        expect(isIssueListKey(["projects", "p", "issues", { orderBy: "position" }])).toBe(true);
        expect(isIssueListKey(["my-issues", { filter: "assigned" }])).toBe(true);
        expect(isIssueListKey(["projects", "p", "categories"])).toBe(false);
        expect(isIssueDetailKey(["issues", "RIN-1"])).toBe(true);
        expect(isIssueDetailKey(["issues", "RIN-1", "comments"])).toBe(false);
    });

    test("patches the one issue and leaves the others", () => {
        const next = applyOptimisticIssueList(list, "RIN-1", { title: "Renamed" });
        expect(next?.find((issue) => issue.identifier === "RIN-1")?.title).toBe("Renamed");
        expect(next?.find((issue) => issue.identifier === "RIN-2")?.title).toBe("Move");
    });

    test("a column change without a position puts the issue above the destination", () => {
        const next = applyOptimisticIssueList(list, "RIN-2", { columnId: "todo" });
        const moved = next?.find((issue) => issue.identifier === "RIN-2");
        expect(moved?.columnId).toBe("todo");
        expect(moved?.position).toBeLessThan(1000);
        expect(next?.find((issue) => issue.identifier === "RIN-1")?.position).toBe(1000);
    });
});
