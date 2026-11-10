import { CalendarDays, Tag } from "lucide-react";
import { useTranslation } from "react-i18next";
import { IssueAvatar, PriorityIcon, StateIcon } from "@/features/board/components/issue-property-icons";
import { columnBucket } from "@/features/board/column-bucket";
import { useColumns } from "@/features/board/hooks/use-board";
import { useCategories } from "@/features/categories/hooks/use-categories";
import { useProjectMembers } from "@/features/projects/hooks/use-project-members";
import { translateStatusName } from "@/i18n/status-label";
import { cx } from "@/utils/cx";
import type { IssueDetail } from "../../api";
import { dueState as getDueState, dueStateClass, formatDueDate } from "../../lib/due-date";
import { priorityLabelKey } from "../../lib/priority";
import { LabelChip, resolveLabels } from "../labels-picker";
import type { PropertyMenuId } from "./property-menu";

const chipClass =
    "flex min-h-[var(--row-height)] max-w-full min-w-0 items-center gap-1.5 rounded-md border border-subtle bg-layer-1 px-2 text-[12px] font-medium text-secondary outline-none hover:bg-layer-1-hover focus-visible:ring-2 focus-visible:ring-accent-strong";

/**
 * The issue's main properties as one-tap chips. Each chip opens the properties sheet at that field, so a thumb can
 * change state, priority, assignee, labels or due date without scrolling past the description.
 */
export function IssuePropertyChips({
    issue,
    onOpen,
}: {
    issue: IssueDetail;
    onOpen: (menu?: PropertyMenuId) => void;
}) {
    const { t, i18n } = useTranslation();
    const { data: columns } = useColumns(issue.projectId);
    const { data: members } = useProjectMembers(issue.projectId);
    const { data: categories } = useCategories(issue.projectId);
    const column = columns?.find((candidate) => candidate.id === issue.columnId);
    const assignee = members?.find((member) => member.id === issue.assigneeId);
    const labels = resolveLabels(issue.categoryIds, new Map((categories ?? []).map((label) => [label.id, label])));
    const dueState = getDueState(issue.dueDate, columnBucket(column?.name ?? "") === "closed");

    return (
        <div className="mt-4 flex flex-wrap items-center gap-1.5">
            <button type="button" className={chipClass} onClick={() => onOpen("state")}>
                <StateIcon name={column?.name ?? ""} color={column?.color} className="size-3.5 shrink-0" />
                <span className="truncate">{column ? translateStatusName(column.name, t) : t("issue.unknownStatus")}</span>
            </button>
            <button type="button" className={chipClass} onClick={() => onOpen("priority")} aria-label={t("issue.priority")}>
                <PriorityIcon priority={issue.priority} className="size-3.5 shrink-0" />
                <span className={cx("truncate", issue.priority === "none" && "text-tertiary")}>{t(priorityLabelKey(issue.priority))}</span>
            </button>
            <button type="button" className={chipClass} onClick={() => onOpen("assignee")}>
                {assignee ? <IssueAvatar name={assignee.name} avatarUrl={assignee.avatarUrl} className="size-4 text-[9px]" /> : <span className="size-3.5 rounded-full border border-dashed border-[var(--border-strong-1)]" />}
                <span className={cx("truncate", !assignee && "text-tertiary")}>{assignee?.name ?? t("issue.assign")}</span>
            </button>
            <button type="button" className={chipClass} onClick={() => onOpen("label")}>
                {labels.length > 0 ? (
                    <span className="flex min-w-0 items-center gap-1">
                        {labels.slice(0, 2).map((label) => (
                            <LabelChip key={label.id} label={label} />
                        ))}
                        {labels.length > 2 && <span className="text-tertiary">+{labels.length - 2}</span>}
                    </span>
                ) : (
                    <>
                        <Tag className="size-3.5 shrink-0 text-tertiary" />
                        <span className="truncate text-tertiary">{t("issue.addLabel")}</span>
                    </>
                )}
            </button>
            <button type="button" className={chipClass} onClick={() => onOpen("due")}>
                <CalendarDays className={cx("size-3.5 shrink-0", dueState ? dueStateClass[dueState] : "text-tertiary")} />
                <span className={cx("truncate", !issue.dueDate ? "text-tertiary" : dueState && dueState !== "upcoming" ? dueStateClass[dueState] : undefined)}>
                    {issue.dueDate ? formatDueDate(issue.dueDate, i18n.language) : t("issue.dueDateAction")}
                </span>
            </button>
            <button type="button" className={chipClass} onClick={() => onOpen()}>
                {t("issue.properties")}
            </button>
        </div>
    );
}
