import { useEffect, useRef, useState } from "react";
import { Menu } from "@base-ui/react/menu";
import { EyeOff, MoreHorizontal, Settings2, Trash2 } from "lucide-react";
import { overlayChrome } from "@/components/overlay/overlay-chrome";
import { useDroppable } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { AddOutline } from "@makeplane/propel/icons";
import { ButtonUtility } from "@/components/base/buttons/button-utility";
import { Input } from "@/components/base/input/input";
import { ConfirmDialog } from "@/components/overlay/confirm-dialog";
import type { UpdateIssueInput } from "@rinia/shared";
import type { Issue, IssuePerson } from "@/features/issues/api";
import { ApiError } from "@/lib/api-client";
import { cx } from "@/utils/cx";
import type { BoardColumn } from "../api";
import { resolveLabels } from "@/features/issues/components/labels-picker";
import { columnBucket } from "../column-bucket";
import { useDeleteColumn, useUpdateColumn } from "../hooks/use-board";
import { StateIcon } from "./issue-property-icons";
import { IssueCard } from "./issue-card";
import { useTranslation } from "react-i18next";
import { translateStatusName } from "@/i18n/status-label";

const columnMenuItem = "flex h-8 cursor-pointer items-center gap-2.5 rounded px-2 text-[13px] text-secondary outline-none data-highlighted:bg-layer-2-hover data-highlighted:text-primary";

interface ColumnProps {
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
    onCreateIssue: (columnId: string) => void;
    onHide: (columnId: string) => void;
    /** Opens the project's state settings, where states are added and ordered (the board has no "new column" button). */
    onManageStates: () => void;
}

export const Column = ({ column, statuses, issues, projectId, categoriesById, membersById, people, labels, onUpdateIssue, onOpenIssue, onCreateIssue, onHide, onManageStates }: ColumnProps) => {
    const { t } = useTranslation();
    const { setNodeRef: setDropRef, isOver } = useDroppable({ id: column.id });

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
        updateColumn.mutate({ columnId: column.id, input: { name: trimmed } }, {
            onError: (err) => setError(err instanceof ApiError ? err.message : t("errors.requestFailed")),
        });
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
            className="group/column animate-enter flex h-full max-h-full w-80 shrink-0 flex-col overflow-hidden rounded-lg bg-surface-1"
        >
            <div className="sticky top-0 z-[2] flex h-10 shrink-0 items-center gap-1.5 bg-surface-1 px-2.5">
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
                        className="flex min-w-0 items-center gap-1.5 rounded px-0.5 text-left text-[13px] font-medium text-primary hover:bg-layer-1-hover"
                    >
                        <StateIcon name={column.name} color={column.color} className="size-4" />
                        <span className="truncate">{label}</span>
                    </button>
                )}

                <span className="text-xs text-tertiary">{issues.length}</span>
                <div className="ml-auto flex shrink-0 items-center">
                    <Menu.Root>
                        <Menu.Trigger aria-label={`${t("projects.columnActions")} · ${label}`} className="grid size-6 place-items-center rounded text-tertiary outline-none hover:bg-layer-transparent-hover hover:text-primary focus-visible:bg-layer-transparent-hover data-[popup-open]:bg-layer-transparent-hover data-[popup-open]:text-primary">
                            <MoreHorizontal className="size-4" />
                        </Menu.Trigger>
                        <Menu.Portal>
                            <Menu.Positioner sideOffset={4} align="end" className="z-50">
                                <Menu.Popup className={cx("w-52 origin-[var(--transform-origin)] transition-[opacity,transform] duration-150 data-[ending-style]:scale-95 data-[ending-style]:opacity-0 data-[starting-style]:scale-95 data-[starting-style]:opacity-0", overlayChrome.menu)}>
                                    <Menu.Item className={columnMenuItem} onClick={() => onHide(column.id)}>
                                        <EyeOff className="size-4 text-tertiary" />
                                        {t("projects.hideColumn")}
                                    </Menu.Item>
                                    <Menu.Item className={columnMenuItem} onClick={onManageStates}>
                                        <Settings2 className="size-4 text-tertiary" />
                                        {t("projects.manageStates")}
                                    </Menu.Item>
                                    <Menu.Separator className="my-1 h-px bg-[var(--border-subtle)]" />
                                    <Menu.Item className={cx(columnMenuItem, "text-danger-primary data-highlighted:text-danger-primary")} onClick={() => setDeleteOpen(true)}>
                                        <Trash2 className="size-4" />
                                        {t("settings.deleteState")}
                                    </Menu.Item>
                                </Menu.Popup>
                            </Menu.Positioner>
                        </Menu.Portal>
                    </Menu.Root>
                    <ButtonUtility icon={AddOutline} size="xs" color="tertiary" tooltip={`${t("issue.newIssue")} · ${label}`} onClick={() => onCreateIssue(column.id)} />
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

            <div ref={setDropRef} className={cx("scrollbar-hide flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-2 pb-2", isOver && "bg-accent-subtle/40")}>
                <SortableContext items={issues.map((issue) => issue.id)} strategy={verticalListSortingStrategy}>
                    {issues.map((issue) => (
                        <IssueCard
                            key={issue.id}
                            issue={issue}
                            status={column}
                            statuses={statuses}
                            projectId={projectId}
                            categories={resolveLabels(issue.categoryIds, categoriesById)}
                            assignee={issue.assigneeId ? membersById.get(issue.assigneeId) : undefined}
                            people={people}
                            labels={labels}
                            closed={columnBucket(column.name) === "closed"}
                            onUpdate={(input) => onUpdateIssue(issue.identifier, input)}
                            onClick={() => onOpenIssue(issue.identifier)}
                        />
                    ))}
                </SortableContext>
                {/* Only the hovered (or keyboard-focused) column offers it, so the board stays quiet. */}
                <button type="button" onClick={() => onCreateIssue(column.id)} className="flex h-7 shrink-0 items-center gap-1 rounded px-1 text-left text-xs text-tertiary opacity-0 transition-opacity duration-150 group-hover/column:opacity-100 hover:bg-layer-1-hover hover:text-secondary focus-visible:opacity-100 motion-reduce:transition-none">
                    <AddOutline className="size-3.5" />
                    {t("issue.newIssue")}
                </button>
            </div>
        </div>
    );
};
