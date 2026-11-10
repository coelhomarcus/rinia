import { memo, type ReactNode } from "react";
import { CalendarDays, ListTree, Tag, Triangle } from "lucide-react";
import { Link } from "react-router";
import { useTranslation } from "react-i18next";
import { OverflowTooltip, Tooltip } from "@/components/base/tooltip/tooltip";
import { IssueAvatar, PriorityIcon, StateIcon } from "@/features/board/components/issue-property-icons";
import { columnBucket } from "@/features/board/column-bucket";
import { useColumns } from "@/features/board/hooks/use-board";
import { useCategories } from "@/features/categories/hooks/use-categories";
import { ProjectIcon } from "@/features/projects/components/project-icon";
import { useProject } from "@/features/projects/hooks/use-project";
import { useProjectMembers } from "@/features/projects/hooks/use-project-members";
import { translateStatusName } from "@/i18n/status-label";
import { urls } from "@/lib/urls";
import { cx } from "@/utils/cx";
import type { IssueDetail } from "../../api";
import { useIssues } from "../../hooks/use-issues";
import { dueState as getDueState, dueStateClass, formatDueDate } from "../../lib/due-date";
import { priorityLabelKey } from "../../lib/priority";
import { formatFullIssueDate } from "../../lib/relative-time";
import { DueDatePopover } from "../due-date-picker";
import { LabelChip, LabelsPicker, resolveLabels, useLabelToggle } from "../labels-picker";
import { assigneeOptions, estimateOptions, priorityOptions, statusOptions, type PropertyOption } from "../property-options";
import { PropertyMenu, type PropertyMenuId } from "./property-menu";
import { propertyButton } from "./styles";
import { useIssuePropertySave, type IssueUpdater } from "./use-issue-mutations";

/** Lists still loading are empty, and one shared array keeps them from looking new on every render. */
const NONE: never[] = [];

function PropertyGroup({ title, children }: { title: string; children: ReactNode }) {
    return (
        <section>
            <h3 className="mb-1 px-2 text-[12px] font-medium text-tertiary">{title}</h3>
            <div className="flex flex-col gap-px">{children}</div>
        </section>
    );
}

function PropertyIcon({ children }: { children: ReactNode }) {
    return <span className="grid size-4 shrink-0 place-items-center">{children}</span>;
}

function EmptyAvatar() {
    return <span className="size-3.5 rounded-full border border-dashed border-[var(--border-strong-1)]" />;
}

/**
 * The issue's properties as a list of menus: state, priority, assignee, estimate, due date, parent, labels, and its
 * project and creator. It loads what the menus offer and saves what they pick, so it can sit in the side rail or in a
 * sheet without the page passing it anything but the issue.
 */
