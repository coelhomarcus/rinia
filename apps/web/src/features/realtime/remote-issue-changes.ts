import type { RealtimeEvent, RealtimeEventType } from "@rinia/shared";

/** How long a teammate's change keeps its accent tint. */
export const REMOTE_ISSUE_HIGHLIGHT_MS = 1000;

const ISSUE_EVENTS = new Set<RealtimeEventType>(["issue.created", "issue.updated", "issue.deleted", "issue.restored"]);

export type RemoteIssueChange = { issueId: string; actorId: string | null; at: number };

/** Layout animation stays off while this person is dragging, and whenever they asked for less motion. */
export function issueMotionEnabled({ suspend, reducedMotion }: { suspend: boolean; reducedMotion: boolean }) {
    return !suspend && !reducedMotion;
}

/**
 * A card that changes column is the same card: it glides, and the copy it leaves behind does not fade.
 * Fading is for a card that is actually arriving or leaving the screen.
 */
export function issuePresenceMotion({
    motionOn,
    animatePresence,
    wasOnScreen,
    stillOnScreen,
}: {
    motionOn: boolean;
    animatePresence: boolean;
    /** True when this id was already on the board or list. A move, not a create. */
    wasOnScreen: boolean;
    /** True when this id is still on the board or list. A move, not a delete. */
    stillOnScreen: boolean;
}) {
    const play = motionOn && animatePresence;
    return {
        enter: play && !wasOnScreen,
        exit: play && !stillOnScreen,
    };
}

/**
 * Issue changes that arrived from another tab, person, or MCP client. Cards subscribe per id, and an id that was
 * not in the batch keeps the snapshot it already returned, so the other cards on a large board do not re-render.
 */
export function createRemoteIssueChanges() {
    const cache = new Map<string, RemoteIssueChange>();
    const timers = new Map<string, ReturnType<typeof setTimeout>>();
    const listeners = new Set<() => void>();

    function emit() {
        for (const listener of listeners) listener();
    }

    function clearTimer(issueId: string) {
        const timer = timers.get(issueId);
        if (!timer) return;
        clearTimeout(timer);
        timers.delete(issueId);
    }

    const api = {
        note(events: RealtimeEvent[], now = Date.now()) {
            let changed = false;
            for (const event of events) {
                if (!ISSUE_EVENTS.has(event.type)) continue;
                clearTimer(event.id);
                cache.set(event.id, { issueId: event.id, actorId: event.actorId, at: now });
                timers.set(
                    event.id,
                    setTimeout(() => {
                        timers.delete(event.id);
                        api.expire(Date.now());
                    }, REMOTE_ISSUE_HIGHLIGHT_MS),
                );
                changed = true;
            }
            if (changed) emit();
        },
        read(issueId: string): RemoteIssueChange | null {
            return cache.get(issueId) ?? null;
        },
        subscribe(listener: () => void) {
            listeners.add(listener);
            return () => listeners.delete(listener);
        },
        /** Drops highlights whose second is up. Tests call it with their own clock; the timers call it with the real one. */
        expire(now: number) {
            let changed = false;
            for (const [issueId, change] of cache) {
                if (now - change.at < REMOTE_ISSUE_HIGHLIGHT_MS) continue;
                cache.delete(issueId);
                clearTimer(issueId);
                changed = true;
            }
            if (changed) emit();
        },
        dispose() {
            for (const timer of timers.values()) clearTimeout(timer);
            timers.clear();
            cache.clear();
            listeners.clear();
        },
    };

    return api;
}

export const remoteIssueChanges = createRemoteIssueChanges();
