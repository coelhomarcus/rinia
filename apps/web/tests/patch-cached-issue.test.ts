import { describe, expect, test } from "bun:test";
import { applyOptimisticIssueList, flattenCachedIssues, isIssueDetailKey, isIssueListKey, mapCachedIssues } from "../src/features/issues/lib/patch-cached-issue";

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

    test("a paged window keeps its cursor when a row that is not mounted changes", () => {
        const window = { pages: [{ issues: list, nextCursor: "cursor" }], pageParams: [undefined] };
        const next = mapCachedIssues(window, (issues) => applyOptimisticIssueList(issues, "RIN-1", { title: "Renamed" }) ?? issues) as typeof window;
        expect(next.pages[0]?.nextCursor).toBe("cursor");
        expect(flattenCachedIssues<{ title: string }>(next).find((issue) => issue.title === "Renamed")).toBeTruthy();
        expect(isIssueListKey(["projects", "p", "issues", { orderBy: "position" }, "page"])).toBe(true);
    });
});
