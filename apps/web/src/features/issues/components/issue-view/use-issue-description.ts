import { useEffect, useImperativeHandle, useRef, useState, type Ref } from "react";
import type { TiptapDocument } from "@rinia/shared";
import { useNavigate } from "react-router";
import { useTranslation } from "react-i18next";
import { useToast } from "@/components/feedback/toaster";
import { ApiError } from "@/lib/api-client";
import { urls } from "@/lib/urls";
import { issueNavigation } from "@/lib/view-transition";
import type { DescriptionRevision, IssueDetail } from "../../api";
import { useCreateIssue, useRestoreDescriptionRevision } from "../../hooks/use-issues";
import { errorMessage } from "../../lib/error-message";
import { issueDescriptionDrafts, issueDraftKey } from "../../lib/issue-description-drafts";
import { EMPTY_TIPTAP_DOCUMENT } from "../rich-text-editor";
import type { IssueUpdater } from "./use-issue-mutations";

type DescriptionStatus = "saved" | "unsaved" | "saving" | "offline" | "error" | "conflict";

/** What the rest of the page can ask of the description editor. */
export interface DescriptionControls {
    /** The text as it is now, saved or not. */
    getContent: () => TiptapDocument;
}

interface Options {
    issue: IssueDetail;
    userId: string | undefined;
    updater: IssueUpdater;
    /** The title as typed, which a copy made from a conflicting draft is named after. */
    getTitle: () => string;
    controls?: Ref<DescriptionControls>;
    /** Whether there are edits not yet saved, and whether a save is running, for the page's header and its leave warning. */
    onDirtyChange: (dirty: boolean) => void;
    onSavingChange: (saving: boolean) => void;
}

/**
 * The issue's description while it is edited: the text, saving it a second after the last keystroke, keeping a draft in
 * the browser so a closed tab or a lost connection costs nothing, and noticing when someone else changed it meanwhile.
 *
 * It lives with the editor, so typing re-renders the description and nothing else on the page.
 */
