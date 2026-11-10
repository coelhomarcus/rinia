import { memo, useCallback, useState } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { UpdateIssueInput } from "@rinia/shared";
import { useLocation } from "react-router";
import { ContextMenuButton } from "@/components/overlay/context-menu-provider";
import type { Issue, IssuePerson } from "@/features/issues/api";
import { dragSlotClass } from "@/features/issues/components/drag-feedback";
import { DueDateMenu } from "@/features/issues/components/due-date-picker";
import { IssueMotionFrame } from "@/features/issues/components/issue-motion";
import { AssigneeMenu, EstimateMenu, LabelMenu, PriorityMenu, StatusMenu } from "@/features/issues/components/issue-property-menus";
import { dragSurfaceClass } from "@/features/issues/lib/drag-sensors";
import { useIssueSelection } from "@/features/issues/selection";
import { cx } from "@/utils/cx";

type Status = { id: string; name: string; color: string | null };

interface IssueCardContentProps {
    issue: Issue;
    /** The card's status, shown as the icon before the title, and the statuses its menu moves the card to. */
    status?: Status;
    statuses?: Status[];
    categories?: Array<{ id: string; name: string; color: string | null }>;
    assignee?: IssuePerson;
    /** Choices for the property menus. The drag overlay leaves them out: its copy of the card is never clicked. */
    people?: IssuePerson[];
    labels?: Array<{ id: string; name: string; color: string | null }>;
    onUpdate?: (input: UpdateIssueInput) => void;
    /** Whether the issue sits in a closed state, where a past due date is no longer late. */
    closed?: boolean;
}

function firstIssueImage(document: Issue["descriptionJson"]): string | null {
    const visit = (nodes: unknown[]): string | null => {
        for (const candidate of nodes) {
            if (!candidate || typeof candidate !== "object") continue;
            const node = candidate as { type?: unknown; attrs?: { src?: unknown }; content?: unknown[] };
            if (node.type === "image" && typeof node.attrs?.src === "string") {
                try {
                    const url = new URL(node.attrs.src);
                    if (url.protocol === "http:" || url.protocol === "https:") return url.href;
                } catch {
                    /* Ignore malformed legacy image nodes. */
                }
            }
            if (Array.isArray(node.content)) {
                const nested = visit(node.content);
                if (nested) return nested;
            }
        }
        return null;
    };
    return visit(document.content ?? []);
}

function IssuePreviewImage({ src }: { src: string }) {
    const [failed, setFailed] = useState(false);
    if (failed) return null;
    return (
        <img
            src={src}
            alt=""
            loading="lazy"
            referrerPolicy="no-referrer"
            onError={() => setFailed(true)}
            className="mb-2 block h-24 w-full rounded object-cover"
        />
    );
}

// Unset estimate and label icons only show while the card is hovered or focused, or their menu is open.
const revealOnHover = "opacity-0 group-hover/card:opacity-100 group-focus-within/card:opacity-100 data-popup-open:opacity-100";

/**
 * Shared with the drag overlay so picking up an issue preserves its geometry. Laid out like Linear's cards: the ID
 * with the assignee on its right, the status icon before the title (its menu moves the card to another column),
 * then the other properties. Each property is a 16px icon that opens a menu to change it.
 */
export const IssueCardContent = ({
    issue,
    status,
    statuses = [],
    categories = [],
    assignee,
    people = [],
    labels = [],
    onUpdate = () => {},
    closed = false,
}: IssueCardContentProps) => {
    const imagePreview = firstIssueImage(issue.descriptionJson);
    const estimate = (
        <EstimateMenu
            key="estimate"
            value={issue.estimate}
            onChange={(next) => onUpdate({ estimate: next })}
            className={issue.estimate == null ? revealOnHover : undefined}
        />
    );
    const labeled = categories.length > 0;
    const label = (
        <LabelMenu
            key="label"
            value={categories}
            labels={labels}
            onChange={(categoryIds) => onUpdate({ categoryIds })}
            className={labeled ? "min-w-0" : revealOnHover}
        />
    );
    const due = (
        <DueDateMenu
            key="due"
            value={issue.dueDate}
            closed={closed}
            onChange={(dueDate) => onUpdate({ dueDate })}
            className={issue.dueDate ? undefined : revealOnHover}
        />
    );
    // Set properties come first so the hidden, unset ones never leave a gap between visible icons.
    const optional = [
        issue.dueDate && due,
        issue.estimate != null && estimate,
        labeled && label,
        !issue.dueDate && due,
        issue.estimate == null && estimate,
        !labeled && label,
    ];
    return (
        <>
            {imagePreview && <IssuePreviewImage key={imagePreview} src={imagePreview} />}
            <div className="flex h-5 items-center justify-between gap-2">
                <span className="text-[11px] font-medium tracking-wide text-tertiary">{issue.identifier}</span>
                <AssigneeMenu value={assignee} people={people} onChange={(assigneeId) => onUpdate({ assigneeId })} />
            </div>
            <div className="mt-1 flex items-start gap-1">
                <StatusMenu value={status} statuses={statuses} onChange={(columnId) => onUpdate({ columnId })} className="text-tertiary" />
                <p className="line-clamp-2 min-w-0 text-[13px] leading-5 font-medium text-primary">{issue.title}</p>
            </div>
            <div className="mt-2 flex min-w-0 flex-wrap items-center gap-1 text-tertiary">
                <PriorityMenu value={issue.priority} onChange={(priority) => onUpdate({ priority })} />
                {optional}
            </div>
        </>
    );
};

