import { useState } from "react";
import { ErrorMessage } from "@/components/feedback/error-message";
import { LoadingState } from "@/components/feedback/loading-state";
import { SettingsCard, SettingsLinkRow, SettingsPage } from "@/components/settings/settings-layout";
import { AdminSearch } from "@/features/admin/components/admin-search";
import { useAdminProjects } from "@/features/admin/hooks/use-admin";
import { useAuth } from "@/features/auth/hooks/use-auth";
import { ProjectIcon } from "@/features/projects/components/project-icon";
import { urls } from "@/lib/urls";
import { useTranslation } from "react-i18next";
import { NotFound } from "./not-found";

/** Every project on the instance, with who owns it and how big it is. Opening one shows its people, never its content. */
export function AdminProjectsPage() {
    const { t } = useTranslation();
    const { user } = useAuth();
    const { data: projects, isLoading, isError } = useAdminProjects(user?.isAdmin === true);
    const [query, setQuery] = useState("");
    if (!user?.isAdmin) return <NotFound />;
    const needle = query.trim().toLowerCase();
    const shown = projects?.filter((project) => !needle || [project.name, project.issueKey, project.owner?.name ?? ""].some((value) => value.toLowerCase().includes(needle)));
    return (
        <SettingsPage title={t("nav.adminProjects")} description={t("settings.adminProjectsDescription")}>
            {projects && projects.length > 0 && <AdminSearch value={query} onChange={setQuery} placeholder={t("settings.searchAdminProjects")} total={t("settings.projectCount", { count: projects.length })} />}
            <SettingsCard>
                {isLoading && <LoadingState className="py-6" />}
                {isError && (
                    <div className="py-3">
                        <ErrorMessage message={t("settings.couldNotLoadAdminProjects")} />
                    </div>
                )}
                {projects?.length === 0 && <p className="py-4 text-[13px] text-tertiary">{t("projects.noProjects")}</p>}
                {projects && projects.length > 0 && shown?.length === 0 && <p className="py-4 text-[13px] text-tertiary">{t("settings.noAdminMatches")}</p>}
                {shown?.map((project) => (
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
                        description={t("settings.adminProjectSummary", { owner: project.owner?.name ?? t("settings.noOwner"), members: t("settings.memberCount", { count: project.memberCount }) })}
                        value={t("settings.adminIssueCount", { count: project.issueCount })}
                    />
                ))}
            </SettingsCard>
        </SettingsPage>
    );
}
