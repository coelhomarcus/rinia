import { useEffect, useMemo, useState } from "react";
import { DndContext, DragOverlay } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import type { IssueListQuery, IssueOrder, SavedViewFilters } from "@rinia/shared";
import { useVirtualizer } from "@tanstack/react-virtual";
import { ChevronDown, Layers, Plus, Users, X } from "lucide-react";
import { LayoutGroup } from "motion/react";
import { useTranslation } from "react-i18next";
import { Link, useLocation, useNavigate, useParams, useSearchParams } from "react-router";
import { Button } from "@/components/base/buttons/button";
import { Skeleton } from "@/components/base/feedback/skeleton";
import { EmptyState } from "@/components/feedback/empty-state";
import { ErrorMessage } from "@/components/feedback/error-message";
import { columnBucket, defaultIssueColumn } from "@/features/board/column-bucket";
import { Board } from "@/features/board/components/board";
import { HiddenColumnsMenu, useHiddenColumns } from "@/features/board/components/hidden-columns";
import { StateIcon } from "@/features/board/components/issue-property-icons";
import { useColumns } from "@/features/board/hooks/use-board";
import { useCategories } from "@/features/categories/hooks/use-categories";
import { listStep } from "@/features/commands/shortcuts";
import type { Issue } from "@/features/issues/api";
import { useProjectPermissions } from "@/features/projects/hooks/use-project-permissions";
import { BulkActionBar } from "@/features/issues/components/bulk-action-bar";
import { DragLift } from "@/features/issues/components/drag-feedback";
import { SortableIssueListRow } from "@/features/issues/components/sortable-issue-list-row";
import { IssueMotionRoster } from "@/features/issues/components/issue-motion";
import { IssueQuickCreateModal } from "@/features/issues/components/lazy-issue-quick-create-modal";
import { IssueFilterRow, IssueToolbar, pillTab } from "@/features/issues/components/issue-toolbar";
import { resolveLabels } from "@/features/issues/components/labels-picker";
import { useIssueView } from "@/features/issues/hooks/use-issue-view";
import { useIssueWindow, useUpdateIssue } from "@/features/issues/hooks/use-issues";
import { type ListGroupBy, listGroupKey, useListReorder } from "@/features/issues/hooks/use-list-reorder";
import { matchesDueFilter } from "@/features/issues/lib/due-date";
import { matchesLabels, readLabels } from "@/features/issues/lib/issue-filters";
import { priorityLabelKey } from "@/features/issues/lib/priority";
import { IssueSelectionProvider, useIssueSelection, useRegisterVisibleIssues } from "@/features/issues/selection";
import { ProjectWorkspaceHeader } from "@/features/projects/components/project-workspace-header";
import { useProjectMembers } from "@/features/projects/hooks/use-project-members";
import { useRouteProject } from "@/features/projects/route-project";
import type { SavedView } from "@/features/views/api";
import { COLLAPSE, Label, useViewActions } from "@/features/views/components/view-controls";
import { useViews } from "@/features/views/hooks/use-views";
import { filtersFromParams, paramsFromFilters } from "@/features/views/lib/view-filters";
import { translateStatusName } from "@/i18n/status-label";
import { urls } from "@/lib/urls";
import { issueNavigation } from "@/lib/view-transition";
import { useDensity } from "@/providers/density";
import { cx } from "@/utils/cx";
import { preloadWhenIdle } from "@/lib/preload";

type OrderBy = IssueOrder;
type GroupBy = ListGroupBy;
type Scope = "active" | "backlog" | "all";

/** The keys that open a list row's property menu, by the `data-property` of its trigger. */
const ROW_MENU_KEYS: Record<string, string | undefined> = { s: "status", p: "priority", a: "assignee" };

/**
 * Each project keeps its own selection; moving to another project starts empty. On a saved view's page the
 * view is passed in: its scope lives in the address like its filters, and its layout is part of what it saves.
 */
export const ProjectIssuesPage = ({ savedView }: { savedView?: SavedView }) => {
    const { projectId } = useRouteProject();
    return (
        <IssueSelectionProvider key={projectId}>
            <ProjectIssues savedView={savedView} />
        </IssueSelectionProvider>
    );
};

