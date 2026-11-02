/**
 * Where a change came from when it was not made in the web app. Changes made in the app have no source. `client` is
 * the tool's own name for itself, such as `claude-code`, or null when it did not say.
 */
export interface ActionSource {
    via: "mcp";
    client: string | null;
}

/** The longest client name kept, so a hostile header cannot fill the activity feed. */
export const ACTION_CLIENT_MAX_LENGTH = 60;

/** A client's name as it is kept: trimmed, lowercase, and only letters, digits and `._ -`. Null when nothing is left. */
export function cleanClientName(value: unknown): string | null {
    if (typeof value !== "string") return null;
    const cleaned = value.toLowerCase().replace(/[^a-z0-9._ -]/g, "").trim().slice(0, ACTION_CLIENT_MAX_LENGTH);
    return cleaned || null;
}
