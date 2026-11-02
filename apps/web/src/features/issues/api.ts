import type { ActionSource, BulkIssuePatch, EntityIcon, IssuePriority, IssueView, MyIssuesQuery } from "@rinia/shared";
import type {
    CreateIssueCommentInput,
    CreateIssueInput,
    CreateIssueRelationInput,
    IssueListQuery,
    TiptapDocument,
    UpdateIssueCommentInput,
    UpdateIssueInput,
    UpdateViewPreferenceInput,
} from "@rinia/shared";
import { apiClient } from "@/lib/api-client";

export interface IssueLabel {
    id: string;
    name: string;
    color: string | null;
}

export interface IssuePerson {
    id: string;
    name: string;
    username: string;
    avatarUrl: string | null;
}

export interface Issue {
    id: string;
    projectId: string;
    number: number;
    identifier: string;
    columnId: string;
    title: string;
    descriptionJson: TiptapDocument;
    descriptionRevision: number;
    assigneeId: string | null;
    /** The issue's labels, in the order they were added. */
    categoryIds: string[];
    /** The labels with names and colors, sorted by name. Edits update `categoryIds` first; lists resolve names from it. */
    categories?: IssueLabel[];
    priority: IssuePriority;
    createdBy: string;
    position: number;
    parentIssueId: string | null;
    estimate: number | null;
    /** `YYYY-MM-DD`, a calendar day with no time zone. */
    dueDate: string | null;
    createdAt: string;
    updatedAt: string;
}

export type IssueDetail = Omit<Issue, "createdBy"> & {
    project: { id: string; name: string; issueKey: string };
    assignee: IssuePerson | null;
    createdBy: IssuePerson;
    categories: IssueLabel[];
    column: { id: string; name: string };
    parent: { id: string; number: number; title: string } | null;
    children: Array<{ id: string; number: number; title: string; columnId: string; priority: Issue["priority"] }>;
};

/** Everyone who reacted to a comment with one emoji. */
export interface ReactionGroup {
    emoji: string;
    users: IssuePerson[];
}

export interface IssueComment {
    id: string;
    issueId: string;
    authorId: string;
    /** The comment whose thread this reply is in, or null for a comment that opens a thread. */
    parentCommentId: string | null;
    contentJson: TiptapDocument;
    source: ActionSource | null;
    createdAt: string;
    updatedAt: string;
    author: IssuePerson;
    reactions: ReactionGroup[];
}

/** A saved version of an issue's description. */
export interface DescriptionRevision {
    id: string;
    issueId: string;
    revision: number;
    authorId: string;
    contentJson: TiptapDocument;
    /** Set when this version brought back an older one. */
    restoredFromId: string | null;
    source: ActionSource | null;
    createdAt: string;
    updatedAt: string;
    author: IssuePerson;
}

export interface IssueActivity {
    id: string;
    issueId: string;
    actorId: string;
    type: string;
    payload: Record<string, unknown>;
    /** Set when a tool such as MCP made the change, null when it was made in the app. */
    source: ActionSource | null;
    createdAt: string;
    actor: IssuePerson;
}

export interface IssueRelation {
    id: string;
    sourceIssueId: string;
    targetIssueId: string;
    type: "blocks" | "blocked_by" | "related" | "duplicate";
    target: { id: string; number: number; title: string; projectId: string; project: { issueKey: string } };
}

function queryString(query: IssueListQuery) {
    const params = new URLSearchParams();
    Object.entries(query).forEach(([key, value]) => value !== undefined && params.set(key, String(value)));
    return params.toString() ? `?${params.toString()}` : "";
}

/** An issue listed outside its project, carrying the project, state, label, and assignee it shows with. */
export type MyIssue = Issue & {
    project: { id: string; name: string; issueKey: string; icon: string | null; iconAppearance: EntityIcon | null };
    column: { id: string; name: string; color: string | null; position: number };
    categories: IssueLabel[];
    assignee: IssuePerson | null;
};

export function listMyIssues(query: MyIssuesQuery): Promise<MyIssue[]> {
    return apiClient.get<{ issues: MyIssue[] }>(`/my-issues?${new URLSearchParams(query).toString()}`).then((res) => res.issues);
}

export function listIssues(projectId: string, query: IssueListQuery = { orderBy: "position" }): Promise<Issue[]> {
    return apiClient.get<{ issues: Issue[] }>(`/projects/${projectId}/issues${queryString(query)}`).then((res) => res.issues);
}

export function createIssue(projectId: string, input: CreateIssueInput): Promise<Issue> {
    return apiClient.post<{ issue: Issue }>(`/projects/${projectId}/issues`, input).then((res) => res.issue);
}

export function bulkUpdateIssues(projectId: string, issueIds: string[], patch: BulkIssuePatch): Promise<Issue[]> {
    return apiClient.patch<{ issues: Issue[] }>(`/projects/${projectId}/issues/bulk`, { issueIds, patch }).then((res) => res.issues);
}

