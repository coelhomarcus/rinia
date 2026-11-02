import { useState } from "react";
import { type AddProjectMemberInput, addProjectMemberSchema } from "@rinia/shared";
import { zodResolver } from "@hookform/resolvers/zod";
import { AddOutline as Plus, SearchOutline as Search, UserMinusOutline as UserRoundMinus } from "@makeplane/propel/icons";
import { useForm } from "react-hook-form";
import { Avatar } from "@/components/base/avatar/avatar";
import { Button } from "@/components/base/buttons/button";
import { ButtonUtility } from "@/components/base/buttons/button-utility";
import { Alert } from "@/components/base/feedback/alert";
import { Input } from "@/components/base/input/input";
import { EmptyState } from "@/components/feedback/empty-state";
import { ErrorMessage } from "@/components/feedback/error-message";
import { LoadingState } from "@/components/feedback/loading-state";
import { ControlledInput } from "@/components/form/controlled-input";
import { SettingsCard, SettingsHeading, SettingsItemRow, SettingsRowActions } from "@/components/settings/settings-layout";
import { ConfirmDialog } from "@/components/overlay/confirm-dialog";
import { ModalDialog } from "@/components/overlay/modal-dialog";
import { ApiError } from "@/lib/api-client";
import { useAddProjectMember, useProjectMembers, useRemoveProjectMember } from "../hooks/use-project-members";
import { useTranslation } from "react-i18next";

export const MembersPanel = ({ projectId, isProjectOwner }: { projectId: string; isProjectOwner: boolean }) => {
    const { t, i18n } = useTranslation();
    const { data: members, isLoading, isError } = useProjectMembers(projectId);
    const removeMutation = useRemoveProjectMember(projectId);
    const [search, setSearch] = useState("");
    const filtered = members?.filter((member) => `${member.name} ${member.username} ${member.email}`.toLowerCase().includes(search.trim().toLowerCase()));

    return (
        <div>
            <SettingsHeading
                title={t("settings.members")}
                description={t("settings.membersSummary")}
                control={
                    <div className="flex flex-wrap items-center gap-2">
                        <Input
                            size="sm"
                            aria-label={t("settings.searchMembers")}
                            placeholder={t("settings.searchMembers")}
                            icon={Search}
                            value={search}
                            onChange={setSearch}
                            className="w-48 max-w-full"
                        />
                        {isProjectOwner && (
                            <ModalDialog
                                trigger={
                                    <Button size="sm" iconLeading={Plus}>
                                        {t("settings.addMember")}
                                    </Button>
                                }
                                title={t("settings.addMember")}
                                description={t("settings.addMemberDescription")}
                            >
                                {({ close }) => <AddMemberForm projectId={projectId} onClose={close} />}
                            </ModalDialog>
                        )}
                    </div>
                }
            />
            {removeMutation.isError && (
                <div className="mb-4">
                    <Alert tone="error">{removeMutation.error instanceof ApiError ? removeMutation.error.message : t("settings.couldNotRemoveMember")}</Alert>
                </div>
            )}
            {isLoading && <LoadingState label={t("settings.loadingMembers")} />}
            {isError && <ErrorMessage message={t("settings.couldNotLoadMembers")} />}
            {filtered && filtered.length === 0 && (
                <EmptyState
                    title={search.trim() ? t("settings.noMembersFound") : t("settings.noMembers")}
                    description={search.trim() ? t("settings.tryMemberSearch") : t("settings.inviteTeammates")}
                />
            )}
            {!!filtered?.length && (
                <SettingsCard>
                    {filtered.map((member) => (
                        <SettingsItemRow
                            key={member.id}
                            leading={<Avatar src={member.avatarUrl ?? undefined} initials={memberInitials(member.name)} size="sm" />}
                            title={member.name}
                            description={member.email}
                        >
                            <span className="hidden text-[13px] whitespace-nowrap text-tertiary sm:inline">
                                {t("settings.joinedOnDate", { date: new Intl.DateTimeFormat(i18n.language, { dateStyle: "medium" }).format(new Date(member.joinedAt)) })}
                            </span>
                            <span className="w-24 text-right text-[13px] text-secondary">{member.role === "owner" ? t("settings.owner") : t("settings.member")}</span>
                            {isProjectOwner && (
                                <span className="flex w-8 justify-end">
                                    {member.role !== "owner" && (
                                        <SettingsRowActions>
                                            <ConfirmDialog
                                                trigger={<ButtonUtility icon={UserRoundMinus} size="sm" color="tertiary" tooltip={`${t("settings.removeMember")} ${member.name}`} isDisabled={removeMutation.isPending} />}
                                                title={t("settings.removeMember")}
                                                description={t("settings.removeMemberDescription", { name: member.name, username: member.username })}
                                                confirmLabel={t("settings.removeMember")}
                                                isPending={removeMutation.isPending}
                                                onConfirm={() => removeMutation.mutate(member.id)}
                                            />
                                        </SettingsRowActions>
                                    )}
                                </span>
                            )}
                        </SettingsItemRow>
                    ))}
                </SettingsCard>
            )}
        </div>
    );
};

export function AddMemberForm({ projectId, onClose }: { projectId: string; onClose: () => void }) {
    const { t } = useTranslation();
    const mutation = useAddProjectMember(projectId);
    const { control, handleSubmit, setError, formState } = useForm<AddProjectMemberInput>({
        resolver: zodResolver(addProjectMemberSchema),
        defaultValues: { username: "" },
    });
    return (
        <form
            className="space-y-5"
            noValidate
            onSubmit={handleSubmit((data) =>
                mutation.mutate(data.username, {
                    onSuccess: onClose,
                    onError: (error) => setError("root", { message: error instanceof ApiError ? error.message : t("settings.couldNotAddMember") }),
                }),
            )}
        >
            <ControlledInput control={control} name="username" label={t("settings.username")} placeholder={t("settings.username")} isRequired autoFocus isDisabled={mutation.isPending} />
            {formState.errors.root && <Alert tone="error">{formState.errors.root.message}</Alert>}
            <div className="flex justify-end gap-2">
                <Button color="secondary" size="lg" isDisabled={mutation.isPending} onClick={onClose}>
                    {t("common.cancel")}
                </Button>
                <Button type="submit" size="lg" isLoading={mutation.isPending}>
                    {t("settings.addMember")}
                </Button>
            </div>
        </form>
    );
}

export function memberInitials(name: string) {
    return name
        .split(" ")
        .filter(Boolean)
        .slice(0, 2)
        .map((part) => part[0])
        .join("");
}
