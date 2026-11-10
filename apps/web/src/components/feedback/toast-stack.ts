/** How far behind the front toast this one sits. The newest toast is last, so its depth is 0. */
export function toastDepth(index: number, count: number) {
    return Math.max(0, count - 1 - index);
}

/** Time left after a pause, never negative. */
export function toastRemaining(remaining: number, elapsed: number) {
    return Math.max(0, remaining - elapsed);
}

/**
 * Collapsed toasts sit behind the newest one. Expanded, each moves up by its own height so a keyboard
 * user can read and reach every one.
 */
export function toastStackTransform(depth: number, expanded: boolean, visible: boolean) {
    if (!visible) return "translateY(8px) scale(0.96)";
    if (depth === 0) return "translateY(0px) scale(1)";
    if (expanded) return `translateY(calc(${-depth} * (100% + 8px))) scale(1)`;
    const scale = Math.max(0.9, 1 - depth * 0.05);
    return `translateY(${-depth * 10}px) scale(${scale})`;
}
