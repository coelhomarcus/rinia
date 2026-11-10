import { type ReactNode, useState } from "react";
import { DndContext, type DragEndEvent, type DragOverEvent, DragOverlay, type DragStartEvent, closestCenter } from "@dnd-kit/core";
import { SortableContext, arrayMove, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
    ArrowDownOutline as ArrowDown,
    TopArrowOutline as ArrowUp,
    StateOutline as CircleDashed,
    EditOutline as Pencil,
    AddOutline as Plus,
    DeleteOutline as Trash2,
} from "@makeplane/propel/icons";
import { positionAtIndex } from "@rinia/shared";
import { GripVertical } from "lucide-react";
import { useTranslation } from "react-i18next";
import { ButtonUtility } from "@/components/base/buttons/button-utility";
import { Alert } from "@/components/base/feedback/alert";
import { EmptyState } from "@/components/feedback/empty-state";
import { ErrorMessage } from "@/components/feedback/error-message";
import { LoadingState } from "@/components/feedback/loading-state";
import { ConfirmDialog } from "@/components/overlay/confirm-dialog";
import { NamedColorForm } from "@/components/settings/named-color-form";
import { SettingsGroup, SettingsHeading, SettingsItemRow, SettingsRowActions } from "@/components/settings/settings-layout";
import { DragLift, dragSlotClass, useDragTilt } from "@/features/issues/components/drag-feedback";
import { dragSurfaceClass, useIssueDragSensors } from "@/features/issues/lib/drag-sensors";
import { ApiError } from "@/lib/api-client";
import { cx } from "@/utils/cx";
import type { BoardColumn } from "../api";
import { useColumns, useCreateColumn, useDeleteColumn, useUpdateColumn } from "../hooks/use-board";
import { COLUMN_COLORS } from "./column-color";

function SortableStateRow({ id, disabled, children }: { id: string; disabled: boolean; children: (handle: ReactNode) => ReactNode }) {
    const { t } = useTranslation();
    const { attributes, listeners, setActivatorNodeRef, setNodeRef, transform, transition, isDragging } = useSortable({ id, disabled });
    const handle = disabled ? null : (
        <button
            type="button"
            ref={setActivatorNodeRef}
            {...attributes}
            {...listeners}
            aria-label={t("issue.dragToReorder")}
            className={cx("flex size-6 shrink-0 cursor-grab items-center justify-center rounded text-placeholder", dragSurfaceClass)}
        >
            <GripVertical className="size-3.5" />
        </button>
    );
    return (
        <div
            ref={setNodeRef}
            style={{ transform: CSS.Transform.toString(transform), transition }}
            className={cx(isDragging && cx("rounded-md border opacity-50", dragSlotClass))}
        >
            {children(handle)}
        </div>
    );
}

