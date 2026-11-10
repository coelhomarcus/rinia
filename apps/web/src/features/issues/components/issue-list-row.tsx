import { type MouseEvent, useEffect } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { UpdateIssueInput } from "@rinia/shared";
import { GripVertical } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { columnBucket } from "@/features/board/column-bucket";
import type { Issue } from "@/features/issues/api";
import { dragSlotClass } from "@/features/issues/components/drag-feedback";
import { DueDateMenu } from "@/features/issues/components/due-date-picker";
import { IssueMotionFrame } from "@/features/issues/components/issue-motion";
import { AssigneeMenu, LabelMenu, PriorityMenu, StatusMenu, propertyIcon } from "@/features/issues/components/issue-property-menus";
import { dragSurfaceClass } from "@/features/issues/lib/drag-sensors";
import { IssueCheckbox, useIssueSelection } from "@/features/issues/selection";
import { urls } from "@/lib/urls";
import { cx } from "@/utils/cx";

export function IssueListRow({
    issue,
    projectId,
    column,
    columns,
    member,
    members,
    categories,
    labels,
    identifierWidth,
    sortable,
    selected,
    onSelect,
    onUpdate,
    suspendLayout = false,
    animatePresence = false,
    layoutAnimation = true,
}: {
    issue: Issue;
    projectId: string;
    column?: { id: string; name: string; color: string | null };
    columns: Array<{ id: string; name: string; color: string | null }>;
    member?: { id: string; name: string; avatarUrl: string | null };
    members: Array<{ id: string; name: string; avatarUrl: string | null }>;
    /** The issue's labels, and the project's labels to choose from. */
    categories: Array<{ id: string; name: string; color: string | null }>;
    labels: Array<{ id: string; name: string; color: string | null }>;
    /** Width of the identifier column in characters: the longest identifier in the list, so every title starts at the same x. */
    identifierWidth: number;
    /** Whether the grip drags the row. Only the manual order can be rearranged; other orders hide the grip. */
    sortable: boolean;
    selected: boolean;
    onSelect: () => void;
    onUpdate: (input: UpdateIssueInput) => void;
    /** True while a row is being dragged, so dnd-kit animates instead of the layout glide. */
    suspendLayout?: boolean;
    /** Fade rows that join or leave. My issues leaves this off; its own presence animation already does that. */
    animatePresence?: boolean;
    /** Off where another animation already moves the row. */
    layoutAnimation?: boolean;
}) {
    const { t, i18n } = useTranslation();
    const date = new Intl.DateTimeFormat(i18n.language, { month: "short", day: "numeric" }).format(new Date(issue.createdAt));
    const { attributes, listeners, setActivatorNodeRef, setNodeRef, transform, transition, isDragging } = useSortable({ id: issue.id, disabled: !sortable });
    const selection = useIssueSelection();
    const checked = selection?.isSelected(issue.id) ?? false;
    // The row the arrow keys moved to is the one X selects.
    useEffect(() => {
        if (selected) selection?.setFocused(issue.id);
    }, [issue.id, selected, selection]);
    /** Shift-click selects a range instead of opening the issue. */
    const rangeClick = (event: MouseEvent) => {
        if (!selection || !event.shiftKey) return;
        event.preventDefault();
        selection.toggle(issue.id, { range: true });
    };
    return (
        <IssueMotionFrame
            nodeRef={setNodeRef}
            issueId={issue.id}
            suspendLayout={suspendLayout}
            animatePresence={animatePresence}
            layoutAnimation={layoutAnimation}
            people={members}
            placement="row"
            style={{ transform: CSS.Translate.toString(transform), transition }}
            className={cx(
                "group/issue relative flex h-9 w-full items-center gap-2 bg-surface-1 px-2 text-[13px] transition-colors duration-150 hover:bg-layer-transparent-hover",
                selected && "bg-layer-1-selected",
                checked && "bg-accent-subtle/60 hover:bg-accent-subtle/80",
                isDragging && cx("z-10 border opacity-50", dragSlotClass),
            )}
            onMouseEnter={() => selection?.setFocused(issue.id)}
            data-issue-id={issue.id}
            data-issue-context="true"
            data-project-id={projectId}
            data-issue-identifier={issue.identifier}
            data-issue-title={issue.title}
        >
            <IssueCheckbox issueId={issue.id} className="group-hover/issue:opacity-100" />
            {sortable ? (
                <button
                    ref={setActivatorNodeRef}
                    type="button"
                    {...attributes}
                    {...listeners}
                    aria-label={t("issue.dragToReorder")}
                    className={cx(
                        "flex size-5 shrink-0 cursor-grab items-center justify-center rounded text-placeholder opacity-0 group-hover/issue:opacity-100 hover:bg-layer-1-hover focus-visible:opacity-100 active:cursor-grabbing",
                        dragSurfaceClass,
                    )}
                >
                    <GripVertical className={propertyIcon} />
                </button>
            ) : (
                <span aria-hidden="true" className="size-5 shrink-0" />
            )}
            <Link
                to={urls.issue(issue.identifier, issue.title)}
                onFocus={onSelect}
                onClick={rangeClick}
                className="shrink-0 truncate font-mono text-xs text-tertiary"
                style={{ width: `${identifierWidth}ch` }}
            >
                {issue.identifier}
            </Link>
            <StatusMenu value={column} statuses={columns} onChange={(columnId) => onUpdate({ columnId })} />
            <Link to={urls.issue(issue.identifier, issue.title)} onClick={rangeClick} className="min-w-0 flex-1 truncate text-secondary">
                {issue.title}
            </Link>
            {categories.length > 0 && (
                <LabelMenu value={categories} labels={labels} onChange={(categoryIds) => onUpdate({ categoryIds })} className="max-w-[40%]" />
            )}
            {issue.dueDate && (
                <DueDateMenu value={issue.dueDate} closed={columnBucket(column?.name ?? "") === "closed"} onChange={(dueDate) => onUpdate({ dueDate })} />
            )}
            <PriorityMenu
                value={issue.priority}
                onChange={(priority) => onUpdate({ priority })}
                className="opacity-0 group-hover/issue:opacity-100 focus-visible:opacity-100"
            />
            <AssigneeMenu value={member} people={members} onChange={(assigneeId) => onUpdate({ assigneeId })} />
            <span className="w-14 shrink-0 text-right text-xs text-tertiary">{date}</span>
        </IssueMotionFrame>
    );
}
