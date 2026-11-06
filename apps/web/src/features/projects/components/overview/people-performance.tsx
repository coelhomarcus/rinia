import type { ProjectPersonStats } from "@rinia/shared";
import { useTranslation } from "react-i18next";
import { Avatar } from "@/components/base/avatar/avatar";
import { Tooltip } from "@/components/base/tooltip/tooltip";
import type { ProjectMember } from "../../api";
import { memberInitials } from "../members-panel";

const SERIES = "var(--chart-series-1)";

/**
 * Each member's work since the project began: issues completed (as a bar, so the team reads at a glance), open issues
 * assigned to them now, and issues they created. A completion counts for the issue's assignee.
 */
export function PeoplePerformance({ people, members }: { people: ProjectPersonStats[]; members: ProjectMember[] | undefined }) {
    const { t, i18n } = useTranslation();
    const number = new Intl.NumberFormat(i18n.language);
    const byId = new Map((members ?? []).map((member) => [member.id, member]));
    const rows = people.filter((person) => byId.has(person.userId));
    const most = Math.max(1, ...rows.map((person) => person.completed));
    if (rows.length === 0) return null;

    return (
        <section aria-labelledby="people-performance" className="min-w-0">
            <h3 id="people-performance" className="text-xs font-medium text-tertiary">
                {t("projectStats.peopleTitle")}
            </h3>
            <p className="mt-1 text-xs text-placeholder">{t("projectStats.peopleHint")}</p>
            <table className="mt-3 w-full table-fixed text-left text-[13px]">
                <thead>
                    <tr className="text-xs text-tertiary">
                        <th scope="col" className="w-[38%] pb-2 font-medium">{t("projectStats.person")}</th>
                        <th scope="col" className="pb-2 font-medium">{t("projectStats.completed")}</th>
                        <th scope="col" className="w-16 pb-2 text-right font-medium sm:w-20">{t("projectStats.open")}</th>
                        <th scope="col" className="w-16 pb-2 text-right font-medium sm:w-20">{t("projectStats.created")}</th>
                    </tr>
                </thead>
                <tbody>
                    {rows.map((person) => {
                        const member = byId.get(person.userId)!;
                        return (
                            <tr key={person.userId} className="border-t border-subtle">
                                <th scope="row" className="py-2 pr-3 font-normal">
                                    <span className="flex min-w-0 items-center gap-2">
                                        <Avatar src={member.avatarUrl ?? undefined} initials={memberInitials(member.name)} size="xs" />
                                        <Tooltip title={member.username}>
                                            <span className="min-w-0 truncate text-primary">{member.name}</span>
                                        </Tooltip>
                                    </span>
                                </th>
                                <td className="py-2 pr-3">
                                    <span className="flex items-center gap-2">
                                        <span aria-hidden="true" className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-[var(--chart-heat-0)]">
                                            <span className="block h-full rounded-full" style={{ width: `${(person.completed / most) * 100}%`, background: SERIES }} />
                                        </span>
                                        <span className="w-8 shrink-0 text-right font-medium text-primary tabular-nums">{number.format(person.completed)}</span>
                                    </span>
                                </td>
                                <td className="py-2 text-right text-secondary tabular-nums">{number.format(person.open)}</td>
                                <td className="py-2 text-right text-secondary tabular-nums">{number.format(person.created)}</td>
                            </tr>
                        );
                    })}
                </tbody>
            </table>
        </section>
    );
}
