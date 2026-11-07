import { relations } from "drizzle-orm";
import { apiTokens } from "./api-tokens";
import { boardColumns } from "./board-columns";
import { categories } from "./categories";
import { commentReactions } from "./comment-reactions";
import { favorites } from "./favorites";
import { files } from "./files";
import { issueActivities } from "./issue-activities";
import { issueComments } from "./issue-comments";
import { issueDescriptionRevisions } from "./issue-description-revisions";
import { issueLabels } from "./issue-labels";
import { issueRelations } from "./issue-relations";
import { issues } from "./issues";
import { issueSubscriptions, notifications } from "./notifications";
import { oauthClients } from "./oauth";
import { projectDocuments } from "./project-documents";
import { projectKeyAliases } from "./project-key-aliases";
import { projectMembers } from "./project-members";
import { projects } from "./projects";
import { users } from "./users";
import { views } from "./views";

export * from "./api-tokens";
export * from "./board-columns";
export * from "./categories";
export * from "./comment-reactions";
export * from "./favorites";
export * from "./files";
export * from "./issue-activities";
export * from "./issue-comments";
export * from "./issue-description-revisions";
export * from "./issue-labels";
export * from "./issue-relations";
export * from "./issues";
export * from "./notifications";
export * from "./oauth";
export * from "./project-documents";
export * from "./project-key-aliases";
export * from "./project-members";
export * from "./projects";
export * from "./project-view-preferences";
export * from "./users";
export * from "./views";

export const usersRelations = relations(users, ({ many }) => ({
    projectsCreated: many(projects),
    projectMemberships: many(projectMembers),
    categoriesCreated: many(categories),
    issuesCreated: many(issues, { relationName: "issueCreatedBy" }),
    issuesAssigned: many(issues, { relationName: "issueAssignee" }),
    comments: many(issueComments),
    activities: many(issueActivities),
    apiTokens: many(apiTokens),
    files: many(files),
}));

export const apiTokensRelations = relations(apiTokens, ({ one }) => ({
    user: one(users, { fields: [apiTokens.userId], references: [users.id] }),
    oauthClient: one(oauthClients, { fields: [apiTokens.oauthClientId], references: [oauthClients.clientId] }),
}));

export const projectsRelations = relations(projects, ({ one, many }) => ({
    creator: one(users, { fields: [projects.createdBy], references: [users.id] }),
    members: many(projectMembers),
    categories: many(categories),
    columns: many(boardColumns),
    issues: many(issues),
    documents: many(projectDocuments),
    files: many(files),
    keyAliases: many(projectKeyAliases),
    views: many(views),
}));

export const projectMembersRelations = relations(projectMembers, ({ one }) => ({
    project: one(projects, { fields: [projectMembers.projectId], references: [projects.id] }),
    user: one(users, { fields: [projectMembers.userId], references: [users.id] }),
}));

export const categoriesRelations = relations(categories, ({ one, many }) => ({
    project: one(projects, { fields: [categories.projectId], references: [projects.id] }),
    createdBy: one(users, { fields: [categories.createdBy], references: [users.id] }),
    issueLabels: many(issueLabels),
}));

export const boardColumnsRelations = relations(boardColumns, ({ one, many }) => ({
    project: one(projects, { fields: [boardColumns.projectId], references: [projects.id] }),
    issues: many(issues),
}));

export const issuesRelations = relations(issues, ({ one, many }) => ({
    project: one(projects, { fields: [issues.projectId], references: [projects.id] }),
    column: one(boardColumns, { fields: [issues.columnId], references: [boardColumns.id] }),
    assignee: one(users, {
        fields: [issues.assigneeId],
        references: [users.id],
        relationName: "issueAssignee",
    }),
    createdBy: one(users, {
        fields: [issues.createdBy],
        references: [users.id],
        relationName: "issueCreatedBy",
    }),
    labels: many(issueLabels),
    parent: one(issues, { fields: [issues.parentIssueId], references: [issues.id], relationName: "issueParent" }),
    children: many(issues, { relationName: "issueParent" }),
    comments: many(issueComments),
    files: many(files),
    activities: many(issueActivities),
    outgoingRelations: many(issueRelations, { relationName: "relationSource" }),
    incomingRelations: many(issueRelations, { relationName: "relationTarget" }),
}));

