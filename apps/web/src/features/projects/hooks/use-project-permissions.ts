import { can as roleCan, canManageMember, type ProjectAction, type ProjectRole } from "@rinia/shared";
import { useAuth } from "@/features/auth/hooks/use-auth";
import { useProjectMembers } from "./use-project-members";

/**
 * What the signed-in user may do in the project, read from the same map the API enforces. While the members load,
 * nothing is allowed, so actions appear rather than disappear.
 */
export function useProjectPermissions(projectId: string) {
    const { user } = useAuth();
    const { data: members, isLoading, isError } = useProjectMembers(projectId);
    const role: ProjectRole | null = members?.find((member) => member.id === user?.id)?.role ?? null;
    return {
        role,
        can: (action: ProjectAction) => roleCan(role, action),
        /** Whether the user may change `target`'s role (to `nextRole`) or remove them. */
        canManage: (target: ProjectRole, nextRole?: ProjectRole) => canManageMember(role, target, nextRole),
        isProjectOwner: role === "owner",
        isLoading,
        isError,
    };
}
