import { EmptyState } from "@/components/feedback/empty-state";
import { ErrorMessage } from "@/components/feedback/error-message";
import { Skeleton } from "@/components/base/feedback/skeleton";
import { Topbar } from "@/components/layout/topbar";
import { CreateProjectModal } from "@/features/projects/components/create-project-modal";
import { ProjectCard } from "@/features/projects/components/project-card";
import { useAuth } from "@/features/auth/hooks/use-auth";
import type { ProjectCardSummary } from "@/features/projects/api";
import { useProjects } from "@/features/projects/hooks/use-projects";
import { groupProjectsByOwner } from "@/features/projects/lib/project-groups";
import { useTranslation } from "react-i18next";

export const ProjectsPage = () => {
    const { data: projects, isLoading, isError } = useProjects();
    const { t } = useTranslation();
    const { user } = useAuth();
    const groups = groupProjectsByOwner(projects ?? [], user?.id, t);

    return (
        <div className="flex h-full min-h-0 flex-col">
            <Topbar title={t("nav.projects")} actions={<CreateProjectModal />} />
            <div className="min-h-0 flex-1 overflow-y-auto p-3 lg:p-4">
                {isLoading && <ProjectListSkeleton />}

                {isError && <ErrorMessage message={t("projects.couldNotLoad")} />}

                {!isLoading && !isError && projects?.length === 0 && (
                    <EmptyState title={t("projects.noProjects")} description={t("projects.createFirst")} action={<CreateProjectModal />} />
                )}

                {groups.length === 1 && <ProjectGrid projects={groups[0].projects} />}
                {groups.length > 1 && (
                    <div className="flex flex-col gap-6">
                        {groups.map((group) => (
                            <section key={group.key} aria-label={group.label}>
                                <h2 className="mb-2 px-1 text-[13px] font-medium text-tertiary">{group.label}</h2>
                                <ProjectGrid projects={group.projects} />
                            </section>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};

function ProjectGrid({ projects }: { projects: ProjectCardSummary[] }) {
    return <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">{projects.map((project) => <ProjectCard key={project.id} project={project} />)}</div>;
}

function ProjectListSkeleton() {
    const { t } = useTranslation();
        return <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3" aria-label={t("common.loading")} role="status">{["one", "two", "three"].map((key) => <div key={key} className="h-[188px] overflow-hidden rounded-lg border border-subtle shadow-raised-100"><Skeleton className="h-24 rounded-none" /><div className="space-y-2 p-3"><Skeleton className="h-3 w-full" /><Skeleton className="h-3 w-3/5" /></div></div>)}</div>;
}
