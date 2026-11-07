import { useMemo, type CSSProperties } from "react";
import { useTranslation } from "react-i18next";
import { Skeleton } from "@/components/base/feedback/skeleton";
import { ErrorMessage } from "@/components/feedback/error-message";
import { useProjectStats } from "../../hooks/use-project-stats";
import { formatDay } from "./chart-utils";
import { CompletedAreaChart } from "./completed-area-chart";
import { bucketPeriod } from "./period-buckets";
import { PeoplePerformance } from "./people-performance";
import { useProjectMembers } from "../../hooks/use-project-members";
import { ContributionHeatmap } from "./contribution-heatmap";
import { CreatedBarChart } from "./created-bar-chart";
import { StatCards } from "./stat-cards";

const HEX = /^#[0-9a-fA-F]{6}$/;

/** The overview's activity since the project was created. Charts use the colour chosen for the project logo. */
export function ProjectActivity({ projectId, accent }: { projectId: string; accent?: string | null }) {
    const { t, i18n } = useTranslation();
    const { data: stats, isLoading, isError } = useProjectStats(projectId);
    const { data: members } = useProjectMembers(projectId);
    const series = useMemo(() => (stats ? bucketPeriod(stats.period) : null), [stats]);

    return (
        <section className="mt-12" aria-labelledby="project-activity">
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                <h2 id="project-activity" className="text-[17px] font-medium text-primary">
                    {t("projectStats.title")}
                </h2>
                {stats && <p className="text-xs text-tertiary">{t("projectStats.since", { date: formatDay(stats.periodStart, i18n.language, { day: "numeric", month: "short", year: "numeric" }) })}</p>}
            </div>
            {isLoading ? (
                <ActivitySkeleton />
            ) : isError || !stats || !series ? (
                <div className="mt-3">
                    <ErrorMessage message={t("projectStats.loadFailed")} />
                </div>
            ) : (
                <div className={`mt-4 flex flex-col gap-10${accent && HEX.test(accent) ? " chart-accent" : ""}`} style={accent && HEX.test(accent) ? ({ "--chart-accent": accent } as CSSProperties) : undefined}>
                    <StatCards stats={stats} />
                    <ContributionHeatmap activity={stats.activity} />
                    <CompletedAreaChart {...series} />
                    <CreatedBarChart {...series} />
                    <PeoplePerformance people={stats.people} members={members} />
                </div>
            )}
        </section>
    );
}

function ActivitySkeleton() {
    const { t } = useTranslation();
    return (
        <div className="mt-4 flex flex-col gap-10" role="status" aria-label={t("projectStats.loading")}>
            <div className="grid grid-cols-2 gap-6 sm:grid-cols-4">
                {[0, 1, 2, 3].map((index) => (
                    <div key={index} className="space-y-2">
                        <Skeleton className="h-3 w-20" />
                        <Skeleton className="h-6 w-14" />
                    </div>
                ))}
            </div>
            <Skeleton className="h-[120px] w-full" />
            <Skeleton className="h-[190px] w-full" />
            <Skeleton className="h-[190px] w-full" />
        </div>
    );
}
