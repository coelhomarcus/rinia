import { QueryClient } from "@tanstack/react-query";
import { describe, expect, test } from "bun:test";
import { issuePreviewTitle } from "../src/features/issues/lib/cached-issue-title";
import { issueNavigation, issueTransitionProps, shouldUseViewTransition, transitionIssue } from "../src/lib/view-transition";

describe("issue view transitions", () => {
    test("marks an identifier and a title apart, per issue", () => {
        expect(issueTransitionProps("RIN-12", "id")).toEqual({ "data-issue-transition": "id:RIN-12" });
        expect(issueTransitionProps("RIN-12", "title")).toEqual({ "data-issue-transition": "title:RIN-12" });
        expect(issueTransitionProps("RIN-12", "id")).not.toEqual(issueTransitionProps("RIN-13", "id"));
    });

    test("morphs only the issue being opened or left", () => {
        expect(transitionIssue("/my-issues", "/issue/RIN-4/ship-it")).toBe("RIN-4");
        expect(transitionIssue("/issue/RIN-4", "/project/RIN/issues")).toBe("RIN-4");
        expect(transitionIssue("/issue/RIN-1", "/issue/RIN-2")).toBe("RIN-2");
        // Between two lists, or a list and the board, nothing morphs: rows and cards only cross-fade.
        expect(transitionIssue("/my-issues", "/project/RIN/issues")).toBeUndefined();
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

    test("keeps a list's filter, scope, and saved view switches out of the transition", () => {
        const go = (from: string, to: string) => shouldUseViewTransition({ from, to, reducedMotion: false, supported: true });
        expect(go("/my-issues", "/my-issues/created")).toBe(false);
        expect(go("/my-issues/created", "/my-issues/subscribed")).toBe(false);
        expect(go("/project/RIN/issues", "/project/RIN/issues/active")).toBe(false);
        expect(go("/project/RIN/issues/active", "/project/RIN/views/bugs-1a2b3c4d")).toBe(false);
        expect(go("/project/RIN/issues", "/project/APP/issues")).toBe(true);
        expect(go("/project/RIN/issues", "/project/RIN/views")).toBe(true);
        expect(go("/my-issues", "/project/RIN/issues")).toBe(true);
        expect(go("/my-issues/created", "/issue/RIN-4")).toBe(true);
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
