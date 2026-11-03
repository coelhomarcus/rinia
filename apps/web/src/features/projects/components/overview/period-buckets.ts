import type { ProjectPeriodDay } from "@rinia/shared";

export type Granularity = "day" | "week" | "month";

/** One bar or point of a chart: a day, a week (Monday to Sunday) or a month, cut to the period's ends. */
export interface PeriodBucket {
    start: string;
    end: string;
    completed: number;
    createdWeb: number;
    createdMcp: number;
}

/** Up to about three months reads well day by day, up to two years week by week, and anything longer by month. */
export function granularityFor(days: number): Granularity {
    return days <= 90 ? "day" : days <= 730 ? "week" : "month";
}

function bucketKey(date: string, granularity: Granularity): string {
    if (granularity === "day") return date;
    if (granularity === "month") return date.slice(0, 7);
    const [year, month, day] = date.split("-").map(Number);
    const utc = new Date(Date.UTC(year!, month! - 1, day!));
    // Weeks start on Monday.
    utc.setUTCDate(utc.getUTCDate() - ((utc.getUTCDay() + 6) % 7));
    return utc.toISOString().slice(0, 10);
}

/** The period's days added up into the chart's buckets, oldest first. */
export function bucketPeriod(period: ProjectPeriodDay[]): { granularity: Granularity; buckets: PeriodBucket[] } {
    const granularity = granularityFor(period.length);
    const buckets: PeriodBucket[] = [];
    let currentKey: string | null = null;
    for (const day of period) {
        const key = bucketKey(day.date, granularity);
        if (key !== currentKey) {
            buckets.push({ start: day.date, end: day.date, completed: 0, createdWeb: 0, createdMcp: 0 });
            currentKey = key;
        }
        const bucket = buckets.at(-1)!;
        bucket.end = day.date;
        bucket.completed += day.completed;
        bucket.createdWeb += day.createdWeb;
        bucket.createdMcp += day.createdMcp;
    }
    return { granularity, buckets };
}
