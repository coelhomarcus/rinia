import type { EntityIcon } from "@rinia/shared";
import { apiClient } from "@/lib/api-client";

export interface AdminPerson {
    id: string;
    name: string;
    username: string;
    avatarUrl: string | null;
}

/** What a site admin sees of a project: its people and its size, never its content. */
export interface AdminProjectSummary {
    id: string;
    name: string;
    issueKey: string;
    icon: string | null;
    iconAppearance: EntityIcon | null;
    createdAt: string;
    updatedAt: string;
    createdBy: AdminPerson;
    owner: AdminPerson | null;
    memberCount: number;
    issueCount: number;
    documentCount: number;
}

export type AdminProject = Omit<AdminProjectSummary, "memberCount"> & {
    members: Array<AdminPerson & { role: "owner" | "member"; joinedAt: string }>;
};

export const listAdminProjects = () => apiClient.get<{ projects: AdminProjectSummary[] }>("/admin/projects").then((res) => res.projects);
export const getAdminProject = (projectId: string) => apiClient.get<{ project: AdminProject }>(`/admin/projects/${projectId}`).then((res) => res.project);

/** What a site admin sees of an account: who it is, its standing, and how many projects it works in. */
export interface AdminUserSummary extends AdminPerson {
    email: string;
    isAdmin: boolean;
    /** When an admin suspended the account; null while it is active. */
    suspendedAt: string | null;
    createdAt: string;
    projectCount: number;
}

export type AdminUser = Omit<AdminUserSummary, "projectCount"> & {
    projects: Array<{ id: string; name: string; issueKey: string; icon: string | null; iconAppearance: EntityIcon | null; role: "owner" | "member"; joinedAt: string }>;
    apiTokenCount: number;
};

export const listAdminUsers = () => apiClient.get<{ users: AdminUserSummary[] }>("/admin/users").then((res) => res.users);
export const getAdminUser = (userId: string) => apiClient.get<{ user: AdminUser }>(`/admin/users/${userId}`).then((res) => res.user);
export const updateAdminUser = (userId: string, changes: { isAdmin?: boolean; suspended?: boolean }) =>
    apiClient.patch<{ user: AdminUser }>(`/admin/users/${userId}`, changes).then((res) => res.user);
export const revokeAdminUserSessions = (userId: string) => apiClient.post<void>(`/admin/users/${userId}/sessions/revoke`);
/** The new password is in this response only; it is never shown again. */
export const resetAdminUserPassword = (userId: string) => apiClient.post<{ password: string }>(`/admin/users/${userId}/password`).then((res) => res.password);
