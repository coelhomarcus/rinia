import { useState } from "react";
import { ArrowDown, ArrowUp, Plus, UserRoundMinus } from "lucide-react";
import { Avatar } from "@/components/base/avatar/avatar";
import { Button } from "@/components/base/buttons/button";
import { ButtonUtility } from "@/components/base/buttons/button-utility";
import { Alert } from "@/components/base/feedback/alert";
import { Skeleton } from "@/components/base/feedback/skeleton";
import { ErrorMessage } from "@/components/feedback/error-message";
import { ConfirmDialog } from "@/components/overlay/confirm-dialog";
import { ModalDialog } from "@/components/overlay/modal-dialog";
import { AddMemberForm, memberInitials } from "@/features/projects/components/members-panel";
import { ProjectWorkspaceHeader } from "@/features/projects/components/project-workspace-header";
import { useProjectMembers, useRemoveProjectMember } from "@/features/projects/hooks/use-project-members";
import { useProjectPermissions } from "@/features/projects/hooks/use-project-permissions";
import { ApiError } from "@/lib/api-client";
import { useTranslation } from "react-i18next";
import { useRouteProject } from "@/features/projects/route-project";

export const ProjectMembersPage = () => {
    const { projectId } = useRouteProject();
    const { t, i18n } = useTranslation();
    const { data: members, isLoading, isError } = useProjectMembers(projectId);
    const { isProjectOwner } = useProjectPermissions(projectId);
    const removeMember = useRemoveProjectMember(projectId);
    const [descending, setDescending] = useState(false);
    const sorted = [...(members ?? [])].sort((a, b) => a.name.localeCompare(b.name, i18n.language) * (descending ? -1 : 1));
    const SortIcon = descending ? ArrowUp : ArrowDown;

    return (
        <div className="flex h-full min-h-0 flex-col bg-surface-1">
            <ProjectWorkspaceHeader projectId={projectId} activeView="members" />
            <main className="min-h-0 flex-1 overflow-y-auto px-3 pt-3">
                {isProjectOwner && (
                    <div className="mb-2 flex justify-end px-3">
                        <ModalDialog
                            trigger={<Button size="sm" color="secondary" iconLeading={Plus}>{t("settings.addMember")}</Button>}
                            title={t("settings.addMember")}
                            description={t("settings.addMemberDescription")}
                        >
                            {({ close }) => <AddMemberForm projectId={projectId} onClose={close} />}
                        </ModalDialog>
                    </div>
                )}
                {removeMember.isError && (
                    <div className="mb-3">
                        <Alert tone="error">{removeMember.error instanceof ApiError ? removeMember.error.message : t("settings.couldNotRemoveMember")}</Alert>
                    </div>
                )}
                {isError && <ErrorMessage message={t("settings.couldNotLoadMembers")} />}
                <table className="w-full table-fixed text-left text-[13px]">
                    <thead>
                        <tr className="text-xs text-tertiary">
                            <th scope="col" className="px-3 py-2 font-medium" aria-sort={descending ? "descending" : "ascending"}>
                                <button type="button" className="inline-flex items-center gap-1 hover:text-primary" onClick={() => setDescending((value) => !value)}>
                                    {t("settings.name")}
                                    <SortIcon className="size-3" aria-hidden="true" />
                                </button>
                            </th>
                            <th scope="col" className="hidden w-[28%] px-3 py-2 font-medium md:table-cell">{t("settings.email")}</th>
                            <th scope="col" className="w-40 px-3 py-2 font-medium">{t("settings.role")}</th>
                            {isProjectOwner && <th scope="col" className="w-10"><span className="sr-only">{t("settings.actions")}</span></th>}
                        </tr>
                    </thead>
                    <tbody>
                        {isLoading &&
                            Array.from({ length: 3 }, (_, index) => (
                                <tr key={index}>
                                    <td className="px-3 py-3" colSpan={isProjectOwner ? 4 : 3}><Skeleton className="h-8 w-full" /></td>
                                </tr>
                            ))}
                        {sorted.map((member) => (
                            <tr key={member.id} className="group rounded-md hover:bg-layer-transparent-hover">
                                <td className="rounded-l-md px-3 py-3">
                                    <div className="flex min-w-0 items-center gap-3">
                                        <Avatar src={member.avatarUrl ?? undefined} initials={memberInitials(member.name)} size="sm" />
                                        <div className="min-w-0">
                                            <p className="truncate font-medium text-primary">{member.name}</p>
                                            <p className="truncate text-xs text-tertiary">{member.username}</p>
                                        </div>
                                    </div>
                                </td>
                                <td className="hidden truncate px-3 py-3 text-secondary md:table-cell">{member.email}</td>
                                <td className={`px-3 py-3 ${isProjectOwner ? "" : "rounded-r-md"}`}>
                                    <span className={member.role === "owner" ? "font-medium text-accent-primary" : "text-secondary"}>
                                        {member.role === "owner" ? t("settings.owner") : t("settings.member")}
                                    </span>
                                </td>
                                {isProjectOwner && (
                                    <td className="rounded-r-md px-2 py-3">
                                        {member.role !== "owner" && (
                                            <div className="opacity-100 group-focus-within:opacity-100 group-hover:opacity-100 md:opacity-0">
                                                <ConfirmDialog
                                                    trigger={<ButtonUtility icon={UserRoundMinus} size="sm" color="tertiary" tooltip={`${t("settings.removeMember")} ${member.name}`} isDisabled={removeMember.isPending} />}
                                                    title={t("settings.removeMember")}
                                                    description={t("settings.removeMemberDescription", { name: member.name, username: member.username })}
                                                    confirmLabel={t("settings.removeMember")}
                                                    isPending={removeMember.isPending}
                                                    onConfirm={() => removeMember.mutate(member.id)}
                                                />
                                            </div>
                                        )}
                                    </td>
                                )}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </main>
        </div>
    );
};
