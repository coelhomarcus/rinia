import { SettingsOutline } from "@makeplane/propel/icons";
import { Link } from "react-router";
import { Avatar } from "@/components/base/avatar/avatar";
import { ContextMenuButton } from "@/components/overlay/context-menu-provider";
import type { ProjectCardSummary } from "../api";
import { ProjectCoverHeader } from "./project-cover-header";
import { useTranslation } from "react-i18next";
import { urls } from "@/lib/urls";

export const ProjectCard = ({ project }: { project: ProjectCardSummary }) => {
    const { t, i18n } = useTranslation();
    const date = new Intl.DateTimeFormat(i18n.language, { month: "short", day: "numeric" }).format(new Date(project.createdAt));
    const memberPreview = project.memberPreview ?? [];
    const memberCount = project.memberCount ?? memberPreview.length;
    const hiddenMembers = Math.max(0, memberCount - memberPreview.length);
    return (
        <article
            className="group/project-card relative flex h-[188px] min-w-0 flex-col overflow-hidden rounded-lg border border-subtle bg-layer-2 shadow-raised-100 transition-all duration-200 ease-out hover:border-strong hover:shadow-raised-200"
            data-project-context="true"
            data-project-id={project.id}
            data-project-name={project.name}
            data-project-issue-key={project.issueKey}
        >
            <Link to={urls.project(project.issueKey)} className="flex min-h-0 flex-1 flex-col outline-none focus-visible:ring-2 focus-visible:ring-accent-strong focus-visible:ring-inset">
                <ProjectCoverHeader cover={project.cover} icon={project.iconAppearance ?? project.icon} name={project.name} issueKey={project.issueKey} />
                <div className="flex min-h-0 flex-1 flex-col justify-between p-3">
                    <p className="line-clamp-2 text-xs leading-5 text-tertiary">{project.description?.trim() || t("projects.createdOn", { date })}</p>
                    <div className="flex items-center justify-between gap-2">
                        <div className="flex min-w-0 -space-x-1.5">
                            {memberPreview.map((member) => (
                                <Avatar key={member.id} src={member.avatarUrl ?? undefined} initials={member.name.slice(0, 2).toUpperCase()} size="xs" className="ring-2 ring-[var(--bg-layer-2)]" />
                            ))}
                            {hiddenMembers > 0 && <span className="grid size-5 place-items-center rounded-full bg-surface-2 text-[10px] text-tertiary ring-2 ring-[var(--bg-layer-2)]">+{hiddenMembers}</span>}
                            {memberCount === 0 && <span className="text-[13px] italic text-placeholder">{t("projects.noMembers")}</span>}
                        </div>
                        <SettingsOutline className="size-3.5 text-placeholder transition-colors duration-200 group-hover/project-card:text-secondary" aria-hidden="true" />
                    </div>
                </div>
            </Link>
            <ContextMenuButton entity={{ type: "project", projectId: project.id, name: project.name, issueKey: project.issueKey }} className="absolute right-2 bottom-2 opacity-100 md:opacity-0 md:group-hover/project-card:opacity-100 md:group-focus-within/project-card:opacity-100" />
        </article>
    );
};
