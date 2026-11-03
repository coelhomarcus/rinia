import { z } from "zod";

/** Whether `value` is an IANA time zone this runtime knows, such as `America/Sao_Paulo`. */
function isTimeZone(value: string) {
    try {
        new Intl.DateTimeFormat("en-US", { timeZone: value });
        return true;
    } catch {
        return false;
    }
}

export const PROJECT_STATS_DEFAULT_DAYS = 30;
/** The contribution map covers this many days, ending today. */
export const PROJECT_STATS_ACTIVITY_DAYS = 365;

export const projectStatsQuerySchema = z.object({
    days: z.coerce.number().int().min(7).max(90).default(PROJECT_STATS_DEFAULT_DAYS),
    /** Days are counted in the viewer's time zone, so "today" is their today. */
    tz: z.string().max(64).refine(isTimeZone, "Unknown time zone").default("UTC"),
});

export type ProjectStatsQuery = z.infer<typeof projectStatsQuerySchema>;

/** One calendar day of activity, `date` as YYYY-MM-DD in the requested time zone. */
export interface ProjectActivityDay {
    date: string;
    created: number;
    completed: number;
    /** Every other recorded change: state moves that do not complete, priority, assignee, labels, dates. */
    updated: number;
}

export interface ProjectPeriodDay {
    date: string;
    completed: number;
    /** Issues created in the web app. */
    createdWeb: number;
    /** Issues created through MCP, by agents and AI tools. */
    createdMcp: number;
}

export interface ProjectStats {
    today: string;
    timeZone: string;
    days: number;
    /** Issues not in a closed state (done, cancelled, duplicate), as the "open" filter counts them. */
    openIssues: number;
    completedInPeriod: number;
    /** The most consecutive days, within the contribution map, with at least one issue completed. */
    longestStreak: number;
    /** Consecutive days with a completed issue up to today; a quiet today does not break a streak that ran to yesterday. */
    currentStreak: number;
    /** `PROJECT_STATS_ACTIVITY_DAYS` days, oldest first, ending today. */
    activity: ProjectActivityDay[];
    /** The last `days` days, oldest first, ending today. */
    period: ProjectPeriodDay[];
}
