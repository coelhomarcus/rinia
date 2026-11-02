import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { addProjectMember, listProjectMembers, lookupProjectMember, removeProjectMember } from "../api";

function membersQueryKey(projectId: string) {
    return ["projects", projectId, "members"] as const;
}

export function useProjectMembers(projectId: string) {
    return useQuery({
        queryKey: membersQueryKey(projectId),
        queryFn: () => listProjectMembers(projectId),
        enabled: !!projectId,
    });
}

/** Who a username belongs to, for the add-member preview. Pass an empty username to skip the request. */
export function useMemberLookup(projectId: string, username: string) {
    return useQuery({
        queryKey: [...membersQueryKey(projectId), "lookup", username] as const,
        queryFn: () => lookupProjectMember(projectId, username),
        enabled: !!projectId && !!username,
        staleTime: 10_000,
    });
}

export function useAddProjectMember(projectId: string) {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (username: string) => addProjectMember(projectId, username),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: membersQueryKey(projectId) });
        },
    });
}

export function useRemoveProjectMember(projectId: string) {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (userId: string) => removeProjectMember(projectId, userId),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: membersQueryKey(projectId) });
        },
    });
}
