import { useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import type { ProjectActivityDay } from "@rinia/shared";
import { useTranslation } from "react-i18next";
import { cx } from "@/utils/cx";
import { ChartTooltip, ChartTable, formatDay, parseDay, useElementWidth, type TooltipRow } from "./chart-utils";
import { ditherStyle } from "./dither";

/** Cells grow to fill the width, between these steps (cell plus gap); below the smallest the map scrolls. */
const MIN_STEP = 10;
const MAX_STEP = 20;
const LABEL_WIDTH = 28;
const LEVELS = [0, 1, 2, 3, 4] as const;
/** How many of a dither tile's 16 pixels each level lights: one dot for an empty day, then a dot grid, a checkerboard, nearly solid and solid. */
const DENSITY = [1, 4, 8, 14, 16] as const;
/** A day's cell, `size` pixels wide: one dither tile of accent pixels at its level, or faint dots for a day with nothing. */
const levelStyle = (level: number, size: number) => ditherStyle(level === 0 ? "var(--color-text-placeholder)" : "var(--chart-series-1)", DENSITY[level] ?? 16, size);

const total = (day: ProjectActivityDay) => day.created + day.completed + day.updated;

/** 0 for an empty day, then 1 to 4 by the day's share of the busiest day. */
export function activityLevel(value: number, max: number): number {
    return value <= 0 || max <= 0 ? 0 : Math.min(4, Math.max(1, Math.ceil((4 * value) / max)));
}

/** A weekday's short name, such as "Seg" or "Mon", from a known Monday (2024-01-01) plus `offset` days. */
function weekdayName(locale: string, offset: number) {
    const name = new Intl.DateTimeFormat(locale, { weekday: "short", timeZone: "UTC" }).format(new Date(Date.UTC(2024, 0, 1 + offset))).replace(/\.$/, "");
    return name.charAt(0).toUpperCase() + name.slice(1);
}

/**
 * A year of project activity, one cell per day in week columns (Sunday on top), like a contribution graph. Each
 * cell's shade is that day's created, completed and updated issues together. Hover a cell, or focus the map and
 * use the arrow keys, to read the day.
 */
export function ContributionHeatmap({ activity }: { activity: ProjectActivityDay[] }) {
    const { t, i18n } = useTranslation();
    const locale = i18n.language;
    const [wrapper, available] = useElementWidth<HTMLDivElement>();
    const scroller = useRef<HTMLDivElement>(null);
    const [active, setActive] = useState<{ index: number; x: number; y: number } | null>(null);

    const { weeks, lead, max, sum, months } = useMemo(() => {
        const lead = activity.length ? parseDay(activity[0]!.date).getUTCDay() : 0;
        const weeks = Math.ceil((lead + activity.length) / 7);
        const max = Math.max(0, ...activity.map(total));
        const sum = activity.reduce((value, day) => value + total(day), 0);
        // A month is named over the first week that holds its 1st, unless the previous name is too close.
        const months: Array<{ week: number; label: string }> = [];
        activity.forEach((day, index) => {
            if (parseDay(day.date).getUTCDate() !== 1) return;
            const week = Math.floor((lead + index) / 7);
            if (months.length && week - months.at(-1)!.week < 3) return;
            months.push({ week, label: formatDay(day.date, locale, { month: "short" }).replace(/\.$/, "") });
        });
        return { weeks, lead, max, sum, months };
    }, [activity, locale]);

    const step = available ? Math.max(MIN_STEP, Math.min(MAX_STEP, Math.floor((available - LABEL_WIDTH) / weeks))) : MAX_STEP;
    // Each cell holds one 4×4 dither tile. An even size keeps its pixels whole on high-density screens; the gap takes the rest.
    const cell = Math.floor((step - 2) / 2) * 2;
    const gap = step - cell;
    // A whole-pixel step leaves up to a pixel per week unused; the columns spread over it so the map meets both edges.
    const natural = weeks * step - gap;
    const gridWidth = available ? Math.max(natural, Math.min(available - LABEL_WIDTH, natural + weeks)) : natural;
    /** The distance from one week's column to the next, once spread. */
    const pitch = weeks > 1 ? (gridWidth - cell) / (weeks - 1) : step;

    // The newest weeks are the ones that matter; on a narrow screen the map opens scrolled to them.
    useLayoutEffect(() => {
        if (scroller.current) scroller.current.scrollLeft = scroller.current.scrollWidth;
    }, [activity.length, step]);

    function show(index: number, { reveal = false } = {}) {
        const target = scroller.current?.querySelector<HTMLElement>(`[data-index="${index}"]`);
        const box = wrapper.current?.getBoundingClientRect();
        if (!target || !box) return;
        if (reveal) target.scrollIntoView({ block: "nearest", inline: "nearest" });
        const rect = target.getBoundingClientRect();
        setActive({ index, x: rect.left - box.left + rect.width / 2, y: rect.top - box.top + rect.height / 2 });
    }

    function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
        const moves: Record<string, number> = { ArrowRight: 7, ArrowLeft: -7, ArrowDown: 1, ArrowUp: -1 };
        const current = active?.index ?? activity.length - 1;
        let next: number | null = null;
        if (event.key in moves) next = current + moves[event.key]!;
        else if (event.key === "Home") next = 0;
        else if (event.key === "End") next = activity.length - 1;
        else if (event.key === "Escape") return setActive(null);
        if (next === null) return;
        event.preventDefault();
        show(Math.max(0, Math.min(activity.length - 1, next)), { reveal: true });
    }

    const day = active ? activity[active.index] : undefined;
    const rows: TooltipRow[] = [];
    if (day?.completed) rows.push({ key: "completed", label: "", value: t("projectStats.completedCount", { count: day.completed }) });
    if (day?.created) rows.push({ key: "created", label: "", value: t("projectStats.createdCount", { count: day.created }) });
    if (day?.updated) rows.push({ key: "updated", label: "", value: t("projectStats.updatedCount", { count: day.updated }) });

    return (
        <div ref={wrapper} className="relative">
            <div ref={scroller} className="overflow-x-auto pb-1">
                <div className="relative" style={{ width: LABEL_WIDTH + gridWidth }}>
                    <div aria-hidden="true" className="mb-1 flex h-3">
                        {/* While the map scrolls, month names slide under the weekday column instead of beside it. */}
                        <div className="sticky left-0 z-[1] shrink-0 bg-surface-1" style={{ width: LABEL_WIDTH }} />
                        <div className="relative flex-1">
                            {months.map((month) => (
                                <span key={`${month.week}-${month.label}`} className="absolute text-[11px] leading-3 text-tertiary" style={{ left: month.week * pitch }}>
                                    {month.label}
                                </span>
                            ))}
                        </div>
                    </div>
                    <div className="flex">
                        <div aria-hidden="true" className="sticky left-0 z-[1] shrink-0 bg-surface-1" style={{ width: LABEL_WIDTH, height: 7 * step - gap }}>
                            {[1, 3, 5].map((row) => (
                                <span key={row} className="absolute left-0 text-[11px] text-tertiary" style={{ top: row * step, lineHeight: `${cell}px` }}>
                                    {weekdayName(locale, row - 1)}
                                </span>
                            ))}
                        </div>
                        <div
                            role="img"
                            tabIndex={0}
                            aria-label={`${t("projectStats.heatmapLabel")}: ${t("projectStats.heatmapSummary", { count: sum })}`}
                            className="grid rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-accent-strong focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg-surface-1)]"
                            style={{ width: gridWidth, gridTemplateRows: `repeat(7, ${cell}px)`, gridTemplateColumns: `repeat(${weeks}, ${cell}px)`, gridAutoFlow: "column", gap, justifyContent: "space-between" }}
                            onKeyDown={onKeyDown}
                            onBlur={() => setActive(null)}
                            onMouseLeave={() => setActive(null)}
                            onMouseOver={(event) => {
                                const index = Number((event.target as HTMLElement).closest<HTMLElement>("[data-index]")?.dataset.index);
                                if (Number.isInteger(index) && index !== active?.index) show(index);
                            }}
                        >
                            {Array.from({ length: lead }, (_, index) => (
                                <span key={`lead-${index}`} aria-hidden="true" />
                            ))}
                            {activity.map((entry, index) => (
                                <span
                                    key={entry.date}
                                    data-index={index}
                                    aria-hidden="true"
                                    className={cx("transition-[outline-color] duration-100", active?.index === index && "outline-2 outline-offset-1 outline-[var(--txt-primary)]")}
                                    style={levelStyle(activityLevel(total(entry), max), cell)}
                                />
                            ))}
                        </div>
                    </div>
                </div>
            </div>
            <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[11px] text-tertiary">
                <span>{t("projectStats.heatmapSummary", { count: sum })}</span>
                <span className="flex items-center gap-1" aria-hidden="true">
                    {t("projectStats.less")}
                    {LEVELS.map((level) => (
                        <span key={level} className="size-2.5" style={levelStyle(level, 10)} />
                    ))}
                    {t("projectStats.more")}
                </span>
            </div>
            {day && active && (
                <ChartTooltip
                    x={active.x}
                    y={active.y}
                    width={available}
                    title={formatDay(day.date, locale, { weekday: "short", day: "numeric", month: "short", year: "numeric" })}
                    rows={rows.length ? rows : [{ key: "none", label: "", value: t("projectStats.noActivity") }]}
                />
            )}
            <ChartTable
                caption={`${t("projectStats.heatmapLabel")} · ${t("projectStats.tableCaption")}`}
                columns={[t("projectStats.date"), t("projectStats.completedTitle"), t("projectStats.createdTitle"), t("projectStats.total")]}
                rows={activity.filter((entry) => total(entry) > 0).map((entry) => ({ key: entry.date, cells: [formatDay(entry.date, locale, { day: "numeric", month: "long", year: "numeric" }), entry.completed, entry.created, total(entry)] }))}
            />
        </div>
    );
}
