import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { Dialog } from "@base-ui/react/dialog";
import { Popover } from "@base-ui/react/popover";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, FileText, Plus, Search, Sparkles, Trash2 } from "lucide-react";
import { Link, useLocation, useNavigate, useParams } from "react-router";
import { useRouteProject } from "@/features/projects/route-project";
import { matchDocumentSlug, urls } from "@/lib/urls";
import { Button } from "@/components/base/buttons/button";
import { Skeleton } from "@/components/base/feedback/skeleton";
import { Input } from "@/components/base/input/input";
import { ErrorMessage } from "@/components/feedback/error-message";
import { useToast } from "@/components/feedback/toaster";
import { ContextMenuButton } from "@/components/overlay/context-menu-provider";
import { AppearancePicker, appearancePopupClass } from "@/components/appearance/appearance-picker";
import { useAuth } from "@/features/auth/hooks/use-auth";
import { type DocumentPage, deleteDocument, getDocument, restoreDocument } from "@/features/documents/api";
import { DocumentProvider, type DocumentProviderState } from "@/features/documents/collab/document-provider";
import { DocumentEditor } from "@/features/documents/components/document-editor";
import { documentKey, documentsKey, useCreateDocument, useDocument, useDocuments } from "@/features/documents/hooks/use-documents";
import { getDocumentSession } from "@/features/documents/sessions";
import { ProjectWorkspaceHeader } from "@/features/projects/components/project-workspace-header";
import { ProjectIcon } from "@/features/projects/components/project-icon";
import { sourceLabel } from "@/features/board/components/issue-property-icons";
import { useProjectMembers } from "@/features/projects/hooks/use-project-members";
import { useProjectPermissions } from "@/features/projects/hooks/use-project-permissions";
import { realtimeClient } from "@/features/realtime/realtime-client";
import { useChannelPresence } from "@/features/realtime/use-realtime";
import { ApiError } from "@/lib/api-client";
import { useTranslation } from "react-i18next";

export function ProjectDocumentsPage() {
    const { projectId, projectKey } = useRouteProject();
    return <DocumentList key={projectId} projectId={projectId} projectKey={projectKey} />;
}

