import { useParams } from "react-router";
import { Avatar } from "@/components/base/avatar/avatar";
import { ErrorMessage } from "@/components/feedback/error-message";
import { LoadingState } from "@/components/feedback/loading-state";
import { SettingsControl, SettingsGroup, SettingsItemRow, SettingsPage } from "@/components/settings/settings-layout";
import type { AdminPerson } from "@/features/admin/api";
import { useAdminProject } from "@/features/admin/hooks/use-admin";
import { useAuth } from "@/features/auth/hooks/use-auth";
import { memberInitials } from "@/features/projects/components/members-panel";
import { urls } from "@/lib/urls";
import { useTranslation } from "react-i18next";
import { NotFound } from "./not-found";

/** One project as a site admin sees it: name, people and size. Nothing written in the project is loaded here. */
export function AdminProjectSettingsPage() {
    const { t, i18n } = useTranslation();
    const { user } = useAuth();
    const { projectId = "" } = useParams();
    const { data: project, isLoading, isError } = useAdminProject(user?.isAdmin ? projectId : "");
    if (!user?.isAdmin) return <NotFound />;
    const back = { to: urls.admin(), label: t("nav.administration") };
    if (isLoading) return <SettingsPage back={back}><LoadingState className="py-10" /></SettingsPage>;
    if (isError || !project) return <SettingsPage back={back}><ErrorMessage message={t("settings.couldNotLoadAdminProject")} /></SettingsPage>;

    const date = (value: string) => new Intl.DateTimeFormat(i18n.language, { dateStyle: "medium" }).format(new Date(value));
    return (
        <SettingsPage back={back} title={project.name} description={t("settings.adminContentNote")}>
            <SettingsGroup title={t("settings.general")}>
                <SettingsControl title={t("settings.projectKey")}>
                    <span className="font-mono text-[13px] text-secondary">{project.issueKey}</span>
                </SettingsControl>
                <SettingsControl title={t("settings.owner")}>
                    {project.owner ? <Person person={project.owner} /> : <span className="text-[13px] text-tertiary">{t("settings.noOwner")}</span>}
                </SettingsControl>
                <SettingsControl title={t("settings.createdBy")}>
                    <Person person={project.createdBy} />
                </SettingsControl>
                <SettingsControl title={t("settings.createdOn")}>
                    <span className="text-[13px] text-secondary">{date(project.createdAt)}</span>
                </SettingsControl>
                <SettingsControl title={t("settings.lastChanged")}>
                    <span className="text-[13px] text-secondary">{date(project.updatedAt)}</span>
                </SettingsControl>
            </SettingsGroup>
            <SettingsGroup title={t("settings.size")}>
                <SettingsControl title={t("settings.members")}>
                    <span className="text-[13px] text-secondary">{t("settings.memberCount", { count: project.members.length })}</span>
                </SettingsControl>
                <SettingsControl title={t("settings.issues")}>
                    <span className="text-[13px] text-secondary">{t("settings.adminIssueCount", { count: project.issueCount })}</span>
                </SettingsControl>
                <SettingsControl title={t("settings.documents")}>
                    <span className="text-[13px] text-secondary">{t("settings.documentCount", { count: project.documentCount })}</span>
                </SettingsControl>
            </SettingsGroup>
            <SettingsGroup title={t("settings.members")}>
                {project.members.map((member) => (
                    <SettingsItemRow
                        key={member.id}
                        leading={<Avatar src={member.avatarUrl ?? undefined} initials={memberInitials(member.name)} size="sm" />}
                        title={member.name}
                        description={`@${member.username}`}
                    >
                        <span className="hidden text-[13px] whitespace-nowrap text-tertiary sm:inline">{t("settings.joinedOnDate", { date: date(member.joinedAt) })}</span>
                        <span className="w-24 text-right text-[13px] text-secondary">{member.role === "owner" ? t("settings.owner") : t("settings.member")}</span>
                    </SettingsItemRow>
                ))}
            </SettingsGroup>
        </SettingsPage>
    );
}

function Person({ person }: { person: AdminPerson }) {
    return (
        <span className="flex min-w-0 items-center gap-2">
            <Avatar src={person.avatarUrl ?? undefined} initials={memberInitials(person.name)} size="xs" />
            <span className="truncate text-[13px] text-secondary">{person.name}</span>
        </span>
    );
}
