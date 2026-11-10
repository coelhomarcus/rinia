/**
 * A point on the way from `from` to `to`. At progress 1 the result is `to` exactly, and no step
 * leaves the range between the two, so the last frame cannot be a rounded neighbor of the real value.
 */
export function countToward(from: number, to: number, progress: number) {
    if (!Number.isFinite(from) || !Number.isFinite(to)) return to;
    if (progress >= 1 || from === to) return to;
    const t = Math.min(1, Math.max(0, progress));
    const eased = 1 - (1 - t) ** 3;
    const rounded = Math.round(from + (to - from) * eased);
    return to >= from ? Math.min(to, Math.max(from, rounded)) : Math.max(to, Math.min(from, rounded));
}
