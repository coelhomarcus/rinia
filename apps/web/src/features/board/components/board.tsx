import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
    type CollisionDetection,
    DndContext,
    type DragEndEvent,
    type DragOverEvent,
    DragOverlay,
    type DragStartEvent,
    MeasuringStrategy,
    pointerWithin,
    rectIntersection,
} from "@dnd-kit/core";
import { arrayMove } from "@dnd-kit/sortable";
import { type UpdateIssueInput, positionAtIndex } from "@rinia/shared";
import { LayoutGroup } from "motion/react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";
import { Alert } from "@/components/base/feedback/alert";
import { Skeleton } from "@/components/base/feedback/skeleton";
import { ErrorMessage } from "@/components/feedback/error-message";
import { useToast } from "@/components/feedback/toaster";
import { useCategories } from "@/features/categories/hooks/use-categories";
import { isTypingTarget } from "@/features/commands/shortcuts";
import type { Issue } from "@/features/issues/api";
import { IssueMotionRoster } from "@/features/issues/components/issue-motion";
import { IssueQuickCreateModal } from "@/features/issues/components/issue-quick-create-modal";
import { resolveLabels } from "@/features/issues/components/labels-picker";
import { useIssues, useUpdateIssue } from "@/features/issues/hooks/use-issues";
import { signalLongPress, touchLiftClass, useIssueDragSensors } from "@/features/issues/lib/drag-sensors";
import { filterIssues, readIssueOrder } from "@/features/issues/lib/issue-filters";
import { useRegisterVisibleIssues } from "@/features/issues/selection";
import { useProjectMembers } from "@/features/projects/hooks/use-project-members";
import { useRouteProject } from "@/features/projects/route-project";
import { ApiError } from "@/lib/api-client";
import { urls } from "@/lib/urls";
import { cx } from "@/utils/cx";
import { columnBucket } from "../column-bucket";
import { useColumns } from "../hooks/use-board";
import { Column } from "./column";
import { IssueCardContent } from "./issue-card";

/**
 * On a board, what matters is literally beneath the cursor (`pointerWithin`) — much more
 * predictable than center distance, which can choose the wrong target for a small card inside a
 * tall column. `rectIntersection` covers the case where the cursor falls in a gap between columns.
 */
const collisionDetection: CollisionDetection = (args) => {
    const pointerCollisions = pointerWithin(args);
    return pointerCollisions.length > 0 ? pointerCollisions : rectIntersection(args);
};

/** Columns change size as issues enter and leave during a drag, so their rectangles must be measured continuously. */
const measuring = { droppable: { strategy: MeasuringStrategy.Always } };
const NO_ISSUES: Issue[] = [];
/** One empty list for every lookup still loading, so memoized columns see the same array. */
const NONE: never[] = [];