const ProjectIssues = ({ savedView }: { savedView?: SavedView }) => {
    const { t, i18n } = useTranslation();
    const { density } = useDensity();
    const { projectId, projectKey } = useRouteProject();
    // Viewers and guests read the list: no new issues, no dragging, no bulk changes.
    const canWrite = useProjectPermissions(projectId).can("issues.write");
    const selection = useIssueSelection()!;
    const params = useParams<{ scope: string }>();
    const navigate = useNavigate();
    const [searchParams, setSearchParams] = useSearchParams();
    const orderBy = readOrder(searchParams.get("order"));
    const groupBy = readGroup(searchParams.get("group"));
    const search = searchParams.get("q") ?? "";
    const priority = searchParams.get("priority") ?? "";
    const status = searchParams.get("status") ?? "";
    const assignee = searchParams.get("assignee") ?? "";
    const labelFilter = useMemo(() => readLabels(searchParams.get("label")), [searchParams]);
    const due = searchParams.get("due") ?? "";
    const scope = savedView ? readSavedScope(searchParams.get("scope")) : readScope(params.scope ?? null);
    const { view, setView } = useIssueView(projectId!, { saved: !!savedView });
    // The screen as a view would save it: the address's parameters, plus the scope and layout that may live elsewhere.
    const screenFilters = useMemo<SavedViewFilters | null>(() => {
        if (!view) return null;
        const filters = filtersFromParams(searchParams);
        filters.view = view;
        if (scope === "active") delete filters.scope;
        else filters.scope = scope;
        return filters;
    }, [scope, searchParams, view]);
    // Arriving from "New view" opens the filter row, so the first filter is one click away.
    const startingView = !!(useLocation().state as { newView?: boolean } | null)?.newView;
    const viewActions = useViewActions({ projectId: projectId!, projectKey, filters: screenFilters, savedView });
    const { data: savedViews } = useViews(projectId!);
    const listQuery = useMemo<IssueListQuery>(
        () => ({
            orderBy,
            limit: 80,
            closed: "exclude",
            ...(status ? { columnId: status } : {}),
            ...(priority ? { priority: priority as IssueListQuery["priority"] } : {}),
            ...(assignee ? { assigneeId: assignee } : {}),
            ...(labelFilter.length ? { categoryIds: labelFilter } : {}),
        }),
        [assignee, labelFilter, orderBy, priority, status],
    );
    const updateIssue = useUpdateIssue(projectId!);
    const { data: columns } = useColumns(projectId!);
    const { hidden: hiddenColumns, hideColumn, showColumn, showAllColumns } = useHiddenColumns(projectId!);
    const { data: members } = useProjectMembers(projectId!);
    const { data: categories } = useCategories(projectId!);
    const [isCreating, setIsCreating] = useState(false);
    const [creatingColumnId, setCreatingColumnId] = useState<string | null>(null);
    const [selectedIssueId, setSelectedIssueId] = useState<string | null>(null);
    const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
    // Collapsing or expanding a group moves every row below it at once. The headers jump, so a row that glided there
    // would slide across the next header's text: the glide stays off until the list has settled.
    const [togglingGroup, setTogglingGroup] = useState(false);
    useEffect(() => {
        if (!togglingGroup) return;
        const timer = window.setTimeout(() => setTogglingGroup(false), 200);
        return () => window.clearTimeout(timer);
    }, [togglingGroup]);
    const [showClosed, setShowClosed] = useState(false);
    const [listScroll, setListScroll] = useState<HTMLElement | null>(null);

    const columnById = useMemo(() => new Map((columns ?? []).map((column) => [column.id, column])), [columns]);
    // The backlog scope only lists issues in a "Backlog" or "Fila" column; without one it would always be empty,
    // so its tab only shows when the project has such a column (or a link already opened it).
    const showBacklog = scope === "backlog" || (columns ?? []).some((column) => columnBucket(column.name) === "backlog");
    const memberById = useMemo(() => new Map((members ?? []).map((member) => [member.id, member])), [members]);
    const categoryById = useMemo(() => new Map((categories ?? []).map((item) => [item.id, item])), [categories]);
    const filteringClosed = !!status && columnBucket(columnById.get(status)?.name ?? "") === "closed";
    const listView = view === "list";
    const openWindow = useIssueWindow(projectId!, listQuery, { enabled: listView && !filteringClosed });
    const completedQuery = useMemo(() => ({ ...listQuery, closed: "only" as const, limit: 120 }), [listQuery]);
    const closedCountQuery = useMemo(() => ({ ...completedQuery, limit: 0 }), [completedQuery]);
    const completedWindow = useIssueWindow(projectId!, completedQuery, { enabled: listView && (showClosed || filteringClosed) });
    const closedCount = useIssueWindow(projectId!, closedCountQuery, { enabled: listView && !showClosed && !filteringClosed });
    const showingClosed = showClosed || filteringClosed;
    const issues = useMemo(
        () => [...openWindow.issues, ...(showingClosed ? completedWindow.issues : [])],
        [completedWindow.issues, openWindow.issues, showingClosed],
    );
    const isLoading = filteringClosed ? completedWindow.isLoading : openWindow.isLoading;
    const isError = openWindow.isError || completedWindow.isError;
    const filteredIssues = useMemo(
        () =>
            issues.filter((issue) => {
                const textMatch = !search || `${issue.identifier} ${issue.title}`.toLowerCase().includes(search.toLowerCase());
                const bucket = columnBucket(columnById.get(issue.columnId)?.name ?? "");
                const scopeMatch = scope === "all" || bucket === scope;
                const dueMatch = matchesDueFilter(issue.dueDate, due, bucket === "closed");
                return (
                    textMatch &&
                    scopeMatch &&
                    dueMatch &&
                    (!priority || issue.priority === priority) &&
                    (!status || issue.columnId === status) &&
                    (!assignee || issue.assigneeId === assignee) &&
                    matchesLabels(issue.categoryIds, labelFilter)
                );
            }),
        [assignee, columnById, due, issues, labelFilter, priority, scope, search, status],
    );
    // How many issues the filters hide from this scope, for the note under the list.
    const hiddenByFilters = useMemo(
        () =>
            (issues ?? []).filter((issue) => scope === "all" || columnBucket(columnById.get(issue.columnId)?.name ?? "") === scope).length -
            filteredIssues.length,
        [columnById, filteredIssues.length, issues, scope],
    );
    // In manual order the list sorts by position itself, so a moved issue lands in place before the server answers.
    const manualOrder = orderBy === "position";
    const orderedSource = useMemo(
        () => (manualOrder ? [...filteredIssues].sort((left, right) => left.position - right.position || left.number - right.number) : filteredIssues),
        [filteredIssues, manualOrder],
    );
    const reorder = useListReorder({
        issues: orderedSource,
        groupBy,
        onMove: (issue, input, done) => updateIssue.mutate({ identifier: issue.identifier, input }, { onSettled: done }),
    });
    const listIssues = reorder.items;
    // Every identifier gets the width of the longest one, so titles line up without the ID column taking extra room.
    const identifierWidth = useMemo(() => Math.max(4, ...(issues ?? []).map((issue) => issue.identifier.length)), [issues]);

    const groups = useMemo(() => {
        if (groupBy === "none") return [{ key: "all", label: null, issues: listIssues }];

        const grouped = new Map<string, Issue[]>();
        for (const issue of listIssues) {
            const key = listGroupKey(issue, groupBy);
            grouped.set(key, [...(grouped.get(key) ?? []), issue]);
        }

        const ordered = [...grouped.entries()].sort((left, right) => {
            if (groupBy !== "status") return left[0].localeCompare(right[0]);
            const leftIndex = (columns ?? []).findIndex((column) => column.id === left[0]);
            const rightIndex = (columns ?? []).findIndex((column) => column.id === right[0]);
            return (leftIndex < 0 ? 99 : leftIndex) - (rightIndex < 0 ? 99 : rightIndex);
        });
        return ordered.map(([key, groupedIssues]) => ({
            key,
            label: groupBy === "status" ? (columnById.get(key)?.name ?? t("issue.unknownStatus")) : (memberById.get(key)?.name ?? t("issue.unassigned")),
            issues: groupedIssues,
        }));
    }, [columnById, columns, listIssues, groupBy, memberById, t]);
    const orderedIssues = useMemo(() => groups.flatMap((group) => group.issues), [groups]);
    // Collapsed groups hide their issues, so they are not selected by Cmd/Ctrl+A or included in ranges.
    const visibleIds = useMemo(
        () => groups.flatMap((group) => (collapsedGroups.has(group.key) ? [] : group.issues.map((issue) => issue.id))),
        [groups, collapsedGroups],
    );
    useRegisterVisibleIssues(view === "list" ? visibleIds : null);
    const selectedIssues = useMemo(() => (issues ?? []).filter((issue) => selection.selected.has(issue.id)), [issues, selection.selected]);

    useEffect(() => {
        if (selectedIssueId && !orderedIssues.some((issue) => issue.id === selectedIssueId)) setSelectedIssueId(null);
    }, [orderedIssues, selectedIssueId]);

    const rows = useMemo(() => {
        const flat: Array<{ type: "header"; group: (typeof groups)[number] } | { type: "issue"; issue: Issue }> = [];
        for (const group of groups) {
            if (group.label) flat.push({ type: "header", group });
            if (!collapsedGroups.has(group.key)) for (const issue of group.issues) flat.push({ type: "issue", issue });
        }
        return flat;
    }, [collapsedGroups, groups]);
    const rowIndexById = useMemo(() => {
        const index = new Map<string, number>();
        rows.forEach((row, position) => {
            if (row.type === "issue") index.set(row.issue.id, position);
        });
        return index;
    }, [rows]);
    const virtualizer = useVirtualizer({
        count: rows.length,
        getScrollElement: () => listScroll,
        estimateSize: () => 36,
        overscan: 12,
        getItemKey: (index) => {
            const row = rows[index];
            if (!row) return index;
            return row.type === "issue" ? row.issue.id : `header:${row.group.key}`;
        },
    });
    useEffect(() => {
        if (view !== "list" || !listScroll) return;
        const load = () => {
            const nearEnd =
                listScroll.scrollHeight <= listScroll.clientHeight + 8 || listScroll.scrollTop + listScroll.clientHeight >= listScroll.scrollHeight - 480;
            if (!nearEnd) return;
            if (!filteringClosed && openWindow.hasNextPage && !openWindow.isFetchingNextPage) void openWindow.fetchNextPage();
            else if (showingClosed && completedWindow.hasNextPage && !completedWindow.isFetchingNextPage) void completedWindow.fetchNextPage();
        };
        load();
        listScroll.addEventListener("scroll", load, { passive: true });
        return () => listScroll.removeEventListener("scroll", load);
    }, [
        completedWindow.fetchNextPage,
        completedWindow.hasNextPage,
        completedWindow.isFetchingNextPage,
        filteringClosed,
        listScroll,
        openWindow.fetchNextPage,
        openWindow.hasNextPage,
        openWindow.isFetchingNextPage,
        rows.length,
        showingClosed,
        view,
    ]);
    useEffect(() => {
        virtualizer.measure();
    }, [density, virtualizer]);

    useEffect(() => {
        if (view !== "list") return;

        function handleListKeyDown(event: KeyboardEvent) {
            const target = event.target as HTMLElement | null;
            if (target?.matches("input, textarea, select, [contenteditable='true']")) return;
            if (orderedIssues.length === 0 || reorder.activeIssue) return;

            const currentIndex = orderedIssues.findIndex((issue) => issue.id === selectedIssueId);
            const direction = listStep(event);
            if (direction) {
                event.preventDefault();
                const nextIndex =
                    currentIndex < 0
                        ? direction === 1
                            ? 0
                            : orderedIssues.length - 1
                        : (currentIndex + direction + orderedIssues.length) % orderedIssues.length;
                const nextIssue = orderedIssues[nextIndex];
                setSelectedIssueId(nextIssue.id);
                const rowIndex = rowIndexById.get(nextIssue.id);
                if (rowIndex !== undefined) virtualizer.scrollToIndex(rowIndex, { align: "auto" });
                requestAnimationFrame(() =>
                    requestAnimationFrame(() => document.querySelector<HTMLElement>(`[data-issue-id="${nextIssue.id}"]`)?.scrollIntoView({ block: "nearest" })),
                );
            }
            if (event.key === "Enter" && currentIndex >= 0) {
                event.preventDefault();
                openIssue(orderedIssues[currentIndex].identifier, orderedIssues[currentIndex].title);
            }
            if (event.key === "Escape") setSelectedIssueId(null);

            // S, P and A open the selected row's menu, as on the issue screen. Estimates and labels are not shown on rows.
            const property =
                !event.metaKey && !event.ctrlKey && !event.altKey && !event.shiftKey && !event.isComposing && currentIndex >= 0
                    ? ROW_MENU_KEYS[event.key.toLowerCase()]
                    : undefined;
            if (property && !target?.closest("[role='menu'], [role='dialog'], [role='listbox']")) {
                event.preventDefault();
                const issueId = orderedIssues[currentIndex].id;
                const openMenu = () => {
                    const trigger = document.querySelector<HTMLElement>(`[data-issue-id="${issueId}"] [data-property="${property}"]`);
                    if (!trigger) return false;
                    trigger.focus();
                    trigger.click();
                    return true;
                };
                if (!openMenu()) {
                    const rowIndex = rowIndexById.get(issueId);
                    if (rowIndex !== undefined) virtualizer.scrollToIndex(rowIndex, { align: "auto" });
                    requestAnimationFrame(() => requestAnimationFrame(openMenu));
                }
            }
        }

        window.addEventListener("keydown", handleListKeyDown);
        return () => window.removeEventListener("keydown", handleListKeyDown);
    }, [orderedIssues, reorder.activeIssue, rowIndexById, selectedIssueId, view, virtualizer]);

    function clearFilters() {
        setSearchParams(
            (current) => {
                for (const key of ["q", "priority", "status", "assignee", "label", "due", "group"]) current.delete(key);
                return current;
            },
            { replace: true },
        );
    }

    /** Says what is empty: the filters and search that match nothing, or the scope and which states it covers. */
    function listEmptyState() {
        const list = new Intl.ListFormat(i18n.language, { type: "conjunction" });
        const statusName = (column: { name: string }) => translateStatusName(column.name, t);
        if (!issues?.length) {
            return {
                illustration: "kanban" as const,
                title: t("issue.noIssues"),
                description: t("issue.createFirstIssue"),
                action: canWrite && (
                    <Button size="sm" iconLeading={Plus} onClick={() => startCreating(defaultIssueColumn(columns)?.id ?? null)}>
                        {t("issue.newIssue")}
                    </Button>
                ),
            };
        }

        const statusColumn = status ? columnById.get(status) : undefined;
        const assigneeName = assignee ? memberById.get(assignee)?.name : undefined;
        const labelNames = resolveLabels(labelFilter, categoryById).map((item) => item.name);
        const labelName = labelNames.length ? new Intl.ListFormat(i18n.language, { type: "disjunction" }).format(labelNames) : undefined;
        const conditions = (
            [
                priority && t("issue.conditionPriority", { value: t(priorityLabelKey(priority)) }),
                statusColumn && t("issue.conditionStatus", { value: statusName(statusColumn) }),
                assigneeName && t("issue.conditionAssignee", { value: assigneeName }),
                labelName && t("issue.conditionLabel", { value: labelName }),
                due === "overdue" && t("issue.conditionDueOverdue"),
                due === "thisWeek" && t("issue.conditionDueThisWeek"),
                search && t("issue.conditionSearch", { value: search }),
            ] as Array<string | false | undefined>
        ).filter((condition): condition is string => !!condition);
        if (conditions.length > 0) {
            const scopeLabel = scope === "backlog" ? t("issue.backlog") : t("issue.active");
            return {
                illustration: "crate" as const,
                title: t("issue.noMatchingIssues"),
                description:
                    scope === "all"
                        ? t("issue.emptyFilteredAll", { conditions: list.format(conditions) })
                        : t("issue.emptyFiltered", { scope: scopeLabel, conditions: list.format(conditions) }),
                action: (
                    <Button size="sm" color="secondary" onClick={clearFilters}>
                        {t("issue.clearFilters")}
                    </Button>
                ),
            };
        }

        const statesWhere = (match: (bucket: string) => boolean) =>
            list.format((columns ?? []).filter((column) => match(columnBucket(column.name))).map(statusName));
        if (scope === "backlog") {
            const backlogColumn = columns?.find((column) => columnBucket(column.name) === "backlog");
            return {
                illustration: "kanban" as const,
                title: t("issue.emptyBacklogTitle"),
                description: t("issue.emptyBacklog", { states: statesWhere((bucket) => bucket === "backlog") }),
                action: canWrite && (
                    <Button size="sm" iconLeading={Plus} onClick={() => startCreating(backlogColumn?.id ?? null)}>
                        {t("issue.newIssue")}
                    </Button>
                ),
            };
        }
        return {
            illustration: "kanban" as const,
            title: t("issue.emptyActiveTitle"),
            description: t("issue.emptyActive", { states: statesWhere((bucket) => bucket !== "active") }),
            action: (
                <Button size="sm" color="secondary" onClick={() => setScope("all")}>
                    {t("issue.showAllIssues")}
                </Button>
            ),
        };
    }

    /** Opens the new-issue modal, starting in `columnId` (a group's status) or the project's default status. */
    function startCreating(columnId: string | null) {
        setCreatingColumnId(columnId);
        setIsCreating(true);
    }

    function openIssue(identifier: string, title?: string) {
        void navigate(urls.issue(identifier), issueNavigation(title ?? issues?.find((issue) => issue.identifier === identifier)?.title));
    }

    function setScope(next: Scope) {
        // A saved view keeps its own scope; the scope pills lead back to the plain issue list.
        if (savedView) {
            void navigate(urls.issues(projectKey, next));
            return;
        }
        const query = searchParams.toString();
        void navigate(`${urls.issues(projectKey, next)}${query ? `?${query}` : ""}`, { replace: true });
    }

    return (
        <div className="relative flex h-full min-h-0 flex-col bg-surface-1">
            <ProjectWorkspaceHeader
                projectId={projectId!}
                activeView={savedView ? "views" : "issues"}
                favorite={savedView ? { kind: "view", projectId: projectId!, viewId: savedView.id } : undefined}
                crumb={
                    savedView && (
                        <>
                            <span className="truncate">{savedView.name}</span>
                            {savedView.shared && <Users aria-label={t("views.sharedWithProject")} role="img" className="size-3.5 shrink-0 text-tertiary" />}
                        </>
                    )
                }
                actions={
                    <>
                        {viewActions.menu}
                        {canWrite && (
                            <Button size="md" color="secondary" className={cx(COLLAPSE, "rounded-full max-md:hidden")} iconLeading={Plus} onClick={() => startCreating(null)}>
                                <Label>{t("issue.newIssue")}</Label>
                            </Button>
                        )}
                    </>
                }
            />
            {/* Pills on the left (scopes, then saved views), round icon controls on the right; every control is 28px tall. */}
            {/* The bar and the filter row share the content's background and need no border; on the board that is the board's own. */}
            <div
                className={cx(
                    "flex h-11 shrink-0 items-center gap-1 px-3 transition-colors",
                    view === "board" ? "bg-surface-2" : "bg-surface-1",
                )}
            >
                {view && (
                    <div className="animate-enter scrollbar-hide flex min-w-0 items-center gap-1 overflow-x-auto max-md:pr-4 max-md:[mask-image:linear-gradient(to_right,black_85%,transparent)]">
                        {(
                            [
                                ["all", t("issue.allIssues")],
                                ["active", t("issue.active")],
                                ...(showBacklog ? [["backlog", t("issue.backlog")] as const] : []),
                            ] as const
                        ).map(([value, label]) => (
                            <button
                                key={value}
                                type="button"
                                aria-pressed={!savedView && scope === value}
                                className={pillTab(!savedView && scope === value)}
                                onClick={() => setScope(value)}
                            >
                                {label}
                            </button>
                        ))}
                        {savedViews?.map((item) => (
                            <Link
                                key={item.id}
                                to={`${urls.view(projectKey, item)}?${paramsFromFilters(item.filters)}`}
                                aria-current={savedView?.id === item.id ? "page" : undefined}
                                className={pillTab(savedView?.id === item.id)}
                            >
                                <Layers className="size-3.5 shrink-0" />
                                {item.name}
                            </Link>
                        ))}
                        {viewActions.saveButton}
                    </div>
                )}
                {view && (
                    <div className="animate-enter ml-auto flex shrink-0 items-center gap-1">
                        <IssueToolbar layout={view} onLayoutChange={setView} projectId={projectId!} />
                        {view === "board" && (
                            <HiddenColumnsMenu
                                columns={(columns ?? []).filter((column) => hiddenColumns.has(column.id))}
                                countFor={(columnId) => filteredIssues.filter((issue) => issue.columnId === columnId).length}
                                onShow={showColumn}
                                onShowAll={showAllColumns}
                            />
                        )}
                    </div>
                )}
            </div>
            <IssueFilterRow
                projectId={projectId!}
                keepOpen={viewActions.dirty || startingView}
                actions={viewActions.filterActions}
                className={cx("transition-colors", view === "board" ? "bg-surface-2" : "bg-surface-1")}
            />
            {viewActions.dialogs}
            {isCreating && defaultIssueColumn(columns) && (
                <IssueQuickCreateModal
                    projectId={projectId!}
                    columnId={creatingColumnId ?? defaultIssueColumn(columns)!.id}
                    onClose={() => {
                        setIsCreating(false);
                        setCreatingColumnId(null);
                    }}
                    onCreated={openIssue}
                />
            )}
            {/* Each view eases in when it opens, so switching (or a first-time preference arriving) never pops. */}
            {view === "board" && (
                <div key="board" className="animate-enter flex min-h-0 flex-1 flex-col overflow-hidden bg-surface-2 pt-1 pb-3 md:px-4">
                    <Board projectId={projectId!} filters={searchParams} scope={scope} hidden={hiddenColumns} hideColumn={hideColumn} showColumn={showColumn} />
                </div>
            )}
            {view === "list" && (
                <main key="list" ref={setListScroll} className="animate-enter min-h-0 w-full flex-1 overflow-y-auto">
                    <div className="flex min-h-full flex-col">
                        {isLoading && <IssueListSkeleton />}
                        {isError && <ErrorMessage message={t("issue.couldNotLoadIssues")} />}
                        {!isLoading && !isError && (
                            <LayoutGroup>
                                <IssueMotionRoster ids={visibleIds}>
                                    <DndContext {...reorder.dndProps} {...(canWrite ? {} : { sensors: [] })}>
                                        <SortableContext items={visibleIds} strategy={verticalListSortingStrategy}>
                                            <div style={{ height: virtualizer.getTotalSize(), position: "relative" }}>
                                                {virtualizer.getVirtualItems().map((virtual) => {
                                                    const row = rows[virtual.index];
                                                    if (!row) return null;
                                                    if (row.type === "header") {
                                                        const column = columnById.get(row.group.key);
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
                                                                }}
                                                            >
                                                                <h2
                                                                    className={cx(
                                                                        "bg-layer-transparent-hover",
                                                                        reorder.overGroupKey === row.group.key && "bg-accent-subtle/40",
                                                                    )}
                                                                >
                                                                    <div className="flex h-[var(--row-height)] items-center gap-[var(--row-gap)] px-3 text-[13px] text-secondary">
                                                                        <button
                                                                            type="button"
                                                                            aria-expanded={!collapsedGroups.has(row.group.key)}
                                                                            onClick={() => {
                                                                                setTogglingGroup(true);
                                                                                setCollapsedGroups((current) => {
                                                                                    const next = new Set(current);
                                                                                    if (next.has(row.group.key)) next.delete(row.group.key);
                                                                                    else next.add(row.group.key);
                                                                                    return next;
                                                                                });
                                                                            }}
                                                                            className="flex min-w-0 flex-1 items-center gap-2 text-left"
                                                                        >
                                                                            <ChevronDown
                                                                                className={`size-3.5 text-placeholder transition-transform duration-200 ${collapsedGroups.has(row.group.key) ? "-rotate-90" : ""}`}
                                                                                aria-hidden="true"
                                                                            />
                                                                            {groupBy === "status" && (
                                                                                <StateIcon name={column?.name ?? row.group.label ?? ""} color={column?.color} />
                                                                            )}
                                                                            <span>
                                                                                {row.group.label === "Unknown status"
                                                                                    ? t("issue.unknownStatus")
                                                                                    : translateStatusName(row.group.label ?? "", t)}
                                                                            </span>
                                                                            <span className="text-tertiary">{row.group.issues.length}</span>
                                                                        </button>
                                                                        {groupBy === "status" && canWrite && (
                                                                            <button
                                                                                type="button"
                                                                                aria-label={t("issue.newIssue")}
                                                                                className="flex size-6 items-center justify-center rounded text-tertiary hover:bg-layer-1-hover hover:text-primary"
                                                                                onClick={() => startCreating(row.group.key)}
                                                                            >
                                                                                <Plus className="size-3.5" />
                                                                            </button>
                                                                        )}
                                                                    </div>
                                                                </h2>
                                                            </div>
                                                        );
                                                    }
                                                    const issue = row.issue;
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
                                                            }}
                                                        >
                                                            <SortableIssueListRow
                                                                issue={issue}
                                                                projectId={projectId!}
                                                                identifierWidth={identifierWidth}
                                                                sortable={manualOrder}
                                                                suspendLayout={reorder.suspendLayout}
                                                                layoutAnimation={!togglingGroup}
                                                                column={columnById.get(issue.columnId)}
                                                                columns={columns ?? []}
                                                                member={issue.assigneeId ? memberById.get(issue.assigneeId) : undefined}
                                                                members={members ?? []}
                                                                categories={resolveLabels(issue.categoryIds, categoryById)}
                                                                labels={categories ?? []}
                                                                selected={selectedIssueId === issue.id}
                                                                onSelect={() => setSelectedIssueId(issue.id)}
                                                                onUpdate={(input) => updateIssue.mutate({ identifier: issue.identifier, input })}
                                                            />
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </SortableContext>
                                        {(openWindow.isFetchingNextPage || completedWindow.isFetchingNextPage) && (
                                            <p className="py-3 text-center text-xs text-tertiary">{t("common.loading")}</p>
                                        )}
                                        {!showingClosed && !openWindow.hasNextPage && closedCount.total > 0 && scope === "all" && (
                                            <button
                                                type="button"
                                                onClick={() => setShowClosed(true)}
                                                className="flex h-11 w-full items-center justify-center text-[13px] text-secondary hover:bg-layer-transparent-hover hover:text-primary"
                                            >
                                                {t("issue.showCompleted", { count: closedCount.total })}
                                            </button>
                                        )}
                                        {filteredIssues.length === 0 && <EmptyState framed={false} className="flex-1 py-16" {...listEmptyState()} />}
                                        {filteredIssues.length > 0 && hiddenByFilters > 0 && (
                                            <div className="animate-enter flex items-center justify-center gap-3 py-4 text-[13px]">
                                                <span>
                                                    <span className="text-primary">
                                                        {hiddenByFilters === 1
                                                            ? t("issue.hiddenByFiltersOne")
                                                            : t("issue.hiddenByFiltersMany", { count: hiddenByFilters })}
                                                    </span>{" "}
                                                    <span className="text-tertiary">{t("issue.hiddenByFilters")}</span>
                                                </span>
                                                <button
                                                    type="button"
                                                    onClick={clearFilters}
                                                    className="flex items-center gap-1 text-secondary transition-colors hover:text-primary"
                                                >
                                                    {t("issue.clearFilters")}
                                                    <X className="size-3.5" />
                                                </button>
                                            </div>
                                        )}
                                        <DragOverlay dropAnimation={reorder.dropAnimation}>
                                            {reorder.activeIssue && (
                                                <DragLift
                                                    tilt={reorder.tilt}
                                                    reducedMotion={reorder.reducedMotion}
                                                    className="flex h-9 items-center gap-2 rounded-md border border-accent-strong bg-surface-1 px-2 text-[13px]"
                                                >
                                                    <span className="size-5 shrink-0" />
                                                    <span className="shrink-0 font-mono text-xs text-tertiary" style={{ width: `${identifierWidth}ch` }}>
                                                        {reorder.activeIssue.identifier}
                                                    </span>
                                                    <span className="min-w-0 flex-1 truncate text-secondary">{reorder.activeIssue.title}</span>
                                                </DragLift>
                                            )}
                                        </DragOverlay>
                                    </DndContext>
                                </IssueMotionRoster>
                            </LayoutGroup>
                        )}
                    </div>
                </main>
            )}
            {canWrite && <BulkActionBar
                projectId={projectId!}
                issues={selectedIssues}
                columns={columns ?? []}
                members={members ?? []}
                labels={categories ?? []}
                onClear={selection.clear}
            />}
        </div>
    );
};

