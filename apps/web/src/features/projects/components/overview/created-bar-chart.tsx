import { useState, type KeyboardEvent } from "react";
import type { Granularity, PeriodBucket } from "./period-buckets";
import { useTranslation } from "react-i18next";
import { axisStartLabel, bucketLabel, ChartHeader, ChartTable, ChartTooltip, niceMax, useElementWidth } from "./chart-utils";

const HEIGHT = 150;
const PAD = { top: 10, right: 10, bottom: 22, left: 30 };
/** The gap, in the surface colour, between a bar's two segments. */
const SEGMENT_GAP = 2;
const RADIUS = 4;
const SERIES = [
    { key: "createdWeb", color: "var(--chart-series-1)" },
    { key: "createdMcp", color: "var(--chart-series-2)" },
] as const;

/** A bar segment with rounded top corners and a square bottom, so the stack reads as growing from the baseline. */
export function roundedTopBar(x: number, y: number, width: number, height: number, radius: number): string {
    const r = Math.max(0, Math.min(radius, width / 2, height));
    return `M${x},${y + height}V${y + r}Q${x},${y} ${x + r},${y}H${x + width - r}Q${x + width},${y} ${x + width},${y + r}V${y + height}Z`;
}

const PER = { day: "projectStats.perDay", week: "projectStats.perWeek", month: "projectStats.perMonth" } as const;

