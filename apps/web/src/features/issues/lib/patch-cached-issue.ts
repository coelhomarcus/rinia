import { positionsAtTop } from "@rinia/shared";

/** A project issue list, a paged window of one, or My issues. The issue detail is `["issues", identifier]` and is not a list. */
export function isIssueListKey(key: readonly unknown[]): boolean {
    return (key[0] === "projects" && key[2] === "issues") || key[0] === "my-issues";
}

interface PagedIssues<T> {
    pages: Array<{ issues: T[] }>;
}

function isPagedIssues<T>(value: object): value is PagedIssues<T> {
    return "pages" in value && Array.isArray(value.pages);
}

/** Issues in a list cache, whether it is one array or a cursor window of pages. */
export function flattenCachedIssues<T>(current: unknown): T[] {
    if (Array.isArray(current)) return current as T[];
    if (current && typeof current === "object" && isPagedIssues<T>(current)) return current.pages.flatMap((page) => page.issues ?? []);
    return [];
}

/**
 * Applies `map` to every issue in the cache entry. A window keeps its cursors: each page is mapped on its own,
 * so an edit lands on a row that is not mounted without reshuffling the pages.
 */
export function mapCachedIssues<T>(current: unknown, map: (issues: T[]) => T[]): unknown {
    if (current == null) return current;
    if (Array.isArray(current)) return map(current as T[]);
    if (typeof current === "object" && isPagedIssues<T>(current)) {
        return { ...current, pages: current.pages.map((page) => ({ ...page, issues: map(page.issues ?? []) })) };
    }
    return current;
}

/** The issue itself, not its comments, activity, or relations. */
export function isIssueDetailKey(key: readonly unknown[]): boolean {
    return key[0] === "issues" && key.length === 2 && typeof key[1] === "string";
}

type ListedIssue = { id: string; identifier: string; columnId: string; position: number; number: number };

/**
 * Issues moving into `columnId` take the positions the server will give them: above that column's top card, in their
 * previous order. Lists sort by position, so they show at the top before the response arrives.
 */
export function placeMovedAtTop<T extends ListedIssue>(list: T[], selected: (issue: T) => boolean, columnId: string): T[] {
    const moving = list.filter((issue) => selected(issue) && issue.columnId !== columnId).sort((a, b) => a.position - b.position || a.number - b.number);
    if (!moving.length) return list;
    const staying = list.filter((issue) => issue.columnId === columnId && !moving.includes(issue));
    const top = staying.length ? Math.min(...staying.map((issue) => issue.position)) : null;
    const positions = new Map(positionsAtTop(top, moving.length).map((position, index) => [moving[index]!.id, position]));
    return list.map((issue) => (positions.has(issue.id) ? { ...issue, position: positions.get(issue.id)! } : issue));
}

/**
 * One issue's fields, in every list that holds it. A column change without a position also moves it to the top of
 * the destination, matching the server.
 */
export function applyOptimisticIssueList<T extends ListedIssue>(
    list: T[] | undefined,
    identifier: string,
    input: Partial<T> & { columnId?: string; position?: number },
): T[] | undefined {
    if (!list) return list;
    const { expectedDescriptionRevision: _expectedDescriptionRevision, ...values } = input as Partial<T> & {
        expectedDescriptionRevision?: number;
        columnId?: string;
        position?: number;
    };
    const placesAtTop = !!values.columnId && values.position === undefined;
    const placed = placesAtTop ? placeMovedAtTop(list, (issue) => issue.identifier === identifier, values.columnId!) : list;
    return placed.map((issue) => (issue.identifier === identifier ? { ...issue, ...values } : issue));
}
