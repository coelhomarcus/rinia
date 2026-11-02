/**
 * Every in-app URL is built here. Projects are addressed by their issue key (`/project/RIN`) and issues by
 * their identifier (`/issue/RIN-4/short-title`), never by database ids. Trailing slugs are cosmetic.
 */

import { appPaths, documentSlug, type MyIssuesFilter } from "@rinia/shared";

export { documentSlug, matchDocumentSlug, slugify } from "@rinia/shared";

export type IssueScope = "active" | "backlog" | "all";
export type ProjectSettingsSection = "general" | "members" | "states" | "labels";

/** The project key inside an issue identifier: `RIN-4` → `RIN`. */
export function projectKeyOf(identifier: string) {
    return identifier.slice(0, identifier.lastIndexOf("-")).toUpperCase();
}

export const urls = {
    projects: () => "/",
    inbox: () => "/inbox",
    myIssues: (filter: MyIssuesFilter = "assigned") => (filter === "assigned" ? "/my-issues" : `/my-issues/${filter}`),
    project: appPaths.project,
    issues: (key: string, scope: IssueScope = "active") => (scope === "active" ? `/project/${key}/issues` : `/project/${key}/issues/${scope}`),
    issue: appPaths.issue,
    documents: (key: string) => `/project/${key}/docs`,
    document: appPaths.document,
    views: (key: string) => `/project/${key}/views`,
    /** Saved views are addressed like documents: the name for people, the first digits of the id for lookups. */
    view: (key: string, view: { id: string; name: string }) => `/project/${key}/views/${documentSlug({ id: view.id, title: view.name })}`,
    members: (key: string) => `/project/${key}/members`,
    projectSettings: (key: string, section?: ProjectSettingsSection) => (section ? `/settings/project/${key}/${section}` : `/settings/project/${key}`),
    integrations: () => "/settings/integrations",
    integration: (slug: string) => `/settings/integrations/${slug}`,
    apiTokens: () => "/settings/api-tokens",
    admin: () => "/settings/admin",
    adminProject: (projectId: string) => `/settings/admin/projects/${projectId}`,
};
