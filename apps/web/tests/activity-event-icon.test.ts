import { describe, expect, test } from "bun:test";
import { activityEventIcon } from "../src/features/issues/lib/activity-event-icon";

const lookups = { columns: [{ id: "col-1", name: "In progress", color: "#f2c94c" }, { id: "col-2", name: "Done" }] };

describe("activityEventIcon", () => {
    test("shows the target state for a status change", () => {
        expect(activityEventIcon({ type: "status_changed", payload: { field: "columnId", from: "col-2", to: "col-1" } }, lookups)).toEqual({ kind: "state", name: "In progress", color: "#f2c94c" });
        expect(activityEventIcon({ type: "status_changed", payload: { to: "col-2" } }, lookups)).toEqual({ kind: "state", name: "Done", color: undefined });
    });

    test("shows no icon when the target state is unknown", () => {
        expect(activityEventIcon({ type: "status_changed", payload: { to: "gone" } }, lookups)).toBeNull();
        expect(activityEventIcon({ type: "status_changed", payload: { to: null } }, lookups)).toBeNull();
    });

    test("shows the new priority for a priority change", () => {
        expect(activityEventIcon({ type: "priority_changed", payload: { field: "priority", from: "medium", to: "urgent" } }, lookups)).toEqual({ kind: "priority", priority: "urgent" });
        expect(activityEventIcon({ type: "priority_changed", payload: { to: "none" } }, lookups)).toEqual({ kind: "priority", priority: "none" });
    });

    test("shows no icon for a priority change without a target", () => {
        expect(activityEventIcon({ type: "priority_changed", payload: { to: null } }, lookups)).toBeNull();
        expect(activityEventIcon({ type: "priority_changed", payload: {} }, lookups)).toBeNull();
    });

    test("leaves every other type to the avatar", () => {
        for (const type of ["created", "assignee_changed", "estimate_changed", "due_date_changed", "parent_changed", "label_added", "label_removed", "relation_added", "relation_removed"]) {
            expect(activityEventIcon({ type, payload: { to: "col-1" } }, lookups)).toBeNull();
        }
    });
});
