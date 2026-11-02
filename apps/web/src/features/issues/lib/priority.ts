import type { IssuePriority } from "@rinia/shared";

/** Menu order, as in Linear: no priority first (shortcut 1), then most to least urgent. */
export const PRIORITY_OPTIONS: readonly IssuePriority[] = ["none", "urgent", "high", "medium", "low"];

/** Translation key for a priority's name; "none" reads as "No priority" rather than a bare "None". */
export function priorityLabelKey(priority: string) {
    return priority === "none" ? "issue.noPriority" : priority === "urgent" ? "issue.urgent" : priority === "high" ? "issue.high" : priority === "medium" ? "issue.medium" : "issue.low";
}
