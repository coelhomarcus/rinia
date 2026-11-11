/**
 * An issue's identifier and title can morph between the row or card that was clicked and the issue page. Elements only
 * carry a marker; the router names the one pair that stands for the issue being opened or left, at the moment the
 * transition starts. Naming every row up front made each navigation capture hundreds of elements, and any issue shown
 * on both pages (a row in My issues and a card on the board) stretched from one shape into the other.
 */
export function issueTransitionProps(identifier: string, part: "id" | "title"): { "data-issue-transition": string } {
    return { "data-issue-transition": `${part}:${identifier}` };
}

function onScreen(element: HTMLElement) {
    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0 && rect.bottom > 0 && rect.right > 0 && rect.top < window.innerHeight && rect.left < window.innerWidth;
}

/**
 * Gives the first on-screen element marked for `identifier` the shared name for its part (`issue-id`, `issue-title`), so
 * exactly one element per name takes part in the transition. Returns a function that takes the names away again.
 */
export function nameIssueTransition(identifier: string | undefined): () => void {
    if (!identifier) return () => undefined;
    const named: HTMLElement[] = [];
    for (const part of ["id", "title"] as const) {
        const marker = CSS.escape(`${part}:${identifier}`);
        const element = [...document.querySelectorAll<HTMLElement>(`[data-issue-transition="${marker}"]`)].find(onScreen);
        if (!element) continue;
        element.style.viewTransitionName = `issue-${part}`;
        named.push(element);
    }
    return () => named.forEach((element) => (element.style.viewTransitionName = ""));
}

/** Passed to `navigate` so the router runs a view transition. The title rides along for the first paint. */
export function issueNavigation(title?: string): { viewTransition: true; state?: { issueTitle: string } } {
    return title ? { viewTransition: true, state: { issueTitle: title } } : { viewTransition: true };
}

function issueIdentifier(pathname: string): string | undefined {
    return /^\/issue\/([^/]+)/.exec(pathname)?.[1];
}

/** The issue a navigation opens or returns from, whose row or card may morph with its page. Others only cross-fade. */
export function transitionIssue(from: string, to: string): string | undefined {
    return issueIdentifier(to) ?? issueIdentifier(from);
}

/**
 * The issue list an address shows, whatever its filter: `/my-issues` and `/my-issues/created` are one
 * list, and so are a project's scopes (`/project/RIN/issues/active`) and its saved views.
 */
function issueList(pathname: string): string | undefined {
    if (/^\/my-issues(?:\/[^/]+)?\/?$/.test(pathname)) return "my-issues";
    const project = /^\/project\/([^/]+)\/(?:issues(?:\/[^/]+)?|views\/[^/]+)\/?$/.exec(pathname)?.[1];
    return project ? `project:${project.toUpperCase()}` : undefined;
}

/**
 * Pathname changes cross-fade (and morph shared names). Search and hash updates, reduced motion,
 * and browsers without the API navigate immediately. Replacing `/issue/RIN-1` with its slugged
 * canonical URL is the same page, so it does not play a second transition. Neither does switching
 * a list's filter, scope, or saved view: the list animates its own rows, and morphing each row's
 * identifier and title into a row of another width would stretch their snapshots.
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
    if (fromIssue && fromIssue === issueIdentifier(to)) return false;
    const fromList = issueList(from);
    return !(fromList && fromList === issueList(to));
}
