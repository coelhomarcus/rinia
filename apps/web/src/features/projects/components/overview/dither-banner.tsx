import { useEffect, useRef } from "react";
import { useReducedMotion } from "@/hooks/use-reduced-motion";
import { cx } from "@/utils/cx";
import { BAYER } from "./dither";

/** Side of one banner pixel, in CSS pixels. */
const PIXEL = 3;
/** Frames drawn per second; the waves move slowly, so more would only cost battery. */
const FPS = 24;
/** Opacity of a lit pixel, 0 to 255. */
const ALPHA = 200;

/**
 * How lit the banner is at pixel (x, y) of a banner `rows` pixels tall, `t` seconds in, from 0 to 1: three slow waves
 * crossing each other, fading out toward the bottom edge so the page below starts clean.
 */
function bannerLevel(x: number, y: number, rows: number, t: number): number {
    // Gone by about three quarters of the way down, so the last rows stay empty and the band has no hard edge.
    const fade = Math.max(0, 1 - y / (rows * 0.72)) ** 1.3;
    const ripple = Math.hypot(x - 90 - 50 * Math.sin(t * 0.17), y * 1.8);
    const waves = (Math.sin(x * 0.035 + t * 0.45) + Math.sin((x * 0.55 + y) * 0.06 - t * 0.3) + Math.sin(ripple * 0.05 - t * 0.7) + 3) / 6;
    // Smoothstep pushes the waves apart, so crests and troughs read as shapes rather than one even haze.
    return fade * (0.1 + 0.75 * waves * waves * (3 - 2 * waves));
}

/** The element's CSS `color` as RGB, whatever format it was written in, read back from a one-pixel canvas. */
function resolveColor(element: HTMLElement): [number, number, number] {
    const probe = document.createElement("canvas");
    probe.width = probe.height = 1;
    const context = probe.getContext("2d", { willReadFrequently: true });
    if (!context) return [94, 106, 210];
    context.fillStyle = getComputedStyle(element).color;
    context.fillRect(0, 0, 1, 1);
    const [r = 0, g = 0, b = 0] = context.getImageData(0, 0, 1, 1).data;
    return [r, g, b];
}

/**
 * A band of slowly moving ordered-dither pixels in `color` (any CSS colour, the theme's chart colour by default),
 * fading out downward. Decorative: it ignores the pointer and is hidden from assistive technology. It pauses while
 * off screen or in a background tab, and holds still for people who asked for less motion.
 */
export function DitherBanner({ color, className }: { color?: string | null; className?: string }) {
    const box = useRef<HTMLDivElement>(null);
    const canvas = useRef<HTMLCanvasElement>(null);
    const reducedMotion = useReducedMotion();

    useEffect(() => {
        const wrapper = box.current;
        const element = canvas.current;
        const context = element?.getContext("2d");
        if (!wrapper || !element || !context) return;

        let pixels = new Uint32Array(0);
        let image: ImageData | null = null;
        let packed = 0;
        let frame = 0;
        let last = -Infinity;
        let onScreen = true;
        const start = performance.now();

        const pickColor = () => {
            const [r, g, b] = resolveColor(element);
            // ImageData is RGBA in memory, which a little-endian Uint32 reads as ABGR.
            packed = ((ALPHA << 24) | (b << 16) | (g << 8) | r) >>> 0;
        };

        const draw = (t: number) => {
            if (!image) return;
            const { width: cols, height: rows } = image;
            for (let y = 0; y < rows; y++) {
                const row = y * cols;
                const bayerRow = (y & 3) * 4;
                for (let x = 0; x < cols; x++) {
                    // Level n of 16 lights the n pixels whose threshold is below it, so a level under 1 lights nothing.
                    pixels[row + x] = BAYER[bayerRow + (x & 3)] + 1 <= bannerLevel(x, y, rows, t) * 16 ? packed : 0;
                }
            }
            context.putImageData(image, 0, 0);
        };

        const resize = () => {
            const cols = Math.max(1, Math.ceil(wrapper.clientWidth / PIXEL));
            const rows = Math.max(1, Math.ceil(wrapper.clientHeight / PIXEL));
            if (image && image.width === cols && image.height === rows) return;
            element.width = cols;
            element.height = rows;
            element.style.width = `${cols * PIXEL}px`;
            element.style.height = `${rows * PIXEL}px`;
            image = context.createImageData(cols, rows);
            pixels = new Uint32Array(image.data.buffer);
            draw(reducedMotion ? 0 : (performance.now() - start) / 1000);
        };

        const tick = (now: number) => {
            frame = requestAnimationFrame(tick);
            if (!onScreen || document.hidden || now - last < 1000 / FPS) return;
            last = now;
            draw((now - start) / 1000);
        };

        pickColor();
        resize();
        const sized = new ResizeObserver(resize);
        sized.observe(wrapper);
        // The default colour follows the theme, so it is read again when the theme changes.
        const themed = new MutationObserver(() => {
            pickColor();
            draw(reducedMotion ? 0 : (performance.now() - start) / 1000);
        });
        themed.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme", "class"] });
        const seen = new IntersectionObserver(([entry]) => (onScreen = entry?.isIntersecting ?? true));
        seen.observe(wrapper);
        if (!reducedMotion) frame = requestAnimationFrame(tick);

        return () => {
            cancelAnimationFrame(frame);
            sized.disconnect();
            themed.disconnect();
            seen.disconnect();
        };
    }, [color, reducedMotion]);

    return (
        <div ref={box} aria-hidden="true" className={cx("pointer-events-none overflow-hidden", className)}>
            <canvas ref={canvas} aria-hidden="true" className="block [image-rendering:pixelated]" style={{ color: color ?? "var(--chart-series-1)" }} />
        </div>
    );
}
