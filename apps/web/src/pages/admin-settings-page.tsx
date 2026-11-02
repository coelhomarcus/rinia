import { ErrorMessage } from "@/components/feedback/error-message";
import { LoadingState } from "@/components/feedback/loading-state";
import { SettingsGroup, SettingsLinkRow, SettingsPage } from "@/components/settings/settings-layout";
import { useAdminProjects } from "@/features/admin/hooks/use-admin";
import { useAuth } from "@/features/auth/hooks/use-auth";
import { ProjectIcon } from "@/features/projects/components/project-icon";
import { urls } from "@/lib/urls";
import { useTranslation } from "react-i18next";
import { NotFound } from "./not-found";

export function AdminSettingsPage() {
    const { t } = useTranslation();
    const { user } = useAuth();
    if (!user?.isAdmin) return <NotFound />;
    return (
        <SettingsPage title={t("nav.administration")} description={t("settings.administrationDescription")}>
            <AdminProjects />
        </SettingsPage>
    );
}

/** Every project on the instance, with who owns it and how big it is. Opening one shows its people, never its content. */
function AdminProjects() {
    const { t } = useTranslation();
    const { data: projects, isLoading, isError } = useAdminProjects();
    return (
        <SettingsGroup title={t("settings.adminProjects")} description={t("settings.adminProjectsDescription")}>
            {isLoading && <LoadingState className="py-6" />}
            {isError && (
                <div className="py-3">
                    <ErrorMessage message={t("settings.couldNotLoadAdminProjects")} />
                </div>
            )}
            {projects?.length === 0 && <p className="py-4 text-[13px] text-tertiary">{t("projects.noProjects")}</p>}
            {projects?.map((project) => (
                <SettingsLinkRow
                    key={project.id}
                    to={urls.adminProject(project.id)}
                    leading={
                        <span className="grid size-8 shrink-0 place-items-center rounded-md bg-layer-2 text-secondary">
                            <ProjectIcon icon={project.iconAppearance ?? project.icon} className="size-4" />
                        </span>
                    }
                    title={project.name}
                    description={t("settings.adminProjectSummary", { owner: project.owner?.name ?? t("settings.noOwner"), members: t("settings.memberCount", { count: project.memberCount }) })}
                    value={t("settings.adminIssueCount", { count: project.issueCount })}
                />
            ))}
        </SettingsGroup>
    );
}
