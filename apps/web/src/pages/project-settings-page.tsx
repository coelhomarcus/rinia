import { ChevronRight, Circle, Tag, Users } from "lucide-react";
import { Link, useParams } from "react-router";
import { AppIcons } from "@/components/foundations/icons";
import { SettingsGroup, SettingsLinkRow, SettingsPage } from "@/components/settings/settings-layout";
import { ColumnsPanel } from "@/features/board/components/columns-panel";
import { useColumns } from "@/features/board/hooks/use-board";
import { CategoriesPanel } from "@/features/categories/components/categories-panel";
import { useCategories } from "@/features/categories/hooks/use-categories";
import { MembersPanel } from "@/features/projects/components/members-panel";
import { ProjectDetailsPanel } from "@/features/projects/components/project-details-panel";
import { ProjectIcon } from "@/features/projects/components/project-icon";
import { useProject } from "@/features/projects/hooks/use-project";
import { useProjectMembers } from "@/features/projects/hooks/use-project-members";
import { useProjectPermissions } from "@/features/projects/hooks/use-project-permissions";
import { useTranslation } from "react-i18next";
import { urls } from "@/lib/urls";
import { useRouteProject } from "@/features/projects/route-project";
import { NotFound } from "./not-found";

const sections = { general: ProjectDetailsPanel, states: ColumnsPanel, members: MembersPanel, labels: CategoriesPanel };

export function ProjectSettingsPage() {
    const { section } = useParams();
    const { projectId, projectKey } = useRouteProject();
    const { isProjectOwner } = useProjectPermissions(projectId);
    const { data: project } = useProject(projectId);
    const { t } = useTranslation();
    if (!section) return <ProjectSettingsHub projectId={projectId} projectKey={projectKey} />;
    const Panel = sections[section as keyof typeof sections];
    if (!Panel) return <NotFound />;
    return (
        <SettingsPage
            title={section === "general" ? t("settings.general") : undefined}
            description={section === "general" ? t("settings.manageDetails") : undefined}
            back={{
                to: urls.projectSettings(projectKey),
                label: project?.name ?? t("projects.project"),
                icon: <ProjectIcon icon={project?.iconAppearance ?? project?.icon} className="size-3.5 shrink-0" />,
            }}
        >
            <Panel key={`${projectId}:${section}`} projectId={projectId} isProjectOwner={isProjectOwner} />
        </SettingsPage>
    );
}

/** Entry point for one project's settings, like a Linear team page. */
function ProjectSettingsHub({ projectId, projectKey }: { projectId: string; projectKey: string }) {
    const { t } = useTranslation();
    const { data: project } = useProject(projectId);
    const { data: members } = useProjectMembers(projectId);
    const { data: columns } = useColumns(projectId);
    const { data: labels } = useCategories(projectId);
    const base = urls.projectSettings(projectKey);
    const countOrNone = (count: number | undefined, key: "settings.memberCount" | "settings.stateCount" | "settings.labelCount") => (count === undefined ? undefined : count === 0 ? t("settings.none") : t(key, { count }));

    return (
        <SettingsPage
            title={project?.name ?? t("projects.project")}
            description={t("settings.projectAccess")}
            back={{ to: "/settings/preferences", label: t("nav.settings") }}
            aside={
                <Link to={urls.project(projectKey)} className="flex items-center gap-1 text-[13px] font-medium text-secondary hover:text-primary">
                    {t("settings.projectOverview")}
                    <ChevronRight className="size-3.5" />
                </Link>
            }
        >
            <SettingsGroup>
                <SettingsLinkRow to={`${base}/general`} icon={AppIcons.Settings} title={t("settings.general")} description={t("settings.generalSummary")} />
                <SettingsLinkRow to={`${base}/members`} icon={Users} title={t("settings.members")} description={t("settings.membersSummary")} value={countOrNone(members?.length, "settings.memberCount")} />
            </SettingsGroup>
            <SettingsGroup title={t("settings.issuesSection")}>
                <SettingsLinkRow to={`${base}/states`} icon={Circle} title={t("settings.states")} description={t("settings.statesSummary")} value={countOrNone(columns?.length, "settings.stateCount")} />
                <SettingsLinkRow to={`${base}/labels`} icon={Tag} title={t("settings.labels")} description={t("settings.labelsSummary")} value={countOrNone(labels?.length, "settings.labelCount")} />
            </SettingsGroup>
        </SettingsPage>
    );
}
