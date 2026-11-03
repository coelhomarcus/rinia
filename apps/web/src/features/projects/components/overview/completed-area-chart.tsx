import { useState, type KeyboardEvent, type PointerEvent } from "react";
import { useTranslation } from "react-i18next";
import { axisStartLabel, bucketLabel, ChartHeader, ChartTable, ChartTooltip, niceMax, useElementWidth } from "./chart-utils";
import type { Granularity, PeriodBucket } from "./period-buckets";

const HEIGHT = 150;
const PAD = { top: 10, right: 10, bottom: 22, left: 30 };
const SERIES = "var(--chart-series-1)";
const PER = { day: "projectStats.perDay", week: "projectStats.perWeek", month: "projectStats.perMonth" } as const;

/** Issues completed since the project began, per day, week or month: a line with a light wash, read with a crosshair. */
export function CompletedAreaChart({ buckets, granularity }: { buckets: PeriodBucket[]; granularity: Granularity }) {
    const { t, i18n } = useTranslation();
    const [ref, width] = useElementWidth<HTMLDivElement>();
    const [hover, setHover] = useState<number | null>(null);
    const number = new Intl.NumberFormat(i18n.language);
    const title = `${t("projectStats.completedTitle")} · ${t(PER[granularity])}`;

    const totalCompleted = buckets.reduce((sum, bucket) => sum + bucket.completed, 0);
    const top = niceMax(Math.max(0, ...buckets.map((bucket) => bucket.completed)));
    const plotWidth = Math.max(0, width - PAD.left - PAD.right);
    const plotHeight = HEIGHT - PAD.top - PAD.bottom;
    const baseline = PAD.top + plotHeight;
    const x = (index: number) => PAD.left + (buckets.length <= 1 ? plotWidth / 2 : (index * plotWidth) / (buckets.length - 1));
    const y = (value: number) => PAD.top + plotHeight - (value / top) * plotHeight;
    const points = buckets.map((bucket, index) => `${x(index).toFixed(1)},${y(bucket.completed).toFixed(1)}`);
    const line = points.length ? `M${points.join("L")}` : "";
    const area = points.length ? `${line}L${x(buckets.length - 1).toFixed(1)},${baseline}L${x(0).toFixed(1)},${baseline}Z` : "";
    const last = buckets.length - 1;

    function onPointerMove(event: PointerEvent<SVGSVGElement>) {
        const box = event.currentTarget.getBoundingClientRect();
        const ratio = plotWidth ? (event.clientX - box.left - PAD.left) / plotWidth : 0;
        setHover(Math.max(0, Math.min(last, Math.round(ratio * last))));
    }

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
            <ChartHeader title={title} figure={t("projectStats.completedTotal", { count: totalCompleted })} />
            <div ref={ref} className="relative mt-3">
                {width > 0 && (
                    <svg
                        width={width}
                        height={HEIGHT}
                        role="img"
                        tabIndex={0}
                        aria-label={`${title}: ${t("projectStats.completedTotal", { count: totalCompleted })}`}
                        className="block touch-pan-y rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-accent-strong"
                        onPointerMove={onPointerMove}
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
                        <path d={area} fill={SERIES} fillOpacity={0.1} />
                        <path d={line} fill="none" stroke={SERIES} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
                        {hovered && hover !== null && <line x1={x(hover)} x2={x(hover)} y1={PAD.top} y2={baseline} stroke="var(--txt-tertiary)" strokeWidth={1} shapeRendering="crispEdges" />}
                        {buckets.length > 0 && <circle cx={x(hover ?? last)} cy={y(buckets[hover ?? last]!.completed)} r={4} fill={SERIES} stroke="var(--bg-surface-1)" strokeWidth={2} />}
                        {buckets.length > 0 && (
                            <>
                                <text x={x(0)} y={HEIGHT - 4} className="fill-[var(--txt-tertiary)] text-[11px]">
                                    {axisStartLabel(buckets, granularity, i18n.language)}
                                </text>
                                <text x={x(last)} y={HEIGHT - 4} textAnchor="end" className="fill-[var(--txt-tertiary)] text-[11px]">
                                    {t("projectStats.today")}
                                </text>
                            </>
                        )}
                    </svg>
                )}
                {hovered && hover !== null && (
                    <ChartTooltip
                        x={x(hover)}
                        y={y(hovered.completed)}
                        width={width}
                        height={HEIGHT}
                        title={bucketLabel(hovered, granularity, i18n.language)}
                        rows={[{ key: "completed", label: t("projectStats.completedTitle").toLowerCase(), value: number.format(hovered.completed), color: SERIES }]}
                    />
                )}
            </div>
            <ChartTable
                caption={`${title} · ${t("projectStats.tableCaption")}`}
                columns={[t("projectStats.date"), t("projectStats.completedTitle")]}
                rows={buckets.map((bucket) => ({ key: bucket.start, cells: [bucketLabel(bucket, granularity, i18n.language), bucket.completed] }))}
            />
        </section>
    );
}
