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
