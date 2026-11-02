import { useEffect, useMemo, useState } from "react";
import { DndContext, DragOverlay } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import type { Issue } from "@/features/issues/api";
import type { IssueOrder, SavedViewFilters } from "@rinia/shared";
import { AddOutline, ChevronDownOutline } from "@makeplane/propel/icons";
import { Layers, Plus, Users, X } from "lucide-react";
import { Link, useLocation, useNavigate, useParams, useSearchParams } from "react-router";
import { urls } from "@/lib/urls";
import { cx } from "@/utils/cx";
import { useRouteProject } from "@/features/projects/route-project";
import { Button } from "@/components/base/buttons/button";
import { EmptyState } from "@/components/feedback/empty-state";
import { ErrorMessage } from "@/components/feedback/error-message";
import { Skeleton } from "@/components/base/feedback/skeleton";
import { Board } from "@/features/board/components/board";
import { HiddenColumnsMenu, useHiddenColumns } from "@/features/board/components/hidden-columns";
import { StateIcon } from "@/features/board/components/issue-property-icons";
import { useColumns } from "@/features/board/hooks/use-board";
import { columnBucket, defaultIssueColumn } from "@/features/board/column-bucket";
import { IssueQuickCreateModal } from "@/features/issues/components/issue-quick-create-modal";
import { IssueListRow } from "@/features/issues/components/issue-list-row";
import { useIssues, useUpdateIssue } from "@/features/issues/hooks/use-issues";
import { ProjectWorkspaceHeader } from "@/features/projects/components/project-workspace-header";
import { IssueFilterRow, IssueToolbar, pillTab } from "@/features/issues/components/issue-toolbar";
import type { SavedView } from "@/features/views/api";
import { COLLAPSE, Label, useViewActions } from "@/features/views/components/view-controls";
import { useViews } from "@/features/views/hooks/use-views";
import { filtersFromParams, paramsFromFilters } from "@/features/views/lib/view-filters";
import { BulkActionBar } from "@/features/issues/components/bulk-action-bar";
import { IssueSelectionProvider, useIssueSelection, useRegisterVisibleIssues } from "@/features/issues/selection";
import { useIssueView } from "@/features/issues/hooks/use-issue-view";
import { listGroupKey, useListReorder, type ListGroupBy } from "@/features/issues/hooks/use-list-reorder";
import { useProjectMembers } from "@/features/projects/hooks/use-project-members";
import { useCategories } from "@/features/categories/hooks/use-categories";
import { matchesDueFilter } from "@/features/issues/lib/due-date";
import { matchesLabels, readLabels } from "@/features/issues/lib/issue-filters";
import { resolveLabels } from "@/features/issues/components/labels-picker";
import { priorityLabelKey } from "@/features/issues/lib/priority";
import { useTranslation } from "react-i18next";
import { translateStatusName } from "@/i18n/status-label";

