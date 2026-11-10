/** A CSS `view-transition-name` is a custom ident: letters, digits, hyphens, and underscores. */
const CSS_IDENT = /^[A-Za-z_][A-Za-z0-9_-]*$/;

/**
 * One name for the identifier and one for the title, unique per issue, shared by the row and the
 * issue page so the row can expand into the page.
 */
export function issueViewTransitionName(identifier: string, part: "id" | "title"): string | undefined {
    const name = `issue-${part}-${identifier}`;
    return CSS_IDENT.test(name) ? name : undefined;
}

export function issueViewTransitionStyle(identifier: string, part: "id" | "title"): { viewTransitionName: string } | undefined {
    const viewTransitionName = issueViewTransitionName(identifier, part);
    return viewTransitionName ? { viewTransitionName } : undefined;
}

/** Passed to `navigate` so the router runs a view transition. The title rides along for the first paint. */
export function issueNavigation(title?: string): { viewTransition: true; state?: { issueTitle: string } } {
    return title ? { viewTransition: true, state: { issueTitle: title } } : { viewTransition: true };
}

function issueIdentifier(pathname: string): string | undefined {
    return /^\/issue\/([^/]+)/.exec(pathname)?.[1];
}

/**
 * Pathname changes cross-fade (and morph shared names). Search and hash updates, reduced motion,
 * and browsers without the API navigate immediately. Replacing `/issue/RIN-1` with its slugged
 * canonical URL is the same page, so it does not play a second transition.
 */
export function shouldUseViewTransition({
    from,
    to,
    reducedMotion,
    supported,
}: {
    from: string;
    to: string;
    reducedMotion: boolean;
    supported: boolean;
}): boolean {
    if (!supported || reducedMotion || from === to) return false;
    const fromIssue = issueIdentifier(from);
    return !(fromIssue && fromIssue === issueIdentifier(to));
}
