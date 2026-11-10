import { Suspense } from "react";
import { Outlet } from "react-router";
import { Skeleton } from "@/components/base/feedback/skeleton";
import { RiniaLogo } from "@/components/foundations/logo/rinia-logo";
import { LanguageSelector } from "@/i18n/language-selector";
import { useTranslation } from "react-i18next";

export function AuthLayout() {
    const { t } = useTranslation();
    return (
        <div className="flex min-h-dvh flex-col bg-canvas p-safe text-primary">
            <header className="flex h-12 items-center justify-between px-4 md:px-6">
                <RiniaLogo />
                <LanguageSelector compact />
            </header>
            <main className="flex flex-1 items-center justify-center px-4 pb-12">
                <div className="w-full max-w-[360px] rounded-lg border border-subtle bg-surface-1 p-6">
                    <Suspense
                        fallback={
                            <div className="space-y-4" role="status" aria-label={t("auth.loadingPage")}>
                                <Skeleton className="h-7 w-40" />
                                <Skeleton className="h-10 w-full" />
                                <Skeleton className="h-10 w-full" />
                                <Skeleton className="h-9 w-full" />
                            </div>
                        }
                    >
                        <Outlet />
                    </Suspense>
                </div>
            </main>
            <footer className="px-6 py-5 text-center text-xs text-placeholder">{t("auth.footer")}</footer>
        </div>
    );
}
