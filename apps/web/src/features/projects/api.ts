import type { AssignableProjectRole, CreateProjectInput, EntityIcon, ProjectRole, ProjectStats, UpdateProjectInput, UpdateProjectPageInput } from "@rinia/shared";
import { apiClient } from "@/lib/api-client";

export interface Project {
    id: string;
    name: string;
    issueKey: string;
    nextIssueNumber: number;
    description: string | null;
    repositoryUrl: string | null;
    icon: string | null;
    iconAppearance: EntityIcon | null;
    pageContent: string;
    createdBy: string;
    createdAt: string;
    updatedAt: string;
}

export type ProjectSummary = Omit<Project, "pageContent">;
export interface ProjectMemberPreview { id: string; name: string; avatarUrl: string | null }
/** A project in the user's list, with their own role in it. */
export type ProjectCardSummary = ProjectSummary & { memberCount: number; memberPreview: ProjectMemberPreview[]; owner: ProjectMemberPreview | null; role: ProjectRole };

export interface ProjectMember {
    id: string;
    name: string;
    username: string;
    /** Left out for a guest, who sees who is in the project but not how to reach them. */
    email?: string;
    avatarUrl: string | null;
    role: ProjectRole;
    joinedAt: string;
}

export function listProjects(): Promise<ProjectCardSummary[]> {
    return apiClient.get<{ projects: ProjectCardSummary[] }>("/projects").then((res) => res.projects);
}

export function getProject(projectId: string): Promise<Project> {
    return apiClient.get<{ project: Project }>(`/projects/${projectId}`).then((res) => res.project);
}

/** Resolves a URL key, including keys the project used before a rename. */
export function getProjectByKey(key: string): Promise<Project> {
    return apiClient.get<{ project: Project }>(`/projects/by-key/${encodeURIComponent(key)}`).then((res) => res.project);
}

export function createProject(input: CreateProjectInput): Promise<Project> {
    return apiClient.post<{ project: Project }>("/projects", input).then((res) => res.project);
}

export function updateProject(projectId: string, input: UpdateProjectInput): Promise<Project> {
    return apiClient.patch<{ project: Project }>(`/projects/${projectId}`, input).then((res) => res.project);
}

export function updateProjectPage(projectId: string, input: UpdateProjectPageInput): Promise<Project> {
    return apiClient.patch<{ project: Project }>(`/projects/${projectId}/page`, input).then((res) => res.project);
}

export function deleteProject(projectId: string): Promise<void> {
    return apiClient.delete<void>(`/projects/${projectId}`);
}

export function listProjectMembers(projectId: string): Promise<ProjectMember[]> {
    return apiClient.get<{ members: ProjectMember[] }>(`/projects/${projectId}/members`).then((res) => res.members);
}

export function addProjectMember(projectId: string, username: string, role: AssignableProjectRole): Promise<ProjectMember> {
    return apiClient.post<{ member: ProjectMember }>(`/projects/${projectId}/members`, { username, role }).then((res) => res.member);
}

export function updateProjectMemberRole(projectId: string, userId: string, role: AssignableProjectRole): Promise<ProjectMember> {
    return apiClient.patch<{ member: ProjectMember }>(`/projects/${projectId}/members/${userId}`, { role }).then((res) => res.member);
}

/** Makes another member the owner. The current owner stays on as an admin. */
export function transferProject(projectId: string, userId: string): Promise<void> {
    return apiClient.post<void>(`/projects/${projectId}/transfer`, { userId });
}

/** A guest an issue or page is shared with. */
export interface GuestShare {
    id: string;
    user: ProjectMemberPreview & { username: string };
    sharedBy: string | null;
    createdAt: string;
}

/** Where an issue or page's shares live: `/issues/RIN-4` or `/projects/:id/documents/:documentId`. */
export function listShares(base: string): Promise<GuestShare[]> {
    return apiClient.get<{ shares: GuestShare[] }>(`${base}/shares`).then((res) => res.shares);
}

export function addShare(base: string, userId: string): Promise<GuestShare> {
    return apiClient.post<{ share: GuestShare }>(`${base}/shares`, { userId }).then((res) => res.share);
}

export function removeShare(base: string, userId: string): Promise<void> {
    return apiClient.delete<void>(`${base}/shares/${userId}`);
}

export interface MemberLookup {
    user: (ProjectMemberPreview & { username: string }) | null;
    isMember: boolean;
}

export function lookupProjectMember(projectId: string, username: string): Promise<MemberLookup> {
    return apiClient.get<MemberLookup>(`/projects/${projectId}/members/lookup?username=${encodeURIComponent(username)}`);
}

export function removeProjectMember(projectId: string, userId: string): Promise<void> {
    return apiClient.delete<void>(`/projects/${projectId}/members/${userId}`);
}

/** The overview's activity numbers since the project was created, with days counted in the viewer's time zone. */
export function getProjectStats(projectId: string, timeZone: string): Promise<ProjectStats> {
    const query = new URLSearchParams({ tz: timeZone });
    return apiClient.get<{ stats: ProjectStats }>(`/projects/${projectId}/stats?${query}`).then((res) => res.stats);
}
