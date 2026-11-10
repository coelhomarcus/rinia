/**
 * Loads a lazy chunk once the browser has nothing better to do, so the next page opens without a wait but this one
 * paints first. A failed load is ignored: the chunk loads again when the page is actually opened.
 */
export function preloadWhenIdle(load: () => Promise<unknown>) {
    if (typeof window === "undefined") return;
    const run = () => void load().catch(() => undefined);
    if (typeof window.requestIdleCallback === "function") window.requestIdleCallback(run, { timeout: 5000 });
    else window.setTimeout(run, 2000);
}
