import { useEffect, useMemo, useState } from "react";
import { type IssueOrder, type MyIssuesFilter, myIssuesFilterValues } from "@rinia/shared";
import { CalendarDays, ChevronDown, CircleDashed, FolderKanban, Hash, History, Minus, SignalHigh, Tag, UserRound } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useNavigate, useParams, useSearchParams } from "react-router";
import { Button } from "@/components/base/buttons/button";
import { Collapse } from "@/components/base/collapse";
import { Skeleton } from "@/components/base/feedback/skeleton";
import { Presence, type PresenceRow, usePresence } from "@/components/base/presence";
import { EmptyState } from "@/components/feedback/empty-state";
import { ErrorMessage } from "@/components/feedback/error-message";
import { Topbar } from "@/components/layout/topbar";
import { columnBucket } from "@/features/board/column-bucket";
import { IssueAvatar, PriorityIcon, StateIcon } from "@/features/board/components/issue-property-icons";
import { useColumns } from "@/features/board/hooks/use-board";
import { useCategories } from "@/features/categories/hooks/use-categories";
import { listStep } from "@/features/commands/shortcuts";
import type { MyIssue } from "@/features/issues/api";
import { IssueListRow } from "@/features/issues/components/issue-list-row";
import { type IssueFilter, IssueFilterRow, IssueToolbar, dueFilter, pillTab } from "@/features/issues/components/issue-toolbar";
import { resolveLabels } from "@/features/issues/components/labels-picker";
import { useMyIssues, useUpdateMyIssue } from "@/features/issues/hooks/use-issues";
import { matchesDueFilter } from "@/features/issues/lib/due-date";
import { matchesLabels, readLabels } from "@/features/issues/lib/issue-filters";
import { PRIORITY_OPTIONS, priorityLabelKey } from "@/features/issues/lib/priority";
import { ProjectIcon } from "@/features/projects/components/project-icon";
import { useProjectMembers } from "@/features/projects/hooks/use-project-members";
import { useProjects } from "@/features/projects/hooks/use-projects";
import { useRealtimeChannels } from "@/features/realtime/use-realtime";
import { translateStatusName } from "@/i18n/status-label";
import { urls } from "@/lib/urls";
import { issueNavigation } from "@/lib/view-transition";
import { preloadWhenIdle } from "@/lib/preload";

type OrderBy = Exclude<IssueOrder, "position">;
type GroupBy = "status" | "project" | "none";

/** States and labels belong to each project, so across projects the ones that share a name are filtered and grouped together. */
const nameKey = (name: string) => name.trim().toLowerCase();