export const ColumnsPanel = ({ projectId, isProjectOwner }: { projectId: string; isProjectOwner: boolean }) => {
    const { t } = useTranslation();
    const { data: columns, isLoading, isError } = useColumns(projectId);
    const createColumn = useCreateColumn(projectId);
    const updateColumn = useUpdateColumn(projectId);
    const deleteColumn = useDeleteColumn(projectId);
    const [editor, setEditor] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [preview, setPreview] = useState<BoardColumn[] | null>(null);
    const [activeId, setActiveId] = useState<string | null>(null);
    const sensors = useIssueDragSensors();
    const { tilt, reducedMotion, onDragMove, resetTilt, dropAnimation } = useDragTilt();
    const rows = preview ?? columns ?? [];
    const activeColumn = rows.find((column) => column.id === activeId) ?? null;
    const pending = updateColumn.isPending || deleteColumn.isPending || createColumn.isPending;
    const showError = (reason: unknown) => setError(reason instanceof ApiError ? reason.message : t("settings.couldNotUpdateWorkflow"));

    function moveColumn(columnId: string, direction: -1 | 1) {
        if (!columns) return;
        const from = columns.findIndex((column) => column.id === columnId);
        const to = from + direction;
        if (from < 0 || to < 0 || to >= columns.length) return;
        const ordered = arrayMove(columns, from, to);
        const position = positionAtIndex(
            ordered.filter((column) => column.id !== columnId),
            to,
        );
        setError(null);
        updateColumn.mutate({ columnId, input: { position } }, { onError: showError });
    }

    function onColumnDragStart(event: DragStartEvent) {
        setActiveId(String(event.active.id));
        setPreview(columns ?? []);
    }

    function onColumnDragOver({ active, over }: DragOverEvent) {
        if (!over || active.id === over.id) return;
        setPreview((current) => {
            const list = current ?? columns ?? [];
            const from = list.findIndex((column) => column.id === active.id);
            const to = list.findIndex((column) => column.id === over.id);
            if (from < 0 || to < 0 || from === to) return current;
            return arrayMove(list, from, to);
        });
    }

    function onColumnDragEnd(event: DragEndEvent) {
        const list = preview ?? columns ?? [];
        const columnId = String(event.active.id);
        setActiveId(null);
        resetTilt();
        if (!event.over) {
            setPreview(null);
            return;
        }
        const index = list.findIndex((column) => column.id === columnId);
        const original = columns?.find((column) => column.id === columnId);
        const position = positionAtIndex(
            list.filter((column) => column.id !== columnId),
            index,
        );
        if (!original || index < 0 || original.position === position) {
            setPreview(null);
            return;
        }
        setError(null);
        updateColumn.mutate({ columnId, input: { position } }, { onError: showError, onSettled: () => setPreview(null) });
    }

    function onColumnDragCancel() {
        setActiveId(null);
        setPreview(null);
        resetTilt();
    }

    return (
        <div>
            <SettingsHeading title={t("settings.states")} description={t("settings.defineWorkflow")} />
            {error && (
                <div className="mb-4">
                    <Alert tone="error">{error}</Alert>
                </div>
            )}
            {isLoading ? (
                <LoadingState label={t("settings.loadingStates")} />
            ) : isError ? (
                <ErrorMessage message={t("settings.couldNotLoadStates")} />
            ) : (
                <SettingsGroup
                    title={`${t("settings.workflow")} · ${columns?.length ?? 0}`}
                    action={
                        isProjectOwner && (
                            <ButtonUtility
                                icon={Plus}
                                size="sm"
                                color="tertiary"
                                tooltip={t("settings.addState")}
                                isDisabled={pending}
                                onClick={() => setEditor("new")}
                            />
                        )
                    }
                >
                    {editor === "new" && (
                        <NamedColorForm
                            key="new"
                            label={t("settings.stateName")}
                            initialColor={COLUMN_COLORS[0]}
                            submitLabel={t("settings.addState")}
                            onSave={(input) => createColumn.mutateAsync(input)}
                            onClose={() => setEditor(null)}
                        />
                    )}
                    {!columns?.length && editor !== "new" && <EmptyState title={t("settings.noStates")} description={t("settings.addStateHint")} />}
                    <DndContext
                        sensors={sensors}
                        collisionDetection={closestCenter}
                        onDragStart={onColumnDragStart}
                        onDragMove={onDragMove}
                        onDragOver={onColumnDragOver}
                        onDragEnd={onColumnDragEnd}
                        onDragCancel={onColumnDragCancel}
                    >
                        <SortableContext
                            items={rows.filter((column) => editor !== column.id).map((column) => column.id)}
                            strategy={verticalListSortingStrategy}
                        >
                            {rows.map((column, index) =>
                                editor === column.id ? (
                                    <NamedColorForm
                                        key={column.id}
                                        label={t("settings.stateName")}
                                        initialName={column.name}
                                        initialColor={column.color}
                                        submitLabel={t("common.save")}
                                        onSave={(input) => updateColumn.mutateAsync({ columnId: column.id, input })}
                                        onClose={() => setEditor(null)}
                                    />
                                ) : (
                                    <SortableStateRow key={column.id} id={column.id} disabled={!isProjectOwner || editor !== null}>
                                        {(handle) => (
                                            <SettingsItemRow
                                                dense
                                                leading={
                                                    <span className="flex items-center gap-1">
                                                        {handle}
                                                        <CircleDashed className="size-4 shrink-0" style={{ color: column.color ?? "#87888c" }} />
                                                    </span>
                                                }
                                                title={column.name}
                                            >
                                                {isProjectOwner && (
                                                    <SettingsRowActions>
                                                        <ButtonUtility
                                                            icon={ArrowUp}
                                                            size="sm"
                                                            color="tertiary"
                                                            tooltip={t("settings.moveStateUp")}
                                                            isDisabled={pending || preview !== null || index === 0}
                                                            onClick={() => moveColumn(column.id, -1)}
                                                        />
                                                        <ButtonUtility
                                                            icon={ArrowDown}
                                                            size="sm"
                                                            color="tertiary"
                                                            tooltip={t("settings.moveStateDown")}
                                                            isDisabled={pending || preview !== null || index === rows.length - 1}
                                                            onClick={() => moveColumn(column.id, 1)}
                                                        />
                                                        <ButtonUtility
                                                            icon={Pencil}
                                                            size="sm"
                                                            color="tertiary"
                                                            tooltip={`${t("common.edit")} ${column.name}`}
                                                            isDisabled={pending}
                                                            onClick={() => setEditor(column.id)}
                                                        />
                                                        <ConfirmDialog
                                                            trigger={
                                                                <ButtonUtility
                                                                    icon={Trash2}
                                                                    size="sm"
                                                                    color="tertiary"
                                                                    tooltip={t("settings.deleteState")}
                                                                    isDisabled={pending}
                                                                />
                                                            }
                                                            title={t("settings.deleteState")}
                                                            description={t("settings.deleteStateDescription", { name: column.name })}
                                                            confirmLabel={t("settings.deleteState")}
                                                            isPending={deleteColumn.isPending}
                                                            onConfirm={() => {
                                                                setError(null);
                                                                deleteColumn.mutate(column.id, { onError: showError });
                                                            }}
                                                        />
                                                    </SettingsRowActions>
                                                )}
                                            </SettingsItemRow>
                                        )}
                                    </SortableStateRow>
                                ),
                            )}
                        </SortableContext>
                        <DragOverlay dropAnimation={dropAnimation}>
                            {activeColumn && (
                                <DragLift
                                    tilt={tilt}
                                    reducedMotion={reducedMotion}
                                    className="flex h-11 items-center gap-2 rounded-md border border-accent-strong bg-layer-1 px-3 text-[13px] font-medium text-primary"
                                >
                                    <CircleDashed className="size-4 shrink-0" style={{ color: activeColumn.color ?? "#87888c" }} />
                                    {activeColumn.name}
                                </DragLift>
                            )}
                        </DragOverlay>
                    </DndContext>
                </SettingsGroup>
            )}
        </div>
    );
};
