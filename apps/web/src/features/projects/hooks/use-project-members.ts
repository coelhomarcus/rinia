import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { AssignableProjectRole } from "@rinia/shared";
import { addProjectMember, addShare, listProjectMembers, listShares, lookupProjectMember, removeProjectMember, removeShare, transferProject, updateProjectMemberRole } from "../api";

export function membersQueryKey(projectId: string) {
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
        mutationFn: ({ username, role }: { username: string; role: AssignableProjectRole }) => addProjectMember(projectId, username, role),
        onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: membersQueryKey(projectId) });
        },
    });
}

export function useRemoveProjectMember(projectId: string) {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (userId: string) => removeProjectMember(projectId, userId),
        onSuccess: () => {
            void queryClient.invalidateQueries({ queryKey: membersQueryKey(projectId) });
        },
    });
}

/** A role change can change what the user sees, so the project's lists refetch with the members. */
function useMembersChanged(projectId: string) {
    const queryClient = useQueryClient();
    return () => {
        void queryClient.invalidateQueries({ queryKey: ["projects", projectId] });
        void queryClient.invalidateQueries({ queryKey: ["projects"], exact: true });
    };
}

export function useUpdateMemberRole(projectId: string) {
    const changed = useMembersChanged(projectId);
    return useMutation({
        mutationFn: ({ userId, role }: { userId: string; role: AssignableProjectRole }) => updateProjectMemberRole(projectId, userId, role),
        onSuccess: changed,
    });
}

export function useTransferProject(projectId: string) {
    const changed = useMembersChanged(projectId);
    return useMutation({ mutationFn: (userId: string) => transferProject(projectId, userId), onSuccess: changed });
}

const sharesKey = (base: string) => ["shares", base] as const;

/** Who an issue or page is shared with. `base` is its API path; pass null to skip. */
export function useShares(base: string | null) {
    return useQuery({ queryKey: sharesKey(base ?? ""), queryFn: () => listShares(base!), enabled: !!base });
}

export function useToggleShare(base: string) {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ userId, shared }: { userId: string; shared: boolean }) => (shared ? addShare(base, userId).then(() => undefined) : removeShare(base, userId)),
        onSettled: () => void queryClient.invalidateQueries({ queryKey: sharesKey(base) }),
    });
}
