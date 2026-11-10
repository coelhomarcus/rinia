import { createContext, type ComponentProps, type ReactNode, useContext, useEffect, useMemo, useRef, useSyncExternalStore } from "react";
import { LazyMotion, m } from "motion/react";
import { useReducedMotion } from "@/hooks/use-reduced-motion";
import { Avatar } from "@/components/base/avatar/avatar";
import { getInitials } from "@/components/base/avatar/utils";
import { issueMotionEnabled, issuePresenceMotion, remoteIssueChanges, type RemoteIssueChange } from "@/features/realtime/remote-issue-changes";

const EASE = [0.2, 0, 0, 1] as const;
const NO_PEOPLE: Array<{ id: string; name: string; avatarUrl: string | null }> = [];
const NO_IDS: ReadonlySet<string> = new Set();
/** Instant, so a card that only changed column does not linger and crossfade with the one that glides. */
const HANDOFF_EXIT = { opacity: 1, transition: { duration: 0 } } as const;

/**
 * The animation engine (layout glides) arrives after the first paint, in a chunk of its own: the cards render at once and
 * start gliding when it is there. Only this file may use `m` components, so the engine is not needed to render a list.
 */
const loadMotionFeatures = () => import("./motion-features").then((module) => module.default);

const CurrentRosterContext = createContext<ReadonlySet<string>>(NO_IDS);
const PreviousRosterContext = createContext<ReadonlySet<string>>(NO_IDS);

/**
 * The issues on screen right now, and the ones from the render before. A card that leaves one column and
 * enters another is in both, so it glides instead of fading out of the old place and into the new one.
 */
export function IssueMotionRoster({ ids, children }: { ids: readonly string[]; children: ReactNode }) {
    const current = useMemo(() => new Set(ids), [ids]);
    const previousRef = useRef<ReadonlySet<string>>(NO_IDS);
    const previous = previousRef.current;
    useEffect(() => {
        previousRef.current = current;
    }, [current]);
    return (
        <LazyMotion features={loadMotionFeatures}>
            <CurrentRosterContext.Provider value={current}>
                <PreviousRosterContext.Provider value={previous}>{children}</PreviousRosterContext.Provider>
            </CurrentRosterContext.Provider>
        </LazyMotion>
    );
}

function useRemoteIssueChange(issueId: string): RemoteIssueChange | null {
    return useSyncExternalStore(
        remoteIssueChanges.subscribe,
        () => remoteIssueChanges.read(issueId),
        () => null,
    );
}

type Person = { id: string; name: string; avatarUrl: string | null };

/**
 * The card or row that glides when its place changes. `layout="position"` moves it with a transform, so a board of
 * hundreds of cards does not write layout on every frame of the glide. While this person is dragging, dnd-kit is
 * already animating and measuring continuously, so the layout animation stays off.
 */
export function IssueMotionFrame({
    issueId,
    suspendLayout = false,
    animatePresence = false,
    layoutAnimation = true,
    people = NO_PEOPLE,
    placement = "card",
    nodeRef,
    style,
    className,
    children,
    ...rest
}: {
    issueId: string;
    /** True for the whole drag, including the moment the dropped order is still a preview. */
    suspendLayout?: boolean;
    /** Fade and scale items that join or leave. The first paint of a list does not, because its AnimatePresence opts out. */
    animatePresence?: boolean;
    /** Off where another animation already moves the row, such as My issues. */
    layoutAnimation?: boolean;
    people?: Person[];
    placement?: "card" | "row";
    nodeRef: (element: HTMLElement | null) => void;
    children: ReactNode;
} & Omit<ComponentProps<typeof m.div>, "layout" | "layoutId" | "initial" | "animate" | "exit" | "transition">) {
    const reduced = useReducedMotion();
    const motionOn = issueMotionEnabled({ suspend: suspendLayout || !layoutAnimation, reducedMotion: reduced });
    const roster = useContext(CurrentRosterContext);
    const previousRoster = useContext(PreviousRosterContext);
    const presence = issuePresenceMotion({
        motionOn,
        animatePresence,
        wasOnScreen: previousRoster.has(issueId),
        stillOnScreen: roster.has(issueId),
    });
    const change = useRemoteIssueChange(issueId);
    const actor = change?.actorId ? people.find((person) => person.id === change.actorId) : undefined;

    return (
        <m.div
            ref={nodeRef}
            layout={motionOn ? "position" : false}
            layoutId={motionOn ? issueId : undefined}
            initial={presence.enter ? { opacity: 0, scale: 0.96 } : false}
            animate={{ opacity: 1, scale: 1 }}
            exit={presence.exit ? { opacity: 0, scale: 0.96 } : HANDOFF_EXIT}
            transition={
                motionOn
                    ? { layout: { duration: 0.32, ease: EASE }, opacity: { duration: 0.18, ease: EASE }, scale: { duration: 0.18, ease: EASE } }
                    : { duration: 0 }
            }
            {...rest}
            className={className}
            style={suspendLayout ? style : undefined}
            data-remote-change={change ? "true" : undefined}
        >
            {children}
            {change && <span key={change.at} className={`remote-issue-highlight pointer-events-none absolute inset-0 z-[1] ${placement === "card" ? "rounded-md" : ""}`} aria-hidden="true" />}
            {actor && (
                <span className={`remote-issue-actor pointer-events-none absolute z-[2] ${placement === "row" ? "top-1/2 right-16 -translate-y-1/2" : "right-1.5 bottom-1.5"}`} aria-hidden="true">
                    <Avatar src={actor.avatarUrl} alt="" initials={getInitials(actor.name)} size="xs" className="size-5 ring-2 ring-[var(--bg-surface-1)]" />
                </span>
            )}
        </m.div>
    );
}