/** Issues created since the project began, per day, week or month, stacked by where: in the app, or through MCP. */
export function CreatedBarChart({ buckets, granularity }: { buckets: PeriodBucket[]; granularity: Granularity }) {
    const { t, i18n } = useTranslation();
    const [ref, width] = useElementWidth<HTMLDivElement>();
    const [hover, setHover] = useState<number | null>(null);
    const number = new Intl.NumberFormat(i18n.language);
    const labels = { createdWeb: t("projectStats.seriesWeb"), createdMcp: t("projectStats.seriesMcp") };
    const title = `${t("projectStats.createdTitle")} · ${t(PER[granularity])}`;

    const totals = { createdWeb: 0, createdMcp: 0 };
    for (const day of buckets) {
        totals.createdWeb += day.createdWeb;
        totals.createdMcp += day.createdMcp;
    }
    const totalCreated = totals.createdWeb + totals.createdMcp;
    const top = niceMax(Math.max(0, ...buckets.map((day) => day.createdWeb + day.createdMcp)));
    const plotWidth = Math.max(0, width - PAD.left - PAD.right);
    const plotHeight = HEIGHT - PAD.top - PAD.bottom;
    const baseline = PAD.top + plotHeight;
    const slot = buckets.length ? plotWidth / buckets.length : 0;
    // Thin bars: never wider than 24px, and always at least the surface gap apart.
    const barWidth = Math.max(1, Math.min(24, slot * 0.6, slot - SEGMENT_GAP));
    const scale = (value: number) => (value / top) * plotHeight;
    const y = (value: number) => baseline - scale(value);
    const last = buckets.length - 1;

    function onKeyDown(event: KeyboardEvent<SVGSVGElement>) {
        const step = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
        if (event.key === "Escape") return setHover(null);
        if (!step) return;
        event.preventDefault();
        setHover((current) => Math.max(0, Math.min(last, (current ?? last) + step)));
    }

    const hovered = hover === null ? undefined : buckets[hover];

    return (
        <section aria-label={title} className="min-w-0">
            <ChartHeader title={title} figure={t("projectStats.createdTotal", { count: totalCreated })}>
                <ul className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-secondary">
                    {SERIES.map((series) => (
                        <li key={series.key} className="flex items-center gap-2">
                            <span aria-hidden="true" className="size-2.5 rounded-[2px]" style={{ background: series.color }} />
                            {labels[series.key]} <span className="text-tertiary tabular-nums">({number.format(totals[series.key])})</span>
                        </li>
                    ))}
                </ul>
            </ChartHeader>
            <div ref={ref} className="relative mt-3">
                {width > 0 && (
                    <svg
                        width={width}
                        height={HEIGHT}
                        role="img"
                        tabIndex={0}
                        aria-label={`${t("projectStats.createdTitle")}: ${labels.createdWeb} ${totals.createdWeb}, ${labels.createdMcp} ${totals.createdMcp}`}
                        className="block rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-accent-strong"
                        onPointerLeave={() => setHover(null)}
                        onKeyDown={onKeyDown}
                        onBlur={() => setHover(null)}
                    >
                        {[0, top / 2, top].map((tick) => (
                            <g key={tick}>
                                <line x1={PAD.left} x2={PAD.left + plotWidth} y1={y(tick)} y2={y(tick)} stroke="var(--chart-grid)" strokeWidth={1} shapeRendering="crispEdges" />
                                {Number.isInteger(tick) && (
                                    <text x={PAD.left - 8} y={y(tick)} dy="0.32em" textAnchor="end" className="fill-[var(--txt-tertiary)] text-[11px] tabular-nums">
                                        {number.format(tick)}
                                    </text>
                                )}
                            </g>
                        ))}
                        {buckets.map((day, index) => {
                            const left = PAD.left + index * slot + (slot - barWidth) / 2;
                            const webHeight = scale(day.createdWeb);
                            const mcpHeight = scale(day.createdMcp);
                            // The upper segment gives up the gap, so the bar's total height stays true to the scale.
                            const mcpDrawn = day.createdWeb > 0 ? Math.max(0, mcpHeight - SEGMENT_GAP) : mcpHeight;
                            const dimmed = hover !== null && hover !== index;
                            return (
                                <g key={day.start} opacity={dimmed ? 0.45 : 1} className="transition-opacity duration-100">
                                    {day.createdWeb > 0 && (
                                        <path d={day.createdMcp > 0 ? `M${left},${baseline}V${baseline - webHeight}H${left + barWidth}V${baseline}Z` : roundedTopBar(left, baseline - webHeight, barWidth, webHeight, RADIUS)} fill={SERIES[0].color} />
                                    )}
                                    {day.createdMcp > 0 && mcpDrawn > 0 && <path d={roundedTopBar(left, baseline - webHeight - mcpHeight, barWidth, mcpDrawn, RADIUS)} fill={SERIES[1].color} />}
                                    {/* The whole column is the hit target, not just the painted bar. */}
                                    <rect x={PAD.left + index * slot} y={PAD.top} width={slot} height={plotHeight} fill="transparent" onPointerEnter={() => setHover(index)} />
                                </g>
                            );
                        })}
                        {buckets.length > 0 && (
                            <>
                                <text x={PAD.left} y={HEIGHT - 4} className="fill-[var(--txt-tertiary)] text-[11px]">
                                    {axisStartLabel(buckets, granularity, i18n.language)}
                                </text>
                                <text x={PAD.left + plotWidth} y={HEIGHT - 4} textAnchor="end" className="fill-[var(--txt-tertiary)] text-[11px]">
                                    {t("projectStats.today")}
                                </text>
                            </>
                        )}
                    </svg>
                )}
                {hovered && hover !== null && (
                    <ChartTooltip
                        x={PAD.left + (hover + 0.5) * slot}
                        y={y((hovered.createdWeb + hovered.createdMcp) / 2)}
                        width={width}
                        height={HEIGHT}
                        title={bucketLabel(hovered, granularity, i18n.language)}
                        rows={[
                            ...SERIES.map((series) => ({ key: series.key, label: labels[series.key], value: number.format(hovered[series.key]), color: series.color })),
                            { key: "total", label: t("projectStats.total"), value: number.format(hovered.createdWeb + hovered.createdMcp) },
                        ]}
                    />
                )}
            </div>
            <ChartTable
                caption={`${title} · ${t("projectStats.tableCaption")}`}
                columns={[t("projectStats.date"), labels.createdWeb, labels.createdMcp]}
                rows={buckets.map((day) => ({ key: day.start, cells: [bucketLabel(day, granularity, i18n.language), day.createdWeb, day.createdMcp] }))}
            />
        </section>
    );
}
