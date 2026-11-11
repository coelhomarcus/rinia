import { memo, useEffect, useRef, useState } from "react";
import { Menu } from "@base-ui/react/menu";
import { useDroppable } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import type { UpdateIssueInput } from "@rinia/shared";
import { useVirtualizer } from "@tanstack/react-virtual";
import { EyeOff, MoreHorizontal, Plus, Settings2, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { ButtonUtility } from "@/components/base/buttons/button-utility";
import { Skeleton } from "@/components/base/feedback/skeleton";
import { Input } from "@/components/base/input/input";
import { ConfirmDialog } from "@/components/overlay/confirm-dialog";
import { overlayChrome } from "@/components/overlay/overlay-chrome";
import type { Issue, IssuePerson } from "@/features/issues/api";
import { resolveLabels } from "@/features/issues/components/labels-picker";
import { translateStatusName } from "@/i18n/status-label";
import { ApiError } from "@/lib/api-client";
import { useDensity } from "@/providers/density";
import { cx } from "@/utils/cx";
import type { BoardColumn } from "../api";
import { columnBucket } from "../column-bucket";
import { useDeleteColumn, useUpdateColumn } from "../hooks/use-board";
import { IssueCard } from "./issue-card";
import { StateIcon } from "./issue-property-icons";

const columnMenuItem =
    "flex h-8 cursor-pointer items-center gap-2.5 rounded-lg px-2 text-[13px] text-secondary outline-none data-highlighted:bg-menu-hover data-highlighted:text-primary";

export interface ColumnProps {
    column: BoardColumn;
    /** Every status, for the status menu on each card. */
    statuses: BoardColumn[];
    issues: Issue[];
    projectId: string;
    categoriesById: Map<string, { id: string; name: string; color: string | null }>;
    membersById: Map<string, IssuePerson>;
    people: IssuePerson[];
    labels: Array<{ id: string; name: string; color: string | null }>;
    onUpdateIssue: (identifier: string, input: UpdateIssueInput) => void;
    onOpenIssue: (identifier: string) => void;
    /** Left out when the role cannot create issues. */
    onCreateIssue?: (columnId: string) => void;
    onHide: (columnId: string) => void;
    /** Opens the project's state settings, where states are added and ordered (the board has no "new column" button). */
    onManageStates: () => void;
    /** True while the dragged card is over this column. */
    lit?: boolean;
    /** True while a card is being dragged, so the layout glide does not fight dnd-kit. */
    suspendLayout: boolean;
    /** Another page of this column is available. */
    hasMore?: boolean;
    loadingMore?: boolean;
    onLoadMore?: () => void;
    pending?: boolean;
    failed?: boolean;
    /** How many issues the column has, including pages that are not loaded yet. */
    total?: number;
    /** Closed issues kept off the board until the person asks for them. */
    hiddenCompleted?: number | null;
    onShowCompleted?: () => void;
    /** The card keyboard navigation wants on screen, including one the window has not mounted. */
    focusIssueId?: string | null;
}

/** Memoized: while a card is dragged, only the columns it leaves and enters get new props. */
export const Column = memo(function Column({
    column,
    statuses,
    issues,
    projectId,
    categoriesById,
    membersById,
    people,
    labels,
    onUpdateIssue,
    onOpenIssue,
    onCreateIssue,
    onHide,
    onManageStates,
    lit = false,
    suspendLayout,
    hasMore = false,
    loadingMore = false,
    onLoadMore,
    pending = false,
    failed = false,
    total,
    hiddenCompleted = null,
    onShowCompleted,
    focusIssueId,
}: ColumnProps) {
    const { t } = useTranslation();
    const { density } = useDensity();
    const scrollRef = useRef<HTMLDivElement | null>(null);
    const { setNodeRef, isOver } = useDroppable({ id: column.id });
    const setDropRef = (node: HTMLDivElement | null) => {
        scrollRef.current = node;
        setNodeRef(node);
    };
    const loadMoreRef = useRef(onLoadMore);
    loadMoreRef.current = hasMore && !loadingMore ? onLoadMore : undefined;
    const virtualizer = useVirtualizer({
        count: issues.length,
        getScrollElement: () => scrollRef.current,
        estimateSize: () => 104,
        overscan: 6,
        getItemKey: (index) => issues[index]?.id ?? index,
    });
    useEffect(() => {
        const element = scrollRef.current;
        if (!element) return;
        const load = () => {
            if (element.scrollHeight <= element.clientHeight + 8 || element.scrollTop + element.clientHeight >= element.scrollHeight - 240)
                loadMoreRef.current?.();
        };
        load();
        element.addEventListener("scroll", load, { passive: true });
        return () => element.removeEventListener("scroll", load);
    }, [hasMore, issues.length, loadingMore]);
    const issuesRef = useRef(issues);
    issuesRef.current = issues;
    useEffect(() => {
        if (!focusIssueId) return;
        const index = issuesRef.current.findIndex((issue) => issue.id === focusIssueId);
        if (index < 0) return;
        virtualizer.scrollToIndex(index, { align: "auto" });
        const frame = requestAnimationFrame(() =>
            requestAnimationFrame(() => scrollRef.current?.querySelector<HTMLElement>(`[data-issue-id="${focusIssueId}"] [data-issue-context]`)?.focus()),
        );
        return () => cancelAnimationFrame(frame);
        // The virtualizer instance is stable; the list is read from the ref so a refresh does not steal focus.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [focusIssueId]);
    useEffect(() => {
        virtualizer.measure();
    }, [density, virtualizer]);

    const updateColumn = useUpdateColumn(projectId);
    const deleteColumn = useDeleteColumn(projectId);

    const [deleteOpen, setDeleteOpen] = useState(false);
    const [isEditingName, setIsEditingName] = useState(false);
    const [name, setName] = useState(column.name);
    const [error, setError] = useState<string | null>(null);
    const nameInputRef = useRef<HTMLInputElement>(null);
    const label = translateStatusName(column.name, t);

    useEffect(() => {
        if (isEditingName) {
            nameInputRef.current?.select();
        }
    }, [isEditingName]);

    function startEditing() {
        setName(column.name);
        setIsEditingName(true);
    }

    function saveName() {
        setIsEditingName(false);
        const trimmed = name.trim();
        if (!trimmed || trimmed === column.name) {
            setName(column.name);
            return;
        }
        updateColumn.mutate(
            { columnId: column.id, input: { name: trimmed } },
            {
                onError: (err) => setError(err instanceof ApiError ? err.message : t("errors.requestFailed")),
            },
        );
    }

    function handleDelete() {
        setError(null);
        deleteColumn.mutate(column.id, {
            onError: (err) => setError(err instanceof ApiError ? err.message : t("errors.requestFailed")),
        });
    }

    return (
        <div
            data-board-column={column.id}
            className={cx(
                "group/column animate-enter flex h-full max-h-full w-[85vw] shrink-0 snap-start flex-col overflow-hidden rounded-lg bg-surface-1 md:w-80 md:snap-align-none",
                (lit || isOver) && "bg-accent-subtle/50",
            )}
        >
            <div className="sticky top-0 z-[2] flex h-10 shrink-0 items-center gap-[var(--row-gap)] bg-surface-1 px-2.5">
                {isEditingName ? (
                    <Input
                        size="sm"
                        aria-label={t("settings.stateName")}
                        value={name}
                        onChange={setName}
                        onBlur={saveName}
                        autoFocus
                        ref={nameInputRef}
                        onKeyDown={(event) => {
                            if (event.key === "Enter") saveName();
                            if (event.key === "Escape") {
                                setName(column.name);
                                setIsEditingName(false);
                            }
                        }}
                    />
                ) : (
                    <button
                        type="button"
                        onClick={startEditing}
                        className="flex min-w-0 items-center gap-[var(--row-gap)] rounded px-0.5 text-left text-[13px] font-medium text-primary hover:bg-layer-1-hover"
                    >
                        <StateIcon name={column.name} color={column.color} className="size-4" />
                        <span className="truncate">{label}</span>
                    </button>
                )}

                <span className="text-xs text-tertiary">{Math.max(issues.length, total ?? 0)}</span>
                <div className="ml-auto flex shrink-0 items-center">
                    <Menu.Root>
                        <Menu.Trigger
                            aria-label={`${t("projects.columnActions")} · ${label}`}
                            className="grid size-6 place-items-center rounded text-tertiary outline-none hover:bg-layer-transparent-hover hover:text-primary focus-visible:bg-layer-transparent-hover data-[popup-open]:bg-layer-transparent-hover data-[popup-open]:text-primary"
                        >
                            <MoreHorizontal className="size-4" />
                        </Menu.Trigger>
                        <Menu.Portal>
                            <Menu.Positioner sideOffset={4} align="end" className="z-50">
                                <Menu.Popup
                                    className={cx(
                                        "w-52 origin-[var(--transform-origin)] transition-[opacity,transform] duration-150 data-[ending-style]:scale-95 data-[ending-style]:opacity-0 data-[starting-style]:scale-95 data-[starting-style]:opacity-0",
                                        overlayChrome.menu,
                                    )}
                                >
                                    <Menu.Item className={columnMenuItem} onClick={() => onHide(column.id)}>
                                        <EyeOff className="size-4 text-tertiary" />
                                        {t("projects.hideColumn")}
                                    </Menu.Item>
                                    <Menu.Item className={columnMenuItem} onClick={onManageStates}>
                                        <Settings2 className="size-4 text-tertiary" />
                                        {t("projects.manageStates")}
                                    </Menu.Item>
                                    <Menu.Separator className="my-1 h-px bg-[var(--border-subtle)]" />
                                    <Menu.Item
                                        className={cx(columnMenuItem, "text-danger-primary data-highlighted:text-danger-primary")}
                                        onClick={() => setDeleteOpen(true)}
                                    >
                                        <Trash2 className="size-4" />
                                        {t("settings.deleteState")}
                                    </Menu.Item>
                                </Menu.Popup>
                            </Menu.Positioner>
                        </Menu.Portal>
                    </Menu.Root>
                    {onCreateIssue && (
                        <ButtonUtility
                            icon={Plus}
                            size="xs"
                            color="tertiary"
                            tooltip={`${t("issue.newIssue")} · ${label}`}
                            onClick={() => onCreateIssue(column.id)}
                        />
                    )}
                </div>
            </div>
            <ConfirmDialog
                open={deleteOpen}
                onOpenChange={setDeleteOpen}
                title={t("settings.deleteState")}
                description={t("settings.deleteStateDescription", { name: label })}
                confirmLabel={t("settings.deleteState")}
                isPending={deleteColumn.isPending}
                onConfirm={handleDelete}
            />

            {error && <p className="px-3 pb-2 text-xs text-danger-primary">{error}</p>}

            <div ref={setDropRef} className="scrollbar-hide flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-2 pb-2">
                {failed && <p className="px-1 text-xs text-danger-primary">{t("issue.couldNotLoadIssues")}</p>}
                {pending && issues.length === 0 && (
                    <div className="space-y-2" aria-label={t("common.loading")} role="status">
                        <Skeleton className="h-24 w-full rounded-md" />
                        <Skeleton className="h-20 w-full rounded-md" />
                    </div>
                )}
                    <SortableContext items={issues.map((issue) => issue.id)} strategy={verticalListSortingStrategy}>
                        <div className="shrink-0" style={{ height: virtualizer.getTotalSize(), position: "relative" }}>
                            {virtualizer.getVirtualItems().map((virtual) => {
                                const issue = issues[virtual.index];
                                if (!issue) return null;
                                return (
                                    <div
                                        key={virtual.key}
                                        data-index={virtual.index}
                                        ref={virtualizer.measureElement}
                                        style={{
                                            position: "absolute",
                                            top: 0,
                                            left: 0,
                                            width: "100%",
                                            transform: `translateY(${virtual.start}px)`,
                                            paddingBottom: 8,
                                        }}
                                    >
                                        <IssueCard
                                            issue={issue}
                                            status={column}
                                            statuses={statuses}
                                            projectId={projectId}
                                            categories={resolveLabels(issue.categoryIds, categoriesById)}
                                            assignee={issue.assigneeId ? membersById.get(issue.assigneeId) : undefined}
                                            people={people}
                                            labels={labels}
                                            closed={columnBucket(column.name) === "closed"}
                                            suspendLayout={suspendLayout}
                                            onUpdateIssue={onUpdateIssue}
                                            onClick={() => onOpenIssue(issue.identifier)}
                                        />
                                    </div>
                                );
                            })}
                        </div>
                    </SortableContext>
                {hiddenCompleted != null && (
                    <button
                        type="button"
                        onClick={onShowCompleted}
                        className="flex h-8 shrink-0 items-center justify-center rounded-md text-xs text-tertiary hover:bg-layer-1-hover hover:text-secondary"
                    >
                        {t("issue.showMoreCompleted", { count: hiddenCompleted })}
                    </button>
                )}
                {hasMore && (
                    <button
                        type="button"
                        onClick={onLoadMore}
                        className="flex h-7 shrink-0 items-center justify-center text-xs text-tertiary hover:text-secondary"
                    >
                        {loadingMore ? t("common.loading") : t("issue.loadMoreIssues")}
                    </button>
                )}
                {/* Only the hovered (or keyboard-focused) column offers it, so the board stays quiet. */}
                {onCreateIssue && <button
                    type="button"
                    onClick={() => onCreateIssue(column.id)}
                    className="flex h-7 shrink-0 items-center gap-1 rounded px-1 text-left text-xs text-tertiary opacity-100 transition-opacity duration-150 hover:bg-layer-1-hover hover:text-secondary motion-reduce:transition-none can-hover:opacity-0 can-hover:group-hover/column:opacity-100 can-hover:group-focus-within/column:opacity-100 can-hover:focus-visible:opacity-100"
                >
                    <Plus className="size-3.5" />
                    {t("issue.newIssue")}
                </button>}
            </div>
        </div>
    );
});
