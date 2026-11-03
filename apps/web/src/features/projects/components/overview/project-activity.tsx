import { useTranslation } from "react-i18next";
import { Skeleton } from "@/components/base/feedback/skeleton";
import { ErrorMessage } from "@/components/feedback/error-message";
import { useProjectStats } from "../../hooks/use-project-stats";
import { CompletedAreaChart } from "./completed-area-chart";
import { ContributionHeatmap } from "./contribution-heatmap";
import { CreatedBarChart } from "./created-bar-chart";
import { StatCards } from "./stat-cards";

/** The overview's activity: the headline numbers, the year's contribution map, and the last 30 days as charts. */
export function ProjectActivity({ projectId }: { projectId: string }) {
    const { t } = useTranslation();
    const { data: stats, isLoading, isError } = useProjectStats(projectId);

    return (
        <section className="mt-12" aria-labelledby="project-activity">
            <h2 id="project-activity" className="text-[17px] font-medium text-primary">
                {t("projectStats.title")}
            </h2>
            {isLoading ? (
                <ActivitySkeleton />
            ) : isError || !stats ? (
                <div className="mt-3">
                    <ErrorMessage message={t("projectStats.loadFailed")} />
                </div>
            ) : (
                <div className="mt-4 flex flex-col gap-10">
                    <StatCards stats={stats} />
                    <ContributionHeatmap activity={stats.activity} />
                    <CompletedAreaChart period={stats.period} />
                    <CreatedBarChart period={stats.period} />
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
