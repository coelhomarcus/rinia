/** WCAG 2.x colour contrast for `#rgb` / `#rrggbb` colours. */

export const ICON_BACKING_LIGHT = "#fafafa";
export const ICON_BACKING_DARK = "#111827";

function channels(hex: string): [number, number, number] {
    const match = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
    if (!match) throw new Error(`Invalid hex colour: ${hex}`);
    const digits = match[1].length === 3 ? [...match[1]].map((digit) => digit + digit).join("") : match[1];
    const value = Number.parseInt(digits, 16);
    return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

function toHex(rgb: [number, number, number]) {
    return `#${rgb.map((channel) => Math.round(channel).toString(16).padStart(2, "0")).join("")}`;
}

/** Relative luminance from 0 (black) to 1 (white). */
export function relativeLuminance(hex: string): number {
    const [r, g, b] = channels(hex).map((channel) => {
        const value = channel / 255;
        return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Contrast ratio from 1 (same colour) to 21 (black on white); the order of the colours does not matter. */
export function contrastRatio(a: string, b: string): number {
    const [lighter, darker] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x);
    return (lighter + 0.05) / (darker + 0.05);
}

/** Paints `top` over `base` at `alpha` (0–1), the way the browser composites a translucent layer. */
export function compositeColor(base: string, top: string, alpha: number): string {
    const below = channels(base);
    const above = channels(top);
    return toHex([0, 1, 2].map((index) => below[index] + (above[index] - below[index]) * alpha) as [number, number, number]);
}

/**
 * The opaque square drawn behind a coloured glyph so it reads on any banner: light or dark,
 * whichever contrasts more. Either choice stays above 4:1, past the 3:1 WCAG 1.4.11 asks of icons.
 */
export function readableBacking(color: string): typeof ICON_BACKING_LIGHT | typeof ICON_BACKING_DARK {
    return contrastRatio(color, ICON_BACKING_LIGHT) >= contrastRatio(color, ICON_BACKING_DARK) ? ICON_BACKING_LIGHT : ICON_BACKING_DARK;
}