function IssueListSkeleton() {
    const { t } = useTranslation();
    return (
        <div className="overflow-hidden" aria-label={t("common.loading")} role="status">
            <div className="hidden h-9 border-b border-subtle bg-surface-2 sm:block" />
            <div className="divide-y divide-subtle">
                {["one", "two", "three", "four", "five"].map((key) => (
                    <div key={key} className="flex h-11 items-center gap-4 px-4">
                        <Skeleton className="h-3 w-24 shrink-0" />
                        <Skeleton className="h-3 min-w-0 flex-1" />
                        <Skeleton className="hidden h-3 w-24 sm:block" />
                        <Skeleton className="hidden size-2 rounded-full sm:block" />
                    </div>
                ))}
            </div>
        </div>
    );
}

function readOrder(value: string | null): OrderBy {
    return value === "number" || value === "priority" || value === "updated" || value === "due" ? value : "position";
}

function readGroup(value: string | null): GroupBy {
    if (value === "none" || value === "assignee") return value;
    return "status";
}

/** The plain issue list opens on every issue; the scope is only in the address when it narrows the list. */
function readScope(value: string | null): Scope {
    return value === "backlog" || value === "active" ? value : "all";
}

/** Saved views leave the scope out when it is active, so views saved before "all" became the default keep their meaning. */
function readSavedScope(value: string | null): Scope {
    return value === "backlog" || value === "all" ? value : "active";
}

preloadWhenIdle(() => import("@/features/issues/components/issue-view/issue-view"));
