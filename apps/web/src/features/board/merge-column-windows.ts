/**
 * Every column's loaded cards as one list, each issue once.
 *
 * A card moved to another column sits in two windows for a moment: the old column's cache still holds it, patched to
 * its new column, until that column refetches, while the new column may already have it from the server. Both copies
 * would land in the new column, under the same key and the same sortable id, and when one left, dnd-kit would forget
 * the other and the card could no longer be dragged. The copy kept is the one from the window of the column it is in.
 */
export function mergeColumnWindows<T extends { id: string; columnId: string }>(windows: ReadonlyMap<string, readonly T[]>): T[] {
    const byId = new Map<string, T>();
    for (const [columnId, issues] of windows) {
        for (const issue of issues) {
            if (!byId.has(issue.id) || issue.columnId === columnId) byId.set(issue.id, issue);
        }
    }
    return [...byId.values()];
}