type OrderBy = IssueOrder;
type GroupBy = ListGroupBy;
type Scope = "active" | "backlog" | "all";

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
    const { projectId, projectKey } = useRouteProject();
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
    const { data: issues, isLoading, isError } = useIssues(projectId!, { orderBy });
    const updateIssue = useUpdateIssue(projectId!);
    const { data: columns } = useColumns(projectId!);
    const { hidden: hiddenColumns, hideColumn, showColumn, showAllColumns } = useHiddenColumns(projectId!);
    const { data: members } = useProjectMembers(projectId!);
    const { data: categories } = useCategories(projectId!);
    const [isCreating, setIsCreating] = useState(false);
    const [creatingColumnId, setCreatingColumnId] = useState<string | null>(null);
    const [selectedIssueId, setSelectedIssueId] = useState<string | null>(null);
    const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());

    const columnById = useMemo(() => new Map((columns ?? []).map((column) => [column.id, column])), [columns]);
    // The backlog scope only lists issues in a "Backlog" or "Fila" column; without one it would always be empty,
    // so its tab only shows when the project has such a column (or a link already opened it).
    const showBacklog = scope === "backlog" || (columns ?? []).some((column) => columnBucket(column.name) === "backlog");
    const memberById = useMemo(() => new Map((members ?? []).map((member) => [member.id, member])), [members]);
    const categoryById = useMemo(() => new Map((categories ?? []).map((item) => [item.id, item])), [categories]);
    const filteredIssues = useMemo(
        () =>
            (issues ?? []).filter((issue) => {
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
        () => (issues ?? []).filter((issue) => scope === "all" || columnBucket(columnById.get(issue.columnId)?.name ?? "") === scope).length - filteredIssues.length,
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
            label:
                groupBy === "status"
                    ? columnById.get(key)?.name ?? t("issue.unknownStatus")
                    : memberById.get(key)?.name ?? t("issue.unassigned"),
            issues: groupedIssues,
        }));
    }, [columnById, columns, listIssues, groupBy, memberById, t]);
    const orderedIssues = useMemo(() => groups.flatMap((group) => group.issues), [groups]);
    // Collapsed groups hide their issues, so they are not selected by Cmd/Ctrl+A or included in ranges.
    useRegisterVisibleIssues(view === "list" ? groups.flatMap((group) => (collapsedGroups.has(group.key) ? [] : group.issues.map((issue) => issue.id))) : null);
    const selectedIssues = useMemo(() => (issues ?? []).filter((issue) => selection.selected.has(issue.id)), [issues, selection.selected]);

    useEffect(() => {
        if (selectedIssueId && !orderedIssues.some((issue) => issue.id === selectedIssueId)) setSelectedIssueId(null);
    }, [orderedIssues, selectedIssueId]);

    useEffect(() => {
        if (view !== "list") return;

        function handleListKeyDown(event: KeyboardEvent) {
            const target = event.target as HTMLElement | null;
            if (target?.matches("input, textarea, select, [contenteditable='true']")) return;
            if (orderedIssues.length === 0 || reorder.activeIssue) return;

            const currentIndex = orderedIssues.findIndex((issue) => issue.id === selectedIssueId);
            if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                event.preventDefault();
                const direction = event.key === "ArrowDown" ? 1 : -1;
                const nextIndex = currentIndex < 0 ? (direction === 1 ? 0 : orderedIssues.length - 1) : (currentIndex + direction + orderedIssues.length) % orderedIssues.length;
                const nextIssue = orderedIssues[nextIndex];
                setSelectedIssueId(nextIssue.id);
                document.querySelector<HTMLElement>(`[data-issue-id="${nextIssue.id}"]`)?.scrollIntoView({ block: "nearest" });
            }
            if (event.key === "Enter" && currentIndex >= 0) {
                event.preventDefault();
                openIssue(orderedIssues[currentIndex].identifier);
            }
            if (event.key === "Escape") setSelectedIssueId(null);
        }

        window.addEventListener("keydown", handleListKeyDown);
        return () => window.removeEventListener("keydown", handleListKeyDown);
    }, [orderedIssues, reorder.activeIssue, selectedIssueId, view]);

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
                title: t("issue.noIssues"),
                description: t("issue.createFirstIssue"),
                action: <Button size="sm" iconLeading={AddOutline} onClick={() => startCreating(defaultIssueColumn(columns)?.id ?? null)}>{t("issue.newIssue")}</Button>,
            };
        }

        const statusColumn = status ? columnById.get(status) : undefined;
        const assigneeName = assignee ? memberById.get(assignee)?.name : undefined;
        const labelNames = resolveLabels(labelFilter, categoryById).map((item) => item.name);
        const labelName = labelNames.length ? new Intl.ListFormat(i18n.language, { type: "disjunction" }).format(labelNames) : undefined;
        const conditions = ([
            priority && t("issue.conditionPriority", { value: t(priorityLabelKey(priority)) }),
            statusColumn && t("issue.conditionStatus", { value: statusName(statusColumn) }),
            assigneeName && t("issue.conditionAssignee", { value: assigneeName }),
            labelName && t("issue.conditionLabel", { value: labelName }),
            due === "overdue" && t("issue.conditionDueOverdue"),
            due === "thisWeek" && t("issue.conditionDueThisWeek"),
            search && t("issue.conditionSearch", { value: search }),
        ] as Array<string | false | undefined>).filter((condition): condition is string => !!condition);
        if (conditions.length > 0) {
            const scopeLabel = scope === "backlog" ? t("issue.backlog") : t("issue.active");
            return {
                title: t("issue.noMatchingIssues"),
                description: scope === "all" ? t("issue.emptyFilteredAll", { conditions: list.format(conditions) }) : t("issue.emptyFiltered", { scope: scopeLabel, conditions: list.format(conditions) }),
                action: <Button size="sm" color="secondary" onClick={clearFilters}>{t("issue.clearFilters")}</Button>,
            };
        }

        const statesWhere = (match: (bucket: string) => boolean) => list.format((columns ?? []).filter((column) => match(columnBucket(column.name))).map(statusName));
        if (scope === "backlog") {
            const backlogColumn = columns?.find((column) => columnBucket(column.name) === "backlog");
            return {
                title: t("issue.emptyBacklogTitle"),
                description: t("issue.emptyBacklog", { states: statesWhere((bucket) => bucket === "backlog") }),
                action: <Button size="sm" iconLeading={AddOutline} onClick={() => startCreating(backlogColumn?.id ?? null)}>{t("issue.newIssue")}</Button>,
            };
        }
        return {
            title: t("issue.emptyActiveTitle"),
            description: t("issue.emptyActive", { states: statesWhere((bucket) => bucket !== "active") }),
            action: <Button size="sm" color="secondary" onClick={() => setScope("all")}>{t("issue.showAllIssues")}</Button>,
        };
    }

    /** Opens the new-issue modal, starting in `columnId` (a group's status) or the project's default status. */
    function startCreating(columnId: string | null) {
        setCreatingColumnId(columnId);
        setIsCreating(true);
    }

    function openIssue(identifier: string) {
        navigate(urls.issue(identifier));
    }


    function setScope(next: Scope) {
        // A saved view keeps its own scope; the scope pills lead back to the plain issue list.
        if (savedView) {
            navigate(urls.issues(projectKey, next));
            return;
        }
        const query = searchParams.toString();
        navigate(`${urls.issues(projectKey, next)}${query ? `?${query}` : ""}`, { replace: true });
    }


    return (
        <div className="relative flex h-full min-h-0 flex-col bg-surface-1">
            <ProjectWorkspaceHeader
                projectId={projectId!}
                activeView={savedView ? "views" : "issues"}
                favorite={savedView ? { kind: "view", projectId: projectId!, viewId: savedView.id } : undefined}
                crumb={savedView && (
                    <>
                        <span className="truncate">{savedView.name}</span>
                        {savedView.shared && <Users aria-label={t("views.sharedWithProject")} role="img" className="size-3.5 shrink-0 text-tertiary" />}
                    </>
                )}
                actions={
                    <>
                        {viewActions.menu}
                        <Button
                            size="md"
                            color="secondary"
                            className={cx(COLLAPSE, "rounded-full")}
                            iconLeading={Plus}
                            onClick={() => startCreating(null)}
                        >
                            <Label>{t("issue.newIssue")}</Label>
                        </Button>
                    </>
                }
            />
            {/* Pills on the left (scopes, then saved views), round icon controls on the right; every control is 28px tall. */}
            {/* The bar and the filter row share the content's background and need no border; on the board that is the board's own. */}
            <div className={cx("flex h-11 shrink-0 items-center gap-1 px-3 transition-colors max-sm:overflow-x-auto", view === "board" ? "bg-surface-2" : "bg-surface-1")}>
                {view && (
                    <div className="animate-enter flex min-w-0 items-center gap-1 max-sm:shrink-0">
                        {([
                                ["all", t("issue.allIssues")],
                                ["active", t("issue.active")],
                                ...(showBacklog ? [["backlog", t("issue.backlog")] as const] : []),
                            ] as const).map(([value, label]) => (
                                <button key={value} type="button" aria-pressed={!savedView && scope === value} className={pillTab(!savedView && scope === value)} onClick={() => setScope(value)}>
                                    {label}
                                </button>
                            ))}
                        {savedViews?.map((item) => (
                            <Link key={item.id} to={`${urls.view(projectKey, item)}?${paramsFromFilters(item.filters)}`} aria-current={savedView?.id === item.id ? "page" : undefined} className={pillTab(savedView?.id === item.id)}>
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
                    onClose={() => { setIsCreating(false); setCreatingColumnId(null); }}
                    onCreated={openIssue}
                />
            )}
            {/* Each view eases in when it opens, so switching (or a first-time preference arriving) never pops. */}
            {view === "board" && (
                <div key="board" className="animate-enter min-h-0 flex-1 overflow-x-auto bg-surface-2 px-4 pt-1 pb-3">
                    <Board projectId={projectId!} filters={searchParams} scope={scope} hidden={hiddenColumns} hideColumn={hideColumn} showColumn={showColumn} />
                </div>
            )}
            {view === "list" && (
            <main key="list" className="animate-enter min-h-0 w-full flex-1 overflow-y-auto">
                <div className="flex min-h-full flex-col">
                    {isLoading && <IssueListSkeleton />}
                    {isError && <ErrorMessage message={t("issue.couldNotLoadIssues")} />}
                    {!isLoading && !isError && (
                        <DndContext {...reorder.dndProps}>
                            {groups.map((group) => {
                                const column = columnById.get(group.key);
                                return (
                                <section key={group.key} aria-label={group.label ?? t("issue.allIssues")}>
                                    {group.label && (
                                        <h2 className="bg-layer-transparent-hover">
                                            <div className="flex h-9 items-center gap-2 px-3 text-[13px] text-secondary">
                                                <button
                                                    type="button"
                                                    aria-expanded={!collapsedGroups.has(group.key)}
                                                    onClick={() => setCollapsedGroups((current) => {
                                                        const next = new Set(current);
                                                        if (next.has(group.key)) next.delete(group.key);
                                                        else next.add(group.key);
                                                        return next;
                                                    })}
                                                    className="flex min-w-0 flex-1 items-center gap-2 text-left"
                                                >
                                                    <ChevronDownOutline className={`size-3.5 text-placeholder transition-transform duration-200 ${collapsedGroups.has(group.key) ? "-rotate-90" : ""}`} aria-hidden="true" />
                                                    {groupBy === "status" && <StateIcon name={column?.name ?? group.label} color={column?.color} />}
                                                    <span>{group.label === "Unknown status" ? t("issue.unknownStatus") : translateStatusName(group.label, t)}</span>
                                                    <span className="text-tertiary">{group.issues.length}</span>
                                                </button>
                                                {groupBy === "status" && (
                                                    <button type="button" aria-label={t("issue.newIssue")} className="flex size-6 items-center justify-center rounded text-tertiary hover:bg-layer-1-hover hover:text-primary" onClick={() => startCreating(group.key)}>
                                                        <Plus className="size-3.5" />
                                                    </button>
                                                )}
                                            </div>
                                        </h2>
                                    )}
                                    <SortableContext items={collapsedGroups.has(group.key) ? [] : group.issues.map((issue) => issue.id)} strategy={verticalListSortingStrategy}>
                                    {!collapsedGroups.has(group.key) && group.issues.map((issue) => (
                                        <IssueListRow
                                            key={issue.id}
                                            issue={issue}
                                            projectId={projectId!}
                                            identifierWidth={identifierWidth}
                                            sortable={manualOrder}
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
                                    ))}
                                    </SortableContext>
                                </section>
                                );
                            })}
                            {filteredIssues.length === 0 && (
                                <EmptyState framed={false} className="flex-1 py-16" {...listEmptyState()} />
                            )}
                            {filteredIssues.length > 0 && hiddenByFilters > 0 && (
                                <div className="animate-enter flex items-center justify-center gap-3 py-4 text-[13px]">
                                    <span>
                                        <span className="text-primary">{hiddenByFilters === 1 ? t("issue.hiddenByFiltersOne") : t("issue.hiddenByFiltersMany", { count: hiddenByFilters })}</span>{" "}
                                        <span className="text-tertiary">{t("issue.hiddenByFilters")}</span>
                                    </span>
                                    <button type="button" onClick={clearFilters} className="flex items-center gap-1 text-secondary transition-colors hover:text-primary">
                                        {t("issue.clearFilters")}
                                        <X className="size-3.5" />
                                    </button>
                                </div>
                            )}
                            <DragOverlay>
                                {reorder.activeIssue && (
                                    <div className="flex h-9 items-center gap-2 rounded-md border border-accent-strong bg-surface-1 px-2 text-[13px] shadow-overlay-200">
                                        <span className="size-5 shrink-0" />
                                        <span className="shrink-0 font-mono text-xs text-tertiary" style={{ width: `${identifierWidth}ch` }}>{reorder.activeIssue.identifier}</span>
                                        <span className="min-w-0 flex-1 truncate text-secondary">{reorder.activeIssue.title}</span>
                                    </div>
                                )}
                            </DragOverlay>
                        </DndContext>
                    )}
                </div>
            </main>
            )}
            <BulkActionBar projectId={projectId!} issues={selectedIssues} columns={columns ?? []} members={members ?? []} labels={categories ?? []} onClear={selection.clear} />
        </div>
    );
};

function IssueListSkeleton() {
    const { t } = useTranslation();
    return <div className="overflow-hidden" aria-label={t("common.loading")} role="status">
        <div className="hidden h-9 border-b border-subtle bg-surface-2 sm:block" />
        <div className="divide-y divide-subtle">{["one", "two", "three", "four", "five"].map((key) => <div key={key} className="flex h-11 items-center gap-4 px-4">
            <Skeleton className="h-3 w-24 shrink-0" /><Skeleton className="h-3 min-w-0 flex-1" /><Skeleton className="hidden h-3 w-24 sm:block" /><Skeleton className="hidden size-2 rounded-full sm:block" />
        </div>)}</div>
    </div>;
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

