import { useSyncExternalStore } from "react";

interface BeforeInstallPromptEvent extends Event {
    prompt: () => Promise<void>;
    userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

let deferred: BeforeInstallPromptEvent | null = null;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((listener) => listener());

/**
 * The browser offers installation once, early, through `beforeinstallprompt`. It is kept here from the first moment
 * (main.tsx imports this module) so the "Install app" item can use it whenever the menu opens.
 */
if (typeof window !== "undefined") {
    window.addEventListener("beforeinstallprompt", (event) => {
        event.preventDefault();
        deferred = event as BeforeInstallPromptEvent;
        notify();
    });
    window.addEventListener("appinstalled", () => {
        deferred = null;
        notify();
    });
}

function subscribe(listener: () => void) {
    listeners.add(listener);
    return () => listeners.delete(listener);
}

/** True when running as the installed app rather than in a browser tab. */
export function isStandalone() {
    if (typeof window === "undefined") return false;
    return window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

/** Whether the browser can install Rinia right now, and the call that shows its install dialog. */
export function useInstallPrompt() {
    const available = useSyncExternalStore(subscribe, () => deferred !== null && !isStandalone(), () => false);
    async function install() {
        const event = deferred;
        if (!event) return;
        deferred = null;
        notify();
        await event.prompt();
        await event.userChoice.catch(() => undefined);
    }
    return { available, install };
}
