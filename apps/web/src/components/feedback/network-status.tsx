import { useEffect, useState } from "react";
import { RefreshCw, WifiOff } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useRealtimeStatus } from "@/features/realtime/use-realtime";

/** A dropped live connection is only reported once it has stayed down this long, so a quick reconnect goes unnoticed. */
const RECONNECT_GRACE_MS = 3_000;

export const NetworkStatus = () => {
    const { t } = useTranslation();
    const [isOffline, setIsOffline] = useState(() => typeof navigator !== "undefined" && !navigator.onLine);
    const realtime = useRealtimeStatus();
    const [reconnecting, setReconnecting] = useState(false);

    useEffect(() => {
        const handleOffline = () => setIsOffline(true);
        const handleOnline = () => setIsOffline(false);

        window.addEventListener("offline", handleOffline);
        window.addEventListener("online", handleOnline);
        return () => {
            window.removeEventListener("offline", handleOffline);
            window.removeEventListener("online", handleOnline);
        };
    }, []);

    useEffect(() => {
        if (realtime !== "offline") return setReconnecting(false);
        const timer = window.setTimeout(() => setReconnecting(true), RECONNECT_GRACE_MS);
        return () => window.clearTimeout(timer);
    }, [realtime]);

    if (!isOffline && !reconnecting) return null;
    const Icon = isOffline ? WifiOff : RefreshCw;

    return (
        <div className="fixed inset-x-0 bottom-3 z-40 mx-auto flex w-fit max-w-[calc(100vw-2rem)] items-center gap-2 animate-enter rounded-full border border-subtle bg-surface-1 px-3 py-2 text-xs font-medium text-secondary shadow-xl" role="status" aria-live="polite" data-print-hide>
            <Icon className={`size-3.5 shrink-0 text-fg-warning-primary ${isOffline ? "" : "motion-safe:animate-spin"}`} aria-hidden="true" />
            <span>{isOffline ? t("common.offlineNotice") : t("realtime.reconnecting")}</span>
        </div>
    );
};
