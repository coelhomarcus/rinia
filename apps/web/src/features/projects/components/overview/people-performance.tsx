import { useEffect, useLayoutEffect, useState } from "react";
import type { ProjectPersonStats } from "@rinia/shared";
import { useTranslation } from "react-i18next";
import { Avatar } from "@/components/base/avatar/avatar";
import { Tooltip } from "@/components/base/tooltip/tooltip";
import { useReducedMotion } from "@/hooks/use-reduced-motion";
import type { ProjectMember } from "../../api";
import { memberInitials } from "../members-panel";

/** Eighths of a cell, so a bar ends exactly where its value does rather than on the nearest whole character. */
const PARTIALS = ["", "▏", "▎", "▍", "▌", "▋", "▊", "▉"];
const FULL = "█";
const TRACK = "·";
const RULE = "─".repeat(240);
const FILL_MS = 700;

/** A bar of `cells` characters, `ratio` of it filled: whole blocks, one partial block, then the dotted track. */
export function asciiBar(ratio: number, cells: number): { filled: string; track: string } {
    if (cells <= 0) return { filled: "", track: "" };
    const exact = Math.max(0, Math.min(1, ratio)) * cells;
    const whole = Math.floor(exact);
    const partial = PARTIALS[Math.floor((exact - whole) * 8)] ?? "";
    const used = whole + (partial ? 1 : 0);
    return { filled: FULL.repeat(whole) + partial, track: TRACK.repeat(Math.max(0, cells - used)) };
}

/** How many monospace characters fit in the element, kept current as it resizes. */
function useCellCount() {
    const [element, ref] = useState<HTMLSpanElement | null>(null);
    const [cells, setCells] = useState(0);
    useLayoutEffect(() => {
        if (!element) return;
        const probe = document.createElement("span");
        probe.textContent = FULL.repeat(10);
        probe.style.cssText = "position:absolute;visibility:hidden;white-space:pre";
        element.appendChild(probe);
        const measure = () => {
            const charWidth = probe.getBoundingClientRect().width / 10 || 7;
            setCells(Math.max(4, Math.floor(element.getBoundingClientRect().width / charWidth)));
        };
        measure();
        const observer = new ResizeObserver(measure);
        observer.observe(element);
        return () => {
            observer.disconnect();
            probe.remove();
        };
    }, [element]);
    return { ref, cells };
}

/** 0 → 1 over a short ease-out when the numbers first show or change, so the bars type themselves in. */
function useFillProgress(key: string) {
    const reducedMotion = useReducedMotion() === true;
    const [progress, setProgress] = useState(reducedMotion ? 1 : 0);
    useEffect(() => {
        if (reducedMotion) {
            setProgress(1);
            return;
        }
        let frame = 0;
        const start = performance.now();
        const step = (now: number) => {
            const t = Math.min(1, (now - start) / FILL_MS);
            setProgress(1 - (1 - t) ** 3);
            if (t < 1) frame = requestAnimationFrame(step);
        };
        setProgress(0);
        frame = requestAnimationFrame(step);
        return () => cancelAnimationFrame(frame);
    }, [key, reducedMotion]);
    return progress;
}

/**
 * Each member's work since the project began, drawn as text: a monospace bar of block characters for issues completed
 * (relative to whoever completed most), their share of all completions, then the open issues assigned to them now and
 * the issues they created. A completion counts for the issue's assignee.
 */
