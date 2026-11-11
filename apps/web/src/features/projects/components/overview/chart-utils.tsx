import { useLayoutEffect, useRef, useState } from "react";
import { cx } from "@/utils/cx";

/** A YYYY-MM-DD day from the API as a Date at UTC midnight, so formatting never shifts it a day. */
export function parseDay(day: string): Date {
    const [year, month, date] = day.split("-").map(Number);
    return new Date(Date.UTC(year!, month! - 1, date!));
}

export function formatDay(day: string, locale: string, options: Intl.DateTimeFormatOptions = { day: "numeric", month: "short" }): string {
    return new Intl.DateTimeFormat(locale, { ...options, timeZone: "UTC" }).format(parseDay(day));
}

/** The rendered width of an element, kept current as the layout changes. */
export function useElementWidth<T extends HTMLElement>() {
    const ref = useRef<T>(null);
    const [width, setWidth] = useState(0);
    useLayoutEffect(() => {
        const element = ref.current;
        if (!element) return;
        setWidth(element.clientWidth);
        const observer = new ResizeObserver(([entry]) => setWidth(Math.round(entry!.contentRect.width)));
        observer.observe(element);
        return () => observer.disconnect();
    }, []);
    return [ref, width] as const;
}

export interface TooltipRow {
    key: string;
    label: string;
    value: string;
    /** The series colour, drawn as a short line key beside the row. */
    color?: string;
}

/**
 * The hover readout shared by the charts: the day, then each value with its series key. `x` and `y` are relative
 * to the chart's positioned box; the tooltip flips to stay inside it.
 */
export function ChartTooltip({ x, y, width, height, title, rows, className }: { x: number; y: number; width: number; height?: number; title: string; rows: TooltipRow[]; className?: string }) {
    const flip = x > width - 180;
    // Kept inside the chart's height, so a value near the baseline does not push the readout below it.
    if (height) {
        const half = 14 + rows.length * 9;
        y = Math.max(half, Math.min(height - half, y));
    }
    return (
        <div
            role="status"
            aria-live="polite"
            className={cx("pointer-events-none absolute z-10 min-w-36 rounded-md border border-subtle bg-layer-2 px-2.5 py-2 text-xs shadow-overlay-200", className)}
            style={{ left: x, top: y, transform: `translate(${flip ? "calc(-100% - 12px)" : "12px"}, -50%)` }}
        >
            <p className="mb-1 font-medium text-secondary">{title}</p>
            <ul className="flex flex-col gap-0.5">
                {rows.map((row) => (
                    <li key={row.key} className="flex items-center gap-2">
                        {row.color && <span aria-hidden="true" className="h-0.5 w-2.5 shrink-0 rounded-full" style={{ background: row.color }} />}
                        <span className="font-semibold text-primary tabular-nums">{row.value}</span>
                        <span className="text-tertiary">{row.label}</span>
                    </li>
                ))}
            </ul>
        </div>
    );
}

/** Screen readers and anyone who prefers numbers get every value as a table. */
export function ChartTable({ caption, columns, rows }: { caption: string; columns: string[]; rows: Array<{ key: string; cells: Array<string | number> }> }) {
    return (
        <table className="sr-only">
            <caption>{caption}</caption>
            <thead>
                <tr>
                    {columns.map((column) => (
                        <th key={column} scope="col">
                            {column}
                        </th>
                    ))}
                </tr>
            </thead>
            <tbody>
                {rows.map((row) => (
                    <tr key={row.key}>
                        {row.cells.map((cell, index) => (index === 0 ? <th key={index} scope="row">{cell}</th> : <td key={index}>{cell}</td>))}
                    </tr>
                ))}
            </tbody>
        </table>
    );
}
