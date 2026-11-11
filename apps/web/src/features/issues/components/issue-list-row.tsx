import { type CSSProperties, type MouseEvent, type ReactNode, useEffect } from "react";
import type { UpdateIssueInput } from "@rinia/shared";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { columnBucket } from "@/features/board/column-bucket";
import type { Issue } from "@/features/issues/api";
import { DueDateMenu } from "@/features/issues/components/due-date-picker";
import { IssueMotionFrame } from "@/features/issues/components/issue-motion";
import { AssigneeMenu, LabelMenu, PriorityMenu, StatusMenu } from "@/features/issues/components/issue-property-menus";
import { IssueCheckbox, useIssueSelection } from "@/features/issues/selection";
import { urls } from "@/lib/urls";
import { issueTransitionProps } from "@/lib/view-transition";
import { cx } from "@/utils/cx";

/** What a row needs to be dragged, from `SortableIssueListRow`. A row without it is not draggable and does not load the drag-and-drop library. */
export interface IssueRowDrag {
    setNodeRef: (element: HTMLElement | null) => void;
    style: CSSProperties;
    /** Extra classes while the row is the one being dragged. */
    className?: string;
    /** The grip that starts the drag. */
    handle: ReactNode;
}

const noNodeRef = () => undefined;

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
    drag,
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
    /** Present when the row can be dragged. Only the manual order can be rearranged; other lists have none and show no grip. */
    drag?: IssueRowDrag;
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
    const { i18n } = useTranslation();
    const date = new Intl.DateTimeFormat(i18n.language, { month: "short", day: "numeric" }).format(new Date(issue.createdAt));
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
            nodeRef={drag?.setNodeRef ?? noNodeRef}
            issueId={issue.id}
            suspendLayout={suspendLayout}
            animatePresence={animatePresence}
            layoutAnimation={layoutAnimation}
            people={members}
            placement="row"
            style={drag?.style}
            className={cx(
                "group/issue relative flex h-[var(--row-height)] w-full items-center gap-[var(--row-gap)] bg-surface-1 px-2 text-[13px] transition-colors duration-150 hover:bg-layer-transparent-hover hover:duration-0",
                // Phones: two lines. Status, title and assignee first; identifier, labels, due date and priority below,
                // lined up under the title. Flex order and a full-width break do the rearranging, so the row stays one tree.
                "max-md:h-auto max-md:min-h-15 max-md:flex-wrap max-md:content-center max-md:gap-x-3 max-md:gap-y-1 max-md:px-4 max-md:py-3",
                selected && "bg-layer-1-selected",
                checked && "bg-accent-subtle/60 hover:bg-accent-subtle/80",
                drag?.className,
            )}
            onMouseEnter={() => selection?.setFocused(issue.id)}
            data-issue-id={issue.id}
            data-issue-context="true"
            data-project-id={projectId}
            data-issue-identifier={issue.identifier}
            data-issue-title={issue.title}
        >
            <IssueCheckbox issueId={issue.id} className="can-hover:group-hover/issue:opacity-100 can-hover:group-focus-within/issue:opacity-100 max-md:hidden" />
            {drag ? <span className="contents max-md:hidden">{drag.handle}</span> : <span aria-hidden="true" className="size-5 shrink-0 max-md:hidden" />}
            <Link
                viewTransition
                to={urls.issue(issue.identifier, issue.title)}
                state={{ issueTitle: issue.title }}
                onFocus={onSelect}
                onClick={rangeClick}
                className="shrink-0 truncate font-mono text-xs text-tertiary max-md:order-5 max-md:ml-8 max-md:w-auto!"
                style={{ width: `${identifierWidth}ch` }}
                {...issueTransitionProps(issue.identifier, "id")}
            >
                {issue.identifier}
            </Link>
            <StatusMenu value={column} statuses={columns} onChange={(columnId) => onUpdate({ columnId })} className="max-md:order-1" />
            <Link
                viewTransition
                to={urls.issue(issue.identifier, issue.title)}
                state={{ issueTitle: issue.title }}
                onClick={rangeClick}
                className="min-w-0 flex-1 truncate text-secondary max-md:order-2 max-md:line-clamp-2 max-md:text-[15px] max-md:leading-5 max-md:whitespace-normal max-md:text-primary"
                {...issueTransitionProps(issue.identifier, "title")}
            >
                {issue.title}
            </Link>
            {categories.length > 0 && (
                <LabelMenu value={categories} labels={labels} onChange={(categoryIds) => onUpdate({ categoryIds })} className="max-w-[40%] max-md:order-6 max-md:max-w-[60%]" />
            )}
            {issue.dueDate && (
                <DueDateMenu value={issue.dueDate} closed={columnBucket(column?.name ?? "") === "closed"} onChange={(dueDate) => onUpdate({ dueDate })} className="max-md:order-7" />
            )}
            <PriorityMenu
                value={issue.priority}
                onChange={(priority) => onUpdate({ priority })}
                className="can-hover:opacity-0 can-hover:group-hover/issue:opacity-100 can-hover:group-focus-within/issue:opacity-100 focus-visible:opacity-100 max-md:order-8"
            />
            <AssigneeMenu value={member} people={members} onChange={(assigneeId) => onUpdate({ assigneeId })} className="max-md:order-3" />
            <span aria-hidden="true" className="hidden h-0 basis-full max-md:order-4 max-md:block" />
            <span className="w-14 shrink-0 text-right text-xs text-tertiary max-md:hidden">{date}</span>
        </IssueMotionFrame>
    );
}
