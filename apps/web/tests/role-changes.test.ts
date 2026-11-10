import { describe, expect, test } from "bun:test";
import { can, type RealtimeEventType } from "@rinia/shared";
import { QueryClient } from "@tanstack/react-query";
import { realtimeTargets } from "../src/features/realtime/invalidate";

const event = (type: RealtimeEventType) => ({ type, projectId: "project", id: "someone", actorId: "ana", clientId: null });
const keys = (type: RealtimeEventType) => realtimeTargets(new QueryClient(), event(type)).map((target) => JSON.stringify(target.queryKey));

describe("role changes", () => {
    test("a member's new role refetches the members and every list it can change", () => {
        const refetched = keys("member.updated");
        expect(refetched).toContain(JSON.stringify(["projects", "project", "members"]));
        expect(refetched).toContain(JSON.stringify(["projects", "project", "issues"]));
        expect(refetched.some((key) => key.includes("documents"))).toBe(true);
    });

    test("sharing with a guest refreshes who things are shared with", () => {
        expect(keys("share.created")).toEqual([JSON.stringify(["shares"])]);
        expect(keys("share.deleted")).toEqual([JSON.stringify(["shares"])]);
    });

    test("the screen reads the same map the API enforces", () => {
        expect(can("viewer", "issues.write")).toBe(false);
        expect(can("viewer", "reactions.write")).toBe(true);
        expect(can("guest", "comments.write")).toBe(true);
        expect(can("admin", "project.delete")).toBe(false);
        expect(can(null, "project.read")).toBe(false);
    });
});
