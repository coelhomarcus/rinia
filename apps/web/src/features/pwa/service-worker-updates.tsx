import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useToast } from "@/components/feedback/toaster";

/** How often an open tab asks the server whether a new build has been deployed. */
const UPDATE_CHECK_MS = 60 * 60 * 1000;

/**
 * Registers the service worker (production builds only) and, when a new build has been installed in the background,
 * offers to reload into it. The new worker waits until then, so one page never mixes code from two builds.
 */
export function ServiceWorkerUpdates() {
    const { t } = useTranslation();
    const showToast = useToast();
    // Read when the toast shows, so a language change does not register the worker again.
    const text = useRef({ t, showToast });
    text.current = { t, showToast };

    useEffect(() => {
        if (!import.meta.env.PROD || !("serviceWorker" in navigator)) return;
        let disposed = false;
        let reloading = false;
        let registration: ServiceWorkerRegistration | undefined;

        const offer = (worker: ServiceWorker) => {
            if (disposed) return;
            const { t, showToast } = text.current;
            showToast({
                title: t("pwa.updateAvailable"),
                action: {
                    label: t("pwa.reload"),
                    onClick: () => {
                        reloading = true;
                        worker.postMessage({ type: "SKIP_WAITING" });
                    },
                },
            });
        };
        // A worker that finishes installing while another one controls the page is an update; the very first
        // install has no controller and needs no reload.
        const watch = (worker: ServiceWorker | null) => {
            worker?.addEventListener("statechange", () => {
                if (worker.state === "installed" && navigator.serviceWorker.controller) offer(worker);
            });
        };
        const onControllerChange = () => {
            if (reloading) window.location.reload();
        };
        const check = () => void registration?.update().catch(() => undefined);
        const onVisible = () => document.visibilityState === "visible" && check();

        navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);
        document.addEventListener("visibilitychange", onVisible);
        const interval = window.setInterval(check, UPDATE_CHECK_MS);
        navigator.serviceWorker
            .register("/sw.js", { scope: "/" })
            .then((registered) => {
                registration = registered;
                if (registered.waiting && navigator.serviceWorker.controller) offer(registered.waiting);
                watch(registered.installing);
                registered.addEventListener("updatefound", () => watch(registered.installing));
            })
            .catch(() => undefined);

        return () => {
            disposed = true;
            navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange);
            document.removeEventListener("visibilitychange", onVisible);
            window.clearInterval(interval);
        };
    }, []);

    return null;
}
