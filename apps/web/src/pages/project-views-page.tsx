import { Layers, LayoutGrid, List, Plus, Users } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate } from "react-router";
import { Button } from "@/components/base/buttons/button";
import { Skeleton } from "@/components/base/feedback/skeleton";
import { EmptyState } from "@/components/feedback/empty-state";
import { ErrorMessage } from "@/components/feedback/error-message";
import { FavoriteStar } from "@/features/favorites/components/favorite-star";
import { ProjectWorkspaceHeader } from "@/features/projects/components/project-workspace-header";
import { useRouteProject } from "@/features/projects/route-project";
import type { SavedView } from "@/features/views/api";
import { useViews } from "@/features/views/hooks/use-views";
import { paramsFromFilters } from "@/features/views/lib/view-filters";
import { urls } from "@/lib/urls";

/** `/project/RIN/views`: the project's saved views, the person's own and the ones shared with the project. */
export const ProjectViewsPage = () => {
    const { t } = useTranslation();
    const { projectId, projectKey } = useRouteProject();
    const navigate = useNavigate();
    const { data: views, isLoading, isError } = useViews(projectId);
    // A view starts from the issue list: the filter row opens there, and Save names what the filters show.
    const startView = () => navigate(urls.issues(projectKey), { state: { newView: true } });

    return (
        <div className="flex h-full min-h-0 flex-col bg-surface-1">
            <ProjectWorkspaceHeader
                projectId={projectId}
                activeView="views"
                favorite={null}
                actions={
                    <Button size="md" color="secondary" className="rounded-full" iconLeading={Plus} onClick={startView}>
                        {t("views.newView")}
                    </Button>
                }
            />
            <main className="min-h-0 flex-1 overflow-y-auto">
                {isLoading && (
                    <div role="status" aria-label={t("common.loading")} className="divide-y divide-subtle">
                        {["one", "two", "three"].map((key) => (
                            <div key={key} className="flex h-12 items-center gap-3 px-4">
                                <Skeleton className="size-4" />
                                <Skeleton className="h-3 w-40" />
                                <Skeleton className="ml-auto h-3 w-24" />
                            </div>
                        ))}
                    </div>
                )}
                {isError && (
                    <div className="p-6">
                        <ErrorMessage message={t("views.couldNotLoadList")} />
                    </div>
                )}
                {views?.length === 0 && (
                    <EmptyState
                        framed={false}
                        className="h-full py-16"
                        illustration="layout"
                        title={t("views.title")}
                        description={
                            <>
                                {t("views.emptyDescription")} {t("views.emptyHint")}
                            </>
                        }
                        action={
                            <Button size="md" className="rounded-full" onClick={startView}>
                                {t("views.createNew")}
                            </Button>
                        }
                    />
                )}
                {!!views?.length && (
                    <ul className="divide-y divide-subtle">
                        {views.map((view) => (
                            <ViewRow key={view.id} view={view} projectKey={projectKey} />
                        ))}
                    </ul>
                )}
            </main>
        </div>
    );
};

function ViewRow({ view, projectKey }: { view: SavedView; projectKey: string }) {
    const { t } = useTranslation();
    const LayoutIcon = view.filters.view === "board" ? LayoutGrid : List;
    return (
        <li className="animate-enter group relative flex h-12 items-center gap-3 px-4 transition-colors hover:bg-layer-transparent-hover">
            <Layers className="size-4 shrink-0 text-tertiary" aria-hidden="true" />
            <Link
                to={`${urls.view(projectKey, view)}?${paramsFromFilters(view.filters)}`}
                className="min-w-0 truncate text-[13px] text-primary after:absolute after:inset-0"
            >
                {view.name}
            </Link>
            <FavoriteStar target={{ kind: "view", projectId: view.projectId, viewId: view.id }} className="relative z-10" />
            <span className="ml-auto flex shrink-0 items-center gap-3 text-xs text-tertiary">
                <LayoutIcon className="size-3.5" aria-label={view.filters.view === "board" ? t("projects.board") : t("issue.list")} />
                <span className="flex items-center gap-1">
                    {view.shared && <Users className="size-3.5" aria-hidden="true" />}
                    {view.shared ? t("views.sharedLabel") : t("views.personal")}
                </span>
                <span className="hidden truncate sm:inline">{view.owner.name}</span>
            </span>
        </li>
    );
}
