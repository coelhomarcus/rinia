/** The event icon an activity row shows after the change, or none when the avatar and the text say enough. */
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

export function activityEventIcon(entry: ActivityEventIconEntry, lookups: ActivityEventIconLookups): ActivityEventIcon | null {
    if (entry.type === "status_changed") {
        const column = lookups.columns.find((candidate) => candidate.id === entry.payload.to);
        return column ? { kind: "state", name: column.name, color: column.color } : null;
    }
    if (entry.type === "priority_changed") {
        return typeof entry.payload.to === "string" && entry.payload.to ? { kind: "priority", priority: entry.payload.to } : null;
    }
    return null;
}
