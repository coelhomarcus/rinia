import { useTranslation } from "react-i18next";
import { Navigate, useLocation, useNavigate, useParams } from "react-router";
import { Button } from "@/components/base/buttons/button";
import { EmptyState } from "@/components/feedback/empty-state";
import { ErrorMessage } from "@/components/feedback/error-message";
import { LoadingState } from "@/components/feedback/loading-state";
import { useRouteProject } from "@/features/projects/route-project";
import { useViews } from "@/features/views/hooks/use-views";
import { paramsFromFilters } from "@/features/views/lib/view-filters";
import { matchDocumentSlug, urls } from "@/lib/urls";
import { ProjectIssuesPage } from "./project-issues-page";

/**
 * `/project/RIN/views/<slug-id>`: the issue page, opened the way the view was saved. The saved parameters go
 * into the address once, then the page works on the address as it does everywhere, so changing a filter
 * edits the screen without touching the view until the person saves.
 */
export const ProjectViewPage = () => {
    const { t } = useTranslation();
    const { projectId, projectKey } = useRouteProject();
    const { viewSlug = "" } = useParams();
    const location = useLocation();
    const navigate = useNavigate();
    const { data: views, isLoading, isError } = useViews(projectId);
    // Views share the document address scheme: a readable name, then the first digits of the id.
    const view = matchDocumentSlug(viewSlug, views);

    if (isLoading) return <LoadingState label={t("common.loadingPage")} className="p-6" />;
    if (isError)
        return (
            <div className="p-6">
                <ErrorMessage message={t("views.couldNotLoad")} />
            </div>
        );
    if (!view) {
        return (
            <EmptyState
                framed={false}
                className="h-full"
                illustration="layout"
                title={t("views.notFoundTitle")}
                description={t("views.notFoundDescription")}
                action={
                    <Button size="sm" color="secondary" onClick={() => navigate(urls.issues(projectKey))}>
                        {t("views.backToIssues")}
                    </Button>
                }
            />
        );
    }

    const search = paramsFromFilters(view.filters).toString();
    if (!location.search && search) return <Navigate replace to={{ search }} />;
    return <ProjectIssuesPage savedView={view} />;
};