export function bulkDeleteIssues(projectId: string, issueIds: string[]): Promise<{ deletedAt: string }> {
    return apiClient.post<{ deletedAt: string }>(`/projects/${projectId}/issues/bulk-delete`, { issueIds });
}

export function restoreBulkIssues(projectId: string, issueIds: string[], deletedAt: string): Promise<void> {
    return apiClient.post<void>(`/projects/${projectId}/issues/bulk-restore`, { issueIds, deletedAt });
}

export function getIssue(identifier: string): Promise<IssueDetail> {
    return apiClient.get<{ issue: IssueDetail }>(`/issues/${encodeURIComponent(identifier)}`).then((res) => res.issue);
}

export function updateIssue(identifier: string, input: UpdateIssueInput): Promise<Issue> {
    return apiClient.patch<{ issue: Issue }>(`/issues/${encodeURIComponent(identifier)}`, input).then((res) => res.issue);
}

export function deleteIssue(identifier: string): Promise<{ deletedAt: string }> {
    return apiClient.delete<{ deletedAt: string }>(`/issues/${encodeURIComponent(identifier)}`);
}

export function restoreIssue(identifier: string, deletedAt: string): Promise<void> {
    return apiClient.post<void>(`/issues/${encodeURIComponent(identifier)}/restore`, { deletedAt });
}

export function listIssueComments(identifier: string): Promise<IssueComment[]> {
    return apiClient.get<{ comments: IssueComment[] }>(`/issues/${encodeURIComponent(identifier)}/comments`).then((res) => res.comments);
}

export function createIssueComment(identifier: string, input: CreateIssueCommentInput): Promise<IssueComment> {
    return apiClient.post<{ comment: IssueComment }>(`/issues/${encodeURIComponent(identifier)}/comments`, input).then((res) => res.comment);
}

export function updateIssueComment(commentId: string, input: UpdateIssueCommentInput): Promise<IssueComment> {
    return apiClient.patch<{ comment: IssueComment }>(`/comments/${commentId}`, input).then((res) => res.comment);
}

export function deleteIssueComment(commentId: string): Promise<{ deletedAt: string }> {
    return apiClient.delete<{ deletedAt: string }>(`/comments/${commentId}`);
}

export function restoreIssueComment(commentId: string, deletedAt: string): Promise<void> {
    return apiClient.post<void>(`/comments/${commentId}/restore`, { deletedAt });
}

export function addCommentReaction(commentId: string, emoji: string): Promise<ReactionGroup[]> {
    return apiClient.post<{ reactions: ReactionGroup[] }>(`/comments/${commentId}/reactions`, { emoji }).then((res) => res.reactions);
}

export function removeCommentReaction(commentId: string, emoji: string): Promise<ReactionGroup[]> {
    return apiClient.delete<{ reactions: ReactionGroup[] }>(`/comments/${commentId}/reactions/${encodeURIComponent(emoji)}`).then((res) => res.reactions);
}

export function listDescriptionRevisions(identifier: string): Promise<DescriptionRevision[]> {
    return apiClient.get<{ revisions: DescriptionRevision[] }>(`/issues/${encodeURIComponent(identifier)}/description-revisions`).then((res) => res.revisions);
}

export function restoreDescriptionRevision(identifier: string, revisionId: string): Promise<Issue> {
    return apiClient.post<{ issue: Issue }>(`/issues/${encodeURIComponent(identifier)}/description-revisions/${revisionId}/restore`).then((res) => res.issue);
}

export function listIssueActivity(identifier: string): Promise<IssueActivity[]> {
    return apiClient.get<{ activity: IssueActivity[] }>(`/issues/${encodeURIComponent(identifier)}/activity`).then((res) => res.activity);
}

export function listIssueRelations(identifier: string): Promise<IssueRelation[]> {
    return apiClient.get<{ relations: IssueRelation[] }>(`/issues/${encodeURIComponent(identifier)}/relations`).then((res) => res.relations);
}

export function createIssueRelation(identifier: string, input: CreateIssueRelationInput): Promise<IssueRelation> {
    return apiClient.post<{ relation: IssueRelation }>(`/issues/${encodeURIComponent(identifier)}/relations`, input).then((res) => res.relation);
}

export function deleteIssueRelation(relationId: string): Promise<void> {
    return apiClient.delete<void>(`/relations/${relationId}`);
}

export interface ViewPreference {
    issueView: IssueView;
}

export function getViewPreference(projectId: string): Promise<ViewPreference> {
    return apiClient.get<{ preference: ViewPreference }>(`/projects/${projectId}/view-preference`).then((res) => res.preference);
}

export function updateViewPreference(projectId: string, input: UpdateViewPreferenceInput): Promise<ViewPreference> {
    return apiClient.patch<{ preference: ViewPreference }>(`/projects/${projectId}/view-preference`, input).then((res) => res.preference);
}
