import type { ReactNode } from "react";
import { updateProjectSchema } from "@rinia/shared";
import { zodResolver } from "@hookform/resolvers/zod";
import { Controller, useForm, type FieldError } from "react-hook-form";
import { Button } from "@/components/base/buttons/button";
import { Alert } from "@/components/base/feedback/alert";
import { ErrorMessage } from "@/components/feedback/error-message";
import { LoadingState } from "@/components/feedback/loading-state";
import { SettingsControl, SettingsGroup, settingsFieldClass } from "@/components/settings/settings-layout";
import { translateValidationMessage } from "@/i18n/validation";
import { ApiError } from "@/lib/api-client";
import { useProject } from "../hooks/use-project";
import { useUpdateProject } from "../hooks/use-projects";
import { DeleteProjectDialog } from "./delete-project-dialog";
import { ProjectCoverControl, ProjectIconControl } from "./project-appearance-controls";
import { projectIconColor } from "./project-icon";
import { useTranslation } from "react-i18next";

export const ProjectDetailsPanel = ({ projectId, isProjectOwner }: { projectId: string; isProjectOwner: boolean }) => {
    const { t } = useTranslation();
    const { data: project, isLoading, isError } = useProject(projectId);
    const mutation = useUpdateProject(projectId);
    const { control, handleSubmit, setError, formState } = useForm({
        resolver: zodResolver(updateProjectSchema),
        values: project
            ? {
                  name: project.name,
                  issueKey: project.issueKey,
                  description: project.description ?? "",
                  repositoryUrl: project.repositoryUrl ?? "",
              }
            : undefined,
        resetOptions: { keepDirtyValues: true },
    });
    if (isLoading) return <LoadingState label={t("settings.loadingProject")} />;
    if (isError || !project) return <ErrorMessage message={t("settings.couldNotLoadProject")} />;
    const disabled = !isProjectOwner || mutation.isPending;
    const icon = project.iconAppearance ?? project.icon;
    const colored = !!projectIconColor(icon);

    return (
        <div>
            <form
                noValidate
                onSubmit={handleSubmit((data) =>
                    mutation.mutate(data, {
                        onError: (error) => setError("root", { message: error instanceof ApiError ? error.message : t("settings.couldNotSaveProject") }),
                    }),
                )}
            >
                <SettingsGroup>
                    <SettingsControl title={t("projects.projectName")}>
                        <ProjectIconControl
                            projectId={projectId}
                            icon={icon}
                            isProjectOwner={isProjectOwner}
                            className={`grid size-8 shrink-0 place-items-center rounded-lg outline-accent-strong ${colored ? "" : "bg-accent-primary text-white"}`}
                            iconClassName={colored ? "size-8 rounded-lg" : "size-4"}
                        />
                        <Controller
                            control={control}
                            name="name"
                            render={({ field, fieldState }) => (
                                <Field error={fieldState.error}>
                                    <input {...field} value={field.value ?? ""} required disabled={disabled} aria-label={t("projects.projectName")} aria-invalid={!!fieldState.error} className={settingsFieldClass} />
                                </Field>
                            )}
                        />
                    </SettingsControl>
                    <SettingsControl title={t("settings.identifier")} description={project.nextIssueNumber > 1 ? t("settings.projectIdRename") : t("settings.identifierHint")}>
                        <Controller
                            control={control}
                            name="issueKey"
                            render={({ field, fieldState }) => (
                                <Field error={fieldState.error}>
                                    <input
                                        {...field}
                                        value={field.value ?? ""}
                                        maxLength={8}
                                        spellCheck={false}
                                        disabled={disabled}
                                        aria-label={t("settings.identifier")}
                                        aria-invalid={!!fieldState.error}
                                        onChange={(event) => field.onChange(event.target.value.toUpperCase())}
                                        className={`${settingsFieldClass} font-mono uppercase`}
                                    />
                                </Field>
                            )}
                        />
                    </SettingsControl>
                    <SettingsControl title={t("projects.repository")} description={t("settings.repositoryHint")}>
                        <Controller
                            control={control}
                            name="repositoryUrl"
                            render={({ field, fieldState }) => (
                                <Field error={fieldState.error}>
                                    <input {...field} value={field.value ?? ""} type="url" disabled={disabled} placeholder="https://github.com/..." aria-label={t("projects.repository")} aria-invalid={!!fieldState.error} className={settingsFieldClass} />
                                </Field>
                            )}
                        />
                    </SettingsControl>
                    <SettingsControl title={t("appearance.projectBanner")} description={t("settings.bannerHint")}>
                        {isProjectOwner ? <ProjectCoverControl projectId={projectId} cover={project.cover} isProjectOwner /> : <span className="text-[13px] text-tertiary">—</span>}
                    </SettingsControl>
                </SettingsGroup>

                <SettingsGroup title={t("projects.description")} description={t("settings.descriptionHint")}>
                    <Controller
                        control={control}
                        name="description"
                        render={({ field }) => (
                            <textarea
                                {...field}
                                value={field.value ?? ""}
                                rows={4}
                                maxLength={2000}
                                disabled={disabled}
                                aria-label={t("projects.description")}
                                placeholder={t("settings.descriptionPlaceholder")}
                                className="-mx-4 block w-[calc(100%+2rem)] resize-none bg-transparent px-4 py-3.5 text-[13px] leading-5 text-primary outline-none placeholder:text-placeholder disabled:text-tertiary"
                            />
                        )}
                    />
                </SettingsGroup>

                <div className="mt-4 flex flex-col gap-3">
                    {formState.errors.root && <Alert tone="error">{formState.errors.root.message}</Alert>}
                    {mutation.isSuccess && !formState.isDirty && <Alert tone="success">{t("settings.projectDetailsSaved")}</Alert>}
                    {isProjectOwner && (
                        <div className="flex justify-end">
                            <Button type="submit" size="sm" isLoading={mutation.isPending} isDisabled={!formState.isDirty}>
                                {t("common.saveChanges")}
                            </Button>
                        </div>
                    )}
                </div>
            </form>
            {isProjectOwner && (
                <SettingsGroup title={t("settings.dangerZone")}>
                    <SettingsControl title={t("projects.deleteProject")} description={t("settings.deleteProjectDescription")}>
                        <DeleteProjectDialog project={project} />
                    </SettingsControl>
                </SettingsGroup>
            )}
        </div>
    );
};

function Field({ error, children }: { error?: FieldError; children: ReactNode }) {
    const { t } = useTranslation();
    return (
        <div className="flex w-full flex-col gap-1 sm:w-56">
            {children}
            {error?.message && <p className="text-xs text-danger-primary">{translateValidationMessage(error.message, t)}</p>}
        </div>
    );
}
