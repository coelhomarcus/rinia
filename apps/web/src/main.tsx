import { QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { ViewTransitionRouter } from "@/components/application/view-transition-router";
import { AppErrorBoundary } from "@/components/feedback/app-error-boundary";
import { ToastProvider } from "@/components/feedback/toaster";
import { ContextMenuProvider } from "@/components/overlay/context-menu-provider";
import { AuthProvider } from "@/features/auth/hooks/use-auth";
import { queryClient } from "@/lib/query-client";
import { RouteProvider } from "@/providers/router-provider";
import { ThemeProvider } from "@/providers/theme-provider";
import { LanguageProvider } from "@/i18n/language-provider";
import { AppRoutes } from "@/routes";
import { ServiceWorkerUpdates } from "@/features/pwa/service-worker-updates";
// Imported first thing so the browser's one-time install offer is not missed.
import "@/features/pwa/install-prompt";
import "@/styles/globals.css";

// Development-only element picker for agents. Vite replaces `import.meta.env.DEV` with `false` in builds, so production never ships it.
if (import.meta.env.DEV) {
    void import("react-grab");
}

createRoot(document.getElementById("root")!).render(
    <StrictMode>
        <AppErrorBoundary>
            <ThemeProvider>
                <QueryClientProvider client={queryClient}>
                    <AuthProvider>
                        <LanguageProvider>
                            <ViewTransitionRouter>
                                <RouteProvider>
                                    <ToastProvider>
                                        <ServiceWorkerUpdates />
                                        <ContextMenuProvider>
                                            <AppRoutes />
                                        </ContextMenuProvider>
                                    </ToastProvider>
                                </RouteProvider>
                            </ViewTransitionRouter>
                        </LanguageProvider>
                    </AuthProvider>
                </QueryClientProvider>
            </ThemeProvider>
        </AppErrorBoundary>
    </StrictMode>,
);
