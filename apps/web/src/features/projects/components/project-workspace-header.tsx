import type { ReactNode } from "react";
import type { PresenceViewer } from "@rinia/shared";
import { ChevronRight } from "lucide-react";
import { Link } from "react-router";
import { ButtonUtility } from "@/components/base/buttons/button-utility";
import { AppIcons } from "@/components/foundations/icons";
import { MobileBackButton } from "@/components/layout/app-shell";
import { ContextMenuButton } from "@/components/overlay/context-menu-provider";
import type { FavoriteTarget } from "@/features/favorites/api";
import { FavoriteStar } from "@/features/favorites/components/favorite-star";
import { useProject } from "@/features/projects/hooks/use-project";
import { useProjectPermissions } from "@/features/projects/hooks/use-project-permissions";
import { useProjects } from "@/features/projects/hooks/use-projects";
import { PresenceAvatars } from "@/features/realtime/components/presence-avatars";
import { ProjectIcon } from "./project-icon";
import { useTranslation } from "react-i18next";
import { urls } from "@/lib/urls";
import { repositoryHost } from "@/features/projects/lib/repository";
import { pillTab } from "@/components/base/pill-tab";

export function ProjectWorkspaceHeader({
    projectId,
    activeView,
    actions,
    hideSection = false,
    favorite,
    crumb,
    viewers,
}: {
    projectId: string;
    actions?: ReactNode;
    /** Tabbed home screens already name the section in their tabs. */
    hideSection?: boolean;
    /** What the star favorites. Defaults to the project, or its issue list on issue screens; `null` hides it. */
    favorite?: FavoriteTarget | null;
    /** A page inside the section, such as a saved view, named after it. */
    crumb?: ReactNode;
    /** Other people on the same page, shown before the actions. */
    viewers?: PresenceViewer[];
    activeView: "overview" | "members" | "issues" | "board" | "documents" | "settings" | "views";
}) {
    const { data: projectData } = useProject(projectId);
    const { data: projects } = useProjects();
    const { can } = useProjectPermissions(projectId);
    const project = projectData ?? projects?.find((candidate) => candidate.id === projectId);
    const { t } = useTranslation();
    const favoriteTarget: FavoriteTarget | null =
        favorite !== undefined
            ? favorite
            : activeView === "overview" || activeView === "members"
              ? { kind: "project", projectId }
              : activeView === "issues" || activeView === "board"
                ? { kind: "issues", projectId }
                : null;
    const showSection = !hideSection && activeView !== "overview" && activeView !== "members";
    const title = activeView === "views" ? t("views.title") : activeView === "issues" || activeView === "board" ? t("nav.issues") : activeView === "documents" ? t("nav.documents") : activeView === "settings" ? t("nav.projectSettings") : t("nav.overview");
    // Phones have no sidebar to switch sections from, so the section pills sit under the header there.
    const sections =
        project && !crumb && activeView !== "settings" && activeView !== "members"
            ? ([
                  ["overview", t("nav.overview"), urls.project(project.issueKey)],
                  ["issues", t("nav.issues"), urls.issues(project.issueKey)],
                  ["documents", t("nav.documents"), urls.documents(project.issueKey)],
                  ["views", t("views.title"), urls.views(project.issueKey)],
              ] as const)
            : null;
    return (
        <>
        <header className="flex h-11 shrink-0 select-none items-center justify-between gap-3 border-b border-subtle px-3 max-md:border-b-0" data-print-hide>
            <div className="flex min-w-0 items-center gap-1 text-[13px]">
                <MobileBackButton fallback={urls.home()} />
                <span className="flex min-w-0 items-center gap-2" data-project-context="true" data-project-id={projectId} data-project-name={project?.name ?? t("projects.project")} data-project-issue-key={project?.issueKey ?? ""}>
                    <ProjectIcon icon={project?.iconAppearance ?? project?.icon} className="size-4 shrink-0" />
                    <Link to={project ? urls.project(project.issueKey) : "/"} className="truncate text-secondary hover:text-primary">{project?.name ?? t("projects.project")}</Link>
                </span>
                {/* With a page inside the section, narrow screens skip the section so the page's own name keeps the room. */}
                {showSection && (
                    <>
                        <ChevronRight className={`size-3 shrink-0 text-placeholder ${crumb ? "max-sm:hidden" : ""}`} aria-hidden="true" />
                        {crumb ? <Link to={activeView === "views" ? urls.views(project?.issueKey ?? "") : urls.issues(project?.issueKey ?? "")} className="truncate text-secondary hover:text-primary max-sm:hidden">{title}</Link> : <span className="truncate text-primary">{title}</span>}
                    </>
                )}
                {crumb && (
                    <>
                        <ChevronRight className="size-3 shrink-0 text-placeholder" aria-hidden="true" />
                        <span className="flex min-w-0 items-center gap-1 text-primary">{crumb}</span>
                    </>
                )}
                {favoriteTarget && <FavoriteStar target={favoriteTarget} />}
                {project && <ContextMenuButton entity={{ type: "project", projectId, name: project.name, issueKey: project.issueKey }} className="size-6" />}
            </div>
            <div className="flex shrink-0 items-center gap-2">
                {viewers && <PresenceAvatars viewers={viewers} />}
                {actions}
                {!actions && project?.repositoryUrl && (
                    <RepositoryButton url={project.repositoryUrl} />
                )}
                {!actions && can("project.update") && project && (
                    <Link to={urls.projectSettings(project.issueKey, "general")} aria-label={t("nav.projectSettings")} className="flex size-6 items-center justify-center rounded text-tertiary hover:bg-layer-1-hover">
                        <AppIcons.Settings className="size-4" />
                    </Link>
                )}
            </div>
        </header>
        {sections && (
            <nav aria-label={t("nav.projectSections")} data-print-hide className="scrollbar-hide flex shrink-0 gap-1 overflow-x-auto border-b border-subtle px-3 pb-2 md:hidden">
                {sections.map(([view, label, to]) => {
                    const active = view === activeView || (view === "issues" && activeView === "board");
                    return (
                        <Link key={view} to={to} aria-current={active ? "page" : undefined} className={pillTab(active)}>
                            {label}
                        </Link>
                    );
                })}
            </nav>
        )}
        </>
    );
}

/** Opens the project's repository, with its host's mark (GitHub, GitLab) or a generic arrow for anything else. */
function RepositoryButton({ url }: { url: string }) {
    const { t } = useTranslation();
    const host = repositoryHost(url);
    return <ButtonUtility icon={host.icon} color="tertiary" tooltip={host.name ? t("projects.openRepositoryOn", { host: host.name }) : t("projects.openRepository")} href={url} target="_blank" rel="noopener noreferrer" />;
}
