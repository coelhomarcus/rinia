import type { RealtimeEvent } from "@rinia/shared";
import type { QueryClient, QueryKey } from "@tanstack/react-query";
import { categoriesQueryKey } from "@/features/categories/hooks/use-categories";
import { documentKey, documentsKey } from "@/features/documents/hooks/use-documents";
import { FAVORITES_QUERY_KEY } from "@/features/favorites/hooks/use-favorites";
import type { IssueDetail } from "@/features/issues/api";
import { MY_ISSUES_QUERY_KEY } from "@/features/issues/hooks/use-issues";
import { projectQueryKey } from "@/features/projects/hooks/use-project";
import { PROJECTS_QUERY_KEY } from "@/features/projects/hooks/use-projects";
import { viewsKey } from "@/features/views/hooks/use-views";

type Target = { queryKey: QueryKey; exact?: boolean };

/** Open issue pages, keyed by identifier, whose issue belongs to the project. */
function issuePages(client: QueryClient, projectId: string) {
    return client
        .getQueryCache()
        .findAll({ queryKey: ["issues"] })
        .filter((query) => query.queryKey.length === 2 && (query.state.data as IssueDetail | undefined)?.projectId === projectId)
        .map((query) => ({ identifier: query.queryKey[1] as string, issue: query.state.data as IssueDetail }));
}

/**
 * The cached queries an event makes stale. Only what is on screen refetches; the rest refetches when it is next
 * shown. The cache is the only copy of server state, so nothing here patches it by hand.
 */
export function realtimeTargets(client: QueryClient, event: RealtimeEvent): Target[] {
    const { projectId } = event;
    const [subject] = event.type.split(".");
    const pages = () => issuePages(client, projectId);
    // Everything an issue page loads (comments, activity, relations) lives under its identifier.
    const issuePage = (issueId: string | undefined) => pages().filter((page) => page.issue.id === issueId).map((page): Target => ({ queryKey: ["issues", page.identifier] }));
    // Another issue's page can show this one as its parent, sub-issue or relation, or show a label or status by name.
    const otherIssuePages = () => pages().map((page): Target => ({ queryKey: ["issues", page.identifier], exact: true }));
    const issueLists: Target[] = [{ queryKey: ["projects", projectId, "issues"] }, { queryKey: MY_ISSUES_QUERY_KEY }];

    switch (subject) {
        case "issue":
            return [...issueLists, ...issuePage(event.id), ...otherIssuePages(), { queryKey: FAVORITES_QUERY_KEY }];
        case "comment":
        case "relation":
            return issuePage(event.issueId);
        case "column":
            return [{ queryKey: ["projects", projectId, "columns"] }, ...issueLists, ...otherIssuePages()];
        case "label":
            return [{ queryKey: categoriesQueryKey(projectId) }, ...issueLists, ...otherIssuePages()];
        case "document":
            return [{ queryKey: documentsKey(projectId), exact: true }, { queryKey: documentKey(projectId, event.id) }, { queryKey: FAVORITES_QUERY_KEY }];
        case "view":
            return [{ queryKey: viewsKey(projectId) }, { queryKey: FAVORITES_QUERY_KEY }];
        case "project":
            return [{ queryKey: PROJECTS_QUERY_KEY, exact: true }, { queryKey: projectQueryKey(projectId), exact: true }, { queryKey: ["projects", "by-key"] }, { queryKey: FAVORITES_QUERY_KEY }];
        case "member":
            // A new role can change what the user may see and do, so the lists refetch with the members.
            return [{ queryKey: ["projects", projectId, "members"] }, { queryKey: PROJECTS_QUERY_KEY, exact: true }, ...issueLists, { queryKey: documentsKey(projectId), exact: true }];
        case "share":
            return [{ queryKey: ["shares"] }];
        default:
            return [];
    }
}

/** Invalidates once per query for a batch of events, so a bulk change of 50 issues refetches the list once. */
export function invalidateForEvents(client: QueryClient, events: RealtimeEvent[]) {
    const targets = new Map<string, Target>();
    for (const event of events) {
        for (const target of realtimeTargets(client, event)) targets.set(`${JSON.stringify(target.queryKey)}:${!!target.exact}`, target);
    }
    for (const target of targets.values()) void client.invalidateQueries(target);
}