function DocumentList({ projectId, projectKey }: { projectId: string; projectKey: string }) {
    const { t, i18n } = useTranslation();
    const { data: pages, isError } = useDocuments(projectId);
    const create = useCreateDocument(projectId);
    const navigate = useNavigate();
    const [search, setSearch] = useState("");
    const filtered = pages?.filter((page) => page.title.toLowerCase().includes(search.toLowerCase()));
    async function addPage() {
        try {
            const page = await create.mutateAsync({});
            navigate(urls.document(projectKey, page));
        } catch {
            /* The mutation error is displayed below. */
        }
    }
    return (
        <div className="flex h-full min-h-0 flex-col bg-surface-1">
            <ProjectWorkspaceHeader projectId={projectId} activeView="documents" hideSection favorite={null} />
            <main className="min-h-0 flex-1 overflow-y-auto px-4 pt-3 pb-3 lg:px-5">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                    <div className="w-64 max-w-full">
                        <Input size="sm" aria-label={t("documents.searchPages")} icon={Search} placeholder={`${t("documents.searchPages")}…`} value={search} onChange={setSearch} />
                    </div>
                    <Button size="sm" iconLeading={Plus} isLoading={create.isPending} onClick={addPage}>
                        {t("documents.newPage")}
                    </Button>
                </div>
                {create.isError && <ErrorMessage message={t("documents.createFailed")} />}
                {isError && <ErrorMessage message={t("documents.loadFailed")} />}
                {!pages && !isError ? (
                    <DocumentSkeleton />
                ) : filtered?.length ? (
                    <div className="divide-y divide-subtle border-y border-subtle">
                        {filtered.map((page) => (
                            <div
                                key={page.id}
                                className="group/page flex min-w-0 items-center rounded px-1 hover:bg-layer-1"
                                data-document-context="true"
                                data-project-id={projectId}
                                data-document-id={page.id}
                                data-document-title={page.title}
                                data-document-author-id={page.createdBy}
                            >
                                <Link
                                    to={urls.document(projectKey, page)}
                                    className="flex min-w-0 flex-1 items-center gap-2.5 px-2 py-2"
                                >
                                    {page.iconAppearance ? <ProjectIcon icon={page.iconAppearance} className="size-4 shrink-0 text-tertiary" /> : <FileText className="size-4 shrink-0 text-tertiary" />}
                                    <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-primary">{page.title}</span>
                                    <span className="hidden text-xs text-tertiary sm:block">
                                        {t("documents.created", { date: new Intl.DateTimeFormat(i18n.language, { dateStyle: "medium" }).format(new Date(page.createdAt)) })}
                                        {page.source && ` · ${t("issue.viaSource", { client: sourceLabel(page.source) })}`}
                                    </span>
                                </Link>
                                <ContextMenuButton
                                    entity={{ type: "document", projectId, documentId: page.id, title: page.title, authorId: page.createdBy }}
                                    className="mr-2 opacity-100 md:opacity-0 md:group-hover/page:opacity-100 md:group-focus-within/page:opacity-100"
                                />
                            </div>
                        ))}
                    </div>
                ) : (
                    pages && (
                        <div className="flex min-h-64 flex-col items-center justify-center gap-3 text-center">
                            <FileText className="size-8 text-placeholder" />
                            <h2 className="text-lg font-medium">{search ? t("documents.noPagesFound") : t("documents.startBlank")}</h2>
                            <p className="max-w-sm text-sm text-tertiary">
                                {search ? t("documents.tryDifferentTitle") : t("documents.writeFreely")}
                            </p>
                            {!search && (
                                <Button color="secondary" iconLeading={Plus} isLoading={create.isPending} onClick={addPage}>
                                    {t("documents.createPage")}
                                </Button>
                            )}
                        </div>
                    )
                )}
            </main>
        </div>
    );
}

export function ProjectDocumentPage() {
    const { documentSlug = "" } = useParams();
    const { projectId, projectKey } = useRouteProject();
    const { t } = useTranslation();
    const location = useLocation();
    const navigate = useNavigate();
    const { data: documents, isError: listFailed } = useDocuments(projectId);
    const documentId = matchDocumentSlug(documentSlug, documents)?.id ?? "";
    const { data: page, isError: pageFailed } = useDocument(projectId, documentId);
    const isError = pageFailed || listFailed || (!!documents && !documentId);
    const { user } = useAuth();
    const viewers = useChannelPresence(documentId ? `document:${documentId}` : null);
    // The slug follows the title, so renaming a page updates the address bar without reloading the editor.
    const canonicalUrl = page ? urls.document(projectKey, page) : null;
    useEffect(() => {
        if (canonicalUrl && location.pathname !== canonicalUrl) navigate(`${canonicalUrl}${location.search}`, { replace: true });
    }, [canonicalUrl, location.pathname, location.search, navigate]);
    return (
        <div className="flex h-full min-h-0 flex-col bg-surface-1">
            <ProjectWorkspaceHeader projectId={projectId} activeView="documents" favorite={documentId ? { kind: "document", projectId, documentId } : null} viewers={viewers} />
            {isError && page && <ErrorMessage message={t("documents.couldNotRefresh")} />}
            {page && user ? (
                <DocumentWorkspace key={`${user.id}:${projectId}:${documentId}`} page={page} userId={user.id} />
            ) : (
                <main className="flex-1 px-5 py-6 lg:px-8">
                    <Link to={urls.documents(projectKey)} className="mb-5 inline-flex items-center gap-2 text-sm text-tertiary">
                        <ArrowLeft className="size-4" />
                        {t("documents.allPages")}
                    </Link>
                    {isError ? (
                        <ErrorMessage message={t("documents.couldNotLoad")} />
                    ) : (
                        <DocumentSkeleton />
                    )}
                </main>
            )}
        </div>
    );
}

