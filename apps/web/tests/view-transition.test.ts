import { QueryClient } from "@tanstack/react-query";
import { describe, expect, test } from "bun:test";
import { issuePreviewTitle } from "../src/features/issues/lib/cached-issue-title";
import { issueNavigation, issueViewTransitionName, shouldUseViewTransition } from "../src/lib/view-transition";

describe("issue view transitions", () => {
    test("gives the identifier and the title distinct names", () => {
        expect(issueViewTransitionName("RIN-12", "id")).toBe("issue-id-RIN-12");
        expect(issueViewTransitionName("RIN-12", "title")).toBe("issue-title-RIN-12");
        expect(issueViewTransitionName("RIN-12", "id")).not.toBe(issueViewTransitionName("RIN-13", "id"));
    });

    test("drops a name that is not a css ident", () => {
        expect(issueViewTransitionName("bad name", "id")).toBeUndefined();
        expect(issueViewTransitionName("RIN-1;x", "title")).toBeUndefined();
    });

    test("skips the animation for the same path, reduced motion, or a browser without the api", () => {
        const ready = { from: "/issues", to: "/issue/RIN-1", reducedMotion: false, supported: true };
        expect(shouldUseViewTransition(ready)).toBe(true);
        expect(shouldUseViewTransition({ ...ready, to: "/issues" })).toBe(false);
        expect(shouldUseViewTransition({ ...ready, reducedMotion: true })).toBe(false);
        expect(shouldUseViewTransition({ ...ready, supported: false })).toBe(false);
        expect(shouldUseViewTransition({ from: "/issue/RIN-1", to: "/issue/RIN-1/ship-it", reducedMotion: false, supported: true })).toBe(false);
        expect(shouldUseViewTransition({ from: "/issue/RIN-1/ship-it", to: "/issue/RIN-2", reducedMotion: false, supported: true })).toBe(true);
    });

    test("asks the router for a view transition and carries the title", () => {
        expect(issueNavigation("Ship it")).toEqual({ viewTransition: true, state: { issueTitle: "Ship it" } });
        expect(issueNavigation()).toEqual({ viewTransition: true });
    });

    test("paints the title from the click, then from the list cache", () => {
        const client = new QueryClient();
        client.setQueryData(["projects", "p", "issues", { orderBy: "position" }], [{ identifier: "RIN-1", title: "Cached" }]);
        expect(issuePreviewTitle({ issueTitle: "From the row" }, client, "RIN-1")).toBe("From the row");
        expect(issuePreviewTitle(null, client, "RIN-1")).toBe("Cached");
        expect(issuePreviewTitle(null, client, "RIN-9")).toBeUndefined();
    });
});
