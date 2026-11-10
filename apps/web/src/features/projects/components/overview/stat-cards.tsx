import { useEffect, useRef, useState } from "react";
import type { ProjectStats } from "@rinia/shared";
import { useReducedMotion } from "motion/react";
import { useTranslation } from "react-i18next";
import { cx } from "@/utils/cx";
import { countToward } from "./count-up";

const COUNT_MS = 480;

function prefersReducedMotion() {
    return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** Counts from zero the first time it is on screen, then from the last shown value when the stat changes. */
function useAnimatedNumber(target: number, active: boolean) {
    const reduced = useReducedMotion() === true || prefersReducedMotion();
    const [shown, setShown] = useState(() => (prefersReducedMotion() ? target : 0));
    const shownRef = useRef(shown);

    useEffect(() => {
        if (reduced) {
            shownRef.current = target;
            setShown(target);
            return;
        }
        if (!active) return;
        const from = shownRef.current;
        if (from === target) {
            setShown(target);
            return;
        }
        const started = performance.now();
        let frame = 0;
        const tick = (now: number) => {
            const next = countToward(from, target, (now - started) / COUNT_MS);
            shownRef.current = next;
            setShown(next);
            if (next !== target) frame = requestAnimationFrame(tick);
        };
        frame = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(frame);
    }, [active, reduced, target]);

    return shown;
}

function StatValue({ value, format, muted }: { value: number; format: (value: number) => string; muted: boolean }) {
    const ref = useRef<HTMLElement>(null);
    const [seen, setSeen] = useState(false);
    const shown = useAnimatedNumber(value, seen);

    useEffect(() => {
        const node = ref.current;
        if (!node || seen) return;
        const observer = new IntersectionObserver(
            ([entry]) => {
                if (entry?.isIntersecting) setSeen(true);
            },
            { threshold: 0.4 },
        );
        observer.observe(node);
        return () => observer.disconnect();
    }, [seen]);

    return (
        <dd ref={ref} className={cx("mt-1 text-xl font-semibold tabular-nums", muted ? "text-placeholder" : "text-primary")}>
            {format(shown)}
        </dd>
    );
}

/** The four headline numbers: open issues, completed in the period, and the longest and current streaks. */
export function StatCards({ stats }: { stats: ProjectStats }) {
    const { t, i18n } = useTranslation();
    const number = new Intl.NumberFormat(i18n.language);
    const cards = [
        { id: "open", label: t("projectStats.openIssues"), value: stats.openIssues, muted: false, format: (value: number) => number.format(value) },
        {
            id: "completed",
            label: t("projectStats.completedSince"),
            value: stats.completedInPeriod,
            muted: false,
            format: (value: number) => number.format(value),
        },
        {
            id: "longest",
            label: t("projectStats.longestStreak"),
            value: stats.longestStreak,
            muted: false,
            format: (value: number) => t("projectStats.streakDays", { count: value }),
        },
        {
            id: "current",
            label: t("projectStats.currentStreak"),
            value: stats.currentStreak,
            muted: stats.currentStreak === 0,
            format: (value: number) => t("projectStats.streakDays", { count: value }),
        },
    ];
    return (
        <dl className="grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-4">
            {cards.map((card) => (
                <div key={card.id} className="min-w-0">
                    <dt className={cx("truncate text-xs font-medium", card.muted ? "text-placeholder" : "text-tertiary")}>{card.label}</dt>
                    <StatValue value={card.value} format={card.format} muted={card.muted} />
                </div>
            ))}
        </dl>
    );
}
