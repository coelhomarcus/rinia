import { useState } from "react";
import { Link, useParams } from "react-router";
import { Avatar } from "@/components/base/avatar/avatar";
import { Button } from "@/components/base/buttons/button";
import { Alert } from "@/components/base/feedback/alert";
import { ErrorMessage } from "@/components/feedback/error-message";
import { LoadingState } from "@/components/feedback/loading-state";
import { ConfirmDialog } from "@/components/overlay/confirm-dialog";
import { SettingsControl, SettingsGroup, SettingsLinkRow, SettingsPage } from "@/components/settings/settings-layout";
import type { AdminUser } from "@/features/admin/api";
import { UserBadges } from "@/features/admin/components/user-badges";
import { useAdminUser, useResetAdminUserPassword, useRevokeAdminUserSessions, useUpdateAdminUser } from "@/features/admin/hooks/use-admin";
import { useAuth } from "@/features/auth/hooks/use-auth";
import { CopyField } from "@/features/integrations/components/copy-field";
import { ProjectIcon } from "@/features/projects/components/project-icon";
import { memberInitials } from "@/features/projects/components/members-panel";
import { ApiError } from "@/lib/api-client";
import { urls } from "@/lib/urls";
import { useTranslation } from "react-i18next";
import { NotFound } from "./not-found";

/** One account as a site admin sees it: who it is, where it works, and what can be done about it. */
export function AdminUserPage() {
    const { t, i18n } = useTranslation();
    const { user: viewer } = useAuth();
    const { userId = "" } = useParams();
    const { data: user, isLoading, isError } = useAdminUser(viewer?.isAdmin ? userId : "");
    if (!viewer?.isAdmin) return <NotFound />;
    const back = { to: urls.adminUsers(), label: t("nav.adminUsers") };
    if (isLoading) return <SettingsPage back={back}><LoadingState className="py-10" /></SettingsPage>;
    if (isError || !user) return <SettingsPage back={back}><ErrorMessage message={t("settings.couldNotLoadAdminUser")} /></SettingsPage>;

    const date = (value: string) => new Intl.DateTimeFormat(i18n.language, { dateStyle: "medium" }).format(new Date(value));
    const isSelf = user.id === viewer.id;
    return (
        <SettingsPage back={back} title={user.name} description={`@${user.username}`} aside={<Avatar src={user.avatarUrl ?? undefined} initials={memberInitials(user.name)} size="lg" />}>
            {user.suspendedAt && (
                <div className="-mt-4 mb-8">
                    <Alert tone="error">{t("settings.suspendedOn", { date: date(user.suspendedAt) })}</Alert>
                </div>
            )}
            <SettingsGroup title={t("settings.general")}>
                <SettingsControl title={t("settings.email")}>
                    <span className="truncate text-[13px] text-secondary select-text">{user.email}</span>
                </SettingsControl>
                <SettingsControl title={t("settings.instanceRole")}>
                    <span className="flex items-center gap-2 text-[13px] text-secondary">
                        {user.isAdmin ? t("settings.adminRole") : t("settings.member")}
                        <UserBadges isAdmin={false} suspended={user.suspendedAt !== null} isSelf={isSelf} />
                    </span>
                </SettingsControl>
                <SettingsControl title={t("settings.joinedInstance")}>
                    <span className="text-[13px] text-secondary">{date(user.createdAt)}</span>
                </SettingsControl>
                <SettingsControl title={t("nav.apiTokens")}>
                    <span className="text-[13px] text-secondary">{t("settings.apiTokenCount", { count: user.apiTokenCount })}</span>
                </SettingsControl>
            </SettingsGroup>

            <SettingsGroup title={t("settings.projects")} description={t("settings.adminUserProjectsDescription")}>
                {user.projects.length === 0 && <p className="flex min-h-15 items-center text-[13px] text-tertiary">{t("settings.noUserProjects")}</p>}
                {user.projects.map((project) => (
                    <SettingsLinkRow
                        key={project.id}
                        to={urls.adminProject(project.id)}
                        leading={
                            <span className="grid size-8 shrink-0 place-items-center rounded-md bg-layer-2 text-secondary">
                                <ProjectIcon icon={project.iconAppearance ?? project.icon} className="size-4" />
                            </span>
                        }
                        title={
                            <>
                                <span className="truncate">{project.name}</span>
                                <span className="shrink-0 font-mono text-xs font-normal text-tertiary">{project.issueKey}</span>
                            </>
                        }
                        description={t("settings.joinedOnDate", { date: date(project.joinedAt) })}
                        value={project.role === "owner" ? t("settings.owner") : t("settings.member")}
                    />
                ))}
            </SettingsGroup>

            {isSelf ? (
                <p className="mt-12 px-4 text-[13px] text-tertiary">
                    {t("settings.ownAccountNote")}{" "}
                    <Link to="/settings/profile" className="text-primary underline decoration-subtle underline-offset-2 hover:decoration-current">
                        {t("nav.profile")}
                    </Link>
                    .
                </p>
            ) : (
                <UserActions user={user} />
            )}
        </SettingsPage>
    );
}