export function PeoplePerformance({ people, members }: { people: ProjectPersonStats[]; members: ProjectMember[] | undefined }) {
    const { t, i18n } = useTranslation();
    const number = new Intl.NumberFormat(i18n.language);
    const percent = new Intl.NumberFormat(i18n.language, { style: "percent", maximumFractionDigits: 0 });
    const byId = new Map((members ?? []).map((member) => [member.id, member]));
    const rows = people.filter((person) => byId.has(person.userId));
    const most = Math.max(1, ...rows.map((person) => person.completed));
    const totals = rows.reduce((sum, person) => ({ completed: sum.completed + person.completed, open: sum.open + person.open, created: sum.created + person.created }), { completed: 0, open: 0, created: 0 });
    const { ref, cells } = useCellCount();
    const progress = useFillProgress(rows.map((person) => `${person.userId}:${person.completed}`).join(","));
    if (rows.length === 0) return null;

    const rule = (
        <tr aria-hidden="true">
            <td colSpan={4} className="overflow-hidden py-1 leading-none whitespace-nowrap text-placeholder select-none">
                {RULE}
            </td>
        </tr>
    );

    return (
        <section aria-labelledby="people-performance" className="min-w-0">
            <h3 id="people-performance" className="text-xs font-medium text-tertiary">
                {t("projectStats.peopleTitle")}
            </h3>
            <p className="mt-1 text-xs text-placeholder">{t("projectStats.peopleHint")}</p>
            <table className="mt-4 w-full table-fixed text-left font-mono text-[12px] leading-6 tabular-nums">
                <colgroup>
                    <col className="w-[34%] sm:w-[30%]" />
                    <col />
                    <col className="w-14 sm:w-16" />
                    <col className="w-14 sm:w-16" />
                </colgroup>
                <thead>
                    <tr className="text-[11px] tracking-wider text-tertiary uppercase">
                        <th scope="col" className="pr-3 font-normal">{t("projectStats.person")}</th>
                        <th scope="col" className="pr-3 font-normal">{t("projectStats.completed")}</th>
                        <th scope="col" className="text-right font-normal">{t("projectStats.open")}</th>
                        <th scope="col" className="text-right font-normal">{t("projectStats.created")}</th>
                    </tr>
                    {rule}
                </thead>
                <tbody>
                    {rows.map((person, index) => {
                        const member = byId.get(person.userId)!;
                        // Rows fill one after another, a beat apart, so the list reads top to bottom.
                        const own = Math.max(0, Math.min(1, progress * (1 + rows.length * 0.15) - index * 0.15));
                        const bar = asciiBar((person.completed / most) * own, cells);
                        return (
                            <tr key={person.userId} className="group/person">
                                <th scope="row" className="py-0.5 pr-3 font-normal">
                                    <span className="flex min-w-0 items-center gap-2">
                                        <Avatar src={member.avatarUrl ?? undefined} initials={memberInitials(member.name)} size="xs" />
                                        <Tooltip title={member.username}>
                                            <span className="min-w-0 truncate font-sans text-[13px] text-primary">{member.name}</span>
                                        </Tooltip>
                                    </span>
                                </th>
                                <td className="py-0.5 pr-3">
                                    <span className="flex min-w-0 items-center gap-2">
                                        <span ref={index === 0 ? ref : undefined} aria-hidden="true" className="min-w-0 flex-1 overflow-hidden whitespace-pre select-none">
                                            <span className="text-[var(--chart-series-1)]">{bar.filled}</span>
                                            <span className="text-placeholder opacity-60 transition-opacity duration-150 group-hover/person:opacity-100">{bar.track}</span>
                                        </span>
                                        <span className="w-7 shrink-0 text-right text-primary">{number.format(person.completed)}</span>
                                        <span className="hidden w-10 shrink-0 text-right text-tertiary sm:inline">
                                            {totals.completed ? percent.format(person.completed / totals.completed) : "–"}
                                        </span>
                                    </span>
                                </td>
                                <td className="py-0.5 text-right text-secondary">{number.format(person.open)}</td>
                                <td className="py-0.5 text-right text-secondary">{number.format(person.created)}</td>
                            </tr>
                        );
                    })}
                </tbody>
                <tfoot>
                    {rule}
                    <tr className="text-tertiary">
                        <th scope="row" className="pr-3 font-normal">{t("projectStats.total")}</th>
                        <td className="pr-3">
                            <span className="flex items-center justify-end gap-2">
                                <span className="w-7 shrink-0 text-right text-primary">{number.format(totals.completed)}</span>
                                <span className="hidden w-10 shrink-0 sm:inline" />
                            </span>
                        </td>
                        <td className="text-right">{number.format(totals.open)}</td>
                        <td className="text-right">{number.format(totals.created)}</td>
                    </tr>
                </tfoot>
            </table>
        </section>
    );
}