export const Board = ({
    projectId,
    filters = new URLSearchParams(),
    scope = "all",
    hidden,
    hideColumn,
    showColumn,
}: {
    projectId: string;
    filters?: URLSearchParams;
    /** Like the list's scopes: Active and Backlog show only the columns of those states, All shows every column. */
    scope?: "active" | "backlog" | "all";
    hidden: Set<string>;
    hideColumn: (columnId: string) => void;
    showColumn: (columnId: string) => void;
}) => {
    const { t } = useTranslation();
    const showToast = useToast();
    const navigate = useNavigate();
    const { projectKey } = useRouteProject();
    const { data: columns, isLoading: columnsLoading, isError: columnsError } = useColumns(projectId);
    const orderBy = readIssueOrder(filters.get("order"));
    const { data: issues, isLoading: issuesLoading, isError: issuesError } = useIssues(projectId, { orderBy });
    // The columns on screen: the scope's states, minus the ones the person hid.
    const shownColumns = useMemo(
        () => (columns ?? []).filter((column) => !hidden.has(column.id) && (scope === "all" || columnBucket(column.name) === scope)),
        [columns, hidden, scope],
    );
    const closedColumnIds = useMemo(
        () => new Set((columns ?? []).filter((column) => columnBucket(column.name) === "closed").map((column) => column.id)),
        [columns],
    );
    const filtered = useMemo(() => filterIssues(issues ?? [], filters, (issue) => closedColumnIds.has(issue.columnId)), [closedColumnIds, issues, filters]);
    const { data: categories } = useCategories(projectId);
    const { data: members } = useProjectMembers(projectId);
    const updateIssue = useUpdateIssue(projectId);

    const [createColumnId, setCreateColumnId] = useState<string | null>(null);
    const [activeIssue, setActiveIssue] = useState<Issue | null>(null);
    const [touchLift, setTouchLift] = useState(false);
    const [activeIssueWidth, setActiveIssueWidth] = useState<number>();
    const [dragIssues, setDragIssues] = useState<Issue[] | null>(null);
    const [moveError, setMoveError] = useState<string | null>(null);

    const sensors = useIssueDragSensors();

    // J and K move the focus through the cards, column by column; Enter opens the focused card and X selects it.
    const boardRef = useRef<HTMLDivElement>(null);
    const dragging = activeIssue !== null;
    useEffect(() => {
        function onKeyDown(event: KeyboardEvent) {
            const key = event.key.toLowerCase();
            if ((key !== "j" && key !== "k") || event.shiftKey || event.metaKey || event.ctrlKey || event.altKey || event.isComposing) return;
            if (dragging || isTypingTarget(event.target) || !boardRef.current) return;
            const cards = [...boardRef.current.querySelectorAll<HTMLElement>("[data-issue-id] > [data-issue-context]")];
            if (cards.length === 0) return;
            event.preventDefault();
            const step = key === "j" ? 1 : -1;
            const current = cards.findIndex((card) => card.contains(document.activeElement));
            const next = cards[current < 0 ? (step === 1 ? 0 : cards.length - 1) : Math.min(Math.max(current + step, 0), cards.length - 1)]!;
            next.focus();
            next.scrollIntoView({ block: "nearest", inline: "nearest" });
        }
        window.addEventListener("keydown", onKeyDown);
        return () => window.removeEventListener("keydown", onKeyDown);
    }, [dragging]);

    // Kept stable so the cards' content is not re-rendered on every frame of a drag (see IssueCard).
    const { mutate: mutateIssue } = updateIssue;
    const onUpdateIssue = useCallback((identifier: string, input: UpdateIssueInput) => mutateIssue({ identifier, input }), [mutateIssue]);
    const onOpenIssue = useCallback((identifier: string) => navigate(urls.issue(identifier)), [navigate]);

    const categoriesById = useMemo(() => new Map((categories ?? []).map((category) => [category.id, category])), [categories]);
    const membersById = useMemo(() => new Map((members ?? []).map((member) => [member.id, member])), [members]);

    /**
     * Flat list of all issues, already in visual order (columns only filter; they do not sort).
     * During a drag, `dragIssues` is reordered in `onDragOver` so columns live-preview where the
     * issue will land instead of making the user drag blindly.
     */
    const board = useMemo(() => dragIssues ?? [...filtered].sort((a, b) => a.position - b.position || a.number - b.number), [dragIssues, filtered]);

    const visibleIds = useMemo(
        () => shownColumns.flatMap((column) => board.filter((issue) => issue.columnId === column.id).map((issue) => issue.id)),
        [board, shownColumns],
    );
    useRegisterVisibleIssues(visibleIds);

    // The column callbacks read the latest props through a ref, so they stay stable and memoized columns can skip renders.
    const latest = useRef({ hideColumn, showColumn, showToast, t, projectKey, navigate });
    latest.current = { hideColumn, showColumn, showToast, t, projectKey, navigate };
    const hideColumnWithUndo = useCallback((columnId: string) => {
        const { hideColumn, showColumn, showToast, t } = latest.current;
        hideColumn(columnId);
        showToast({
            title: t("projects.columnHidden"),
            action: { label: t("issue.undo"), onClick: () => showColumn(columnId) },
        });
    }, []);
    const manageStates = useCallback(() => latest.current.navigate(urls.projectSettings(latest.current.projectKey, "states")), []);

    // One list per column, reused while its cards are unchanged: a card moving between two columns re-renders those
    // two, not the whole board.
    const columnCache = useRef(new Map<string, Issue[]>());
    const issuesByColumn = useMemo(() => {
        const grouped = new Map<string, Issue[]>();
        for (const issue of board) grouped.set(issue.columnId, [...(grouped.get(issue.columnId) ?? []), issue]);
        const next = new Map<string, Issue[]>();
        for (const [columnId, list] of grouped) {
            const previous = columnCache.current.get(columnId);
            next.set(columnId, previous && previous.length === list.length && previous.every((issue, index) => issue === list[index]) ? previous : list);
        }
        columnCache.current = next;
        return next;
    }, [board]);

    /** Resolves the target column: `over` is the column itself (card area) or a card inside it. */
    function resolveColumnId(overId: string, list: Issue[]): string | undefined {
        if (columns?.some((column) => column.id === overId)) return overId;
        return list.find((issue) => issue.id === overId)?.columnId;
    }

    function handleDragStart(event: DragStartEvent) {
        setTouchLift(signalLongPress(event.activatorEvent));
        setMoveError(null);
        const activeId = String(event.active.id);
        setActiveIssue(board.find((issue) => issue.id === activeId) ?? null);
        setDragIssues(board);

        // `active.rect.current.initial` is sometimes not measured in this frame yet; reading the
        // width directly from the element (still in the DOM here) is more reliable for the overlay clone.
        const node = document.querySelector<HTMLElement>(`[data-issue-id="${activeId}"]`);
        setActiveIssueWidth(node?.getBoundingClientRect().width ?? event.active.rect.current.initial?.width);
    }

    /**
     * Handles only COLUMN CHANGES: moves the issue to the hovered column's list while dragging,
     * making the source column close the gap and the destination open space live. Reordering
     * within the same column is handled by `SortableContext` (visual transform) and is finalized
     * on drop — changing state here would cause a double movement.
     */
    function handleDragOver(event: DragOverEvent) {
        const { active, over } = event;
        if (!over) return;

        const activeId = String(active.id);
        const overId = String(over.id);

        setDragIssues((current) => {
            const list = current ?? board;
            const dragged = list.find((issue) => issue.id === activeId);
            const targetColumnId = resolveColumnId(overId, list);

            if (!dragged || !targetColumnId || dragged.columnId === targetColumnId) return current;

            const withoutDragged = list.filter((issue) => issue.id !== activeId);
            const overIndex = withoutDragged.findIndex((issue) => issue.id === overId);
            const insertAt = overIndex === -1 ? withoutDragged.length : overIndex;

            return [...withoutDragged.slice(0, insertAt), { ...dragged, columnId: targetColumnId }, ...withoutDragged.slice(insertAt)];
        });
    }

    function handleDragEnd(event: DragEndEvent) {
        const { active, over } = event;
        const list = dragIssues ?? board;

        setActiveIssue(null);
        setTouchLift(false);

        if (!over) {
            setDragIssues(null);
            return;
        }

        const activeId = String(active.id);
        const overId = String(over.id);

        const targetColumnId = resolveColumnId(overId, list);
        if (!targetColumnId) {
            setDragIssues(null);
            return;
        }

        // `arrayMove` is the same operation SortableContext uses for the visual preview, so the
        // drop result matches exactly the gap the user was seeing.
        const columnIssues = list.filter((issue) => issue.columnId === targetColumnId);
        const fromIndex = columnIssues.findIndex((issue) => issue.id === activeId);

        // Only another issue provides a specific index; dropping on the column means "at the end".
        const overIssueIndex = columnIssues.findIndex((issue) => issue.id === overId);
        const toIndex = overIssueIndex === -1 ? columnIssues.length - 1 : overIssueIndex;
        if (fromIndex === -1 || toIndex === -1) {
            setDragIssues(null);
            return;
        }

        const ordered = arrayMove(columnIssues, fromIndex, toIndex);
        const finalIndex = ordered.findIndex((issue) => issue.id === activeId);
        const position = positionAtIndex(
            ordered.filter((issue) => issue.id !== activeId),
            finalIndex,
        );

        const original = filtered.find((issue) => issue.id === activeId);
        if (original && original.columnId === targetColumnId && original.position === position) {
            setDragIssues(null);
            return;
        }

        const activeIssue = list.find((issue) => issue.id === activeId);
        if (!activeIssue) {
            setDragIssues(null);
            return;
        }

        // Freeze the preview in its NEW order until the mutation settles. Within a column, dragging only
        // moves cards visually (SortableContext transforms), so `list` still holds the old order; keeping
        // that would snap the card back to where it started until the server answered, and only then move it.
        let slot = 0;
        setDragIssues(
            list.map((issue) => {
                if (issue.columnId !== targetColumnId) return issue;
                const next = ordered[slot++];
                return next.id === activeId ? { ...next, columnId: targetColumnId, position } : next;
            }),
        );

        updateIssue.mutate(
            { identifier: activeIssue.identifier, input: { columnId: targetColumnId, position } },
            {
                onError: (reason) => setMoveError(reason instanceof ApiError ? reason.message : t("errors.requestFailed")),
                onSettled: () => setDragIssues(null),
            },
        );
    }

    function handleDragCancel() {
        setActiveIssue(null);
        setTouchLift(false);
        setDragIssues(null);
    }

    if (columnsLoading || issuesLoading) {
        return <BoardSkeleton />;
    }

    if (columnsError || issuesError) {
        return <ErrorMessage message={t("errors.requestFailed")} />;
    }

    const activeCategories = activeIssue ? resolveLabels(activeIssue.categoryIds, categoriesById) : [];
    const activeAssignee = activeIssue?.assigneeId ? membersById.get(activeIssue.assigneeId) : undefined;

    return (
        <>
            {moveError && (
                <Alert tone="error" className="mb-3">
                    {moveError}
                </Alert>
            )}
            <DndContext
                sensors={sensors}
                collisionDetection={collisionDetection}
                measuring={measuring}
                onDragStart={handleDragStart}
                onDragOver={handleDragOver}
                onDragEnd={handleDragEnd}
                onDragCancel={handleDragCancel}
            >
                <LayoutGroup>
                    <IssueMotionRoster ids={visibleIds}>
                        <div ref={boardRef} className="flex h-full min-w-0 gap-3">
                            <div className="flex h-full min-w-0 flex-1 items-start gap-3 overflow-x-auto">
                                {shownColumns.map((column) => (
                                    <Column
                                        key={column.id}
                                        column={column}
                                        statuses={columns ?? NONE}
                                        issues={issuesByColumn.get(column.id) ?? NO_ISSUES}
                                        projectId={projectId}
                                        categoriesById={categoriesById}
                                        membersById={membersById}
                                        people={members ?? NONE}
                                        labels={categories ?? NONE}
                                        suspendLayout={dragIssues !== null}
                                        onUpdateIssue={onUpdateIssue}
                                        onOpenIssue={onOpenIssue}
                                        onCreateIssue={setCreateColumnId}
                                        onHide={hideColumnWithUndo}
                                        onManageStates={manageStates}
                                    />
                                ))}
                            </div>
                        </div>
                    </IssueMotionRoster>
                </LayoutGroup>

                <DragOverlay>
                    {activeIssue && (
                        <div
                            style={{ width: activeIssueWidth }}
                            className={cx(
                                "block rotate-1 cursor-grabbing rounded-md border border-accent-strong bg-surface-1 px-3 py-2.5 shadow-overlay-200",
                                touchLift && touchLiftClass,
                            )}
                        >
                            <IssueCardContent
                                issue={activeIssue}
                                status={columns?.find((column) => column.id === activeIssue.columnId)}
                                categories={activeCategories}
                                assignee={activeAssignee}
                                closed={closedColumnIds.has(activeIssue.columnId)}
                            />
                        </div>
                    )}
                </DragOverlay>
            </DndContext>

            {createColumnId && <IssueQuickCreateModal projectId={projectId} columnId={createColumnId} onClose={() => setCreateColumnId(null)} />}
        </>
    );
};

function BoardSkeleton() {
    const { t } = useTranslation();
    return (
        <div className="flex h-full min-w-max items-start gap-3" aria-label={t("common.loading")} role="status">
            {["one", "two", "three"].map((key) => (
                <div key={key} className="flex h-full w-80 shrink-0 flex-col overflow-hidden rounded-lg bg-surface-1">
                    <div className="flex h-10 items-center justify-between px-2.5">
                        <Skeleton className="h-3 w-28" />
                        <Skeleton className="size-4 rounded-full" />
                    </div>
                    <div className="space-y-2 px-2">
                        <Skeleton className="h-24 w-full rounded-md" />
                        <Skeleton className="h-20 w-full rounded-md" />
                        <Skeleton className="h-28 w-full rounded-md" />
                    </div>
                </div>
            ))}
        </div>
    );
}