/** What an admin can do about someone else's account. Each step is confirmed, and none can be taken on one's own. */
function UserActions({ user }: { user: AdminUser }) {
    const { t } = useTranslation();
    const update = useUpdateAdminUser(user.id);
    const revokeSessions = useRevokeAdminUserSessions(user.id);
    const resetPassword = useResetAdminUserPassword(user.id);
    const [password, setPassword] = useState<string | null>(null);
    const [notice, setNotice] = useState<string | null>(null);
    const failed = [update, revokeSessions, resetPassword].find((mutation) => mutation.isError);
    const suspended = user.suspendedAt !== null;
    const names = { name: user.name, username: user.username };

    return (
        <>
            <SettingsGroup title={t("settings.access")}>
                {(failed || notice) && (
                    <div className="py-4">
                        {failed ? <Alert tone="error">{failed.error instanceof ApiError ? failed.error.message : t("settings.couldNotUpdateUser")}</Alert> : <Alert tone="success">{notice}</Alert>}
                    </div>
                )}
                <SettingsControl title={t("settings.adminRole")} description={user.isAdmin ? t("settings.removeAdminHint") : t("settings.makeAdminHint")}>
                    <ConfirmDialog
                        trigger={<Button size="sm" color="secondary" isLoading={update.isPending && update.variables?.isAdmin !== undefined}>{user.isAdmin ? t("settings.removeAdmin") : t("settings.makeAdmin")}</Button>}
                        title={user.isAdmin ? t("settings.removeAdmin") : t("settings.makeAdmin")}
                        description={user.isAdmin ? t("settings.removeAdminDescription", names) : t("settings.makeAdminDescription", names)}
                        confirmLabel={user.isAdmin ? t("settings.removeAdmin") : t("settings.makeAdmin")}
                        onConfirm={() => {
                            setNotice(null);
                            update.mutate({ isAdmin: !user.isAdmin });
                        }}
                    />
                </SettingsControl>
                <SettingsControl title={t("settings.signOutEverywhere")} description={t("settings.signOutEverywhereHint")}>
                    <ConfirmDialog
                        trigger={<Button size="sm" color="secondary" isLoading={revokeSessions.isPending}>{t("settings.signOutEverywhere")}</Button>}
                        title={t("settings.signOutEverywhere")}
                        description={t("settings.signOutEverywhereDescription", names)}
                        confirmLabel={t("settings.signOutEverywhere")}
                        onConfirm={() => {
                            setNotice(null);
                            revokeSessions.mutate(undefined, { onSuccess: () => setNotice(t("settings.signedOutEverywhere", names)) });
                        }}
                    />
                </SettingsControl>
                <SettingsControl title={t("settings.resetPassword")} description={t("settings.resetPasswordHint")}>
                    <ConfirmDialog
                        trigger={<Button size="sm" color="secondary" isLoading={resetPassword.isPending}>{t("settings.resetPassword")}</Button>}
                        title={t("settings.resetPassword")}
                        description={t("settings.resetPasswordDescription", names)}
                        confirmLabel={t("settings.resetPassword")}
                        onConfirm={() => {
                            setNotice(null);
                            resetPassword.mutate(undefined, { onSuccess: setPassword });
                        }}
                    />
                </SettingsControl>
                {password && (
                    <div className="flex flex-col gap-3 py-4">
                        <div>
                            <h3 className="text-md font-medium text-primary">{t("settings.temporaryPassword")}</h3>
                            <p className="text-xs text-tertiary">{t("settings.temporaryPasswordHint", names)}</p>
                        </div>
                        <CopyField value={password} label={t("settings.temporaryPassword")} />
                        <div className="flex justify-end">
                            <Button size="sm" color="secondary" onClick={() => setPassword(null)}>
                                {t("settings.hidePassword")}
                            </Button>
                        </div>
                    </div>
                )}
            </SettingsGroup>

            <SettingsGroup title={t("settings.dangerZone")}>
                {suspended ? (
                    <SettingsControl title={t("settings.restoreAccount")} description={t("settings.restoreAccountHint")}>
                        <Button size="sm" color="secondary" isLoading={update.isPending && update.variables?.suspended === false} onClick={() => update.mutate({ suspended: false })}>
                            {t("settings.restoreAccount")}
                        </Button>
                    </SettingsControl>
                ) : (
                    <SettingsControl title={t("settings.suspendAccount")} description={t("settings.suspendAccountHint")}>
                        <ConfirmDialog
                            trigger={<Button size="sm" color="secondary-destructive" isLoading={update.isPending && update.variables?.suspended === true}>{t("settings.suspendAccount")}</Button>}
                            title={t("settings.suspendAccount")}
                            description={t("settings.suspendAccountDescription", names)}
                            confirmLabel={t("settings.suspendAccount")}
                            onConfirm={() => {
                                setNotice(null);
                                update.mutate({ suspended: true });
                            }}
                        />
                    </SettingsControl>
                )}
            </SettingsGroup>
        </>
    );
}
