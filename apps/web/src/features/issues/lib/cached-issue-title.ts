import type { QueryClient } from "@tanstack/react-query";

function titleOf(data: unknown, identifier: string): string | undefined {
    if (!Array.isArray(data)) return undefined;
    for (const item of data) {
        if (!item || typeof item !== "object") continue;
        if (!("identifier" in item) || item.identifier !== identifier) continue;
        if ("title" in item && typeof item.title === "string" && item.title.length > 0) return item.title;
    }
    return undefined;
}

/** The title already on screen, from a project list or My issues, so the issue page can paint it before its own request. */
export function cachedIssueTitle(queryClient: QueryClient, identifier: string): string | undefined {
    const lists = queryClient.getQueriesData<unknown>({
        predicate: (query) => {
            const key = query.queryKey;
            return (key[0] === "projects" && key[2] === "issues") || key[0] === "my-issues";
        },
    });
    for (const [, data] of lists) {
        const title = titleOf(data, identifier);
        if (title) return title;
    }
    return undefined;
}

/** The title passed with the navigation wins; the list cache covers a click that did not pass one. */
export function issuePreviewTitle(state: unknown, queryClient: QueryClient, identifier: string): string | undefined {
    if (state && typeof state === "object" && "issueTitle" in state && typeof state.issueTitle === "string" && state.issueTitle.length > 0) {
        return state.issueTitle;
    }
    return cachedIssueTitle(queryClient, identifier);
}
