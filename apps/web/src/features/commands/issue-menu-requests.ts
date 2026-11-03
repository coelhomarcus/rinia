import { useEffect, useRef } from "react";

/** The property menus of the issue page that commands can open, the same ones S, P, A and L open. */
export type IssueMenuRequest = "state" | "priority" | "assignee" | "label";

const EVENT = "rinia:open-issue-menu";

/** Asks the open issue page to show one of its property menus. Does nothing when no issue page is open. */
export function requestIssueMenu(menu: IssueMenuRequest) {
    window.dispatchEvent(new CustomEvent<IssueMenuRequest>(EVENT, { detail: menu }));
}

/** Lets the issue page answer `requestIssueMenu`. */
export function useIssueMenuRequests(onRequest: (menu: IssueMenuRequest) => void) {
    const handler = useRef(onRequest);
    handler.current = onRequest;
    useEffect(() => {
        const listener = (event: Event) => handler.current((event as CustomEvent<IssueMenuRequest>).detail);
        window.addEventListener(EVENT, listener);
        return () => window.removeEventListener(EVENT, listener);
    }, []);
}