function DocumentWorkspace({ page, userId }: { page: DocumentPage; userId: string }) {
    const { t } = useTranslation();
    const { projectKey } = useRouteProject();
    const client = useQueryClient();
    const showToast = useToast();
    const navigate = useNavigate();
    const { user } = useAuth();
    const { isProjectOwner } = useProjectPermissions(page.projectId);
    const { data: members = [] } = useProjectMembers(page.projectId);
    const session = useMemo(() => getDocumentSession(userId, page, client), [userId, page.id, page.projectId, client]);
    const state = useSyncExternalStore(session.subscribe, session.getSnapshot);
    const provider = useDocumentProvider(userId, page);
    const collab = useSyncExternalStore(provider?.subscribe ?? noSubscribe, provider?.getSnapshot ?? (() => OFFLINE));
    const [confirmingDelete, setConfirmingDelete] = useState(false);
    const [busy, setBusy] = useState(false);
    const [actionError, setActionError] = useState("");
    const [iconPickerOpen, setIconPickerOpen] = useState(false);
    const titleRef = useRef<HTMLTextAreaElement>(null);
    // Cursors show who is typing where; the avatars in the header also mark who is typing right now.
    useChannelPresence(`document:${page.id}`, useRecentlyEdited(provider));
    useEffect(() => session.observe(page), [session, page]);
    useEffect(() => {
        const save = (event: KeyboardEvent) => {
            if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
                event.preventDefault();
                void session.flush();
            }
        };
        window.addEventListener("keydown", save);
        return () => window.removeEventListener("keydown", save);
    }, [session]);
    useEffect(() => {
        const title = titleRef.current;
        if (!title) return;
        const resize = () => {
            title.style.height = "auto";
            title.style.height = `${title.scrollHeight}px`;
        };
        resize();
        let width = title.parentElement!.clientWidth;
        const observer = new ResizeObserver(() => {
            const next = title.parentElement!.clientWidth;
            if (next !== width) {
                width = next;
                resize();
            }
        });
        // Observe the parent width, not the textarea height changed by resize().
        observer.observe(title.parentElement!);
        return () => observer.disconnect();
    }, [state.title, collab.ready]);
    async function confirmDelete() {
        setBusy(true);
        setActionError("");
        try {
            await session.pause();
            const { deletedAt } = await deleteDocument(page.projectId, page.id);
            await client.cancelQueries({ queryKey: documentKey(page.projectId, page.id) });
            client.removeQueries({ queryKey: documentKey(page.projectId, page.id) });
            void client.invalidateQueries({ queryKey: documentsKey(page.projectId), exact: true });
            void client.invalidateQueries({ queryKey: ["favorites"] });
            navigate(urls.documents(projectKey), { replace: true });
            showToast({
                title: t("documents.pageDeleted"),
                action: {
                    label: t("issue.undo"),
                    onClick: async () => {
                        try {
                            await restoreDocument(page.projectId, page.id, deletedAt);
                            session.resume();
                            const restored = await getDocument(page.projectId, page.id);
                            client.setQueryData(documentKey(page.projectId, page.id), restored);
                            await client.invalidateQueries({ queryKey: documentsKey(page.projectId), exact: true });
                            await client.invalidateQueries({ queryKey: ["favorites"] });
                            navigate(urls.document(projectKey, restored));
                        } catch {
                            showToast({ tone: "error", title: t("issue.couldNotUndo") });
                        }
                    },
                },
            });
            setConfirmingDelete(false);
        } catch (error) {
            session.resume();
            setActionError(error instanceof ApiError ? error.message : t("documents.couldNotComplete"));
        } finally {
            setBusy(false);
        }
    }
    const status = {
        saved: t("documents.saved"),
        pending: t("documents.unsaved"),
        saving: t("documents.saving"),
        offline: t("documents.offline"),
        error: t("documents.saveFailed"),
        deleted: t("documents.pageDeleted"),
    }[state.status === "saved" ? (collab.ready && !collab.connected ? "offline" : collab.unsynced ? "pending" : "saved") : state.status];
    return (
        <>
            <div className="flex h-[45px] shrink-0 items-center justify-between gap-3 border-b border-subtle px-4 lg:px-5">
                <Link to={urls.documents(projectKey)} className="inline-flex items-center gap-2 text-sm text-tertiary hover:text-primary">
                    <ArrowLeft className="size-4" />
                    {t("documents.allPages")}
                </Link>
                <div className="flex items-center gap-3">
                    <span role="status" aria-live="polite" className="text-xs text-tertiary">
                        {status}
                    </span>
                    {(page.createdBy === userId || isProjectOwner) && (
                        <Button
                            color="tertiary"
                            size="sm"
                            aria-label={t("documents.deletePage")}
                            iconLeading={Trash2}
                            isDisabled={busy}
                            onClick={() => {
                                setActionError("");
                                setConfirmingDelete(true);
                            }}
                        />
                    )}
                </div>
            </div>
            <main data-document-scroll className="document-scroll min-h-0 flex-1 overflow-y-auto">
                {!provider || !collab.ready ? (
                    <div className="px-5 py-6 lg:px-8">
                        {collab.failed ? <ErrorMessage message={t("documents.couldNotOpen")} /> : <DocumentSkeleton />}
                    </div>
                ) : (
                    <div className="document-writing-surface">
                        {state.status === "error" && (
                            <ErrorMessage message={`${t((state.error || "documents.couldNotSave") as "documents.couldNotSave")} ${t("documents.retrySave")}`} />
                        )}
                        {!collab.connected && <p className="mb-4 text-sm text-tertiary">{t("documents.offlineHint")}</p>}
                        {state.status === "deleted" && (
                            <div role="alert" className="mb-5 rounded-md border border-strong bg-layer-1 p-4">
                                <p className="text-sm font-medium">{t("documents.deletedMessage")}</p>
                            </div>
                        )}
                        {actionError && !confirmingDelete && <ErrorMessage message={actionError} />}
                        <div className="relative z-10 mb-5 flex flex-wrap items-end gap-2">
                            <Popover.Root open={iconPickerOpen} onOpenChange={setIconPickerOpen}>
                                <Popover.Trigger disabled={busy || state.status === "deleted"} aria-label={state.iconAppearance ? t("appearance.changePageIcon") : t("appearance.addPageIcon")} className={`flex items-center justify-center rounded-md border border-subtle bg-layer-2 text-secondary hover:bg-layer-2-hover ${state.iconAppearance ? "size-12" : "h-7 gap-1.5 px-2 text-xs font-medium"}`}>
                                    {state.iconAppearance ? <ProjectIcon icon={state.iconAppearance} className="size-6" /> : <><Sparkles className="size-3.5" /> {t("appearance.addPageIcon")}</>}
                                </Popover.Trigger>
                                <Popover.Portal>
                                    <Popover.Positioner sideOffset={8} collisionPadding={12} className="z-[60]">
                                        <Popover.Popup className={appearancePopupClass}>
                                            <Popover.Title className="sr-only">{t("appearance.pageIcon")}</Popover.Title>
                                            <AppearancePicker value={state.iconAppearance} onChange={(iconAppearance) => session.edit({ iconAppearance })} onComplete={() => setIconPickerOpen(false)} />
                                        </Popover.Popup>
                                    </Popover.Positioner>
                                </Popover.Portal>
                            </Popover.Root>
                        </div>
                        <textarea
                            ref={titleRef}
                            aria-label={t("documents.pageTitle")}
                            rows={1}
                            maxLength={200}
                            value={state.title}
                            placeholder={t("documents.untitled")}
                            className="document-title"
                            disabled={busy || state.status === "deleted"}
                            onChange={(event) => session.edit({ title: event.target.value.replace(/\n/g, " ") })}
                            onKeyDown={(event) => {
                                if (event.key === "Enter") {
                                    event.preventDefault();
                                    event.currentTarget.parentElement?.querySelector<HTMLElement>('[contenteditable="true"]')?.focus();
                                }
                            }}
                        />
                        <DocumentEditor
                            provider={provider}
                            user={{ id: userId, name: user?.name ?? "" }}
                            members={members}
                            disabled={busy || state.status === "deleted"}
                        />
                    </div>
                )}
            </main>
            <Dialog.Root
                open={confirmingDelete}
                onOpenChange={(open) => {
                    if (!busy && !open) setConfirmingDelete(false);
                }}
            >
                <Dialog.Portal>
                    <Dialog.Backdrop className="fixed inset-0 z-50 bg-backdrop" />
                    <Dialog.Viewport className="fixed inset-0 z-50 flex items-center justify-center p-4">
                        <Dialog.Popup className="w-full max-w-md rounded-lg border border-subtle bg-layer-2 p-6 shadow-overlay-200">
                            <Dialog.Title className="text-lg font-semibold">{t("documents.deleteTitle")}</Dialog.Title>
                            <Dialog.Description className="mt-2 text-sm text-tertiary">{t("documents.deleteWarning")}</Dialog.Description>
                            {actionError && <ErrorMessage message={actionError} />}
                            <div className="mt-6 flex justify-end gap-2">
                                <Button color="secondary" isDisabled={busy} onClick={() => setConfirmingDelete(false)}>
                                    {t("common.cancel")}
                                </Button>
                                <Button color="primary-destructive" isLoading={busy} onClick={confirmDelete}>
                                    {t("documents.deletePage")}
                                </Button>
                            </div>
                        </Dialog.Popup>
                    </Dialog.Viewport>
                </Dialog.Portal>
            </Dialog.Root>
        </>
    );
}

