import { createContext, useContext, useEffect, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation, useNavigate, useParams } from "react-router";
import { LoadingState } from "@/components/feedback/loading-state";
import { NotFound } from "@/pages/not-found";
import { useTranslation } from "react-i18next";
import { useRealtimeChannels } from "@/features/realtime/use-realtime";
import { getProjectByKey } from "./api";
import { useProjects } from "./hooks/use-projects";

interface RouteProject {
    projectId: string;
    projectKey: string;
}

const RouteProjectContext = createContext<RouteProject | null>(null);

/** The project named by the `:projectKey` URL segment, resolved to its database id. */
export function useRouteProject(): RouteProject {
    const project = useContext(RouteProjectContext);
    if (!project) throw new Error("useRouteProject must be used inside ProjectRoute");
    return project;
}

/**
 * Resolves `/project/:projectKey/...` (and the settings equivalent) to a project. A lowercase key or a key the
 * project used before a rename is rewritten to the current key in place.
 */
export function ProjectRoute({ children }: { children: ReactNode }) {
    const { projectKey = "" } = useParams<{ projectKey: string }>();
    const { t } = useTranslation();
    const location = useLocation();
    const navigate = useNavigate();
    const key = projectKey.toUpperCase();
    const { data: projects, isLoading: projectsLoading } = useProjects();
    const listed = projects?.find((project) => project.issueKey === key);
    const lookup = useQuery({
        queryKey: ["projects", "by-key", key],
        queryFn: () => getProjectByKey(key),
        enabled: !!key && !!projects && !listed,
        retry: false,
    });
    const project = listed ?? lookup.data;
    // Every page inside a project updates when someone else changes it.
    useRealtimeChannels([project && `project:${project.id}`]);

    useEffect(() => {
        if (!project || project.issueKey === projectKey) return;
        const pathname = location.pathname.replace(/(\/project\/)[^/]+/, `$1${project.issueKey}`);
        void navigate(`${pathname}${location.search}`, { replace: true });
    }, [location.pathname, location.search, navigate, project, projectKey]);

    if (!project) return projectsLoading || lookup.isLoading ? <LoadingState label={t("common.loadingPage")} className="p-6" /> : <NotFound />;
    return <RouteProjectContext.Provider value={{ projectId: project.id, projectKey: project.issueKey }}>{children}</RouteProjectContext.Provider>;
}
