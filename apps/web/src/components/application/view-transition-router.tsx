import { type ReactNode, startTransition, useLayoutEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { Router, UNSAFE_createBrowserHistory } from "react-router";
import { nameIssueTransition, shouldUseViewTransition, transitionIssue } from "@/lib/view-transition";

type AppHistory = ReturnType<typeof UNSAFE_createBrowserHistory>;
type HistoryUpdate = Parameters<Parameters<AppHistory["listen"]>[0]>[0];

function prefersReducedMotion() {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * `<BrowserRouter>` accepts `viewTransition` on `<Link>` and `navigate`, but only a data router
 * calls `document.startViewTransition`. This is that same history: every pathname change runs the
 * transition, so the issue being opened or left can morph and other routes cross-fade. Search and hash
 * updates stay instant. Reduced motion, and browsers without the API, commit the next page in the
 * same turn — the navigation is never held for the animation. The back button is an ordinary pop,
 * so it animates the same way and history stays intact.
 */
export function ViewTransitionRouter({ children }: { children: ReactNode }) {
    const historyRef = useRef<AppHistory | null>(null);
    if (historyRef.current == null) {
        historyRef.current = UNSAFE_createBrowserHistory({ v5Compat: true });
    }
    const history = historyRef.current;
    const [state, setState] = useState(() => ({ action: history.action, location: history.location }));
    const pathnameRef = useRef(state.location.pathname);
    pathnameRef.current = state.location.pathname;

    useLayoutEffect(() => {
        return history.listen((update: HistoryUpdate) => {
            const next = { action: update.action, location: update.location };
            const transition = shouldUseViewTransition({
                from: pathnameRef.current,
                to: update.location.pathname,
                reducedMotion: prefersReducedMotion(),
                supported: typeof document.startViewTransition === "function",
            });
            if (!transition) {
                startTransition(() => setState(next));
                return;
            }
            // Only the issue being opened or left morphs: its row or card on one side, its page on the other. The old
            // side is named before the snapshot, the new side once React has committed the next page.
            const issue = transitionIssue(pathnameRef.current, update.location.pathname);
            const clearOld = nameIssueTransition(issue);
            let clearNew = () => undefined as void;
            try {
                const viewTransition = document.startViewTransition(() => {
                    clearOld();
                    flushSync(() => setState(next));
                    clearNew = nameIssueTransition(issue);
                });
                void viewTransition.finished.finally(() => clearNew());
            } catch {
                clearOld();
                setState(next);
            }
        });
    }, [history]);

    return (
        <Router location={state.location} navigationType={state.action} navigator={history}>
            {children}
        </Router>
    );
}
