import type { ProjectStats } from "@rinia/shared";
import { useTranslation } from "react-i18next";
import { cx } from "@/utils/cx";

/** The four headline numbers: open issues, completed in the period, and the longest and current streaks. */
export function StatCards({ stats }: { stats: ProjectStats }) {
    const { t, i18n } = useTranslation();
    const number = new Intl.NumberFormat(i18n.language);
    const cards = [
        { id: "open", label: t("projectStats.openIssues"), value: number.format(stats.openIssues), muted: false },
        { id: "completed", label: t("projectStats.completedRecent", { days: stats.days }), value: number.format(stats.completedInPeriod), muted: false },
        { id: "longest", label: t("projectStats.longestStreak"), value: t("projectStats.streakDays", { count: stats.longestStreak }), muted: false },
        { id: "current", label: t("projectStats.currentStreak"), value: t("projectStats.streakDays", { count: stats.currentStreak }), muted: stats.currentStreak === 0 },
    ];
    return (
        <dl className="grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-4">
            {cards.map((card) => (
                <div key={card.id} className="min-w-0">
                    <dt className={cx("truncate text-xs font-medium", card.muted ? "text-placeholder" : "text-tertiary")}>{card.label}</dt>
                    <dd className={cx("mt-1 text-xl font-semibold", card.muted ? "text-placeholder" : "text-primary")}>{card.value}</dd>
                </div>
            ))}
        </dl>
    );
}
