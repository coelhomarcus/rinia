import type { ActionSource } from "@rinia/shared";
import { useTranslation } from "react-i18next";
import { IssueAvatarGroup, PriorityIcon, StateIcon, sourceLabel } from "@/features/board/components/issue-property-icons";
import { formatDueDate } from "@/features/issues/lib/due-date";
import { translateStatusName } from "@/i18n/status-label";
import type { TranslationKey } from "@/i18n/resources";
import { activityEventIcon } from "../lib/activity-event-icon";
import { formatDistanceToNow, formatFullIssueDate } from "../lib/relative-time";
import { LabelChip } from "./labels-picker";

export type ActivityEntry = { id: string; type: string; createdAt: string; actor: { name: string; avatarUrl: string | null }; source?: ActionSource | null; payload: Record<string, unknown> };

export interface TimelineLookups {
    columns: Array<{ id: string; name: string; color?: string | null }>;
    members: Array<{ id: string; name: string }>;
    categories: Array<{ id: string; name: string; color: string | null }>;
    projectIssues: Array<{ id: string; identifier: string; title: string }>;
}

const activityLabelKeys: Record<string, TranslationKey> = {
    created: "issue.createdThisIssue",
    status_changed: "issue.changedStatus",
    priority_changed: "issue.changedPriority",
    assignee_changed: "issue.changedAssignee",
    category_changed: "issue.changedCategory",
    cycle_changed: "issue.changedCycle",
    estimate_changed: "issue.changedEstimate",
    due_date_changed: "issue.changedDueDate",
    parent_changed: "issue.changedParent",
    relation_added: "issue.addedRelation",
    relation_removed: "issue.removedRelation",
    label_added: "issue.addedLabel",
    label_removed: "issue.removedLabel",
};

/**
 * One line of the issue feed: the person who did it first (grouped with the tool when a tool did the work), so every
 * row starts the same way, then what changed. The event icon closes the change, after the from → to, and the avatar
 * shares the first line of text, so a long row that wraps keeps it at the top.
 */
export function TimelineActivity({ entry, lookups }: { entry: ActivityEntry; lookups: TimelineLookups }) {
    const { t, i18n } = useTranslation();
    const eventIcon = activityEventIcon(entry, lookups);
    const label = entry.type === "label_added" || entry.type === "label_removed" ? lookups.categories.find((category) => category.id === entry.payload.categoryId) : undefined;
    return (
        <li className="animate-enter flex items-start gap-2.5 py-1.5 pl-1 text-[13px] leading-5 text-tertiary">
            <span className="flex h-5 shrink-0 items-center">
                <IssueAvatarGroup name={entry.actor.name} avatarUrl={entry.actor.avatarUrl} source={entry.source} className="size-4 text-[9px]" />
            </span>
            <p className="min-w-0 flex-1">
                <span className="font-medium text-secondary">{entry.actor.name}</span>{" "}{activityLabelKeys[entry.type] ? t(activityLabelKeys[entry.type]) : entry.type}
                {label && <> <LabelChip label={label} className="inline-flex max-w-40 align-middle" /></>}
                {formatActivityChange(entry.payload, { ...lookups, columns: lookups.columns.map((column) => ({ ...column, name: translateStatusName(column.name, t) })) }, t("issue.noneValue"), i18n.language)}
                {eventIcon?.kind === "state" && <StateIcon name={eventIcon.name} color={eventIcon.color} className="ml-1.5 inline-block size-4 shrink-0 align-text-bottom" />}
                {eventIcon?.kind === "priority" && <PriorityIcon priority={eventIcon.priority} className="ml-1.5 inline-block size-4 align-text-bottom" />}
                <span className="text-placeholder"> · </span>
                <time className="text-placeholder" title={formatFullIssueDate(entry.createdAt, i18n.language)} dateTime={entry.createdAt}>{formatDistanceToNow(entry.createdAt, i18n.language)}</time>
                {entry.source && <span className="sr-only"> {t("issue.viaSource", { client: sourceLabel(entry.source) })}</span>}
            </p>
        </li>
    );
}

function formatActivityChange(payload: Record<string, unknown>, lookups: {
    columns: Array<{ id: string; name: string }>;
    members: Array<{ id: string; name: string }>;
    categories: Array<{ id: string; name: string }>;
    projectIssues: Array<{ id: string; identifier: string; title: string }>;
}, noneLabel: string, locale: string) {
    if (!("from" in payload) && !("to" in payload)) return "";
    const field = String(payload.field ?? "");
    const resolve = (value: unknown) => {
        if (value === null || value === undefined || value === "") return noneLabel;
        if (field === "dueDate") return formatDueDate(String(value), locale);
        const options = field === "columnId" ? lookups.columns : field === "assigneeId" ? lookups.members : field === "categoryId" ? lookups.categories : field === "parentIssueId" ? lookups.projectIssues : [];
        const match = options.find((option) => option.id === value);
        if (match && "identifier" in match) return match.identifier;
        if (match) return match.name;
        return String(value);
    };
    return ` · ${resolve(payload.from)} → ${resolve(payload.to)}`;
}