export function useIssueDescription({ issue, userId, updater, getTitle, controls, onDirtyChange, onSavingChange }: Options) {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const showToast = useToast();
    const createIssue = useCreateIssue(issue.projectId);
    const restoreRevision = useRestoreDescriptionRevision(issue.identifier);
    const initial = issue.descriptionJson ?? EMPTY_TIPTAP_DOCUMENT;
    const [description, setDescription] = useState<TiptapDocument>(initial);
    const [saveError, setSaveError] = useState<string | null>(null);
    const [status, setStatus] = useState<DescriptionStatus>("saved");
    const loadedIssueId = useRef<string | null>(null);
    const dirty = useRef(false);
    const revision = useRef(issue.descriptionRevision);
    const latest = useRef<TiptapDocument>(initial);
    const saved = useRef<TiptapDocument>(initial);
    const saveLoop = useRef<Promise<void> | null>(null);
    const draftKey = useRef<string | null>(null);
    const draftContext = useRef<{ key: string; userId: string; projectId: string; issueId: string } | null>(null);
    const draftRestoreIssue = useRef<string | null>(null);
    const flushRef = useRef<() => Promise<void>>(async () => undefined);
    const persistDraftRef = useRef<() => void>(() => undefined);

    useImperativeHandle(controls, () => ({ getContent: () => latest.current }), []);

    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
                event.preventDefault();
                void flushRef.current();
            }
        };
        const handleOnline = () => {
            if (dirty.current) void flushRef.current();
        };
        window.addEventListener("keydown", handleKeyDown);
        window.addEventListener("online", handleOnline);
        return () => {
            window.removeEventListener("keydown", handleKeyDown);
            window.removeEventListener("online", handleOnline);
        };
    }, []);

    // Starts from the issue's text, and follows the server's when someone else changes it and there is nothing unsaved here.
    useEffect(() => {
        if (loadedIssueId.current !== issue.id) {
            if (loadedIssueId.current) persistDraftRef.current();
            loadedIssueId.current = issue.id;
            dirty.current = false;
            latest.current = issue.descriptionJson ?? EMPTY_TIPTAP_DOCUMENT;
            saved.current = issue.descriptionJson ?? EMPTY_TIPTAP_DOCUMENT;
            revision.current = issue.descriptionRevision;
            draftKey.current = userId ? issueDraftKey(userId, issue.projectId, issue.id) : null;
            draftContext.current = userId && draftKey.current ? { key: draftKey.current, userId, projectId: issue.projectId, issueId: issue.id } : null;
            draftRestoreIssue.current = null;
            setDescription(issue.descriptionJson ?? EMPTY_TIPTAP_DOCUMENT);
            setSaveError(null);
            setStatus("saved");
            return;
        }

        if (draftContext.current?.userId !== userId) {
            persistDraftRef.current();
            const key = userId ? issueDraftKey(userId, issue.projectId, issue.id) : null;
            draftKey.current = key;
            draftContext.current = userId && key ? { key, userId, projectId: issue.projectId, issueId: issue.id } : null;
        }

        if (!dirty.current && issue.descriptionRevision !== revision.current) {
            const next = issue.descriptionJson ?? EMPTY_TIPTAP_DOCUMENT;
            revision.current = issue.descriptionRevision;
            latest.current = next;
            saved.current = next;
            setDescription(next);
            setStatus("saved");
        }
    }, [issue, userId]);

    // Brings back what was typed and not saved before the tab closed, as unsaved, or as a conflict when the text moved on since.
    useEffect(() => {
        if (!userId || draftRestoreIssue.current === issue.id) return;
        draftRestoreIssue.current = issue.id;
        const key = issueDraftKey(userId, issue.projectId, issue.id);
        draftKey.current = key;
        let cancelled = false;
        void issueDescriptionDrafts.get(key).then((draft) => {
            if (cancelled || !draft?.descriptionJson || loadedIssueId.current !== issue.id || dirty.current) return;
            if (JSON.stringify(draft.descriptionJson) === JSON.stringify(issue.descriptionJson)) {
                void issueDescriptionDrafts.clearDescription(key).catch(() => undefined);
                return;
            }
            latest.current = draft.descriptionJson;
            dirty.current = true;
            setDescription(draft.descriptionJson);
            if (draft.baseRevision === issue.descriptionRevision) {
                setStatus("unsaved");
            } else {
                setStatus("conflict");
                setSaveError(t("issue.descriptionConflict"));
            }
        }).catch(() => undefined);
        return () => {
            cancelled = true;
            if (draftRestoreIssue.current === issue.id) draftRestoreIssue.current = null;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [issue.id, issue.projectId, issue.descriptionRevision, userId, t]);

    // A draft after 150 ms, a save after a second.
    useEffect(() => {
        if (!dirty.current) return;
        const draftTimer = window.setTimeout(() => {
            const key = draftKey.current;
            if (!key || !userId) return;
            void issueDescriptionDrafts.putDescription({
                key,
                userId,
                projectId: issue.projectId,
                issueId: issue.id,
                baseRevision: revision.current,
                descriptionJson: latest.current,
                updatedAt: Date.now(),
            }).catch(() => undefined);
        }, 150);
        const saveTimer = status === "conflict"
            ? undefined
            : window.setTimeout(() => { void flushRef.current(); }, 1000);
        return () => {
            window.clearTimeout(draftTimer);
            if (saveTimer !== undefined) window.clearTimeout(saveTimer);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [description, issue.id, userId]);

    useEffect(() => () => persistDraftRef.current(), []);

    flushRef.current = async () => {
        if (!dirty.current) return;
        if (saveLoop.current) return saveLoop.current;

        const issueId = issue.id;
        const key = draftKey.current;
        const operation = (async () => {
            while (dirty.current && loadedIssueId.current === issueId) {
                const next = latest.current;
                if (JSON.stringify(next) === JSON.stringify(saved.current)) {
                    dirty.current = false;
                    setStatus("saved");
                    if (key) void issueDescriptionDrafts.clearDescription(key).catch(() => undefined);
                    break;
                }
                setStatus("saving");
                setSaveError(null);
                try {
                    const updated = await updater.mutateAsync({
                        identifier: issue.identifier,
                        input: { descriptionJson: next, expectedDescriptionRevision: revision.current },
                    });
                    if (loadedIssueId.current !== issueId) {
                        if (key) void issueDescriptionDrafts.clearDescription(key).catch(() => undefined);
                        break;
                    }
                    revision.current = updated.descriptionRevision;
                    saved.current = next;
                    if (JSON.stringify(latest.current) === JSON.stringify(next)) {
                        dirty.current = false;
                        setStatus("saved");
                        setSaveError(null);
                        if (key) void issueDescriptionDrafts.clearDescription(key).catch(() => undefined);
                    } else {
                        dirty.current = true;
                        setStatus("unsaved");
                    }
                } catch (reason) {
                    if (loadedIssueId.current !== issueId) break;
                    const conflict = reason instanceof ApiError && reason.status === 409;
                    setStatus(conflict ? "conflict" : !navigator.onLine ? "offline" : "error");
                    setSaveError(errorMessage(reason, t("issue.couldNotSaveIssue")));
                    break;
                }
            }
        })();
        saveLoop.current = operation;
        try {
            await operation;
        } finally {
            if (saveLoop.current === operation) saveLoop.current = null;
            if (dirty.current && loadedIssueId.current !== issueId) queueMicrotask(() => void flushRef.current());
        }
    };

    persistDraftRef.current = () => {
        const context = draftContext.current;
        if (!context || !dirty.current) return;
        void issueDescriptionDrafts.putDescription({
            ...context,
            baseRevision: revision.current,
            descriptionJson: latest.current,
            updatedAt: Date.now(),
        }).catch(() => undefined);
    };

    useEffect(() => {
        onDirtyChange(dirty.current);
        onSavingChange(status === "saving");
    });
    useEffect(() => () => {
        onDirtyChange(false);
        onSavingChange(false);
    }, [onDirtyChange, onSavingChange]);

    const clearDraft = () => {
        const key = draftKey.current;
        if (key) void issueDescriptionDrafts.clearDescription(key).catch(() => undefined);
    };

    const onChange = (value: TiptapDocument) => {
        dirty.current = true;
        latest.current = value;
        if (status !== "conflict") {
            setStatus("unsaved");
            setSaveError(null);
        }
        setDescription(value);
    };

    /** Drops what was typed in favour of the text on the server. */
    const keepSavedDescription = () => {
        const current = issue.descriptionJson ?? EMPTY_TIPTAP_DOCUMENT;
        dirty.current = false;
        revision.current = issue.descriptionRevision;
        latest.current = current;
        saved.current = current;
        setDescription(current);
        setStatus("saved");
        setSaveError(null);
        clearDraft();
    };

    /** Keeps what was typed as an issue of its own, with the properties of this one, and opens it. */
    const createIssueFromDraft = async () => {
        try {
            const suffix = ` (${t("issue.draftCopySuffix")})`;
            const created = await createIssue.mutateAsync({
                columnId: issue.columnId,
                title: `${getTitle().slice(0, 200 - suffix.length)}${suffix}`,
                descriptionJson: latest.current,
                assigneeId: issue.assigneeId,
                categoryIds: issue.categoryIds,
                priority: issue.priority,
                estimate: issue.estimate,
            });
            clearDraft();
            dirty.current = false;
            void navigate(urls.issue(created.identifier, created.title), issueNavigation(created.title));
        } catch (reason) {
            setSaveError(errorMessage(reason, t("issue.couldNotSaveIssue")));
        }
    };

    /** Saves any pending edit first, so the restore is not undone by it, then lets the restored text replace the editor's. */
    const restoreVersion = async (version: DescriptionRevision) => {
        try {
            await flushRef.current();
            await restoreRevision.mutateAsync(version.id);
            dirty.current = false;
            clearDraft();
            setSaveError(null);
            setStatus("saved");
            showToast({ title: t("issue.versionRestored") });
        } catch (reason) {
            showToast({ tone: "error", title: errorMessage(reason, t("issue.couldNotRestoreVersion")) });
        }
    };

    const notice = status === "offline" ? t("issue.descriptionOffline") : status === "error" ? t("issue.descriptionSaveFailed") : status === "conflict" ? t("issue.descriptionConflict") : null;
    return {
        description,
        status,
        saveError,
        notice,
        onChange,
        keepSavedDescription,
        createIssueFromDraft,
        isCreatingFromDraft: createIssue.isPending,
        restoreVersion,
        isRestoring: restoreRevision.isPending,
    };
}
