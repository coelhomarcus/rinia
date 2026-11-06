import { describe, expect, test } from "bun:test";
import { openProjectsAfterVisit } from "../src/features/projects/lib/last-project";

const linkord = "project-linkord";
const rinia = "project-rinia";

describe("openProjectsAfterVisit", () => {
    test("a favorite leaves every project as it was", () => {
        const collapsed = new Set<string>();
        const expanded = new Set([rinia]);

        expect(openProjectsAfterVisit(collapsed, linkord, true)).toBe(collapsed);
        expect(openProjectsAfterVisit(expanded, linkord, true)).toBe(expanded);
        expect([...openProjectsAfterVisit(expanded, linkord, true)]).toEqual([rinia]);
    });

    test("switching favorites does not open either project", () => {
        const open = new Set([rinia]);
        const afterLinkord = openProjectsAfterVisit(open, linkord, true);
        const afterRinia = openProjectsAfterVisit(afterLinkord, rinia, true);

        expect(afterRinia).toBe(open);
        expect([...afterRinia]).toEqual([rinia]);
    });

    test("any other visit opens that project and keeps the others", () => {
        const open = new Set([rinia]);
        const next = openProjectsAfterVisit(open, linkord, false);

        expect([...next].sort()).toEqual([linkord, rinia].sort());
        expect(open.has(linkord)).toBe(false);
    });

    test("an ordinary visit to a project that is already open changes nothing", () => {
        const open = new Set([linkord, rinia]);
        expect(openProjectsAfterVisit(open, linkord, false)).toBe(open);
    });

    test("no current project changes nothing", () => {
        const open = new Set([linkord]);
        expect(openProjectsAfterVisit(open, "", false)).toBe(open);
    });
});