export const issueCommentsRelations = relations(issueComments, ({ one, many }) => ({
    issue: one(issues, { fields: [issueComments.issueId], references: [issues.id] }),
    author: one(users, { fields: [issueComments.authorId], references: [users.id] }),
    reactions: many(commentReactions),
    parent: one(issueComments, { fields: [issueComments.parentCommentId], references: [issueComments.id], relationName: "commentReplies" }),
    replies: many(issueComments, { relationName: "commentReplies" }),
}));

export const commentReactionsRelations = relations(commentReactions, ({ one }) => ({
    comment: one(issueComments, { fields: [commentReactions.commentId], references: [issueComments.id] }),
    user: one(users, { fields: [commentReactions.userId], references: [users.id] }),
}));

export const issueDescriptionRevisionsRelations = relations(issueDescriptionRevisions, ({ one }) => ({
    issue: one(issues, { fields: [issueDescriptionRevisions.issueId], references: [issues.id] }),
    author: one(users, { fields: [issueDescriptionRevisions.authorId], references: [users.id] }),
}));

export const issueActivitiesRelations = relations(issueActivities, ({ one }) => ({
    issue: one(issues, { fields: [issueActivities.issueId], references: [issues.id] }),
    actor: one(users, { fields: [issueActivities.actorId], references: [users.id] }),
}));

export const issueRelationsRelations = relations(issueRelations, ({ one }) => ({
    source: one(issues, { fields: [issueRelations.sourceIssueId], references: [issues.id], relationName: "relationSource" }),
    target: one(issues, { fields: [issueRelations.targetIssueId], references: [issues.id], relationName: "relationTarget" }),
}));

export const projectDocumentsRelations = relations(projectDocuments, ({ one }) => ({
    project: one(projects, { fields: [projectDocuments.projectId], references: [projects.id] }),
}));

export const projectKeyAliasesRelations = relations(projectKeyAliases, ({ one }) => ({
    project: one(projects, { fields: [projectKeyAliases.projectId], references: [projects.id] }),
}));

export const filesRelations = relations(files, ({ one }) => ({
    project: one(projects, { fields: [files.projectId], references: [projects.id] }),
    issue: one(issues, { fields: [files.issueId], references: [issues.id] }),
    uploadedBy: one(users, { fields: [files.uploadedBy], references: [users.id] }),
}));

export const favoritesRelations = relations(favorites, ({ one }) => ({
    user: one(users, { fields: [favorites.userId], references: [users.id] }),
    project: one(projects, { fields: [favorites.projectId], references: [projects.id] }),
    document: one(projectDocuments, { fields: [favorites.documentId], references: [projectDocuments.id] }),
    issue: one(issues, { fields: [favorites.issueId], references: [issues.id] }),
    view: one(views, { fields: [favorites.viewId], references: [views.id] }),
}));

export const viewsRelations = relations(views, ({ one }) => ({
    project: one(projects, { fields: [views.projectId], references: [projects.id] }),
    owner: one(users, { fields: [views.ownerId], references: [users.id] }),
}));

export const notificationsRelations = relations(notifications, ({ one }) => ({
    user: one(users, { fields: [notifications.userId], references: [users.id] }),
    actor: one(users, { fields: [notifications.actorId], references: [users.id] }),
    project: one(projects, { fields: [notifications.projectId], references: [projects.id] }),
    issue: one(issues, { fields: [notifications.issueId], references: [issues.id] }),
    comment: one(issueComments, { fields: [notifications.commentId], references: [issueComments.id] }),
}));

export const issueSubscriptionsRelations = relations(issueSubscriptions, ({ one }) => ({
    user: one(users, { fields: [issueSubscriptions.userId], references: [users.id] }),
    issue: one(issues, { fields: [issueSubscriptions.issueId], references: [issues.id] }),
}));

export const issueLabelsRelations = relations(issueLabels, ({ one }) => ({
    issue: one(issues, { fields: [issueLabels.issueId], references: [issues.id] }),
    category: one(categories, { fields: [issueLabels.categoryId], references: [categories.id] }),
}));