/** How long after the last keystroke someone still counts as editing the page, for the avatars other people see. */
const EDITING_IDLE_MS = 10_000;
const OFFLINE: DocumentProviderState = { connected: false, synced: false, restored: false, unsynced: false, failed: false, ready: false };
const noSubscribe = () => () => {};

/** True from this tab's last edit of the page content until it has been idle for a while. */
function useRecentlyEdited(provider: DocumentProvider | null) {
    const [editing, setEditing] = useState(false);
    useEffect(() => {
        if (!provider) return;
        let timer: ReturnType<typeof setTimeout> | undefined;
        // Only changes made here are local; edits from other people and the copy kept in this browser arrive as updates.
        const onTransaction = (transaction: { local: boolean }) => {
            if (!transaction.local) return;
            setEditing(true);
            clearTimeout(timer);
            timer = setTimeout(() => setEditing(false), EDITING_IDLE_MS);
        };
        provider.doc.on("afterTransaction", onTransaction);
        return () => {
            clearTimeout(timer);
            provider.doc.off("afterTransaction", onTransaction);
        };
    }, [provider]);
    return editing;
}

/** The page's collaborative document, joined for as long as the page is open. Null until the first render has committed. */
function useDocumentProvider(userId: string, page: DocumentPage) {
    const [provider, setProvider] = useState<DocumentProvider | null>(null);
    useEffect(() => {
        const created = new DocumentProvider(userId, page.projectId, page.id, realtimeClient);
        setProvider(created);
        return () => {
            created.destroy();
            setProvider(null);
        };
    }, [userId, page.projectId, page.id]);
    return provider;
}

function DocumentSkeleton() {
    const { t } = useTranslation();
    return (
        <div role="status" aria-label={t("documents.loading")} className="space-y-5">
            <Skeleton className="h-8 w-2/5" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-4/5" />
            <Skeleton className="h-4 w-3/5" />
        </div>
    );
}
