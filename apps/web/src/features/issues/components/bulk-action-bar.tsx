import { useEffect, useState, type ReactNode } from "react";
import { Menu } from "@base-ui/react/menu";
import { useQueryClient } from "@tanstack/react-query";
import { EstimateOutline, LabelsOutline } from "@makeplane/propel/icons";
import { issueEstimateValues, type BulkIssuePatch } from "@rinia/shared";
import { Trash2, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { motionTiming } from "@/components/base/motion";
import { Tooltip } from "@/components/base/tooltip/tooltip";
import { useToast } from "@/components/feedback/toaster";
import { ConfirmDialog } from "@/components/overlay/confirm-dialog";
import { overlayChrome } from "@/components/overlay/overlay-chrome";
import { IssueAvatar, PriorityIcon, StateIcon } from "@/features/board/components/issue-property-icons";
import { PRIORITY_OPTIONS, priorityLabelKey } from "@/features/issues/lib/priority";
import { translateStatusName } from "@/i18n/status-label";
import { cx } from "@/utils/cx";
import type { Issue } from "../api";
import { restoreBulkIssues } from "../api";
import { useBulkDeleteIssues, useBulkUpdateIssues } from "../hooks/use-issues";
import { LabelsPicker, type LabelOption } from "./labels-picker";
import { UnassignedIcon } from "./issue-property-menus";

const SCALAR_FIELDS = ["columnId", "priority", "assigneeId", "estimate", "dueDate"] as const;
const barButton =
    "flex h-7 shrink-0 items-center gap-2 rounded-md px-2 text-[13px] text-secondary outline-none transition-colors duration-150 hover:bg-layer-transparent-hover hover:text-primary focus-visible:bg-layer-transparent-hover data-[popup-open]:bg-layer-transparent-hover data-[popup-open]:text-primary";
const menuItem = "flex h-8 cursor-pointer items-center gap-2 rounded px-2 text-[13px] text-secondary outline-none data-highlighted:bg-layer-2-hover data-highlighted:text-primary";
const popupMotion =
    "origin-[var(--transform-origin)] transition-[opacity,transform] duration-150 ease-out data-[ending-style]:scale-95 data-[ending-style]:opacity-0 data-[starting-style]:scale-95 data-[starting-style]:opacity-0";

/**
 * The requests that put each issue back as it was before `patch`. Issues that had the same values share a
 * request, so undoing a change to twenty issues that were in two states takes two requests.
 */
export function undoPatches(before: Issue[], patch: BulkIssuePatch) {
    const touchesLabels = patch.categoryIds !== undefined || patch.addCategoryIds !== undefined || patch.removeCategoryIds !== undefined;
    const groups = new Map<string, { issueIds: string[]; patch: BulkIssuePatch }>();
    for (const issue of before) {
        const restore: BulkIssuePatch = {};
        for (const field of SCALAR_FIELDS) if (patch[field] !== undefined) Object.assign(restore, { [field]: issue[field] });
        if (touchesLabels) restore.categoryIds = issue.categoryIds;
        const key = JSON.stringify(restore);
        const group = groups.get(key) ?? { issueIds: [], patch: restore };
        group.issueIds.push(issue.id);
        groups.set(key, group);
    }
    return [...groups.values()];
}

function BarMenu({ icon, label, children }: { icon: ReactNode; label: string; children: ReactNode }) {
    return (
        <Menu.Root>
            <Menu.Trigger className={barButton}>
                {icon}
                <span className="hidden sm:inline">{label}</span>
            </Menu.Trigger>
            <Menu.Portal>
                <Menu.Positioner side="top" sideOffset={8} className="z-50">
                    <Menu.Popup className={cx("max-h-80 w-56 overflow-y-auto", overlayChrome.menu, popupMotion)}>
                        <div className="px-2 py-1 text-[11px] text-placeholder">{label}</div>
                        {children}
                    </Menu.Popup>
                </Menu.Positioner>
            </Menu.Portal>
        </Menu.Root>
    );
}

/**
 * Floats at the bottom while issues are selected and edits all of them at once. Every change takes one request,
 * shows right away, and offers to undo it.
 */
export function BulkActionBar({
    projectId,
    issues,
    columns,
    members,
    labels,
    onClear,
}: {
    projectId: string;
    /** The selected issues, as currently shown. */
    issues: Issue[];
    columns: Array<{ id: string; name: string; color: string | null }>;
    members: Array<{ id: string; name: string; avatarUrl: string | null }>;
    labels: LabelOption[];
    onClear: () => void;
}) {
    const { t } = useTranslation();
    const showToast = useToast();
    const queryClient = useQueryClient();
    const update = useBulkUpdateIssues(projectId);
    const remove = useBulkDeleteIssues(projectId);
    const [confirmDelete, setConfirmDelete] = useState(false);
    // While the bar slides away its count stays as it was, instead of reading "0 selected".
    const [shownCount, setShownCount] = useState(issues.length);
    useEffect(() => {
        if (issues.length > 0) setShownCount(issues.length);
    }, [issues.length]);
    const open = issues.length > 0;
    const counted = (one: string, many: string, count: number) => (count === 1 ? t(one as "issue.selectedOne") : t(many as "issue.selectedMany", { count }));

    async function apply(patch: BulkIssuePatch) {
        const before = issues;
        try {
            await update.mutateAsync({ issueIds: before.map((issue) => issue.id), patch });
        } catch {
            showToast({ tone: "error", title: t("issue.couldNotUpdateSelected") });
            return;
        }
        showToast({
            title: counted("issue.updatedOne", "issue.updatedMany", before.length),
            action: {
                label: t("issue.undo"),
                onClick: async () => {
                    try {
                        for (const group of undoPatches(before, patch)) await update.mutateAsync(group);
                        showToast({ title: t("issue.changesUndone") });
                    } catch {
                        showToast({ tone: "error", title: t("issue.couldNotUndo") });
                    }
                },
            },
        });
    }

    function deleteSelected() {
        const ids = issues.map((issue) => issue.id);
        remove.mutate(ids, {
            onSuccess: ({ deletedAt }) => {
                setConfirmDelete(false);
                onClear();
                showToast({
                    title: counted("issue.deletedOne", "issue.deletedMany", ids.length),
                    action: {
                        label: t("issue.undo"),
                        onClick: async () => {
                            try {
                                await restoreBulkIssues(projectId, ids, deletedAt);
                                await Promise.all([
                                    queryClient.invalidateQueries({ queryKey: ["projects", projectId, "issues"] }),
                                    queryClient.invalidateQueries({ queryKey: ["my-issues"] }),
                                    queryClient.invalidateQueries({ queryKey: ["issues"] }),
                                ]);
                                showToast({ title: t("issue.changesUndone") });
                            } catch {
                                showToast({ tone: "error", title: t("issue.couldNotUndo") });
                            }
                        },
                    },
                });
            },
            onError: () => {
                setConfirmDelete(false);
                showToast({ tone: "error", title: t("issue.couldNotDeleteSelected") });
            },
        });
    }

    const labelState = (labelId: string) => {
        const count = issues.filter((issue) => issue.categoryIds.includes(labelId)).length;
        return count === 0 ? "unchecked" : count === issues.length ? "checked" : "mixed";
    };

    return (
        <>
            <div
                role="toolbar"
                aria-label={t("issue.bulkActions")}
                inert={!open}
                className={cx(
                    "absolute bottom-5 left-4 right-4 z-30 mx-auto flex w-fit max-w-full flex-wrap justify-center items-center gap-0.5 overflow-hidden rounded-xl border border-subtle bg-layer-2 p-1 shadow-overlay-200 transition-[opacity,transform] motion-reduce:transition-none",
                    motionTiming(open),
                    open ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-3 opacity-0",
                )}
            >
                <span className="flex h-7 shrink-0 items-center gap-1 rounded-md border border-dashed border-subtle pr-1 pl-2 text-[13px] text-primary tabular-nums">
                    {counted("issue.selectedOne", "issue.selectedMany", shownCount)}
                    <Tooltip title={`${t("issue.clearSelection")} · Esc`}>
                        <button type="button" aria-label={t("issue.clearSelection")} onClick={onClear} className="grid size-5 place-items-center rounded text-tertiary hover:bg-layer-transparent-hover hover:text-primary">
                            <X className="size-3.5" />
                        </button>
                    </Tooltip>
                </span>
                <span aria-hidden="true" className="mx-1 h-4 w-px shrink-0 bg-border-secondary" />
                <BarMenu icon={<StateIcon name={columns[0]?.name ?? ""} color={columns[0]?.color} className="size-4" />} label={t("issue.status")}>
                    {columns.map((column) => (
                        <Menu.Item key={column.id} className={menuItem} onClick={() => void apply({ columnId: column.id })}>
                            <StateIcon name={column.name} color={column.color} className="size-4" />
                            {translateStatusName(column.name, t)}
                        </Menu.Item>
                    ))}
                </BarMenu>
                <BarMenu icon={<PriorityIcon priority="high" className="size-4" />} label={t("issue.priority")}>
                    {PRIORITY_OPTIONS.map((priority) => (
                        <Menu.Item key={priority} className={menuItem} onClick={() => void apply({ priority })}>
                            <PriorityIcon priority={priority} className="size-4" />
                            {t(priorityLabelKey(priority))}
                        </Menu.Item>
                    ))}
                </BarMenu>
                <BarMenu icon={<UnassignedIcon />} label={t("issue.assignee")}>
                    <Menu.Item className={menuItem} onClick={() => void apply({ assigneeId: null })}>
                        <UnassignedIcon />
                        {t("issue.unassigned")}
                    </Menu.Item>
                    {members.map((member) => (
                        <Menu.Item key={member.id} className={menuItem} onClick={() => void apply({ assigneeId: member.id })}>
                            <IssueAvatar name={member.name} avatarUrl={member.avatarUrl} className="size-4 text-[9px]" />
                            {member.name}
                        </Menu.Item>
                    ))}
                </BarMenu>
                <LabelsPicker
                    labels={labels}
                    state={labelState}
                    onToggle={(labelId, add) => void apply(add ? { addCategoryIds: [labelId] } : { removeCategoryIds: [labelId] })}
                    triggerLabel={t("issue.labels")}
                    triggerClassName={barButton}
                >
                    <LabelsOutline className="size-4 text-tertiary" />
                    <span className="hidden sm:inline">{t("issue.labels")}</span>
                </LabelsPicker>
                <BarMenu icon={<EstimateOutline className="size-4 text-tertiary" />} label={t("issue.estimate")}>
                    <Menu.Item className={menuItem} onClick={() => void apply({ estimate: null })}>
                        <EstimateOutline className="size-4 text-placeholder" />
                        {t("issue.noEstimate")}
                    </Menu.Item>
                    {issueEstimateValues.map((points) => (
                        <Menu.Item key={points} className={menuItem} onClick={() => void apply({ estimate: points })}>
                            <EstimateOutline className="size-4 text-tertiary" />
                            {t("projects.points", { count: points })}
                        </Menu.Item>
                    ))}
                </BarMenu>
                <span aria-hidden="true" className="mx-1 h-4 w-px shrink-0 bg-border-secondary" />
                <button type="button" onClick={() => setConfirmDelete(true)} className={cx(barButton, "text-danger-primary hover:text-danger-primary")}>
                    <Trash2 className="size-4" />
                    <span className="hidden sm:inline">{t("issue.deleteAction")}</span>
                </button>
            </div>
            <ConfirmDialog
                open={confirmDelete}
                onOpenChange={setConfirmDelete}
                title={counted("issue.deleteSelectedOne", "issue.deleteSelectedMany", issues.length)}
                description={t("issue.deleteSelectedDescription")}
                confirmLabel={t("issue.deleteAction")}
                isPending={remove.isPending}
                onConfirm={deleteSelected}
            />
        </>
    );
}
