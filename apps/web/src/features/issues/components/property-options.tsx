import type { ReactNode } from "react";
import type { TFunction } from "i18next";
import { Triangle } from "lucide-react";
import { issueEstimateValues, type IssuePriority } from "@rinia/shared";
import { IssueAvatar, PriorityIcon, StateIcon } from "@/features/board/components/issue-property-icons";
import { PRIORITY_OPTIONS, priorityLabelKey } from "@/features/issues/lib/priority";
import { translateStatusName } from "@/i18n/status-label";
import { cx } from "@/utils/cx";
import type { NumberableOption } from "../lib/numbered-options";

/**
 * The choices of every numbered property menu. The issue screen's searchable menu and the board and list's
 * popup menus both render these, so a property has the same options, icons and numbers on every surface.
 */

/** Every property icon on issue rows, cards and menus (status, priority, assignee, label, estimate) is this 16px square. */
export const propertyIcon = "size-4";

export interface PropertyOption<V> extends NumberableOption {
    /** A stable key for rendering; `value` can be null or empty. */
    key: string;
    value: V;
    label: string;
    icon: ReactNode;
}

type Person = { id: string; name: string; avatarUrl: string | null };
type Status = { id: string; name: string; color: string | null };

export function AssigneeAvatar({ person }: { person: { name: string; avatarUrl: string | null } }) {
    return <IssueAvatar name={person.name} avatarUrl={person.avatarUrl} className={cx(propertyIcon, "text-[9px]")} />;
}

export function UnassignedIcon() {
    return <span className={cx(propertyIcon, "shrink-0 rounded-full border border-dashed border-strong")} />;
}

export function EstimateIcon({ muted = false }: { muted?: boolean }) {
    return <Triangle className={cx(propertyIcon, "shrink-0", muted ? "text-placeholder" : "text-tertiary")} />;
}

export function statusOptions(statuses: Status[], t: TFunction): PropertyOption<string>[] {
    return statuses.map((status) => ({ key: status.id, value: status.id, label: translateStatusName(status.name, t), icon: <StateIcon name={status.name} color={status.color} className={propertyIcon} /> }));
}

/** "No priority" is `1`, then urgent to low are `2` to `5`. */
export function priorityOptions(t: TFunction): PropertyOption<IssuePriority>[] {
    return PRIORITY_OPTIONS.map((priority) => ({ key: priority, value: priority, label: t(priorityLabelKey(priority)), icon: <PriorityIcon priority={priority} className={propertyIcon} />, clears: priority === "none" }));
}

/** Unassigned is `1`, then the members. */
export function assigneeOptions(people: Person[], t: TFunction): PropertyOption<string | null>[] {
    return [
        { key: "unassigned", value: null, label: t("issue.unassigned"), icon: <UnassignedIcon />, clears: true },
        ...people.map((person) => ({ key: person.id, value: person.id as string | null, label: person.name, icon: <AssigneeAvatar person={person} /> })),
    ];
}

/** No estimate clears with Backspace; each estimate is numbered by its own value (1 2 3 5 8). */
export function estimateOptions(t: TFunction): PropertyOption<number | null>[] {
    return [
        { key: "none", value: null, label: t("issue.noEstimate"), icon: <EstimateIcon muted />, clears: true },
        ...issueEstimateValues.map((points) => ({ key: String(points), value: points as number | null, label: t("projects.points", { count: points }), icon: <EstimateIcon /> })),
    ];
}

/** The key beside an option (its digit, or ⌫): right-aligned, tabular and the same size in every menu. Empty where an option has none. */
export function OptionNumber({ value }: { value: string | null }) {
    return <span aria-hidden="true" className="w-3 shrink-0 text-right text-[11px] text-placeholder tabular-nums max-md:hidden">{value ?? ""}</span>;
}
