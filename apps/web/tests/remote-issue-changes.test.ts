import { afterEach, describe, expect, test } from "bun:test";
import type { RealtimeEvent, RealtimeEventType } from "@rinia/shared";
import { createRemoteIssueChanges, issueMotionEnabled, issuePresenceMotion, REMOTE_ISSUE_HIGHLIGHT_MS } from "../src/features/realtime/remote-issue-changes";

const changes = createRemoteIssueChanges();
afterEach(() => changes.dispose());

function event(type: RealtimeEventType, id: string, actorId: string | null = "ana"): RealtimeEvent {
    return { type, projectId: "project", id, actorId, clientId: "other-tab" };
}

describe("remote issue changes", () => {
    test("remembers an issue someone else created, moved, changed or removed", () => {
        changes.note([event("issue.created", "new"), event("issue.updated", "moved", "bruno"), event("issue.deleted", "gone"), event("comment.created", "comment")], 1_000);

        expect(changes.read("new")).toEqual({ issueId: "new", actorId: "ana", at: 1_000 });
        expect(changes.read("moved")?.actorId).toBe("bruno");
        expect(changes.read("gone")?.issueId).toBe("gone");
        expect(changes.read("comment")).toBeNull();
    });

    test("a later change replaces the highlight, and it is gone after a second", () => {
        changes.note([event("issue.updated", "card", "ana")], 5_000);
        const first = changes.read("card");
        changes.note([event("issue.updated", "card", "bruno")], 5_400);
        expect(changes.read("card")).not.toBe(first);
        expect(changes.read("card")?.actorId).toBe("bruno");

        changes.expire(5_400 + REMOTE_ISSUE_HIGHLIGHT_MS - 1);
        expect(changes.read("card")?.actorId).toBe("bruno");
        changes.expire(5_400 + REMOTE_ISSUE_HIGHLIGHT_MS);
        expect(changes.read("card")).toBeNull();
    });

    test("one batch notifies once, and cards that did not change keep the same snapshot", () => {
        let calls = 0;
        const stop = changes.subscribe(() => calls++);
        changes.note(Array.from({ length: 200 }, (_, index) => event("issue.updated", `issue-${index}`)), 2_000);
        const untouched = changes.read("untouched");
        const first = changes.read("issue-0");

        changes.note([event("issue.updated", "issue-0", "bruno")], 2_100);

        expect(calls).toBe(2);
        expect(changes.read("untouched")).toBe(untouched);
        expect(changes.read("issue-0")).not.toBe(first);
        expect(changes.read("issue-199")?.issueId).toBe("issue-199");
        stop();
    });
});

describe("issue motion", () => {
    test("layout animation is off while dragging and when motion is reduced", () => {
        expect(issueMotionEnabled({ suspend: false, reducedMotion: false })).toBe(true);
        expect(issueMotionEnabled({ suspend: true, reducedMotion: false })).toBe(false);
        expect(issueMotionEnabled({ suspend: false, reducedMotion: true })).toBe(false);
    });

    test("a move glides, and only a real arrival or departure fades", () => {
        const on = { motionOn: true, animatePresence: true };
        expect(issuePresenceMotion({ ...on, wasOnScreen: true, stillOnScreen: true })).toEqual({ enter: false, exit: false });
        expect(issuePresenceMotion({ ...on, wasOnScreen: false, stillOnScreen: true })).toEqual({ enter: true, exit: false });
        expect(issuePresenceMotion({ ...on, wasOnScreen: true, stillOnScreen: false })).toEqual({ enter: false, exit: true });
        expect(issuePresenceMotion({ motionOn: false, animatePresence: true, wasOnScreen: false, stillOnScreen: false })).toEqual({ enter: false, exit: false });
    });
});
