import type { UpdateProjectInput, UpdateProjectPageInput } from "@rinia/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router";
import { useAuth } from "@/features/auth/hooks/use-auth";
import { clearDocumentDrafts } from "@/features/documents/sessions";
import { type Project, type ProjectCardSummary, createProject, deleteProject, listProjects, updateProject, updateProjectPage } from "../api";
import { projectQueryKey } from "./use-project";

export const PROJECTS_QUERY_KEY = ["projects"] as const;

export function useProjects() {
    return useQuery({ queryKey: PROJECTS_QUERY_KEY, queryFn: listProjects });
}

export function useCreateProject() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: createProject,
        onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: PROJECTS_QUERY_KEY });
        },
    });
}

export function useUpdateProject(projectId: string) {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (input: UpdateProjectInput) => updateProject(projectId, input),
        onMutate: async (input) => {
            await Promise.all([
                queryClient.cancelQueries({ queryKey: PROJECTS_QUERY_KEY, exact: true }),
                queryClient.cancelQueries({ queryKey: projectQueryKey(projectId), exact: true }),
            ]);
            const previousProject = queryClient.getQueryData<Project>(projectQueryKey(projectId));
            const previousProjects = queryClient.getQueryData<ProjectCardSummary[]>(PROJECTS_QUERY_KEY);
            const nextAppearance =
                input.iconAppearance === undefined
                    ? {}
                    : { icon: input.iconAppearance?.type === "icon" ? input.iconAppearance.key : null };
            queryClient.setQueryData<Project>(projectQueryKey(projectId), (current) => current ? { ...current, ...input, ...nextAppearance } : current);
            queryClient.setQueryData<ProjectCardSummary[]>(PROJECTS_QUERY_KEY, (current) => current?.map((project) => project.id === projectId ? { ...project, ...input, ...nextAppearance } : project));
            return { previousProject, previousProjects };
        },
        onError: (_error, _input, context) => {
            if (context?.previousProject) queryClient.setQueryData(projectQueryKey(projectId), context.previousProject);
            if (context?.previousProjects) queryClient.setQueryData(PROJECTS_QUERY_KEY, context.previousProjects);
        },
        onSuccess: (project) => {
            queryClient.setQueryData(projectQueryKey(projectId), project);
            queryClient.setQueryData<ProjectCardSummary[]>(PROJECTS_QUERY_KEY, (current) => current?.map((item) => item.id === project.id ? { ...item, ...project } : item));
        },
        onSettled: (_project, _error, input) => {
            void queryClient.invalidateQueries({ queryKey: PROJECTS_QUERY_KEY, exact: true });
            void queryClient.invalidateQueries({ queryKey: projectQueryKey(projectId), exact: true });
            if (input.issueKey) {
                // Issue identifiers embed the key, so every cached issue now shows a stale one.
                void queryClient.invalidateQueries({ queryKey: ["projects", projectId, "issues"] });
                void queryClient.invalidateQueries({ queryKey: ["issues"] });
            }
        },
    });
}

export function useDeleteProject(project: Pick<Project, "id" | "issueKey">) {
    const { user } = useAuth();
    const queryClient = useQueryClient();
    const navigate = useNavigate();
    return useMutation({
        mutationFn: () => deleteProject(project.id),
        onSuccess: async () => {
            if (user) await clearDocumentDrafts(user.id, project.id).catch(() => console.warn("Could not clear local drafts for the deleted project."));
            void navigate("/", { replace: true, flushSync: true });
            const filters = {
                predicate: (query: { queryKey: readonly unknown[] }) =>
                    (query.queryKey[0] === "projects" && query.queryKey[1] === project.id) ||
                    (query.queryKey[0] === "issues" && typeof query.queryKey[1] === "string" && query.queryKey[1].startsWith(`${project.issueKey}-`)),
            };
            await queryClient.cancelQueries(filters);
            queryClient.removeQueries(filters);
            queryClient.setQueryData<ProjectCardSummary[]>(PROJECTS_QUERY_KEY, (old) => old?.filter((item) => item.id !== project.id));
            await queryClient.invalidateQueries({ queryKey: PROJECTS_QUERY_KEY, exact: true });
        },
    });
}

export function useUpdateProjectPage(projectId: string) {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (input: UpdateProjectPageInput) => updateProjectPage(projectId, input),
        onMutate: async (input) => {
            await queryClient.cancelQueries({ queryKey: projectQueryKey(projectId) });
            const previousProject = queryClient.getQueryData<Project>(projectQueryKey(projectId));

            queryClient.setQueryData<Project>(projectQueryKey(projectId), (old) => (old ? { ...old, pageContent: input.pageContent } : old));

            return { previousProject };
        },
        onError: (_error, _variables, context) => {
            if (context?.previousProject) {
                queryClient.setQueryData(projectQueryKey(projectId), context.previousProject);
            }
        },
        onSettled: () => {
            void queryClient.invalidateQueries({ queryKey: PROJECTS_QUERY_KEY });
            void queryClient.invalidateQueries({ queryKey: projectQueryKey(projectId) });
        },
    });
}
