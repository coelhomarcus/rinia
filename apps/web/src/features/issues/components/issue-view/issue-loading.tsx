import { ChevronRight } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Skeleton } from "@/components/base/feedback/skeleton";
import { issueTransitionProps } from "@/lib/view-transition";

/** The first paint of an issue, before its request returns, so the row's identifier and title have somewhere to land. */
export function IssueArrival({ identifier, title }: { identifier: string; title: string }) {
    const { t } = useTranslation();
    return (
        <main className="flex h-full min-h-0 flex-col bg-surface-1" role="status" aria-label={t("issue.loadingIssueDetails")} aria-live="polite">
            <header className="flex h-11 shrink-0 items-center gap-1.5 border-b border-subtle px-3 text-[13px]">
                <Skeleton className="h-4 w-24" />
                <ChevronRight className="size-3 shrink-0 text-placeholder" aria-hidden="true" />
                <Skeleton className="h-4 w-14" />
                <ChevronRight className="size-3 shrink-0 text-placeholder" aria-hidden="true" />
                <span className="truncate text-tertiary" {...issueTransitionProps(identifier, "id")}>{identifier}</span>
            </header>
            <div className="mx-auto w-full max-w-[48rem] px-6 pt-10 lg:px-12">
                <h1 className="text-[26px] leading-8 font-semibold tracking-tight text-primary" {...issueTransitionProps(identifier, "title")}>{title}</h1>
                <div className="mt-6 space-y-5">
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-4 w-4/5" />
                    <Skeleton className="mt-10 h-5 w-24" />
                    <Skeleton className="h-16 w-full" />
                </div>
            </div>
        </main>
    );
}

export function IssueLoadingSkeleton() {
    const { t } = useTranslation();
    return (
        <main className="flex h-full min-h-0 flex-col bg-surface-1" role="status" aria-label={t("issue.loadingIssueDetails")} aria-live="polite">
            <div className="flex h-11 shrink-0 items-center border-b border-subtle px-4">
                <Skeleton className="h-4 w-64" />
            </div>
            <div className="flex min-h-0 flex-1">
                <div className="mx-auto w-full max-w-[48rem] space-y-5 px-6 pt-10 lg:px-12">
                    <Skeleton className="h-8 w-3/5" />
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-4 w-4/5" />
                    <Skeleton className="mt-10 h-5 w-24" />
                    <Skeleton className="h-16 w-full" />
                </div>
                <div className="hidden w-[17.5rem] shrink-0 space-y-3 px-5 pt-16 lg:block">
                    <Skeleton className="h-4 w-20" />
                    <Skeleton className="h-8 w-full" />
                    <Skeleton className="h-8 w-full" />
                    <Skeleton className="h-8 w-full" />
                </div>
            </div>
        </main>
    );
}
