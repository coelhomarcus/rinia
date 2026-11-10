/** Query key that keeps the snapped board column across a round-trip to an issue. */
export const BOARD_COLUMN_PARAM = "column";

/** Picks the column whose start is closest to the scroller's snap origin. */
export function nearestColumnIndex(origin: number, starts: number[]): number {
    if (starts.length === 0) return 0;
    let closest = 0;
    let best = Number.POSITIVE_INFINITY;
    for (let i = 0; i < starts.length; i++) {
        const distance = Math.abs(starts[i]! - origin);
        if (distance < best) {
            best = distance;
            closest = i;
        }
    }
    return closest;
}

/** The address's column, or the first one still on the board when that id is missing or hidden. */
export function resolveBoardColumnId(requested: string | null, columnIds: string[]): string | null {
    if (columnIds.length === 0) return null;
    if (requested && columnIds.includes(requested)) return requested;
    return columnIds[0]!;
}

/** Writes `?column=` without dropping the rest of the query. Same instance when nothing changes. */
export function writeColumnParam(params: URLSearchParams, columnId: string | null): URLSearchParams {
    const current = params.get(BOARD_COLUMN_PARAM);
    if ((columnId ?? null) === current) return params;
    const next = new URLSearchParams(params);
    if (columnId) next.set(BOARD_COLUMN_PARAM, columnId);
    else next.delete(BOARD_COLUMN_PARAM);
    return next;
}
