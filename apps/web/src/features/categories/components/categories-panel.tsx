import { useState } from "react";
import { EditOutline as Pencil, AddOutline as Plus, DeleteOutline as Trash2 } from "@makeplane/propel/icons";
import { Button } from "@/components/base/buttons/button";
import { ButtonUtility } from "@/components/base/buttons/button-utility";
import { Alert } from "@/components/base/feedback/alert";
import { EmptyState } from "@/components/feedback/empty-state";
import { ErrorMessage } from "@/components/feedback/error-message";
import { LoadingState } from "@/components/feedback/loading-state";
import { ConfirmDialog } from "@/components/overlay/confirm-dialog";
import { NamedColorForm } from "@/components/settings/named-color-form";
import { SettingsCard, SettingsHeading, SettingsItemRow, SettingsRowActions } from "@/components/settings/settings-layout";
import { useAuth } from "@/features/auth/hooks/use-auth";
import { ApiError } from "@/lib/api-client";
import { useCategories, useCreateCategory, useDeleteCategory, useUpdateCategory } from "../hooks/use-categories";
import { CATEGORY_COLORS } from "./category-badge";
import { useTranslation } from "react-i18next";

export const CategoriesPanel = ({ projectId, isProjectOwner }: { projectId: string; isProjectOwner: boolean }) => {
    const { t } = useTranslation();
    const { user } = useAuth();
    const { data: categories, isLoading, isError } = useCategories(projectId);
    const createMutation = useCreateCategory(projectId);
    const deleteMutation = useDeleteCategory(projectId);
    const updateMutation = useUpdateCategory(projectId);
    const [editor, setEditor] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const pending = createMutation.isPending || updateMutation.isPending || deleteMutation.isPending;

    return (
        <div>
            <SettingsHeading
                title={t("settings.labels")}
                description={t("settings.createLabelsDescription")}
                control={
                    <Button size="sm" iconLeading={Plus} isDisabled={pending || !!editor} onClick={() => setEditor("new")}>
                        {t("settings.addLabel")}
                    </Button>
                }
            />
            {error && (
                <div className="mb-4">
                    <Alert tone="error">{error}</Alert>
                </div>
            )}
            {isLoading && <LoadingState label={t("settings.loadingLabels")} />}
            {isError && <ErrorMessage message={t("settings.couldNotLoadLabels")} />}
            {categories?.length === 0 && editor !== "new" && <EmptyState title={t("settings.noLabels")} description={t("settings.createLabelHint")} />}
            {(!!categories?.length || editor === "new") && (
                <SettingsCard>
                    {editor === "new" && (
                        <NamedColorForm
                            key="new"
                            label={t("settings.labelName")}
                            initialColor={CATEGORY_COLORS[0]}
                            submitLabel={t("settings.addLabel")}
                            onSave={(input) => createMutation.mutateAsync({ ...input, color: input.color ?? CATEGORY_COLORS[0] })}
                            onClose={() => setEditor(null)}
                        />
                    )}
                    {categories?.map((category) => {
                        const editable = isProjectOwner || category.createdBy === user?.id;
                        if (editor === category.id)
                            return (
                                <NamedColorForm
                                    key={category.id}
                                    label={t("settings.labelName")}
                                    initialName={category.name}
                                    initialColor={category.color}
                                    submitLabel={t("common.save")}
                                    onSave={(input) => updateMutation.mutateAsync({ categoryId: category.id, input })}
                                    onClose={() => setEditor(null)}
                                />
                            );
                        return (
                            <SettingsItemRow
                                key={category.id}
                                dense
                                leading={
                                    <span className="grid size-4 shrink-0 place-items-center">
                                        <span className="size-2.5 rounded-full" style={{ backgroundColor: category.color ?? CATEGORY_COLORS[0] }} />
                                    </span>
                                }
                                title={category.name}
                            >
                                {editable && (
                                    <SettingsRowActions>
                                        <ButtonUtility icon={Pencil} size="sm" color="tertiary" tooltip={`${t("common.edit")} ${category.name}`} isDisabled={pending || !!editor} onClick={() => setEditor(category.id)} />
                                        <ConfirmDialog
                                            trigger={<ButtonUtility icon={Trash2} size="sm" color="tertiary" tooltip={t("settings.deleteLabel")} isDisabled={pending} />}
                                            title={t("settings.deleteLabel")}
                                            description={t("settings.deleteLabelDescription", { name: category.name })}
                                            confirmLabel={t("settings.deleteLabel")}
                                            isPending={deleteMutation.isPending}
                                            onConfirm={() => {
                                                setError(null);
                                                deleteMutation.mutate(category.id, {
                                                    onError: (reason) => setError(reason instanceof ApiError ? reason.message : t("settings.couldNotDeleteLabel")),
                                                });
                                            }}
                                        />
                                    </SettingsRowActions>
                                )}
                            </SettingsItemRow>
                        );
                    })}
                </SettingsCard>
            )}
        </div>
    );
};
