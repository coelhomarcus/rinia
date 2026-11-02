import { useQuery } from "@tanstack/react-query";
import { getAdminProject, listAdminProjects } from "../api";

const adminProjectsKey = ["admin", "projects"] as const;

export function useAdminProjects() {
    return useQuery({ queryKey: adminProjectsKey, queryFn: listAdminProjects });
}

export function useAdminProject(projectId: string) {
    return useQuery({ queryKey: [...adminProjectsKey, projectId], queryFn: () => getAdminProject(projectId), enabled: !!projectId });
}
