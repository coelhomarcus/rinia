import { useState } from "react";
import { KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent, type DragOverEvent, type DragStartEvent } from "@dnd-kit/core";
import { arrayMove, sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import { positionAtIndex, type UpdateIssueInput } from "@rinia/shared";
import type { Issue } from "../api";

export type ListGroupBy = "none" | "status" | "assignee";

/** The group an issue is listed under. */
export function listGroupKey(issue: Issue, groupBy: ListGroupBy) {
    if (groupBy === "status") return issue.columnId;
    if (groupBy === "assignee") return issue.assigneeId ?? "unassigned";
    return "all";
}

/** What changes when an issue is dropped into another group: its status, or its assignee. */
function groupChange(groupBy: ListGroupBy, key: string): Partial<Issue> & UpdateIssueInput {
    if (groupBy === "status") return { columnId: key };
    if (groupBy === "assignee") return { assigneeId: key === "unassigned" ? null : key };
    return {};
}

/**
 * Drag to reorder the issue list, as on the board. `issues` must be in manual order. While dragging, the issue
 * moves into whichever group it is over, so that group opens a gap for it; on drop it gets a position between
 * its new neighbours (and the group's status or assignee) and `onMove` saves it. `done` ends the preview.
 */
export function useListReorder({ issues, groupBy, onMove }: { issues: Issue[]; groupBy: ListGroupBy; onMove: (issue: Issue, input: UpdateIssueInput, done: () => void) => void }) {
    const [dragIssues, setDragIssues] = useState<Issue[] | null>(null);
    const [activeIssue, setActiveIssue] = useState<Issue | null>(null);
    const items = dragIssues ?? issues;
    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
        useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
    );

    function onDragStart(event: DragStartEvent) {
        setActiveIssue(issues.find((issue) => issue.id === event.active.id) ?? null);
        setDragIssues(issues);
    }

    function onDragOver({ active, over }: DragOverEvent) {
        if (!over) return;
        setDragIssues((current) => {
            const list = current ?? issues;
            const dragged = list.find((issue) => issue.id === active.id);
            const target = list.find((issue) => issue.id === over.id);
            if (!dragged || !target) return current;
            const targetKey = listGroupKey(target, groupBy);
            if (listGroupKey(dragged, groupBy) === targetKey) return current;
            const without = list.filter((issue) => issue.id !== dragged.id);
            const at = without.findIndex((issue) => issue.id === target.id);
            return [...without.slice(0, at), { ...dragged, ...groupChange(groupBy, targetKey) }, ...without.slice(at)];
        });
    }

    function end() {
        setActiveIssue(null);
        setDragIssues(null);
    }

    function onDragEnd({ active, over }: DragEndEvent) {
        const list = dragIssues ?? issues;
        const dragged = list.find((issue) => issue.id === active.id);
        const original = issues.find((issue) => issue.id === active.id);
        if (!over || !dragged || !original) return end();

        const key = listGroupKey(dragged, groupBy);
        const group = list.filter((issue) => listGroupKey(issue, groupBy) === key);
        const from = group.findIndex((issue) => issue.id === dragged.id);
        const to = group.findIndex((issue) => issue.id === over.id);
        const ordered = arrayMove(group, from, to === -1 ? from : to);
        const index = ordered.findIndex((issue) => issue.id === dragged.id);
        const position = positionAtIndex(ordered.filter((issue) => issue.id !== dragged.id), index);

        const movedGroup = listGroupKey(original, groupBy) !== key;
        if (!movedGroup && position === original.position) return end();

        setActiveIssue(null);
        // Keep the preview, in its new order, until the save settles, so the row does not jump back for a frame.
        let slot = 0;
        setDragIssues(list.map((issue) => {
            if (listGroupKey(issue, groupBy) !== key) return issue;
            const next = ordered[slot++];
            return next.id === dragged.id ? { ...next, position } : next;
        }));
        onMove(original, { position, ...(movedGroup ? groupChange(groupBy, key) : {}) }, () => setDragIssues(null));
    }

    return {
        items,
        activeIssue,
        dndProps: { sensors, collisionDetection: closestCenter, onDragStart, onDragOver, onDragEnd, onDragCancel: end },
    };
}
