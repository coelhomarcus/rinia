import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getAdminProject, getAdminUser, listAdminProjects, listAdminUsers, resetAdminUserPassword, revokeAdminUserSessions, updateAdminUser, type AdminUser } from "../api";

const adminProjectsKey = ["admin", "projects"] as const;
const adminUsersKey = ["admin", "users"] as const;

export function useAdminProjects(enabled = true) {
    return useQuery({ queryKey: adminProjectsKey, queryFn: listAdminProjects, enabled });
}

export function useAdminProject(projectId: string) {
    return useQuery({ queryKey: [...adminProjectsKey, projectId], queryFn: () => getAdminProject(projectId), enabled: !!projectId });
}

export function useAdminUsers(enabled = true) {
    return useQuery({ queryKey: adminUsersKey, queryFn: listAdminUsers, enabled });
}

export function useAdminUser(userId: string) {
    return useQuery({ queryKey: [...adminUsersKey, userId], queryFn: () => getAdminUser(userId), enabled: !!userId });
}

/** Grants or removes admin rights, or suspends or restores the account; the page and the list show the change at once. */
export function useUpdateAdminUser(userId: string) {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: (changes: { isAdmin?: boolean; suspended?: boolean }) => updateAdminUser(userId, changes),
        onSuccess: (user) => {
            queryClient.setQueryData<AdminUser>([...adminUsersKey, userId], user);
            void queryClient.invalidateQueries({ queryKey: adminUsersKey, exact: true });
        },
    });
}

export function useRevokeAdminUserSessions(userId: string) {
    return useMutation({ mutationFn: () => revokeAdminUserSessions(userId) });
}

export function useResetAdminUserPassword(userId: string) {
    return useMutation({ mutationFn: () => resetAdminUserPassword(userId) });
}