export const MyIssuesPage = () => {
    const { t, i18n } = useTranslation();
    const navigate = useNavigate();
    const params = useParams<{ filter: string }>();
    const filter = readFilter(params.filter);
    const [searchParams, setSearchParams] = useSearchParams();
    const orderBy = readOrder(searchParams.get("order"));
    const groupBy = readGroup(searchParams.get("group"));
    const search = searchParams.get("q") ?? "";
    const priority = searchParams.get("priority") ?? "";
    const status = searchParams.get("status") ?? "";
    const assignee = searchParams.get("assignee") ?? "";
    const labelFilter = useMemo(() => readLabels(searchParams.get("label")), [searchParams]);
    const project = searchParams.get("project") ?? "";
    const due = searchParams.get("due") ?? "";
    const { data: issues, isLoading, isError } = useMyIssues({ filter, orderBy });
    // Issues here come from every project, so a change in any of them can add, move or drop one.
    const { data: projects } = useProjects();
    useRealtimeChannels((projects ?? []).map((item) => `project:${item.id}` as const));
    const updateIssue = useUpdateMyIssue();
    const [selectedIssueId, setSelectedIssueId] = useState<string | null>(null);
    const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());

    const options = useMemo(() => collectOptions(issues ?? []), [issues]);
    const filtered = useMemo(
        () =>
            issues?.filter(
                (issue) =>
                    (!search || `${issue.identifier} ${issue.title}`.toLowerCase().includes(search.toLowerCase())) &&
                    (!priority || issue.priority === priority) &&
                    (!status || nameKey(issue.column.name) === status) &&
                    (!assignee || issue.assigneeId === assignee) &&
                    matchesLabels(
                        issue.categories.map((item) => nameKey(item.name)),
                        labelFilter,
                    ) &&
                    (!project || issue.projectId === project) &&
                    matchesDueFilter(issue.dueDate, due, columnBucket(issue.column.name) === "closed"),
            ),
        [assignee, due, issues, labelFilter, priority, project, search, status],
    );
    const rows = usePresence(filtered, (issue) => issue.id);
    // The rows on screen count too: while another filter loads, the previous rows stay and keep their width.
    const identifierWidth = useMemo(
        () => Math.max(4, ...[...(issues ?? []), ...rows.map((row) => row.item)].map((issue) => issue.identifier.length)),
        [issues, rows],
    );

    const groups = useMemo(() => {
        if (groupBy === "none")
            return [{ key: "all", label: null as string | null, column: null as MyIssue["column"] | null, project: null as MyIssue["project"] | null, rows }];
        const grouped = new Map<
            string,
            {
                key: string;
                label: string;
                column: MyIssue["column"] | null;
                project: MyIssue["project"] | null;
                rows: PresenceRow<MyIssue>[];
                rank: number | string;
            }
        >();
        for (const row of rows) {
            const issue = row.item;
            const key = groupBy === "status" ? nameKey(issue.column.name) : issue.projectId;
            const group = grouped.get(key) ?? {
                key,
                label: groupBy === "status" ? translateStatusName(issue.column.name, t) : issue.project.name,
                column: groupBy === "status" ? issue.column : null,
                project: groupBy === "project" ? issue.project : null,
                rows: [],
                // Status groups follow the order of the project columns, as the board does; a state shared by projects takes its lowest position.
                rank: groupBy === "status" ? issue.column.position : issue.project.name.toLowerCase(),
            };
            if (groupBy === "status" && issue.column.position < Number(group.rank)) group.rank = issue.column.position;
            group.rows.push(row);
            grouped.set(key, group);
        }
        return [...grouped.values()].sort((left, right) => (left.rank < right.rank ? -1 : left.rank > right.rank ? 1 : 0));
    }, [groupBy, rows, t]);
    const orderedIssues = useMemo(
        () => groups.flatMap((group) => (collapsedGroups.has(group.key) ? [] : group.rows.filter((row) => !row.leaving).map((row) => row.item))),
        [collapsedGroups, groups],
    );

    useEffect(() => {
        function handleKeyDown(event: KeyboardEvent) {
            const target = event.target as HTMLElement | null;
            if (target?.matches("input, textarea, select, [contenteditable='true']") || orderedIssues.length === 0) return;
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
                const next = orderedIssues[nextIndex];
                setSelectedIssueId(next.id);
                document.querySelector<HTMLElement>(`[data-issue-id="${next.id}"]`)?.scrollIntoView({ block: "nearest" });
            }
            if (event.key === "Enter" && currentIndex >= 0) {
                event.preventDefault();
                void navigate(
                    urls.issue(orderedIssues[currentIndex].identifier, orderedIssues[currentIndex].title),
                    issueNavigation(orderedIssues[currentIndex].title),
                );
            }
            if (event.key === "Escape") setSelectedIssueId(null);
        }
        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [navigate, orderedIssues, selectedIssueId]);

    const toolbarFilters: IssueFilter[] = [
        {
            key: "status",
            label: t("issue.status"),
            icon: CircleDashed,
            items: options.statuses.map((column) => ({
                id: nameKey(column.name),
                name: translateStatusName(column.name, t),
                icon: <StateIcon name={column.name} color={column.color} />,
            })),
        },
        {
            key: "priority",
            label: t("issue.priority"),
            icon: SignalHigh,
            items: PRIORITY_OPTIONS.map((id) => ({ id, name: t(priorityLabelKey(id)), icon: <PriorityIcon priority={id} /> })),
        },
        {
            key: "assignee",
            label: t("issue.assignee"),
            icon: UserRound,
            items: options.assignees.map((person) => ({
                id: person.id,
                name: person.name,
                avatarUrl: person.avatarUrl,
                icon: person.avatarUrl ? undefined : <IssueAvatar name={person.name} avatarUrl={person.avatarUrl} />,
            })),
        },
        {
            key: "label",
            label: t("issue.label"),
            icon: Tag,
            multiple: true,
            items: options.labels.map((item) => ({
                id: nameKey(item.name),
                name: item.name,
                icon: <Tag className="size-3.5" style={{ color: item.color ?? "#7a5af8" }} />,
            })),
        },
        {
            key: "project",
            label: t("myIssues.project"),
            icon: FolderKanban,
            items: options.projects.map((item) => ({
                id: item.id,
                name: item.name,
                icon: <ProjectIcon icon={item.iconAppearance ?? item.icon} className="size-3.5" />,
            })),
        },
        dueFilter(t),
    ];

    function clearFilters() {
        setSearchParams(
            (current) => {
                for (const key of ["q", "priority", "status", "assignee", "label", "project", "due"]) current.delete(key);
                return current;
            },
            { replace: true },
        );
    }

    function setFilter(next: MyIssuesFilter) {
        setSelectedIssueId(null);
        const query = searchParams.toString();
        void navigate(`${urls.myIssues(next)}${query ? `?${query}` : ""}`, { replace: true });
    }

    /** Says what is empty: the filters that match nothing, or the tab itself. */
    function emptyState() {
        const conditions: string[] = toolbarFilters.flatMap((item) => {
            const value = searchParams.get(item.key);
            const names = (value ?? "").split(",").flatMap((id) => item.items.find((option) => option.id === id)?.name ?? []);
            if (names.length === 0) return [];
            const name = new Intl.ListFormat(i18n.language, { type: "disjunction" }).format(names);
            if (item.key === "due") return [value === "overdue" ? t("issue.conditionDueOverdue") : t("issue.conditionDueThisWeek")];
            const key = {
                status: "issue.conditionStatus",
                priority: "issue.conditionPriority",
                assignee: "issue.conditionAssignee",
                label: "issue.conditionLabel",
                project: "myIssues.conditionProject",
            }[item.key] as "issue.conditionStatus";
            return [t(key, { value: name })];
        });
        if (search) conditions.push(t("issue.conditionSearch", { value: search }));
        if (issues?.length && conditions.length) {
            return {
                illustration: "crate" as const,
                title: t("issue.noMatchingIssues"),
                description: t("issue.emptyFilteredAll", { conditions: new Intl.ListFormat(i18n.language, { type: "conjunction" }).format(conditions) }),
                action: (
                    <Button size="sm" color="secondary" onClick={clearFilters}>
                        {t("issue.clearFilters")}
                    </Button>
                ),
            };
        }
        if (filter === "created") return { illustration: "kanban" as const, title: t("myIssues.emptyCreatedTitle"), description: t("myIssues.emptyCreated") };
        if (filter === "following")
            return { illustration: "mail" as const, title: t("myIssues.emptyFollowingTitle"), description: t("myIssues.emptyFollowing") };
        return { illustration: "briefcase" as const, title: t("myIssues.emptyAssignedTitle"), description: t("myIssues.emptyAssigned") };
    }

    return (
        <div className="flex h-full min-h-0 flex-col bg-surface-1">
            <Topbar title={t("myIssues.title")} />
            <div className="flex h-11 shrink-0 items-center gap-1 px-3 select-none">
                <div role="group" aria-label={t("myIssues.tabs")} className="flex min-w-0 items-center gap-1">
                    {myIssuesFilterValues.map((value) => (
                        <button
                            key={value}
                            type="button"
                            aria-pressed={filter === value}
                            className={pillTab(filter === value)}
                            onClick={() => setFilter(value)}
                        >
                            {t(`myIssues.${value}`)}
                        </button>
                    ))}
                </div>
                <div className="ml-auto flex items-center gap-1">
                    <IssueToolbar
                        filters={toolbarFilters}
                        defaultOrder="updated"
                        orders={[
                            { id: "updated", label: t("issue.recentlyUpdated"), icon: History },
                            { id: "priority", label: t("issue.priority"), icon: SignalHigh },
                            { id: "number", label: t("issue.issueNumber"), icon: Hash },
                            { id: "due", label: t("issue.dueDate"), icon: CalendarDays },
                        ]}
                        groups={[
                            { id: "none", label: t("issue.noGrouping"), icon: Minus },
                            { id: "status", label: t("issue.status"), icon: CircleDashed },
                            { id: "project", label: t("myIssues.project"), icon: FolderKanban },
                        ]}
                    />
                </div>
            </div>
            <IssueFilterRow filters={toolbarFilters} />
            <main className="min-h-0 w-full flex-1 overflow-y-auto">
                <div className="flex min-h-full flex-col">
                    {isLoading && <MyIssuesSkeleton />}
                    {isError && <ErrorMessage message={t("myIssues.couldNotLoad")} />}
                    {groups.map((group) => {
                        const collapsed = collapsedGroups.has(group.key);
                        const remaining = group.rows.filter((row) => !row.leaving).length;
                        return (
                            <Collapse key={group.key} open={remaining > 0} lazy={false}>
                                <section aria-label={group.label ?? t("myIssues.title")}>
                                    {group.label && (
                                        <h2 className="bg-layer-transparent-hover">
                                            <button
                                                type="button"
                                                aria-expanded={!collapsed}
                                                onClick={() =>
                                                    setCollapsedGroups((current) => {
                                                        const next = new Set(current);
                                                        if (next.has(group.key)) next.delete(group.key);
                                                        else next.add(group.key);
                                                        return next;
                                                    })
                                                }
                                                className="flex h-[var(--row-height)] w-full items-center gap-[var(--row-gap)] px-3 text-left text-[13px] text-secondary"
                                            >
                                                <ChevronDown
                                                    className={`size-3.5 text-placeholder transition-transform duration-200 ${collapsed ? "-rotate-90" : ""}`}
                                                    aria-hidden="true"
                                                />
                                                {group.column && <StateIcon name={group.column.name} color={group.column.color} />}
                                                {group.project && (
                                                    <ProjectIcon icon={group.project.iconAppearance ?? group.project.icon} className="size-3.5 shrink-0" />
                                                )}
                                                <span>{group.label}</span>
                                                <span className="text-tertiary">{remaining}</span>
                                            </button>
                                        </h2>
                                    )}
                                    <Collapse open={!collapsed} lazy={false}>
                                        {group.rows.map((row) => (
                                            <Presence key={row.key} leaving={row.leaving} entering={row.entering}>
                                                <MyIssueRow
                                                    issue={row.item}
                                                    identifierWidth={identifierWidth}
                                                    selected={selectedIssueId === row.item.id}
                                                    onSelect={() => setSelectedIssueId(row.item.id)}
                                                    onUpdate={(input) => updateIssue.mutate({ issue: row.item, input })}
                                                />
                                            </Presence>
                                        ))}
                                    </Collapse>
                                </section>
                            </Collapse>
                        );
                    })}
                    {filtered?.length === 0 && <EmptyState framed={false} className="flex-1 py-16" {...emptyState()} />}
                </div>
            </main>
        </div>
    );
};