interface IssueCardProps extends Omit<IssueCardContentProps, "onUpdate"> {
    projectId: string;
    /** Stable across renders (the board keeps one), so the card's content can skip re-rendering while dragging. */
    onUpdateIssue: (identifier: string, input: UpdateIssueInput) => void;
    onClick: () => void;
    /** True while anyone on this board is dragging, so dnd-kit animates instead of the layout glide. */
    suspendLayout?: boolean;
}

const sameLabels = (a: IssueCardContentProps["categories"] = [], b: IssueCardContentProps["categories"] = []) =>
    a.length === b.length && a.every((label, index) => label.id === b[index]?.id && label.name === b[index]?.name && label.color === b[index]?.color);

/**
 * The card's content, which only changes with its issue and the lookups it shows. While a card is dragged, dnd-kit
 * re-renders every sortable card on the board many times a second; this keeps those renders to the thin wrapper.
 */
const CardContent = memo(
    IssueCardContent,
    (prev, next) =>
        prev.issue === next.issue &&
        prev.status === next.status &&
        prev.statuses === next.statuses &&
        prev.assignee === next.assignee &&
        prev.people === next.people &&
        prev.labels === next.labels &&
        prev.closed === next.closed &&
        prev.onUpdate === next.onUpdate &&
        sameLabels(prev.categories, next.categories),
);

export const IssueCard = ({
    issue,
    status,
    statuses,
    categories,
    assignee,
    people,
    labels,
    onUpdateIssue,
    closed,
    projectId,
    onClick,
    suspendLayout = false,
}: IssueCardProps) => {
    const onUpdate = useCallback((input: UpdateIssueInput) => onUpdateIssue(issue.identifier, input), [issue.identifier, onUpdateIssue]);
    const { attributes, listeners, setActivatorNodeRef, setNodeRef, transform, transition, isDragging } = useSortable({ id: issue.id });

    const location = useLocation();
    const selected = location.pathname.endsWith(`/issues/${issue.identifier}`);
    const style = { transform: CSS.Transform.toString(transform), transition };
    const selection = useIssueSelection();
    const checked = selection?.isSelected(issue.id) ?? false;

    return (
        <IssueMotionFrame
            nodeRef={setNodeRef}
            issueId={issue.id}
            suspendLayout={suspendLayout}
            animatePresence
            people={people}
            style={style}
            data-issue-id={issue.id}
            className={cx("group/card relative w-full", isDragging && "z-10 opacity-50")}
            onMouseEnter={() => selection?.setFocused(issue.id)}
        >
            {/* A div rather than a button: the property menus inside it are buttons themselves. */}
            <div
                ref={setActivatorNodeRef}
                {...attributes}
                {...listeners}
                data-issue-context="true"
                data-project-id={projectId}
                data-issue-identifier={issue.identifier}
                data-issue-title={issue.title}
                data-peek-selected={selected || undefined}
                onClick={(event) => {
                    // Shift-click selects a range of cards instead of opening this one.
                    if (selection && event.shiftKey) {
                        event.preventDefault();
                        selection.toggle(issue.id, { range: true });
                    } else onClick();
                }}
                onFocus={() => selection?.setFocused(issue.id)}
                onKeyDown={(event) => {
                    if (event.key === "Enter") {
                        event.preventDefault();
                        onClick();
                    } else listeners?.onKeyDown?.(event);
                }}
                className={cx(
                    "block w-full cursor-pointer rounded-md border border-subtle bg-surface-1 px-3 py-2.5 pr-9 text-left transition-colors duration-200 ease-out outline-none hover:border-strong focus-visible:ring-2 focus-visible:ring-accent-strong md:pr-3",
                    dragSurfaceClass,
                    isDragging && dragSlotClass,
                    selected && "border-accent-strong",
                    checked && "border-accent-strong bg-accent-subtle/40",
                )}
            >
                <CardContent
                    issue={issue}
                    status={status}
                    statuses={statuses}
                    categories={categories}
                    assignee={assignee}
                    people={people}
                    labels={labels}
                    onUpdate={onUpdate}
                    closed={closed}
                />
            </div>
            <ContextMenuButton
                entity={{ type: "issue", projectId, identifier: issue.identifier, title: issue.title }}
                className="absolute top-1.5 right-1.5 z-10 rounded-md bg-layer-2"
            />
        </IssueMotionFrame>
    );
};
