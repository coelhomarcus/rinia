/** The event icon shown beside a value in an activity row's from → to, or none when the text says enough. */
export type ActivityEventIcon =
    | { kind: "state"; name: string; color?: string | null }
    | { kind: "priority"; priority: string };

export interface ActivityEventIconEntry {
    type: string;
    payload: Record<string, unknown>;
}

export interface ActivityEventIconLookups {
    columns: Array<{ id: string; name: string; color?: string | null }>;
}

/** The icon for one side of a change: the state or priority the issue left (`from`) or moved to (`to`). */
export function activityEventIcon(entry: ActivityEventIconEntry, lookups: ActivityEventIconLookups, side: "from" | "to" = "to"): ActivityEventIcon | null {
    const value = entry.payload[side];
    if (entry.type === "status_changed") {
        const column = lookups.columns.find((candidate) => candidate.id === value);
        return column ? { kind: "state", name: column.name, color: column.color } : null;
    }
    if (entry.type === "priority_changed") {
        return typeof value === "string" && value ? { kind: "priority", priority: value } : null;
    }
    return null;
}
