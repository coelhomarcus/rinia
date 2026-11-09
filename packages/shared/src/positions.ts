/** Card positions start this far apart, so a card can be dropped between two others many times. */
export const POSITION_GAP = 1000;

/**
 * Positions for `count` cards moved into a column without a place picked for them, as from a status menu: they go to
 * the top, above `firstPosition` (the column's current top card, if any), in the order given.
 */
export function positionsAtTop(firstPosition: number | null | undefined, count: number): number[] {
    const top = firstPosition ?? POSITION_GAP * (count + 1);
    return Array.from({ length: count }, (_, index) => top - POSITION_GAP * (count - index));
}

/**
 * The position for an item entering `siblings` at `index`. `siblings` is in visual order and leaves out the item
 * itself. Between two neighbours it takes the midpoint; at either end it steps one gap past the last one. Cards,
 * list rows and board columns all use it.
 */
export function positionAtIndex(siblings: ReadonlyArray<{ position: number }>, index: number): number {
    const before = siblings[index - 1];
    const after = siblings[index];
    if (!before && !after) return POSITION_GAP;
    if (!before) return after.position - POSITION_GAP;
    if (!after) return before.position + POSITION_GAP;
    return (before.position + after.position) / 2;
}

/**
 * Whether two neighbouring positions are too close to drop anything else between them. Positions are doubles: each
 * drop between the same two neighbours halves their gap, and once it nears the precision of the numbers the midpoint
 * stops falling strictly between them. The threshold grows with the size of the numbers and leaves about 2^22 steps
 * of precision in the gap, so the order is spread out again long before two positions could meet.
 */
export function positionsTooClose(lower: number | null | undefined, upper: number | null | undefined): boolean {
    if (lower == null || upper == null) return false;
    const scale = Math.max(Math.abs(lower), Math.abs(upper), POSITION_GAP);
    return upper - lower < scale * 2 ** -30;
}

