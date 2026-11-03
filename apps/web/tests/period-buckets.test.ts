import { describe, expect, test } from "bun:test";
import type { ProjectPeriodDay } from "@rinia/shared";
import { bucketPeriod, granularityFor } from "../src/features/projects/components/overview/period-buckets";

/** `length` consecutive days from `start`, each with one completed and one created issue. */
function days(start: string, length: number): ProjectPeriodDay[] {
    const [year, month, day] = start.split("-").map(Number);
    return Array.from({ length }, (_, index) => ({
        date: new Date(Date.UTC(year!, month! - 1, day! + index)).toISOString().slice(0, 10),
        completed: 1,
        createdWeb: 1,
        createdMcp: 0,
    }));
}

describe("bucketPeriod", () => {
    test("picks days, weeks or months by how long the project has existed", () => {
        expect([7, 90, 91, 730, 731].map(granularityFor)).toEqual(["day", "day", "week", "week", "month"]);
    });

    test("a short period keeps one bucket per day", () => {
        const { granularity, buckets } = bucketPeriod(days("2026-10-28", 7));
        expect(granularity).toBe("day");
        expect(buckets.length).toBe(7);
        expect(buckets[0]).toEqual({ start: "2026-10-28", end: "2026-10-28", completed: 1, createdWeb: 1, createdMcp: 0 });
    });

    test("weeks run Monday to Sunday, and the first and last are cut to the period", () => {
        // Thursday 2026-01-01 to Tuesday 2026-04-07: 97 days.
        const { granularity, buckets } = bucketPeriod(days("2026-01-01", 97));
        expect(granularity).toBe("week");
        expect(buckets[0]).toMatchObject({ start: "2026-01-01", end: "2026-01-04", completed: 4 });
        expect(buckets[1]).toMatchObject({ start: "2026-01-05", end: "2026-01-11", completed: 7 });
        expect(buckets.at(-1)).toMatchObject({ start: "2026-04-06", end: "2026-04-07", completed: 2 });
        expect(buckets.reduce((sum, bucket) => sum + bucket.completed, 0)).toBe(97);
    });

    test("over two years, months", () => {
        const { granularity, buckets } = bucketPeriod(days("2024-01-15", 800));
        expect(granularity).toBe("month");
        expect(buckets[0]).toMatchObject({ start: "2024-01-15", end: "2024-01-31", completed: 17 });
        expect(buckets[1]).toMatchObject({ start: "2024-02-01", end: "2024-02-29", completed: 29 });
        expect(buckets.reduce((sum, bucket) => sum + bucket.createdWeb, 0)).toBe(800);
    });
});
