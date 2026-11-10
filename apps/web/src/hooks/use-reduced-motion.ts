import { useSyncExternalStore } from "react";

const QUERY = "(prefers-reduced-motion: reduce)";

function subscribe(onChange: () => void) {
    const media = window.matchMedia(QUERY);
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
}

/** Whether the person asked their system for less motion. A plain media query, so code that only needs this does not load the animation library. */
export function useReducedMotion() {
    return useSyncExternalStore(
        subscribe,
        () => window.matchMedia(QUERY).matches,
        () => false,
    );
}
