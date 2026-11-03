/** Shared with the API, which uses the same buckets for MCP filters and new issues. */
export type ColumnBucket = "active" | "backlog" | "closed";

/** Groups a column by its name: the backlog, the states that close an issue, and the active ones in between. */
export function columnBucket(name: string): ColumnBucket {
    const normalized = name.toLowerCase();
    if (normalized.includes("backlog") || normalized.includes("fila")) return "backlog";
    if (normalized.includes("done") || normalized.includes("cancel") || normalized.includes("duplicate") || normalized.includes("conclu")) return "closed";
    return "active";
}

/**
 * The column a new issue starts in: the first active one (To Do in the default workflow), so the issue shows
 * under Active instead of landing in the backlog. Falls back to the first column.
 */
export function defaultIssueColumn<T extends { name: string }>(columns: T[] | undefined): T | undefined {
    return columns?.find((column) => columnBucket(column.name) === "active") ?? columns?.[0];
}

/** A closed state that means the work was done, unlike cancelled or duplicate. Moving an issue here completes it. */
export function isDoneColumn(name: string): boolean {
    const normalized = name.toLowerCase();
    return normalized.includes("done") || normalized.includes("conclu");
}
