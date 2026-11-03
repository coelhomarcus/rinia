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

/** The contribution map covers this many days, ending today. */
export const PROJECT_STATS_ACTIVITY_DAYS = 365;
/** The charts span at least this many days, so a project created today still draws a readable chart. */
export const PROJECT_STATS_MIN_PERIOD_DAYS = 7;

export const projectStatsQuerySchema = z.object({
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

/** One project member's numbers since the project was created. */
export interface ProjectPersonStats {
    userId: string;
    /** Issues completed that are assigned to this person, or that they completed when nobody was assigned. */
    completed: number;
    /** Issues this person created, in the app or through MCP with their token. */
    created: number;
    /** Open issues assigned to this person now. */
    open: number;
}

export interface ProjectStats {
    today: string;
    timeZone: string;
    /** The day the project was created, where the charts start (or a week before today, for a newer project). */
    periodStart: string;
    /** Issues not in a closed state (done, cancelled, duplicate), as the "open" filter counts them. */
    openIssues: number;
    /** Issues completed since `periodStart`. */
    completedInPeriod: number;
    /** The most consecutive days, over the project's life, with at least one issue completed. */
    longestStreak: number;
    /** Consecutive days with a completed issue up to today; a quiet today does not break a streak that ran to yesterday. */
    currentStreak: number;
    /** `PROJECT_STATS_ACTIVITY_DAYS` days, oldest first, ending today. */
    activity: ProjectActivityDay[];
    /** Every day from `periodStart` to today, oldest first. */
    period: ProjectPeriodDay[];
    /** Every current member, most completed first. */
    people: ProjectPersonStats[];
}
