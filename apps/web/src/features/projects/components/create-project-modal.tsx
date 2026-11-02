import { useState } from "react";
import { createProjectSchema, suggestProjectKey } from "@rinia/shared";
import { zodResolver } from "@hookform/resolvers/zod";
import { Plus } from "lucide-react";
import { Popover } from "@base-ui/react/popover";
import { Controller, useForm } from "react-hook-form";
import { useNavigate } from "react-router";
import { Button } from "@/components/base/buttons/button";
import { Input } from "@/components/base/input/input";
import { ControlledInput } from "@/components/form/controlled-input";
import { ControlledTextarea } from "@/components/form/controlled-textarea";
import { ModalDialog } from "@/components/overlay/modal-dialog";
import { AppearancePicker, appearancePopupClass } from "@/components/appearance/appearance-picker";
import { GradientPicker } from "@/components/appearance/gradient-picker";
import { ApiError } from "@/lib/api-client";
import { useCreateProject } from "../hooks/use-projects";
import { DEFAULT_PROJECT_ICON, ProjectIcon } from "./project-icon";
import { useTranslation } from "react-i18next";
import { urls } from "@/lib/urls";

export const CreateProjectModal = () => {
    const mutation = useCreateProject();
    const navigate = useNavigate();
    const [iconPickerOpen, setIconPickerOpen] = useState(false);
    const { t } = useTranslation();
    const { control, handleSubmit, reset, setError, watch, formState } = useForm({
        resolver: zodResolver(createProjectSchema),
        defaultValues: { name: "", issueKey: "", description: "", repositoryUrl: "", iconAppearance: { type: "icon" as const, key: DEFAULT_PROJECT_ICON }, cover: null },
    });
    const projectName = watch("name");
    const generatedIssueKey = suggestProjectKey(projectName);
    const issueKey = watch("issueKey");
    const iconAppearance = watch("iconAppearance");

    return (
        <ModalDialog trigger={<Button iconLeading={Plus}>{t("nav.newProject")}</Button>} title={t("nav.newProject")} size="2xl">
            {({ close }) => (
                <form
                    className="flex flex-col gap-4"
                    noValidate
                    onSubmit={handleSubmit((data) => {
                        mutation.mutate(data, {
                            onSuccess: (project) => {
                                reset();
                                close();
                                navigate(urls.project(project.issueKey));
                            },
                            onError: (error) => {
                                setError(error instanceof ApiError && error.status === 409 ? "issueKey" : "root", {
                                    message: error instanceof ApiError ? error.message : t("projects.couldNotCreate"),
                                });
                            },
                        });
                    })}
                >
                    <div className="flex min-w-0 items-stretch gap-2">
                        <Controller
                            control={control}
                            name="iconAppearance"
                            render={({ field }) => (
                                <Popover.Root open={iconPickerOpen} onOpenChange={setIconPickerOpen}>
                                    <Popover.Trigger
                                        render={
                                            <button
                                                type="button"
                                                aria-label={t("projects.chooseIcon")}
                                                title={t("projects.chooseIcon")}
                                                className="flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-md border border-subtle bg-layer-2 text-secondary outline-accent-strong transition-colors hover:bg-layer-2-hover hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-strong"
                                            />
                                        }
                                    >
                                        <ProjectIcon icon={field.value} className="size-5" />
                                    </Popover.Trigger>
                                    <Popover.Portal>
                                        <Popover.Positioner side="bottom" align="start" sideOffset={8} collisionPadding={12} className="z-[60]">
                                            <Popover.Popup className={appearancePopupClass}>
                                                <Popover.Title className="sr-only">{t("projects.chooseIcon")}</Popover.Title>
                                                <AppearancePicker value={field.value} onChange={field.onChange} onComplete={() => setIconPickerOpen(false)} />
                                            </Popover.Popup>
                                        </Popover.Positioner>
                                    </Popover.Portal>
                                </Popover.Root>
                            )}
                        />
                        <div className="min-w-0 flex-1">
                            <ControlledInput control={control} name="name" label={t("projects.projectName")} isRequired autoFocus />
                        </div>
                    </div>
                    <Controller
                        control={control}
                        name="issueKey"
                        render={({ field, fieldState }) => (
                            <Input
                                {...field}
                                value={field.value ?? ""}
                                onChange={(value) => field.onChange(value.toUpperCase())}
                                label={t("projects.projectId")}
                                placeholder={projectName.trim() ? generatedIssueKey : "PRJ"}
                                maxLength={8}
                                isInvalid={!!fieldState.error}
                                inputClassName="uppercase"
                                hint={fieldState.error?.message ?? <span className="text-xs text-tertiary/60">{t("projects.projectIssueKeyHint")}</span>}
                            />
                        )}
                    />
                    <ControlledTextarea control={control} name="description" label={t("projects.description")} rows={3} />
                    <ControlledInput control={control} name="repositoryUrl" label={t("projects.repository")} placeholder="https://github.com/..." />
                    <Controller
                        control={control}
                        name="cover"
                        render={({ field }) => (
                            <GradientPicker
                                cover={field.value}
                                onChange={field.onChange}
                                preview={{ name: projectName.trim() || t("projects.projectName"), issueKey: issueKey || (projectName.trim() ? generatedIssueKey : "PRJ"), icon: iconAppearance }}
                            />
                        )}
                    />

                    {formState.errors.root && <p className="text-sm text-danger-primary">{formState.errors.root.message}</p>}

                    <div className="mt-1 flex justify-end gap-2 border-t border-subtle pt-3">
                        <Button type="button" color="secondary" onClick={close}>
                                {t("common.cancel")}
                        </Button>
                        <Button type="submit" isLoading={mutation.isPending}>
                            {t("projects.createProject")}
                        </Button>
                    </div>
                </form>
            )}
        </ModalDialog>
    );
};