/** One issue with its own project's states and people, so its status and assignee menus work as in the project. */
function MyIssueRow({
    issue,
    identifierWidth,
    selected,
    onSelect,
    onUpdate,
}: {
    issue: MyIssue;
    identifierWidth: number;
    selected: boolean;
    onSelect: () => void;
    onUpdate: Parameters<typeof IssueListRow>[0]["onUpdate"];
}) {
    const { data: columns } = useColumns(issue.projectId);
    const { data: members } = useProjectMembers(issue.projectId);
    const { data: labels } = useCategories(issue.projectId);
    const labelById = useMemo(() => new Map((labels ?? issue.categories).map((item) => [item.id, item])), [issue.categories, labels]);
    const column = columns?.find((candidate) => candidate.id === issue.columnId) ?? issue.column;
    const member = members?.find((candidate) => candidate.id === issue.assigneeId) ?? issue.assignee ?? undefined;
    return (
        <IssueListRow
            issue={issue}
            projectId={issue.projectId}
            identifierWidth={identifierWidth}
            layoutAnimation={false}
            column={column}
            columns={columns ?? [issue.column]}
            member={member}
            members={members ?? []}
            categories={resolveLabels(issue.categoryIds, labelById)}
            labels={labels ?? []}
            selected={selected}
            onSelect={onSelect}
            onUpdate={onUpdate}
        />
    );
}

