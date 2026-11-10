import { useEffect, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { Plus, Search, UserRoundMinus } from "lucide-react";
import { type AddProjectMemberInput, type AssignableProjectRole, addProjectMemberSchema } from "@rinia/shared";
import { useForm, useWatch } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { Avatar } from "@/components/base/avatar/avatar";
import { Button } from "@/components/base/buttons/button";
import { ButtonUtility } from "@/components/base/buttons/button-utility";
import { Alert } from "@/components/base/feedback/alert";
import { Input } from "@/components/base/input/input";
import { EmptyState } from "@/components/feedback/empty-state";
import { ErrorMessage } from "@/components/feedback/error-message";
import { LoadingState } from "@/components/feedback/loading-state";
import { ControlledInput } from "@/components/form/controlled-input";
import { ConfirmDialog } from "@/components/overlay/confirm-dialog";
import { ModalDialog } from "@/components/overlay/modal-dialog";
import { SettingsCard, SettingsHeading, SettingsItemRow, SettingsRowActions } from "@/components/settings/settings-layout";
import { ApiError } from "@/lib/api-client";
import { useAddProjectMember, useMemberLookup, useProjectMembers, useRemoveProjectMember } from "../hooks/use-project-members";
import { useProjectPermissions } from "../hooks/use-project-permissions";
import { MemberRoleControl, RolePicker, TransferOwnershipButton } from "./member-role";

export const MembersPanel = ({ projectId, canManage }: { projectId: string; canManage: boolean }) => {
    const { t, i18n } = useTranslation();
    const { data: members, isLoading, isError } = useProjectMembers(projectId);
    const permissions = useProjectPermissions(projectId);
    const removeMutation = useRemoveProjectMember(projectId);
    const [search, setSearch] = useState("");
    const filtered = members?.filter((member) => `${member.name} ${member.username} ${member.email ?? ""}`.toLowerCase().includes(search.trim().toLowerCase()));

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
                        {canManage && (
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
                    illustration={search.trim() ? "crate" : "briefcase"}
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
                            description={member.email ?? `@${member.username}`}
                        >
                            <span className="hidden text-[13px] whitespace-nowrap text-tertiary sm:inline">
                                {t("settings.joinedOnDate", {
                                    date: new Intl.DateTimeFormat(i18n.language, { dateStyle: "medium" }).format(new Date(member.joinedAt)),
                                })}
                            </span>
                            <span className="flex w-32 justify-end text-[13px]">
                                <MemberRoleControl projectId={projectId} member={member} />
                            </span>
                            {canManage && (
                                <span className="flex w-16 justify-end gap-1">
                                    <TransferOwnershipButton projectId={projectId} member={member} />
                                    {permissions.canManage(member.role) && (
                                        <SettingsRowActions>
                                            <ConfirmDialog
                                                trigger={
                                                    <ButtonUtility
                                                        icon={UserRoundMinus}
                                                        size="sm"
                                                        color="tertiary"
                                                        tooltip={`${t("settings.removeMember")} ${member.name}`}
                                                        isDisabled={removeMutation.isPending}
                                                    />
                                                }
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
    const [role, setRole] = useState<AssignableProjectRole>("member");
    // The lookup waits for a pause in typing, so it does not ask about every letter.
    const typed = (useWatch({ control, name: "username" }) ?? "").trim().toLowerCase().replace(/^@/, "");
    const [username, setUsername] = useState("");
    useEffect(() => {
        const timer = setTimeout(() => setUsername(typed), 300);
        return () => clearTimeout(timer);
    }, [typed]);
    const lookup = useMemberLookup(projectId, username);
    const checking = !!typed && (typed !== username || lookup.isFetching);
    const settled = !!typed && !checking;
    const found = settled ? (lookup.data?.user ?? null) : null;
    const isMember = !!found && !!lookup.data?.isMember;

    return (
        <form
            className="space-y-5"
            noValidate
            onSubmit={handleSubmit((data) =>
                mutation.mutate({ username: data.username.replace(/^@/, ""), role }, {
                    onSuccess: onClose,
                    onError: (error) => setError("root", { message: error instanceof ApiError ? error.message : t("settings.couldNotAddMember") }),
                }),
            )}
        >
            <ControlledInput
                control={control}
                name="username"
                label={t("settings.username")}
                placeholder={t("settings.username")}
                isRequired
                autoFocus
                isDisabled={mutation.isPending}
            />
            {typed && (
                <div aria-live="polite" className="space-y-2">
                    {checking && <p className="text-[13px] text-tertiary">{t("settings.checkingUser")}</p>}
                    {settled && lookup.isError && <Alert tone="error">{t("settings.couldNotCheckUser")}</Alert>}
                    {settled && lookup.data && !found && <Alert tone="warning">{t("settings.userNotFound", { username: typed })}</Alert>}
                    {found && (
                        <div className="flex items-center gap-3 rounded-lg border border-secondary px-3 py-3">
                            <Avatar src={found.avatarUrl ?? undefined} initials={memberInitials(found.name)} size="sm" />
                            <div className="min-w-0">
                                <p className="truncate text-sm font-medium text-primary">{found.name}</p>
                                <p className="truncate text-[13px] text-tertiary">@{found.username}</p>
                            </div>
                        </div>
                    )}
                    {isMember && <p className="text-[13px] text-tertiary">{t("settings.userAlreadyMember", { username: found!.username })}</p>}
                </div>
            )}
            <div className="flex items-center justify-between gap-3">
                <span className="text-sm font-medium text-secondary">{t("settings.role")}</span>
                <RolePicker value={role} onChange={setRole} isDisabled={mutation.isPending} label={t("settings.role")} className="w-40" />
            </div>
            {formState.errors.root && <Alert tone="error">{formState.errors.root.message}</Alert>}
            <div className="flex justify-end gap-2">
                <Button color="secondary" size="lg" isDisabled={mutation.isPending} onClick={onClose}>
                    {t("common.cancel")}
                </Button>
                <Button type="submit" size="lg" isLoading={mutation.isPending} isDisabled={!found || isMember}>
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
