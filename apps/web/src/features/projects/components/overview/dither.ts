/** Side of one dither pixel, in CSS pixels. Shapes snap to whole pixels so their edges stay crisp. */
export const DITHER_PIXEL = 2;

/** The 4×4 ordered-dither (Bayer) thresholds: at level `n` of 16, the pixels whose threshold is below `n` are lit. */
export const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];

/** Side of one repeating dither tile, in CSS pixels. */
export const DITHER_TILE = 4 * DITHER_PIXEL;

/** The lit pixels of a 4×4 dither tile at `level` of 16, as one SVG path. */
function tilePath(level: number): string {
    let path = "";
    BAYER.forEach((threshold, index) => {
        if (threshold < level) path += `M${(index % 4) * DITHER_PIXEL} ${Math.floor(index / 4) * DITHER_PIXEL}h${DITHER_PIXEL}v${DITHER_PIXEL}h-${DITHER_PIXEL}z`;
    });
    return path;
}

/** Each level's tile path, from 0 (nothing lit) to 16 (solid). */
export const DITHER_TILES = Array.from({ length: 17 }, (_, level) => tilePath(level));

/**
 * Each level's tile as a CSS mask: give an element a colour as its background and one of these as its mask, and it
 * shows that colour dithered. A mask rather than an image, so the colour can still come from a CSS variable.
 */
export const DITHER_MASKS = DITHER_TILES.map((path) => {
    const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='${DITHER_TILE}' height='${DITHER_TILE}' shape-rendering='crispEdges'><path d='${path}'/></svg>`;
    return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
});

/**
 * Style that draws an element's background `color` dithered at `level` of 16. `tile` is the side of one repeat in CSS
 * pixels; pass the element's own size to fit exactly one tile in it, so every shade keeps its whole, symmetric pattern.
 */
export function ditherStyle(color: string, level: number, tile = DITHER_TILE) {
    const mask = DITHER_MASKS[Math.max(0, Math.min(16, Math.round(level)))];
    const size = `${tile}px ${tile}px`;
    return { background: color, maskImage: mask, maskSize: size, maskRepeat: "repeat", WebkitMaskImage: mask, WebkitMaskSize: size, WebkitMaskRepeat: "repeat" } as const;
}

/**
 * A bar `filled` pixels long as runs of equal dither level: `from` at its start, rising to solid at its last pixel,
 * so the bar's end, its value, reads sharply.
 */
export function ditherRuns(filled: number, from = 4): Array<{ x: number; width: number; level: number }> {
    const runs: Array<{ x: number; width: number; level: number }> = [];
    for (let x = 0; x < filled; x++) {
        const level = Math.round(from + (16 - from) * ((x + 1) / filled));
        const last = runs.at(-1);
        if (last?.level === level) last.width++;
        else runs.push({ x, width: 1, level });
    }
    return runs;
}