/** The states, people, labels, and projects the listed issues use, each once. */
function collectOptions(issues: MyIssue[]) {
    const statuses = new Map<string, MyIssue["column"]>();
    const assignees = new Map<string, NonNullable<MyIssue["assignee"]>>();
    const labels = new Map<string, MyIssue["categories"][number]>();
    const projects = new Map<string, MyIssue["project"]>();
    for (const issue of issues) {
        const known = statuses.get(nameKey(issue.column.name));
        if (!known || issue.column.position < known.position) statuses.set(nameKey(issue.column.name), issue.column);
        if (issue.assignee) assignees.set(issue.assignee.id, issue.assignee);
        for (const item of issue.categories) if (!labels.has(nameKey(item.name))) labels.set(nameKey(item.name), item);
        projects.set(issue.project.id, issue.project);
    }
    const byName = <T extends { name: string }>(items: Iterable<T>) => [...items].sort((left, right) => left.name.localeCompare(right.name));
    return {
        statuses: [...statuses.values()].sort((left, right) => left.position - right.position),
        assignees: byName(assignees.values()),
        labels: byName(labels.values()),
        projects: byName(projects.values()),
    };
}

function MyIssuesSkeleton() {
    const { t } = useTranslation();
    return (
        <div className="divide-y divide-subtle" aria-label={t("common.loading")} role="status">
            {["one", "two", "three", "four", "five"].map((key) => (
                <div key={key} className="flex h-9 items-center gap-4 px-4">
                    <Skeleton className="h-3 w-16 shrink-0" />
                    <Skeleton className="h-3 min-w-0 flex-1" />
                    <Skeleton className="size-4 shrink-0 rounded-full" />
                </div>
            ))}
        </div>
    );
}

function readFilter(value: string | undefined): MyIssuesFilter {
    return value === "created" || value === "following" ? value : "assigned";
}

function readOrder(value: string | null): OrderBy {
    return value === "priority" || value === "number" || value === "due" ? value : "updated";
}

function readGroup(value: string | null): GroupBy {
    return value === "none" || value === "project" ? value : "status";
}

preloadWhenIdle(() => import("@/features/issues/components/issue-view/issue-view"));
