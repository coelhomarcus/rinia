import { useEffect, type ReactNode } from "react";
import { WifiOff } from "lucide-react";
import { Navigate, useLocation } from "react-router";
import { Button } from "@/components/base/buttons/button";
import { LoadingState } from "@/components/feedback/loading-state";
import { useAuth } from "../hooks/use-auth";
import { useTranslation } from "react-i18next";

export const RequireAuth = ({ children }: { children: ReactNode }) => {
    const { t } = useTranslation();
    const { user, isLoading, unreachable, retry } = useAuth();
    const location = useLocation();

    if (isLoading) {
        return <LoadingState label={t("auth.loadingSession")} className="flex min-h-dvh items-center justify-center bg-surface-1" />;
    }

    if (!user && unreachable) {
        return <OfflineScreen onRetry={retry} />;
    }

    if (!user) {
        return <Navigate to="/login" state={{ from: location }} replace />;
    }

    return children;
};

/** Shown instead of the sign-in page when the session could not be checked, such as when the app opens offline. */
function OfflineScreen({ onRetry }: { onRetry: () => void }) {
    const { t } = useTranslation();
    useEffect(() => {
        window.addEventListener("online", onRetry);
        return () => window.removeEventListener("online", onRetry);
    }, [onRetry]);
    return (
        <main className="flex min-h-dvh items-center justify-center bg-canvas p-6">
            <div className="flex max-w-sm flex-col items-center gap-3 text-center" role="status" aria-live="polite">
                <span className="grid size-10 place-items-center rounded-full bg-layer-1 text-tertiary">
                    <WifiOff className="size-5" aria-hidden="true" />
                </span>
                <h1 className="text-base font-semibold text-primary">{t("pwa.offlineTitle")}</h1>
                <p className="text-sm text-tertiary">{t("pwa.offlineDescription")}</p>
                <Button size="sm" color="secondary" onClick={onRetry} className="mt-2">
                    {t("pwa.retry")}
                </Button>
            </div>
        </main>
    );
}
