import { useState } from "react";
import { arrayMove } from "@dnd-kit/sortable";
import {
    ArrowDownOutline as ArrowDown,
    TopArrowOutline as ArrowUp,
    StateOutline as CircleDashed,
    EditOutline as Pencil,
    AddOutline as Plus,
    DeleteOutline as Trash2,
} from "@makeplane/propel/icons";
import { ButtonUtility } from "@/components/base/buttons/button-utility";
import { Alert } from "@/components/base/feedback/alert";
import { EmptyState } from "@/components/feedback/empty-state";
import { ErrorMessage } from "@/components/feedback/error-message";
import { LoadingState } from "@/components/feedback/loading-state";
import { ConfirmDialog } from "@/components/overlay/confirm-dialog";
import { NamedColorForm } from "@/components/settings/named-color-form";
import { SettingsGroup, SettingsHeading, SettingsItemRow, SettingsRowActions } from "@/components/settings/settings-layout";
import { ApiError } from "@/lib/api-client";
import { useColumns, useCreateColumn, useDeleteColumn, useUpdateColumn } from "../hooks/use-board";
import { positionAtIndex } from "../position";
import { COLUMN_COLORS } from "./column-color";
import { useTranslation } from "react-i18next";

export const ColumnsPanel = ({ projectId, isProjectOwner }: { projectId: string; isProjectOwner: boolean }) => {
    const { t } = useTranslation();
    const { data: columns, isLoading, isError } = useColumns(projectId);
    const createColumn = useCreateColumn(projectId);
    const updateColumn = useUpdateColumn(projectId);
    const deleteColumn = useDeleteColumn(projectId);
    const [editor, setEditor] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
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
                    action={isProjectOwner && <ButtonUtility icon={Plus} size="sm" color="tertiary" tooltip={t("settings.addState")} isDisabled={pending} onClick={() => setEditor("new")} />}
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
                    {columns?.map((column, index) =>
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
                            <SettingsItemRow key={column.id} dense leading={<CircleDashed className="size-4 shrink-0" style={{ color: column.color ?? "#87888c" }} />} title={column.name}>
                                {isProjectOwner && (
                                    <SettingsRowActions>
                                        <ButtonUtility icon={ArrowUp} size="sm" color="tertiary" tooltip={t("settings.moveStateUp")} isDisabled={pending || index === 0} onClick={() => moveColumn(column.id, -1)} />
                                        <ButtonUtility
                                            icon={ArrowDown}
                                            size="sm"
                                            color="tertiary"
                                            tooltip={t("settings.moveStateDown")}
                                            isDisabled={pending || index === (columns?.length ?? 0) - 1}
                                            onClick={() => moveColumn(column.id, 1)}
                                        />
                                        <ButtonUtility icon={Pencil} size="sm" color="tertiary" tooltip={`${t("common.edit")} ${column.name}`} isDisabled={pending} onClick={() => setEditor(column.id)} />
                                        <ConfirmDialog
                                            trigger={<ButtonUtility icon={Trash2} size="sm" color="tertiary" tooltip={t("settings.deleteState")} isDisabled={pending} />}
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
                        ),
                    )}
                </SettingsGroup>
            )}
        </div>
    );
};