export const IssueProperties = memo(function IssueProperties({
    issue,
    updater,
    openMenu,
    onOpenMenuChange,
}: {
    issue: IssueDetail;
    updater: IssueUpdater;
    openMenu: PropertyMenuId | null;
    onOpenMenuChange: (menu: PropertyMenuId | null) => void;
}) {
    const { t, i18n } = useTranslation();
    const { data: project } = useProject(issue.projectId);
    const { data: loadedColumns } = useColumns(issue.projectId);
    const { data: loadedMembers } = useProjectMembers(issue.projectId);
    const { data: loadedCategories } = useCategories(issue.projectId);
    const { data: loadedIssues } = useIssues(issue.projectId);
    const columns = loadedColumns ?? NONE;
    const members = loadedMembers ?? NONE;
    const categories = loadedCategories ?? NONE;
    const projectIssues = loadedIssues ?? NONE;
    const projectIcon = project?.iconAppearance ?? project?.icon;
    const { save, error } = useIssuePropertySave(issue, updater);
    const isPending = updater.isPending;
    const column = columns.find((candidate) => candidate.id === issue.columnId);
    const assignee = members.find((member) => member.id === issue.assigneeId);
    const labelById = new Map(categories.map((candidate) => [candidate.id, candidate]));
    const issueLabels = resolveLabels(issue.categoryIds, labelById);
    const labelEditor = useLabelToggle(issue.categoryIds, (categoryIds) => save({ categoryIds }));
    const parent = projectIssues.find((candidate) => candidate.id === issue.parent?.id);
    const menu = (id: PropertyMenuId) => ({ open: openMenu === id, onOpenChange: (open: boolean) => onOpenMenuChange(open ? id : null), disabled: isPending });
    const avatar = (person: { name: string; avatarUrl: string | null }) => <IssueAvatar name={person.name} avatarUrl={person.avatarUrl} className="size-4 text-[9px]" />;
    const created = new Intl.DateTimeFormat(i18n.language, { dateStyle: "medium" }).format(new Date(issue.createdAt));
    const parentIcon = <ListTree className="size-4 text-tertiary" />;
    // A long searchable list: only Backspace clears, so digits stay free for searching "RIN-12".
    const parentOptions: PropertyOption<string>[] = [
        { key: "none", value: "", label: t("issue.noParent"), icon: parentIcon, clears: true },
        ...projectIssues.filter((candidate) => candidate.id !== issue.id).map((candidate) => ({ key: candidate.id, value: candidate.id, label: `${candidate.identifier} ${candidate.title}`, icon: parentIcon })),
    ];
    const dueState = getDueState(issue.dueDate, columnBucket(column?.name ?? "") === "closed");

    return (
        <div className="flex flex-col gap-6">
            <PropertyGroup title={t("issue.properties")}>
                <PropertyMenu
                    {...menu("state")}
                    label={t("issue.status")}
                    placeholder={t("issue.changeStatus")}
                    shortcut="S"
                    value={issue.columnId}
                    options={statusOptions(columns, t)}
                    onSelect={(columnId) => save({ columnId })}
                >
                    <PropertyIcon><StateIcon name={column?.name ?? ""} color={column?.color} className="size-4" /></PropertyIcon>
                    <span className="truncate">{column ? translateStatusName(column.name, t) : t("issue.unknownStatus")}</span>
                </PropertyMenu>
                <PropertyMenu
                    {...menu("priority")}
                    label={t("issue.priority")}
                    placeholder={t("issue.setPriority")}
                    shortcut="P"
                    value={issue.priority}
                    options={priorityOptions(t)}
                    onSelect={(priority) => save({ priority })}
                >
                    <PropertyIcon><PriorityIcon priority={issue.priority} className="size-4" /></PropertyIcon>
                    <span className={cx("truncate", issue.priority === "none" && "text-tertiary")}>{issue.priority === "none" ? t("issue.setPriorityAction") : t(priorityLabelKey(issue.priority))}</span>
                </PropertyMenu>
                <PropertyMenu
                    {...menu("assignee")}
                    label={t("issue.assignee")}
                    placeholder={t("issue.assignTo")}
                    shortcut="A"
                    value={issue.assigneeId ?? null}
                    options={assigneeOptions(members, t)}
                    onSelect={(assigneeId) => save({ assigneeId })}
                >
                    <PropertyIcon>{assignee ? avatar(assignee) : <EmptyAvatar />}</PropertyIcon>
                    <span className={cx("truncate", !assignee && "text-tertiary")}>{assignee?.name ?? t("issue.assign")}</span>
                </PropertyMenu>
                <PropertyMenu
                    {...menu("estimate")}
                    label={t("issue.estimate")}
                    placeholder={t("issue.setEstimate")}
                    shortcut="E"
                    value={issue.estimate ?? null}
                    options={estimateOptions(t)}
                    mode="value"
                    onSelect={(estimate) => save({ estimate })}
                >
                    <PropertyIcon><Triangle className="size-3.5 text-tertiary" /></PropertyIcon>
                    <span className={cx("truncate", issue.estimate == null && "text-tertiary")}>{issue.estimate != null ? t("projects.points", { count: issue.estimate }) : t("issue.estimateAction")}</span>
                </PropertyMenu>
                <DueDatePopover
                    {...menu("due")}
                    value={issue.dueDate}
                    onChange={(dueDate) => save({ dueDate })}
                    triggerLabel={t("issue.dueDate")}
                    triggerClassName={propertyButton}
                >
                    <PropertyIcon><CalendarDays className={cx("size-3.5", dueState ? dueStateClass[dueState] : "text-tertiary")} /></PropertyIcon>
                    <span className={cx("truncate", !issue.dueDate ? "text-tertiary" : dueState !== "upcoming" && dueState ? dueStateClass[dueState] : undefined)}>
                        {issue.dueDate ? formatDueDate(issue.dueDate, i18n.language) : t("issue.dueDateAction")}
                    </span>
                    {dueState === "overdue" && <span className="ml-auto shrink-0 text-[11px] text-danger-primary">{t("issue.isOverdue")}</span>}
                    {dueState === "today" && <span className="ml-auto shrink-0 text-[11px] text-warning-primary">{t("issue.isDueToday")}</span>}
                </DueDatePopover>
                <PropertyMenu
                    {...menu("parent")}
                    label={t("issue.parent")}
                    placeholder={t("issue.setParent")}
                    value={issue.parent?.id ?? ""}
                    options={parentOptions}
                    mode="none"
                    onSelect={(value) => save({ parentIssueId: value || null })}
                >
                    <PropertyIcon><ListTree className="size-3.5 text-tertiary" /></PropertyIcon>
                    <span className={cx("truncate", !issue.parent && "text-tertiary")}>{parent ? <><span className="text-tertiary">{parent.identifier}</span> {parent.title}</> : issue.parent ? issue.parent.title : t("issue.addParentIssue")}</span>
                </PropertyMenu>
            </PropertyGroup>

            <PropertyGroup title={t("issue.labels")}>
                <LabelsPicker
                    {...menu("label")}
                    labels={categories}
                    state={labelEditor.state}
                    onToggle={labelEditor.toggle}
                    onClose={labelEditor.reset}
                    triggerLabel={t("issue.labels")}
                    triggerClassName={cx(propertyButton, issueLabels.length > 0 && "h-auto min-h-8 flex-wrap gap-1 py-1")}
                >
                    {issueLabels.length > 0 ? (
                        issueLabels.map((label) => <LabelChip key={label.id} label={label} className="h-6 max-w-full px-2 text-[12px]" />)
                    ) : (
                        <>
                            <PropertyIcon><Tag className="size-3.5 text-tertiary" /></PropertyIcon>
                            <span className="truncate text-tertiary">{t("issue.addLabel")}</span>
                        </>
                    )}
                </LabelsPicker>
            </PropertyGroup>

            <PropertyGroup title={t("issue.project")}>
                <Link to={urls.project(issue.project.issueKey)} className={propertyButton}>
                    <ProjectIcon icon={projectIcon} className="size-4 shrink-0" />
                    <span className="truncate">{issue.project.name}</span>
                </Link>
            </PropertyGroup>

            {/* Read only, so it is plain text: no hover, focus or shortcut like the editable fields above. */}
            <PropertyGroup title={t("issue.creator")}>
                <div className="flex min-h-8 min-w-0 items-center gap-2.5 px-2 py-1">
                    <PropertyIcon>{avatar(issue.createdBy)}</PropertyIcon>
                    <div className="min-w-0">
                        <OverflowTooltip as="p" className="truncate text-[13px] font-medium text-secondary" title={issue.createdBy.name}>{issue.createdBy.name}</OverflowTooltip>
                        <Tooltip title={formatFullIssueDate(issue.createdAt, i18n.language)}>
                            <p className="truncate text-[12px] text-placeholder">{t("issue.createdOn", { date: created })}</p>
                        </Tooltip>
                    </div>
                </div>
            </PropertyGroup>
            {error && <p role="alert" className="animate-enter px-2 text-xs text-danger-primary">{error}</p>}
        </div>
    );
});
