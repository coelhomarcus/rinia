import { useEffect, useState } from "react";
import { History, RotateCcw, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/base/buttons/button";
import { Skeleton } from "@/components/base/feedback/skeleton";
import { Sheet } from "@/components/base/sheet/sheet";
import { EmptyState } from "@/components/feedback/empty-state";
import { IssueAvatarGroup, sourceLabel } from "@/features/board/components/issue-property-icons";
import { cx } from "@/utils/cx";
import type { DescriptionRevision } from "../api";
import { useDescriptionRevisions } from "../hooks/use-issues";
import { RichTextEditor } from "./rich-text-editor";

function formatVersionDate(value: string, locale: string) {
    return new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

/**
 * The versions of an issue's description, newest first, with the selected one's text. Restoring brings that text
 * back as a new version, so nothing in the list is ever lost.
 */
export function DescriptionHistorySheet({
    identifier,
    open,
    onOpenChange,
    isRestoring,
    onRestore,
}: {
    identifier: string;
    open: boolean;
    onOpenChange: (open: boolean) => void;
    isRestoring: boolean;
    onRestore: (revision: DescriptionRevision) => Promise<void>;
}) {
    const { t, i18n } = useTranslation();
    const { data: revisions, isLoading, isError } = useDescriptionRevisions(identifier, open);
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const selected = revisions?.find((revision) => revision.id === selectedId) ?? revisions?.[0];
    const isCurrent = !!selected && selected.id === revisions?.[0]?.id;
    const dateOf = (id: string | null) => revisions?.find((revision) => revision.id === id)?.updatedAt;

    // A restore adds a version at the top; follow it so the panel shows what the description now says.
    useEffect(() => {
        if (!open) setSelectedId(null);
    }, [open]);

    return (
        <Sheet open={open} onOpenChange={onOpenChange} title={t("issue.descriptionHistory")}>
            <header className="flex h-11 shrink-0 items-center justify-between gap-3 border-b border-subtle px-4">
                <h2 className="flex items-center gap-2 text-[13px] font-medium text-primary">
                    <History className="size-4 text-tertiary" />
                    {t("issue.descriptionHistory")}
                </h2>
                <button type="button" aria-label={t("common.close")} onClick={() => onOpenChange(false)} className="grid size-7 place-items-center rounded-md text-tertiary hover:bg-layer-transparent-hover hover:text-primary">
                    <X className="size-4" />
                </button>
            </header>
            {isLoading && (
                <div className="flex flex-col gap-3 p-4" role="status" aria-label={t("common.loading")}>
                    <Skeleton className="h-10 w-full" />
                    <Skeleton className="h-10 w-full" />
                    <Skeleton className="h-40 w-full" />
                </div>
            )}
            {isError && <p role="alert" className="p-4 text-sm text-danger-primary">{t("issue.couldNotLoadHistory")}</p>}
            {revisions?.length === 0 && <EmptyState framed={false} className="flex-1" title={t("issue.noDescriptionHistory")} description={t("issue.noDescriptionHistoryHint")} />}
            {selected && revisions && (
                <div className="flex min-h-0 flex-1 flex-col md:flex-row">
                    <ol aria-label={t("issue.descriptionHistory")} className="flex max-h-56 shrink-0 flex-col gap-px overflow-y-auto border-b border-subtle p-2 md:max-h-none md:w-56 md:border-r md:border-b-0">
                        {revisions.map((revision, index) => {
                            const active = revision.id === selected.id;
                            return (
                                <li key={revision.id} className="animate-enter">
                                    <button
                                        type="button"
                                        aria-current={active ? "true" : undefined}
                                        onClick={() => setSelectedId(revision.id)}
                                        className={cx("flex w-full items-start gap-2.5 rounded-md px-2 py-2 text-left transition-colors duration-150", active ? "bg-layer-1-selected" : "hover:bg-layer-transparent-hover")}
                                    >
                                        <IssueAvatarGroup name={revision.author.name} avatarUrl={revision.author.avatarUrl} source={revision.source} className="mt-0.5 size-5 text-[10px]" />
                                        <span className="flex min-w-0 flex-1 flex-col">
                                            <span className="flex items-center gap-1.5 text-[13px] text-primary">
                                                <span className="truncate">{revision.author.name}</span>
                                                {revision.source && <span className="shrink-0 text-[12px] text-tertiary">{t("issue.viaSource", { client: sourceLabel(revision.source) })}</span>}
                                                {index === 0 && <span className="shrink-0 rounded bg-layer-2 px-1 text-[10px] text-tertiary">{t("issue.currentVersion")}</span>}
                                            </span>
                                            <time dateTime={revision.updatedAt} className="text-[12px] text-tertiary">{formatVersionDate(revision.updatedAt, i18n.language)}</time>
                                            {revision.restoredFromId && (
                                                <span className="flex items-center gap-1 text-[11px] text-placeholder">
                                                    <RotateCcw className="size-3 shrink-0" />
                                                    <span className="truncate">{t("issue.restoredFromVersion", { date: dateOf(revision.restoredFromId) ? formatVersionDate(dateOf(revision.restoredFromId)!, i18n.language) : "—" })}</span>
                                                </span>
                                            )}
                                        </span>
                                    </button>
                                </li>
                            );
                        })}
                    </ol>
                    <section aria-label={formatVersionDate(selected.updatedAt, i18n.language)} className="flex min-h-0 min-w-0 flex-1 flex-col">
                        <div className="flex h-12 shrink-0 items-center justify-between gap-3 border-b border-subtle px-4">
                            <span className="min-w-0 truncate text-[12px] text-tertiary">
                                {selected.author.name} · {formatVersionDate(selected.updatedAt, i18n.language)}
                            </span>
                            <Button
                                size="xs"
                                color="secondary"
                                iconLeading={RotateCcw}
                                isDisabled={isCurrent}
                                isLoading={isRestoring}
                                onClick={async () => {
                                    await onRestore(selected);
                                    setSelectedId(null);
                                }}
                            >
                                {t("issue.restoreVersion")}
                            </Button>
                        </div>
                        <div key={selected.id} className="animate-enter min-h-0 flex-1 overflow-y-auto px-4 py-4">
                            {selected.contentJson.content?.length ? (
                                <RichTextEditor toolbar={false} variant="description" content={selected.contentJson} editable={false} />
                            ) : (
                                <p className="text-[13px] text-placeholder">{t("issue.emptyVersion")}</p>
                            )}
                        </div>
                    </section>
                </div>
            )}
        </Sheet>
    );
}
