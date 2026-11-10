import { useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { Check } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cx } from "@/utils/cx";

export const DEFAULT_ICON_COLOR = "#5e6ad2";

const PRESETS = ["#8a8f98", "#5e6ad2", "#0097ff", "#26b5ce", "#4cb782", "#f2c94c", "#f2994a", "#eb5757", "#e255a1", "#9b51e0"];

export function iconBackground(color: string) {
    return `color-mix(in srgb, ${color} 18%, transparent)`;
}

interface IconColorPickerProps {
    color: string | null;
    /** Fires while dragging so the caller can preview the color without saving it. */
    onPreview?: (color: string) => void;
    /** Fires once per committed color: a swatch click, the end of a drag, or a complete hex value. */
    onChange: (color: string | null) => void;
}

export function IconColorPicker({ color, onPreview, onChange }: IconColorPickerProps) {
    const { t } = useTranslation();
    const [custom, setCustom] = useState(() => !!color && !PRESETS.includes(color));
    const [hsv, setHsv] = useState(() => hexToHsv(color ?? DEFAULT_ICON_COLOR));
    const [draft, setDraft] = useState((color ?? DEFAULT_ICON_COLOR).slice(1).toUpperCase());
    const [lastColor, setLastColor] = useState(color);
    if (color !== lastColor) {
        setLastColor(color);
        if (color && color !== hsvToHex(hsv.h, hsv.s, hsv.v)) setHsv(hexToHsv(color));
        setDraft((color ?? DEFAULT_ICON_COLOR).slice(1).toUpperCase());
    }
    const live = hsvToHex(hsv.h, hsv.s, hsv.v);

    function paint(next: { h: number; s: number; v: number }) {
        const hex = hsvToHex(next.h, next.s, next.v);
        setHsv(next);
        setDraft(hex.slice(1).toUpperCase());
        onPreview?.(hex);
    }

    function movePlane(event: ReactPointerEvent<HTMLDivElement>) {
        const rect = event.currentTarget.getBoundingClientRect();
        paint({ h: hsv.h, s: clamp((event.clientX - rect.left) / rect.width), v: 1 - clamp((event.clientY - rect.top) / rect.height) });
    }

    function moveHue(event: ReactPointerEvent<HTMLDivElement>) {
        const rect = event.currentTarget.getBoundingClientRect();
        paint({ h: clamp((event.clientY - rect.top) / rect.height) * 359.9, s: hsv.s, v: hsv.v });
    }

    function dragHandlers(move: (event: ReactPointerEvent<HTMLDivElement>) => void) {
        return {
            onPointerDown: (event: ReactPointerEvent<HTMLDivElement>) => {
                event.currentTarget.setPointerCapture(event.pointerId);
                move(event);
            },
            onPointerMove: (event: ReactPointerEvent<HTMLDivElement>) => {
                if (event.currentTarget.hasPointerCapture(event.pointerId)) move(event);
            },
            onPointerUp: () => onChange(live),
        };
    }

    const swatch = "relative grid size-5 shrink-0 place-items-center rounded-full outline-offset-2 focus-visible:outline-2 focus-visible:outline-accent-strong";

    return (
        <div className="flex flex-col gap-2" role="group" aria-label={t("appearance.iconColor")}>
            <div className="flex items-center gap-2">
                <button type="button" aria-label={t("appearance.defaultColor")} aria-pressed={!color} className={cx(swatch, "border border-dashed border-primary text-tertiary")} onClick={() => onChange(null)}>
                    {!color && <Check className="size-3" />}
                </button>
                {PRESETS.map((preset) => (
                    <button key={preset} type="button" aria-label={preset} aria-pressed={color === preset} className={swatch} style={{ backgroundColor: preset }} onClick={() => onChange(preset)}>
                        {color === preset && <Check className="size-3 text-white" />}
                    </button>
                ))}
                <button
                    type="button"
                    aria-label={t("appearance.customColor")}
                    aria-expanded={custom}
                    className={cx(swatch, "ml-auto", custom && "ring-2 ring-accent-strong ring-offset-1 ring-offset-transparent")}
                    style={{ background: "conic-gradient(#ff4d4d, #ffd84d, #4dff88, #4dd2ff, #6b4dff, #ff4dd8, #ff4d4d)" }}
                    onClick={() => setCustom((open) => !open)}
                />
            </div>
            {custom && (
                <>
                    <div className="flex gap-2">
                        <div
                            role="slider"
                            aria-label={t("appearance.iconColor")}
                            aria-valuemin={0}
                            aria-valuemax={100}
                            aria-valuenow={Math.round(hsv.s * 100)}
                            tabIndex={0}
                            className="relative h-24 min-w-0 flex-1 cursor-crosshair touch-none rounded-md"
                            style={{ background: `linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, hsl(${hsv.h} 100% 50%))` }}
                            {...dragHandlers(movePlane)}
                        >
                            <span aria-hidden="true" className="pointer-events-none absolute size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-sm" style={{ left: `${hsv.s * 100}%`, top: `${(1 - hsv.v) * 100}%`, backgroundColor: live }} />
                        </div>
                        <div
                            role="slider"
                            aria-label={t("appearance.hue")}
                            aria-valuemin={0}
                            aria-valuemax={360}
                            aria-valuenow={Math.round(hsv.h)}
                            tabIndex={0}
                            className="relative h-24 w-3 shrink-0 cursor-pointer touch-none rounded-full"
                            style={{ background: "linear-gradient(to bottom, #ff0000, #ffff00, #00ff00, #00ffff, #0000ff, #ff00ff, #ff0000)" }}
                            {...dragHandlers(moveHue)}
                        >
                            <span aria-hidden="true" className="pointer-events-none absolute left-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white" style={{ top: `${(hsv.h / 360) * 100}%`, backgroundColor: `hsl(${hsv.h} 100% 50%)` }} />
                        </div>
                    </div>
                    <label className="flex h-8 items-center gap-2 rounded-md border border-subtle px-2">
                        <span aria-hidden="true" className="size-4 shrink-0 rounded-full" style={{ backgroundColor: live }} />
                        <span className="text-xs text-tertiary">HEX</span>
                        <input
                            aria-label={t("appearance.hexColor")}
                            value={draft}
                            spellCheck={false}
                            maxLength={6}
                            onChange={(event) => {
                                const next = event.target.value.replace(/[^0-9a-fA-F]/g, "").slice(0, 6).toUpperCase();
                                setDraft(next);
                                if (next.length === 6) onChange(`#${next.toLowerCase()}`);
                            }}
                            className="min-w-0 flex-1 bg-transparent font-mono text-sm text-primary uppercase outline-none"
                        />
                    </label>
                </>
            )}
        </div>
    );
}

function clamp(value: number) {
    return Math.min(1, Math.max(0, value));
}

function hexToHsv(hex: string) {
    const parsed = /^#([0-9a-fA-F]{6})$/.exec(hex);
    const raw = parsed ? Number.parseInt(parsed[1], 16) : 0x5e6ad2;
    const r = ((raw >> 16) & 255) / 255;
    const g = ((raw >> 8) & 255) / 255;
    const b = (raw & 255) / 255;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const delta = max - min;
    let h = 0;
    if (delta) {
        if (max === r) h = ((g - b) / delta) % 6;
        else if (max === g) h = (b - r) / delta + 2;
        else h = (r - g) / delta + 4;
        h *= 60;
        if (h < 0) h += 360;
    }
    return { h, s: max === 0 ? 0 : delta / max, v: max };
}

function hsvToHex(h: number, s: number, v: number) {
    const c = v * s;
    const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
    const m = v - c;
    const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
    const channel = (value: number) => Math.round((value + m) * 255).toString(16).padStart(2, "0");
    return `#${channel(r)}${channel(g)}${channel(b)}`;
}
