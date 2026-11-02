import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { ActionSource, EntityIcon, TiptapDocument, UpdateIssueInput } from "@rinia/shared";
import { ArrowDown, ArrowUp, Ban, CalendarDays, Check, History, ChevronRight, Copy, GitBranch, Link2, Pencil, Plus, ShieldOff, Sparkles, Trash2 } from "lucide-react";
import { Link, useBeforeUnload, useLocation, useNavigate, useParams } from "react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useHotkeys } from "react-hotkeys-hook";
import { Menu } from "@base-ui/react/menu";
import { Popover } from "@base-ui/react/popover";
import { EstimateOutline, LabelsOutline, MoreHorizontalOutline, ParentOutline } from "@makeplane/propel/icons";
import { Collapse } from "@/components/base/collapse";
import { Button } from "@/components/base/buttons/button";
import { ButtonUtility } from "@/components/base/buttons/button-utility";
import { Skeleton } from "@/components/base/feedback/skeleton";
import { ComboBox, ComboBoxItem } from "@/components/base/select/combobox";
import { Select } from "@/components/base/select/select";
import { ErrorMessage } from "@/components/feedback/error-message";
import { useToast, type ToastInput } from "@/components/feedback/toaster";
import { AppIcons } from "@/components/foundations/icons";
import { useAppNavigation } from "@/components/layout/app-shell";
import { ConfirmDialog } from "@/components/overlay/confirm-dialog";
import { overlayChrome } from "@/components/overlay/overlay-chrome";
import { useAuth } from "@/features/auth/hooks/use-auth";
import { PresenceAvatars } from "@/features/realtime/components/presence-avatars";
import { useChannelPresence, useRealtimeChannels } from "@/features/realtime/use-realtime";
import { IssueAvatar, IssueAvatarGroup, PriorityIcon, SourceAvatar, StateIcon, sourceLabel } from "@/features/board/components/issue-property-icons";
import { useColumns } from "@/features/board/hooks/use-board";
import { columnBucket, defaultIssueColumn } from "@/features/board/column-bucket";
import { dueState as getDueState, dueStateClass, formatDueDate } from "@/features/issues/lib/due-date";
import { useCategories } from "@/features/categories/hooks/use-categories";
import { FavoriteStar } from "@/features/favorites/components/favorite-star";
import { FollowButton } from "@/features/notifications/components/follow-button";
import { ProjectIcon } from "@/features/projects/components/project-icon";
import { useProject } from "@/features/projects/hooks/use-project";
import { useCurrentProject } from "@/features/projects/hooks/use-current-project";
import { urls } from "@/lib/urls";
import { PRIORITY_OPTIONS, priorityLabelKey } from "@/features/issues/lib/priority";
import { useProjectMembers } from "@/features/projects/hooks/use-project-members";
import { useBreakpoint } from "@/hooks/use-breakpoint";
import { useClipboard } from "@/hooks/use-clipboard";
import { ApiError } from "@/lib/api-client";
import { cx } from "@/utils/cx";
import {
    issueKey,
    useCreateIssue,
    useCreateIssueComment,
    useCreateIssueRelation,
    useDeleteIssue,
    useDeleteIssueComment,
    useDeleteIssueRelation,
    useIssue,
    useIssueActivity,
    useIssueComments,
    useIssueRelations,
    useIssues,
    useRestoreDescriptionRevision,
    useToggleReaction,
    useUpdateIssue,
    useUpdateIssueComment,
} from "../hooks/use-issues";
import { restoreIssue as restoreDeletedIssue, restoreIssueComment, type DescriptionRevision, type IssueDetail, type ReactionGroup } from "../api";
import { ReactionChips, ReactionPicker } from "./comment-reactions";
import { DescriptionHistorySheet } from "./description-history";
import { fetchIssueClipboardContent } from "../lib/issue-clipboard";
import { issueDescriptionDrafts, issueDraftKey } from "../lib/issue-description-drafts";
import { DueDatePopover } from "./due-date-picker";
import { LabelChip, LabelsPicker, resolveLabels, useLabelToggle } from "./labels-picker";
import { EMPTY_TIPTAP_DOCUMENT, RichTextEditor, type MentionItem } from "./rich-text-editor";
import { useTranslation } from "react-i18next";
import { translateStatusName } from "@/i18n/status-label";
import type { TranslationKey } from "@/i18n/resources";

const propertyButton =
    "flex h-8 w-full min-w-0 items-center gap-2.5 rounded-md px-2 text-left text-[13px] font-medium text-secondary outline-none transition-colors duration-150 hover:bg-layer-transparent-hover hover:text-primary focus-visible:bg-layer-transparent-hover disabled:opacity-60 data-[popup-open]:bg-layer-transparent-hover";
const menuItemClass = "flex h-8 w-full cursor-pointer items-center gap-2.5 rounded px-2 text-[13px] text-secondary outline-none data-highlighted:bg-layer-2-hover data-highlighted:text-primary";
const popupMotion = "origin-[var(--transform-origin)] transition-[opacity,transform] duration-150 ease-out data-[ending-style]:scale-95 data-[ending-style]:opacity-0 data-[starting-style]:scale-95 data-[starting-style]:opacity-0";

type PropertyMenuId = "state" | "priority" | "assignee" | "estimate" | "due" | "parent" | "label";

const activityLabelKeys: Record<string, TranslationKey> = {
    created: "issue.createdThisIssue",
    status_changed: "issue.changedStatus",
    priority_changed: "issue.changedPriority",
    assignee_changed: "issue.changedAssignee",
    category_changed: "issue.changedCategory",
    cycle_changed: "issue.changedCycle",
    estimate_changed: "issue.changedEstimate",
    due_date_changed: "issue.changedDueDate",
    parent_changed: "issue.changedParent",
    relation_added: "issue.addedRelation",
    relation_removed: "issue.removedRelation",
    label_added: "issue.addedLabel",
    label_removed: "issue.removedLabel",
};

export const IssueView = () => {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const params = useParams<{ projectId: string; issueIdentifier: string }>();
    const resolvedIdentifier = params.issueIdentifier ?? "";
    const currentProject = useCurrentProject();
    const resolvedProjectId = currentProject?.id ?? "";
    const location = useLocation();
    const { user } = useAuth();
    const { copy } = useClipboard();
    const showToast = useToast();
    const queryClient = useQueryClient();
    const { openNavigation } = useAppNavigation();
    const wide = useBreakpoint("lg");
    const [openMenu, setOpenMenu] = useState<PropertyMenuId | null>(null);
    const [deleteOpen, setDeleteOpen] = useState(false);
    const { data: issue, isLoading, isError } = useIssue(resolvedIdentifier);
    // The project channel carries the issue's own changes and its neighbours' (pager, sub-issues); the issue channel carries comments and relations.
    useRealtimeChannels([issue && `project:${issue.projectId}`]);
    const viewers = useChannelPresence(issue ? `issue:${issue.id}` : null);
    const { data: project } = useProject(issue?.projectId ?? resolvedProjectId);
    const updateIssue = useUpdateIssue(issue?.projectId ?? resolvedProjectId);
    const createIssue = useCreateIssue(issue?.projectId ?? resolvedProjectId);
    const deleteIssue = useDeleteIssue(issue?.projectId ?? resolvedProjectId);
    const { data: comments, isLoading: commentsLoading, isError: commentsLoadFailed } = useIssueComments(issue?.identifier ?? resolvedIdentifier);
    const { data: activity, isLoading: activityLoading, isError: activityLoadFailed } = useIssueActivity(issue?.identifier ?? resolvedIdentifier);
    const { data: relations } = useIssueRelations(issue?.identifier ?? resolvedIdentifier);
    const { data: projectIssues } = useIssues(issue?.projectId ?? resolvedProjectId);
    const { data: columns } = useColumns(issue?.projectId ?? resolvedProjectId);
    const { data: members } = useProjectMembers(issue?.projectId ?? resolvedProjectId);
    const mentionItems = useMemo(() => (members ?? []).map((member) => ({ id: member.id, label: member.username, description: member.name })), [members]);
    const { data: categories } = useCategories(issue?.projectId ?? resolvedProjectId);
    const createComment = useCreateIssueComment(issue?.identifier ?? resolvedIdentifier);
    const deleteComment = useDeleteIssueComment(issue?.identifier ?? resolvedIdentifier);
    const updateComment = useUpdateIssueComment(issue?.identifier ?? resolvedIdentifier);
    const createRelation = useCreateIssueRelation(issue?.identifier ?? resolvedIdentifier);
    const deleteRelation = useDeleteIssueRelation(issue?.identifier ?? resolvedIdentifier);
    const toggleReaction = useToggleReaction(issue?.identifier ?? resolvedIdentifier, user ? { id: user.id, name: user.name, username: user.username, avatarUrl: user.avatarUrl } : null);
    const restoreRevision = useRestoreDescriptionRevision(issue?.identifier ?? resolvedIdentifier);
    const [historyOpen, setHistoryOpen] = useState(false);
    // Linear-style property shortcuts; ignored while typing in a field or the editor.
    const propertyHotkey = { enableOnFormTags: false, enableOnContentEditable: false, useKey: true, preventDefault: true } as const;
    useHotkeys("s", () => setOpenMenu("state"), propertyHotkey);
    useHotkeys("p", () => setOpenMenu("priority"), propertyHotkey);
    useHotkeys("a", () => setOpenMenu("assignee"), propertyHotkey);
    useHotkeys("l", () => setOpenMenu("label"), propertyHotkey);
    useHotkeys("shift+d", () => setOpenMenu("due"), propertyHotkey);

    // Keep the URL canonical: an identifier from before a key change, a missing or stale title slug,
    // or a lowercase identifier all become `/issue/KEY-12/current-title`.
    const canonicalUrl = issue ? urls.issue(issue.identifier, issue.title) : null;
    useEffect(() => {
        if (!canonicalUrl || location.pathname === canonicalUrl) return;
        navigate(`${canonicalUrl}${location.search}`, { replace: true });
    }, [canonicalUrl, location.pathname, location.search, navigate]);
    const [relationsOpen, setRelationsOpen] = useState(false);
    const [description, setDescription] = useState<TiptapDocument>(EMPTY_TIPTAP_DOCUMENT);
    const [title, setTitle] = useState("");
    const [comment, setComment] = useState<TiptapDocument>(EMPTY_TIPTAP_DOCUMENT);
    const [titleSaveError, setTitleSaveError] = useState<string | null>(null);
    const [descriptionSaveError, setDescriptionSaveError] = useState<string | null>(null);
    const [descriptionStatus, setDescriptionStatus] = useState<"saved" | "unsaved" | "saving" | "offline" | "error" | "conflict">("saved");
    const [propertySaveError, setPropertySaveError] = useState<string | null>(null);
    const [commentSaveError, setCommentSaveError] = useState<string | null>(null);
    const [isCopyingIssue, setIsCopyingIssue] = useState(false);
    const loadedIssueId = useRef<string | null>(null);
    const titleDirty = useRef(false);
    const descriptionDirty = useRef(false);
    const titleVersion = useRef(0);
    const descriptionVersion = useRef(0);
    const descriptionRevision = useRef(0);
    const latestDescription = useRef<TiptapDocument>(EMPTY_TIPTAP_DOCUMENT);
    const savedDescription = useRef<TiptapDocument>(EMPTY_TIPTAP_DOCUMENT);
    const descriptionSaveLoop = useRef<Promise<void> | null>(null);
    const descriptionDraftKey = useRef<string | null>(null);
    const descriptionDraftContext = useRef<{ key: string; userId: string; projectId: string; issueId: string } | null>(null);
    const descriptionDraftRestoreIssue = useRef<string | null>(null);
    const commentDraftRestoreIssue = useRef<string | null>(null);
    const commentDraftOwner = useRef<string | null>(null);
    const flushDescriptionRef = useRef<() => Promise<void>>(async () => undefined);
    const persistDescriptionDraftRef = useRef<() => void>(() => undefined);
    const persistCommentDraftRef = useRef<() => void>(() => undefined);
    const titleRef = useRef<HTMLTextAreaElement>(null);

    useBeforeUnload((event) => {
        if (!titleDirty.current && !descriptionDirty.current && !hasMeaningfulTiptapContent(comment)) return;
        event.preventDefault();
        event.returnValue = "";
    });

    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
                event.preventDefault();
                void flushDescriptionRef.current();
            }
        };
        const handleOnline = () => {
            if (descriptionDirty.current) void flushDescriptionRef.current();
        };
        window.addEventListener("keydown", handleKeyDown);
        window.addEventListener("online", handleOnline);
        return () => {
            window.removeEventListener("keydown", handleKeyDown);
            window.removeEventListener("online", handleOnline);
        };
    }, []);

    useEffect(() => {
        if (!issue) return;
        if (loadedIssueId.current !== issue.id) {
            if (loadedIssueId.current) {
                persistDescriptionDraftRef.current();
                persistCommentDraftRef.current();
            }
            loadedIssueId.current = issue.id;
            titleDirty.current = false;
            descriptionDirty.current = false;
            descriptionVersion.current = 0;
            setTitle(issue.title);
            setDescription(issue.descriptionJson ?? EMPTY_TIPTAP_DOCUMENT);
            latestDescription.current = issue.descriptionJson ?? EMPTY_TIPTAP_DOCUMENT;
            savedDescription.current = issue.descriptionJson ?? EMPTY_TIPTAP_DOCUMENT;
            descriptionRevision.current = issue.descriptionRevision;
            descriptionDraftKey.current = user?.id ? issueDraftKey(user.id, issue.projectId, issue.id) : null;
            descriptionDraftContext.current = user?.id && descriptionDraftKey.current ? { key: descriptionDraftKey.current, userId: user.id, projectId: issue.projectId, issueId: issue.id } : null;
            descriptionDraftRestoreIssue.current = null;
            commentDraftRestoreIssue.current = null;
            commentDraftOwner.current = null;
            setComment(EMPTY_TIPTAP_DOCUMENT);
            setCommentSaveError(null);
            setTitleSaveError(null);
            setDescriptionSaveError(null);
            setPropertySaveError(null);
            setDescriptionStatus("saved");
            setRelationsOpen(false);
            setOpenMenu(null);
            return;
        }

        if (descriptionDraftContext.current?.userId !== user?.id) {
            persistDescriptionDraftRef.current();
            persistCommentDraftRef.current();
            const key = user?.id ? issueDraftKey(user.id, issue.projectId, issue.id) : null;
            descriptionDraftKey.current = key;
            descriptionDraftContext.current = user?.id && key ? { key, userId: user.id, projectId: issue.projectId, issueId: issue.id } : null;
        }

        if (!titleDirty.current) setTitle(issue.title);
        if (!descriptionDirty.current && issue.descriptionRevision !== descriptionRevision.current) {
            const nextDescription = issue.descriptionJson ?? EMPTY_TIPTAP_DOCUMENT;
            descriptionRevision.current = issue.descriptionRevision;
            latestDescription.current = nextDescription;
            savedDescription.current = nextDescription;
            setDescription(nextDescription);
            setDescriptionStatus("saved");
        }
    }, [issue, user?.id]);

    useEffect(() => {
        if (!issue || !user?.id || descriptionDraftRestoreIssue.current === issue.id) return;
        descriptionDraftRestoreIssue.current = issue.id;
        const key = issueDraftKey(user.id, issue.projectId, issue.id);
        descriptionDraftKey.current = key;
        let cancelled = false;
        void issueDescriptionDrafts.get(key).then((draft) => {
            if (cancelled || !draft?.descriptionJson || loadedIssueId.current !== issue.id || descriptionDirty.current) return;
            if (JSON.stringify(draft.descriptionJson) === JSON.stringify(issue.descriptionJson)) {
                void issueDescriptionDrafts.clearDescription(key).catch(() => undefined);
                return;
            }
            latestDescription.current = draft.descriptionJson;
            descriptionDirty.current = true;
            descriptionVersion.current += 1;
            setDescription(draft.descriptionJson);
            if (draft.baseRevision === issue.descriptionRevision) {
                setDescriptionStatus("unsaved");
            } else {
                setDescriptionStatus("conflict");
                setDescriptionSaveError(t("issue.descriptionConflict"));
            }
        }).catch(() => undefined);
        return () => {
            cancelled = true;
            if (descriptionDraftRestoreIssue.current === issue.id) descriptionDraftRestoreIssue.current = null;
        };
    }, [issue?.id, issue?.projectId, issue?.descriptionRevision, user?.id, t]);

    useEffect(() => {
        if (!issue || !user?.id || commentDraftRestoreIssue.current === issue.id) return;
        commentDraftRestoreIssue.current = issue.id;
        const key = issueDraftKey(user.id, issue.projectId, issue.id);
        let cancelled = false;
        void issueDescriptionDrafts.get(key).then((draft) => {
            if (cancelled || loadedIssueId.current !== issue.id || commentDraftOwner.current) return;
            setComment(draft?.commentJson ?? EMPTY_TIPTAP_DOCUMENT);
            commentDraftOwner.current = issue.id;
        }).catch(() => { if (!cancelled && loadedIssueId.current === issue.id) commentDraftOwner.current = issue.id; });
        return () => {
            cancelled = true;
            if (commentDraftRestoreIssue.current === issue.id) commentDraftRestoreIssue.current = null;
        };
    }, [issue?.id, issue?.projectId, user?.id]);

    useEffect(() => {
        if (!issue || !descriptionDirty.current) return;
        const draftTimer = window.setTimeout(() => {
            const key = descriptionDraftKey.current;
            if (!key || !user?.id) return;
            void issueDescriptionDrafts.putDescription({
                key,
                userId: user.id,
                projectId: issue.projectId,
                issueId: issue.id,
                baseRevision: descriptionRevision.current,
                descriptionJson: latestDescription.current,
                updatedAt: Date.now(),
            }).catch(() => undefined);
        }, 150);
        const saveTimer = descriptionStatus === "conflict"
            ? undefined
            : window.setTimeout(() => { void flushDescriptionRef.current(); }, 1000);
        return () => {
            window.clearTimeout(draftTimer);
            if (saveTimer !== undefined) window.clearTimeout(saveTimer);
        };
    }, [description, issue?.id, user?.id]);

    useEffect(() => {
        if (!issue || !user?.id || commentDraftOwner.current !== issue.id) return;
        const timer = window.setTimeout(() => {
            const key = issueDraftKey(user.id, issue.projectId, issue.id);
            const content = hasMeaningfulTiptapContent(comment) ? comment : undefined;
            const save = content
                ? issueDescriptionDrafts.putComment({ key, userId: user.id, projectId: issue.projectId, issueId: issue.id, commentJson: content, updatedAt: Date.now() })
                : issueDescriptionDrafts.clearComment(key);
            void save.catch(() => undefined);
        }, 150);
        return () => window.clearTimeout(timer);
    }, [comment, issue?.id, user?.id]);

    useEffect(() => () => {
        persistDescriptionDraftRef.current();
        persistCommentDraftRef.current();
    }, []);

    useEffect(() => {
        const titleElement = titleRef.current;
        if (!titleElement) return;
        titleElement.style.height = "auto";
        titleElement.style.height = `${titleElement.scrollHeight}px`;
    }, [title]);

    flushDescriptionRef.current = async () => {
        if (!issue || !descriptionDirty.current) return;
        if (descriptionSaveLoop.current) return descriptionSaveLoop.current;

        const issueId = issue.id;
        const draftKey = descriptionDraftKey.current;
        const operation = (async () => {
            while (descriptionDirty.current && loadedIssueId.current === issueId) {
                const nextDescription = latestDescription.current;
                if (JSON.stringify(nextDescription) === JSON.stringify(savedDescription.current)) {
                    descriptionDirty.current = false;
                    setDescriptionStatus("saved");
                    if (draftKey) void issueDescriptionDrafts.clearDescription(draftKey).catch(() => undefined);
                    break;
                }
                setDescriptionStatus("saving");
                setDescriptionSaveError(null);
                try {
                    const updated = await updateIssue.mutateAsync({
                        identifier: issue.identifier,
                        input: { descriptionJson: nextDescription, expectedDescriptionRevision: descriptionRevision.current },
                    });
                    if (loadedIssueId.current !== issueId) {
                        if (draftKey) void issueDescriptionDrafts.clearDescription(draftKey).catch(() => undefined);
                        break;
                    }
                    descriptionRevision.current = updated.descriptionRevision;
                    savedDescription.current = nextDescription;
                    if (JSON.stringify(latestDescription.current) === JSON.stringify(nextDescription)) {
                        descriptionDirty.current = false;
                        setDescriptionStatus("saved");
                        setDescriptionSaveError(null);
                        if (draftKey) void issueDescriptionDrafts.clearDescription(draftKey).catch(() => undefined);
                    } else {
                        descriptionDirty.current = true;
                        setDescriptionStatus("unsaved");
                    }
                } catch (reason) {
                    if (loadedIssueId.current !== issueId) break;
                    const conflict = reason instanceof ApiError && reason.status === 409;
                    setDescriptionStatus(conflict ? "conflict" : !navigator.onLine ? "offline" : "error");
                    setDescriptionSaveError(errorMessage(reason, t("issue.couldNotSaveIssue")));
                    break;
                }
            }
        })();
        descriptionSaveLoop.current = operation;
        try {
            await operation;
        } finally {
            if (descriptionSaveLoop.current === operation) descriptionSaveLoop.current = null;
            if (descriptionDirty.current && loadedIssueId.current !== issueId) queueMicrotask(() => void flushDescriptionRef.current());
        }
    };

    persistDescriptionDraftRef.current = () => {
        const context = descriptionDraftContext.current;
        if (!context || !descriptionDirty.current) return;
        void issueDescriptionDrafts.putDescription({
            ...context,
            baseRevision: descriptionRevision.current,
            descriptionJson: latestDescription.current,
            updatedAt: Date.now(),
        }).catch(() => undefined);
    };
    persistCommentDraftRef.current = () => {
        const context = descriptionDraftContext.current;
        if (!context || commentDraftOwner.current !== context.issueId) return;
        const content = hasMeaningfulTiptapContent(comment) ? comment : undefined;
        const save = content
            ? issueDescriptionDrafts.putComment({ ...context, commentJson: content, updatedAt: Date.now() })
            : issueDescriptionDrafts.clearComment(context.key);
        void save.catch(() => undefined);
    };

    if (isLoading) return <IssueLoadingSkeleton />;
    if (isError || !issue) {
        return (
            <main className="flex h-full min-h-0 items-center justify-center bg-surface-1 p-6">
                <ErrorMessage message={t("issue.couldNotLoadIssue")} />
            </main>
        );
    }

    const save = (input: UpdateIssueInput) => {
        const actionIssueId = issue.id;
        setPropertySaveError(null);
        const undo = input.columnId !== undefined && input.columnId !== issue.columnId
            ? { patch: { columnId: issue.columnId }, title: t("issue.statusUpdated") }
            : input.assigneeId !== undefined && input.assigneeId !== issue.assigneeId
              ? { patch: { assigneeId: issue.assigneeId }, title: t("issue.assigneeUpdated") }
              : null;
        updateIssue.mutate(
            { identifier: issue.identifier, input },
            {
                onSuccess: () => {
                    if (!undo) return;
                    showToast({
                        title: undo.title,
                        action: {
                            label: t("issue.undo"),
                            onClick: async () => {
                                try {
                                    await updateIssue.mutateAsync({ identifier: issue.identifier, input: undo.patch });
                                } catch {
                                    showToast({ tone: "error", title: t("issue.couldNotUndo") });
                                }
                            },
                        },
                    });
                },
                onError: (reason) => { if (loadedIssueId.current === actionIssueId) setPropertySaveError(errorMessage(reason, t("issue.couldNotSaveIssue"))); },
            },
        );
    };
    const currentTitle = title.trim() || issue.title;
    /** Saves any pending edit first, so the restore is not undone by it, then lets the restored text replace the editor's. */
    const restoreDescription = async (revision: DescriptionRevision) => {
        try {
            await flushDescriptionRef.current();
            await restoreRevision.mutateAsync(revision.id);
            descriptionDirty.current = false;
            const key = descriptionDraftKey.current;
            if (key) void issueDescriptionDrafts.clearDescription(key).catch(() => undefined);
            setDescriptionSaveError(null);
            setDescriptionStatus("saved");
            showToast({ title: t("issue.versionRestored") });
        } catch (reason) {
            showToast({ tone: "error", title: errorMessage(reason, t("issue.couldNotRestoreVersion")) });
        }
    };
    const copyText = async (text: string, success: ToastInput) => {
        const result = await copy(text, "issue-meta");
        showToast(result.success ? success : { tone: "error", title: t("issue.couldNotCopy") });
    };
    const copyLink = () => void copyText(`${window.location.origin}${urls.issue(issue.identifier, currentTitle)}`, { tone: "copy", title: t("issue.linkCopied") });
    const copyId = () => void copyText(issue.identifier, { tone: "copy", title: t("issue.idCopied", { id: issue.identifier }) });
    const copyBranch = () => {
        const branch = gitBranchName(user?.username, issue.identifier, currentTitle);
        void copyText(branch, { tone: "copy", title: branch, description: t("issue.branchCopied") });
    };
    const copyAsPrompt = async () => {
        setIsCopyingIssue(true);
        try {
            const content = await fetchIssueClipboardContent(issue.identifier, { title: currentTitle, description });
            await copyText(content, { tone: "copy", title: t("issue.promptCopied") });
        } catch {
            showToast({ tone: "error", title: t("issue.couldNotCopyContent") });
        } finally {
            setIsCopyingIssue(false);
        }
    };
    const saveTitle = () => {
        const nextTitle = title.trim();
        if (!nextTitle) {
            setTitle(issue.title);
            titleDirty.current = false;
            showToast({ tone: "error", title: t("issue.titleRequired"), description: t("issue.titleReverted") });
            return;
        }
        if (nextTitle === issue.title) {
            titleDirty.current = false;
            return;
        }
        const saveVersion = titleVersion.current;
        updateIssue.mutate(
            { identifier: issue.identifier, input: { title: nextTitle } },
            {
                onSuccess: () => {
                    if (loadedIssueId.current === issue.id && titleVersion.current === saveVersion) titleDirty.current = false;
                },
                onError: (reason) => { if (loadedIssueId.current === issue.id) setTitleSaveError(errorMessage(reason, t("issue.couldNotSaveIssue"))); },
            },
        );
    };
    const createSubIssue = async (subTitle: string) => {
        await createIssue.mutateAsync({ columnId: defaultIssueColumn(columns)?.id ?? issue.columnId, title: subTitle, parentIssueId: issue.id, priority: "none" });
        await queryClient.invalidateQueries({ queryKey: issueKey(issue.identifier) });
    };
    const saving = updateIssue.isPending || descriptionStatus === "saving";
    const unsaved = titleDirty.current || descriptionDirty.current;
    const descriptionNotice =
        descriptionStatus === "offline" ? t("issue.descriptionOffline") : descriptionStatus === "error" ? t("issue.descriptionSaveFailed") : descriptionStatus === "conflict" ? t("issue.descriptionConflict") : null;
    const properties = (
        <IssueProperties
            issue={issue}
            projectIcon={project?.iconAppearance ?? project?.icon}
            columns={columns ?? []}
            members={members ?? []}
            categories={categories ?? []}
            projectIssues={projectIssues ?? []}
            save={save}
            isPending={updateIssue.isPending}
            error={propertySaveError}
            openMenu={openMenu}
            onOpenMenuChange={setOpenMenu}
        />
    );
    const copyActions = { onCopyLink: copyLink, onCopyId: copyId, onCopyBranch: copyBranch, onCopyPrompt: () => void copyAsPrompt(), isCopying: isCopyingIssue };

    return (
        <main className="flex h-full min-h-0 flex-col bg-surface-1">
            <header className="flex h-11 shrink-0 items-center justify-between gap-3 border-b border-subtle px-3">
                <div className="flex min-w-0 items-center gap-1.5 text-[13px]">
                    <span className="md:hidden">
                        <ButtonUtility icon={AppIcons.Menu} color="tertiary" tooltip={t("nav.expand")} onClick={openNavigation} />
                    </span>
                    <Link to={urls.project(issue.project.issueKey)} className="flex min-w-0 shrink items-center gap-2 text-secondary hover:text-primary">
                        <ProjectIcon icon={project?.iconAppearance ?? project?.icon} className="size-4 shrink-0" />
                        <span className="truncate">{issue.project.name}</span>
                    </Link>
                    <ChevronRight className="size-3 shrink-0 text-placeholder" aria-hidden="true" />
                    <Link to={urls.issues(issue.project.issueKey)} className="shrink-0 text-secondary hover:text-primary">{t("nav.issues")}</Link>
                    <ChevronRight className="size-3 shrink-0 text-placeholder" aria-hidden="true" />
                    <span className="min-w-0 truncate text-primary">
                        <span className="text-tertiary">{issue.identifier}</span> {currentTitle}
                    </span>
                    <FavoriteStar target={{ kind: "issue", projectId: issue.projectId, issueId: issue.id }} />
                    <FollowButton identifier={issue.identifier} />
                    <IssueActionsMenu
                        {...copyActions}
                        onAddRelation={() => setRelationsOpen(true)}
                        onSetParent={() => window.setTimeout(() => setOpenMenu("parent"), 0)}
                        onOpenHistory={() => setHistoryOpen(true)}
                        onDelete={() => setDeleteOpen(true)}
                    />
                </div>
                <div className="flex shrink-0 items-center gap-3">
                    <PresenceAvatars viewers={viewers} />
                    {(saving || unsaved) && <span className="text-xs text-tertiary" role="status">{saving ? t("issue.savingIssue") : t("issue.unsavedIssue")}</span>}
                    {projectIssues && projectIssues.length > 0 && <IssuePager issues={projectIssues} identifier={issue.identifier} onOpen={(next) => navigate(urls.issue(next))} />}
                </div>
            </header>

            <div className="flex min-h-0 flex-1 overflow-hidden">
                <div className="min-w-0 flex-1 overflow-y-auto">
                    <div className="mx-auto w-full max-w-[48rem] px-6 pt-10 pb-24 lg:px-12">
                        <textarea
                            ref={titleRef}
                            rows={1}
                            value={title}
                            placeholder={t("issue.issueTitle")}
                            onChange={(event) => {
                                titleDirty.current = true;
                                titleVersion.current += 1;
                                setTitleSaveError(null);
                                setTitle(event.target.value);
                            }}
                            onKeyDown={(event) => {
                                if (event.key === "Enter") {
                                    event.preventDefault();
                                    event.currentTarget.blur();
                                }
                            }}
                            onBlur={saveTitle}
                            className="block w-full resize-none overflow-hidden bg-transparent text-[26px] leading-8 font-semibold tracking-tight text-primary outline-none placeholder:text-placeholder"
                            aria-label={t("issue.title")}
                        />
                        {titleSaveError && <p role="alert" className="mt-1 text-xs text-danger-primary">{titleSaveError}</p>}

                        {!wide && <div className="mt-6 rounded-xl border border-subtle bg-layer-1 p-2">{properties}</div>}

                        <div className="issue-description mt-4">
                            <RichTextEditor
                                toolbar={false}
                                variant="description"
                                content={description}
                                onChange={(value) => {
                                    descriptionDirty.current = true;
                                    descriptionVersion.current += 1;
                                    latestDescription.current = value;
                                    if (descriptionStatus !== "conflict") {
                                        setDescriptionStatus("unsaved");
                                        setDescriptionSaveError(null);
                                    }
                                    setDescription(value);
                                }}
                                mentionItems={mentionItems}
                                placeholder={t("issue.describeIssue")}
                            />
                        </div>
                        {descriptionNotice && <p role="status" className="animate-enter mt-2 text-xs text-warning-primary">{descriptionNotice}</p>}
                        {descriptionSaveError && descriptionStatus !== "conflict" && <p role="alert" className="mt-2 text-xs text-danger-primary">{descriptionSaveError}</p>}
                        {descriptionStatus === "conflict" && (
                            <div className="animate-enter mt-3 flex flex-wrap items-center justify-end gap-2 rounded-lg border border-fg-warning-primary/40 bg-warning-primary/10 p-3">
                                <Button size="xs" color="tertiary" onClick={() => {
                                    const current = issue.descriptionJson ?? EMPTY_TIPTAP_DOCUMENT;
                                    descriptionDirty.current = false;
                                    descriptionRevision.current = issue.descriptionRevision;
                                    latestDescription.current = current;
                                    savedDescription.current = current;
                                    setDescription(current);
                                    setDescriptionStatus("saved");
                                    setDescriptionSaveError(null);
                                    const key = descriptionDraftKey.current;
                                    if (key) void issueDescriptionDrafts.clearDescription(key).catch(() => undefined);
                                }}>{t("issue.useSavedDescription")}</Button>
                                <Button size="xs" color="primary" isLoading={createIssue.isPending} onClick={async () => {
                                    try {
                                        const suffix = ` (${t("issue.draftCopySuffix")})`;
                                        const created = await createIssue.mutateAsync({
                                            columnId: issue.columnId,
                                            title: `${currentTitle.slice(0, 200 - suffix.length)}${suffix}`,
                                            descriptionJson: latestDescription.current,
                                            assigneeId: issue.assigneeId,
                                            categoryIds: issue.categoryIds,
                                            priority: issue.priority,
                                            estimate: issue.estimate,
                                        });
                                        const key = descriptionDraftKey.current;
                                        if (key) void issueDescriptionDrafts.clearDescription(key).catch(() => undefined);
                                        descriptionDirty.current = false;
                                        navigate(urls.issue(created.identifier, created.title));
                                    } catch (reason) {
                                        setDescriptionSaveError(errorMessage(reason, t("issue.couldNotSaveIssue")));
                                    }
                                }}>{t("issue.createIssueFromDraft")}</Button>
                            </div>
                        )}

                        <IssueSubIssues issue={issue} columns={columns ?? []} isCreating={createIssue.isPending} onCreate={createSubIssue} />

                        <Collapse open={relationsOpen || !!relations?.length} lazy={false}>
                            <IssueRelations
                                projectId={issue.projectId}
                                issueId={issue.id}
                                projectIssues={projectIssues ?? []}
                                relations={relations ?? []}
                                formOpen={relationsOpen || !relations?.length}
                                onFormOpenChange={setRelationsOpen}
                                isPending={createRelation.isPending || deleteRelation.isPending}
                                onAdd={(targetIssueIdentifier, type) => createRelation.mutateAsync({ targetIssueIdentifier, type }).then(() => undefined)}
                                onDelete={(relationId) => deleteRelation.mutate(relationId)}
                            />
                        </Collapse>

                        <div className="mt-10 border-t border-subtle pt-8">
                            <IssueTimeline
                                activity={activity ?? []}
                                comments={comments ?? []}
                                isLoading={activityLoading || commentsLoading}
                                loadFailed={activityLoadFailed || commentsLoadFailed}
                                lookups={{ columns: columns ?? [], members: members ?? [], categories: categories ?? [], projectIssues: projectIssues ?? [] }}
                                currentUserId={user?.id}
                                mentionItems={mentionItems}
                                onReact={(commentId, emoji, add) => toggleReaction.mutate({ commentId, emoji, add })}
                                currentUser={user ? { name: user.name, avatarUrl: user.avatarUrl } : null}
                                onReply={async (parentCommentId, contentJson) => {
                                    await createComment.mutateAsync({ contentJson, parentCommentId });
                                }}
                                value={comment}
                                onChange={(value) => {
                                    commentDraftOwner.current = issue.id;
                                    setComment(value);
                                }}
                                isSubmitting={createComment.isPending || updateComment.isPending || deleteComment.isPending}
                                error={commentSaveError}
                                onSubmit={async () => {
                                    if (!hasMeaningfulTiptapContent(comment)) return;
                                    const submittedIssueId = issue.id;
                                    setCommentSaveError(null);
                                    try {
                                        await createComment.mutateAsync({ contentJson: comment });
                                        if (loadedIssueId.current === submittedIssueId) setComment(EMPTY_TIPTAP_DOCUMENT);
                                    } catch (reason) {
                                        if (loadedIssueId.current === submittedIssueId) setCommentSaveError(errorMessage(reason, t("issue.couldNotAddComment")));
                                    }
                                }}
                                onDelete={async (commentId) => {
                                    const actionIssueId = issue.id;
                                    setCommentSaveError(null);
                                    try {
                                        const { deletedAt } = await deleteComment.mutateAsync(commentId);
                                        showToast({
                                            title: t("issue.commentDeleted"),
                                            action: {
                                                label: t("issue.undo"),
                                                onClick: async () => {
                                                    try {
                                                        await restoreIssueComment(commentId, deletedAt);
                                                        await queryClient.invalidateQueries({ queryKey: [...issueKey(issue.identifier), "comments"] });
                                                    } catch {
                                                        showToast({ tone: "error", title: t("issue.couldNotUndo") });
                                                    }
                                                },
                                            },
                                        });
                                    } catch (reason) {
                                        if (loadedIssueId.current === actionIssueId) setCommentSaveError(errorMessage(reason, t("issue.couldNotDeleteComment")));
                                        throw reason;
                                    }
                                }}
                                onEdit={async (commentId, contentJson) => {
                                    const actionIssueId = issue.id;
                                    setCommentSaveError(null);
                                    try {
                                        await updateComment.mutateAsync({ commentId, input: { contentJson } });
                                    } catch (reason) {
                                        if (loadedIssueId.current === actionIssueId) setCommentSaveError(errorMessage(reason, t("issue.couldNotUpdateComment")));
                                        throw reason;
                                    }
                                }}
                            />
                        </div>
                    </div>
                </div>

                {wide && (
                    <aside aria-label={t("issue.properties")} className="w-[17.5rem] shrink-0 overflow-y-auto px-4 pt-3 pb-10">
                        <IssueQuickActions {...copyActions} />
                        <div className="mt-5">{properties}</div>
                    </aside>
                )}
            </div>

            <DescriptionHistorySheet identifier={issue.identifier} open={historyOpen} onOpenChange={setHistoryOpen} isRestoring={restoreRevision.isPending} onRestore={restoreDescription} />
            <ConfirmDialog
                open={deleteOpen}
                onOpenChange={setDeleteOpen}
                title={t("issue.deleteIssue")}
                description={t("issue.deleteIssueDescription", { title: issue.title })}
                confirmLabel={t("issue.deleteIssue")}
                isPending={deleteIssue.isPending}
                onConfirm={() => deleteIssue.mutate(issue.identifier, {
                    onSuccess: ({ deletedAt }) => {
                        navigate(urls.issues(issue.project.issueKey));
                        showToast({
                            title: t("issue.deletedOne"),
                            action: {
                                label: t("issue.undo"),
                                onClick: async () => {
                                    try {
                                        await restoreDeletedIssue(issue.identifier, deletedAt);
                                        await Promise.all([
                                            queryClient.invalidateQueries({ queryKey: ["projects", issue.projectId, "issues"] }),
                                            queryClient.invalidateQueries({ queryKey: ["my-issues"] }),
                                            queryClient.invalidateQueries({ queryKey: ["issues"] }),
                                        ]);
                                        navigate(urls.issue(issue.identifier, issue.title));
                                    } catch {
                                        showToast({ tone: "error", title: t("issue.couldNotUndo") });
                                    }
                                },
                            },
                        });
                    },
                })}
            />
        </main>
    );
};

function IssuePager({ issues, identifier, onOpen }: { issues: Array<{ identifier: string }>; identifier: string; onOpen: (identifier: string) => void }) {
    const { t } = useTranslation();
    const index = issues.findIndex((item) => item.identifier === identifier);
    if (index < 0) return null;
    return (
        <div className="flex items-center gap-0.5 text-[13px] text-tertiary">
            <span className="px-1 tabular-nums">
                {index + 1} <span className="text-placeholder">/ {issues.length}</span>
            </span>
            <ButtonUtility icon={ArrowDown} size="xs" color="tertiary" tooltip={t("common.next")} isDisabled={index === issues.length - 1} onClick={() => onOpen(issues[index + 1]!.identifier)} />
            <ButtonUtility icon={ArrowUp} size="xs" color="tertiary" tooltip={t("common.previous")} isDisabled={index === 0} onClick={() => onOpen(issues[index - 1]!.identifier)} />
        </div>
    );
}

interface CopyActions {
    onCopyLink: () => void;
    onCopyId: () => void;
    onCopyBranch: () => void;
    onCopyPrompt: () => void;
    isCopying: boolean;
}

function IssueActionsMenu({ onCopyLink, onCopyId, onCopyBranch, onCopyPrompt, isCopying, onAddRelation, onSetParent, onOpenHistory, onDelete }: CopyActions & { onAddRelation: () => void; onSetParent: () => void; onOpenHistory: () => void; onDelete: () => void }) {
    const { t } = useTranslation();
    return (
        <Menu.Root>
            <Menu.Trigger aria-label={t("issue.issueActions")} className="grid size-6 shrink-0 place-items-center rounded text-tertiary outline-none hover:bg-layer-transparent-hover hover:text-primary focus-visible:bg-layer-transparent-hover data-[popup-open]:bg-layer-transparent-hover">
                <MoreHorizontalOutline className="size-4" />
            </Menu.Trigger>
            <Menu.Portal>
                <Menu.Positioner sideOffset={6} align="start" className="z-50">
                    <Menu.Popup className={cx("w-60", overlayChrome.menu, popupMotion)}>
                        <Menu.Item className={menuItemClass} onClick={onCopyLink}><Link2 className="size-4 text-tertiary" />{t("issue.copyIssueLink")}</Menu.Item>
                        <Menu.Item className={menuItemClass} onClick={onCopyId}><Copy className="size-4 text-tertiary" />{t("issue.copyIdentifier")}</Menu.Item>
                        <Menu.Item className={menuItemClass} onClick={onCopyBranch}><GitBranch className="size-4 text-tertiary" />{t("issue.copyBranchName")}</Menu.Item>
                        <Menu.Item className={menuItemClass} disabled={isCopying} onClick={onCopyPrompt}><Sparkles className="size-4 text-tertiary" />{t("issue.copyAsPrompt")}</Menu.Item>
                        <Menu.Separator className="my-1 h-px bg-[var(--border-subtle)]" />
                        <Menu.Item className={menuItemClass} onClick={onAddRelation}><Link2 className="size-4 text-tertiary" />{t("issue.addRelation")}</Menu.Item>
                        <Menu.Item className={menuItemClass} onClick={onSetParent}><ParentOutline className="size-4 text-tertiary" />{t("issue.addParent")}</Menu.Item>
                        <Menu.Item className={menuItemClass} onClick={onOpenHistory}><History className="size-4 text-tertiary" />{t("issue.descriptionHistory")}</Menu.Item>
                        <Menu.Separator className="my-1 h-px bg-[var(--border-subtle)]" />
                        <Menu.Item className={cx(menuItemClass, "text-danger-primary data-highlighted:text-danger-primary")} onClick={onDelete}><Trash2 className="size-4" />{t("issue.deleteIssue")}</Menu.Item>
                    </Menu.Popup>
                </Menu.Positioner>
            </Menu.Portal>
        </Menu.Root>
    );
}

/** Round copy shortcuts at the top of the properties rail. */
function IssueQuickActions({ onCopyLink, onCopyId, onCopyBranch, onCopyPrompt, isCopying }: CopyActions) {
    const { t } = useTranslation();
    const actions: Array<[string, typeof Link2, () => void, boolean?]> = [
        [t("issue.copyIssueLink"), Link2, onCopyLink],
        [t("issue.copyIdentifier"), Copy, onCopyId],
        [t("issue.copyBranchName"), GitBranch, onCopyBranch],
        [t("issue.copyAsPrompt"), Sparkles, onCopyPrompt, isCopying],
    ];
    return (
        <div className="flex items-center justify-end gap-1.5">
            {actions.map(([label, Icon, onClick, disabled]) => (
                <ButtonUtility key={label} icon={Icon} size="sm" color="tertiary" tooltip={label} tooltipPlacement="bottom" isDisabled={disabled} onClick={onClick} className="size-8 rounded-full border border-subtle" />
            ))}
        </div>
    );
}

interface PropertyOption {
    value: string;
    label: string;
    icon: ReactNode;
}

/**
 * A property row that opens a searchable list. Arrow keys move, Enter picks, and 1–9 pick directly while the search is empty.
 */
function PropertyMenu({
    open,
    onOpenChange,
    label,
    placeholder,
    shortcut,
    value,
    options,
    onSelect,
    disabled,
    children,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    label: string;
    placeholder: string;
    shortcut?: string;
    value: string;
    options: PropertyOption[];
    onSelect: (value: string) => void;
    disabled?: boolean;
    children: ReactNode;
}) {
    const { t } = useTranslation();
    const [query, setQuery] = useState("");
    const [active, setActive] = useState(0);
    const normalized = query.trim().toLowerCase();
    const filtered = normalized ? options.filter((option) => option.label.toLowerCase().includes(normalized)) : options;
    useEffect(() => {
        if (!open) return;
        setQuery("");
        setActive(Math.max(0, options.findIndex((option) => option.value === value)));
        // Only reset when the menu opens; option identity changes on every render.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open]);

    function choose(option: PropertyOption | undefined) {
        if (!option) return;
        if (option.value !== value) onSelect(option.value);
        onOpenChange(false);
    }

    return (
        <Popover.Root open={open} onOpenChange={onOpenChange}>
            <Popover.Trigger aria-label={label} disabled={disabled} className={propertyButton}>
                {children}
            </Popover.Trigger>
            <Popover.Portal>
                <Popover.Positioner side="bottom" align="start" sideOffset={4} collisionPadding={12} className="z-50">
                    <Popover.Popup className={cx("w-64 p-1", overlayChrome.popup, popupMotion)}>
                        <Popover.Title className="sr-only">{label}</Popover.Title>
                        <div className="mb-1 flex items-center gap-2 border-b border-subtle px-2 pb-1">
                            <input
                                autoFocus
                                value={query}
                                placeholder={placeholder}
                                aria-label={placeholder}
                                onChange={(event) => {
                                    setQuery(event.target.value);
                                    setActive(0);
                                }}
                                onKeyDown={(event) => {
                                    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                                        event.preventDefault();
                                        const step = event.key === "ArrowDown" ? 1 : -1;
                                        setActive((current) => (current + step + filtered.length) % Math.max(filtered.length, 1));
                                    } else if (event.key === "Enter") {
                                        event.preventDefault();
                                        choose(filtered[active]);
                                    } else if (!query && /^[1-9]$/.test(event.key)) {
                                        event.preventDefault();
                                        choose(options[Number(event.key) - 1]);
                                    }
                                }}
                                className="h-8 min-w-0 flex-1 bg-transparent text-[13px] text-primary outline-none placeholder:text-placeholder"
                            />
                            {shortcut && <kbd className="rounded border border-subtle px-1.5 font-sans text-[11px] text-tertiary">{shortcut}</kbd>}
                        </div>
                        <div role="listbox" aria-label={label} className="max-h-72 overflow-y-auto">
                            {filtered.map((option, index) => (
                                <button
                                    key={option.value || "none"}
                                    type="button"
                                    role="option"
                                    aria-selected={option.value === value}
                                    onMouseEnter={() => setActive(index)}
                                    onClick={() => choose(option)}
                                    className={cx("flex h-8 w-full items-center gap-2.5 rounded px-2 text-left text-[13px] text-secondary transition-colors duration-100", index === active && "bg-layer-2-hover text-primary")}
                                >
                                    <span className="grid size-4 shrink-0 place-items-center">{option.icon}</span>
                                    <span className="min-w-0 flex-1 truncate">{option.label}</span>
                                    {option.value === value && <Check className="size-3.5 shrink-0 text-secondary" />}
                                    <span className="w-3 shrink-0 text-right text-[11px] text-placeholder tabular-nums">{!query && index < 9 ? index + 1 : ""}</span>
                                </button>
                            ))}
                            {filtered.length === 0 && <p className="px-2 py-2 text-[13px] text-placeholder">{t("common.noResults")}</p>}
                        </div>
                    </Popover.Popup>
                </Popover.Positioner>
            </Popover.Portal>
        </Popover.Root>
    );
}

function PropertyGroup({ title, children }: { title: string; children: ReactNode }) {
    return (
        <section>
            <h3 className="mb-1 px-2 text-[12px] font-medium text-tertiary">{title}</h3>
            <div className="flex flex-col gap-px">{children}</div>
        </section>
    );
}

function PropertyIcon({ children }: { children: ReactNode }) {
    return <span className="grid size-4 shrink-0 place-items-center">{children}</span>;
}

function EmptyAvatar() {
    return <span className="size-3.5 rounded-full border border-dashed border-[var(--border-strong-1)]" />;
}

function IssueProperties({
    issue,
    projectIcon,
    columns,
    members,
    categories,
    projectIssues,
    save,
    isPending,
    error,
    openMenu,
    onOpenMenuChange,
}: {
    issue: IssueDetail;
    projectIcon: EntityIcon | string | null | undefined;
    columns: Array<{ id: string; name: string; color: string | null }>;
    members: Array<{ id: string; name: string; avatarUrl: string | null }>;
    categories: Array<{ id: string; name: string; color: string | null }>;
    projectIssues: Array<{ id: string; identifier: string; title: string }>;
    save: (input: UpdateIssueInput) => void;
    isPending: boolean;
    error: string | null;
    openMenu: PropertyMenuId | null;
    onOpenMenuChange: (menu: PropertyMenuId | null) => void;
}) {
    const { t, i18n } = useTranslation();
    const column = columns.find((candidate) => candidate.id === issue.columnId);
    const assignee = members.find((member) => member.id === issue.assigneeId);
    const labelById = new Map(categories.map((candidate) => [candidate.id, candidate]));
    const issueLabels = resolveLabels(issue.categoryIds, labelById);
    const labelEditor = useLabelToggle(issue.categoryIds, (categoryIds) => save({ categoryIds }));
    const parent = projectIssues.find((candidate) => candidate.id === issue.parent?.id);
    const menu = (id: PropertyMenuId) => ({ open: openMenu === id, onOpenChange: (open: boolean) => onOpenMenuChange(open ? id : null), disabled: isPending });
    const avatar = (person: { name: string; avatarUrl: string | null }) => <IssueAvatar name={person.name} avatarUrl={person.avatarUrl} className="size-4 text-[9px]" />;
    const created = new Intl.DateTimeFormat(i18n.language, { dateStyle: "medium" }).format(new Date(issue.createdAt));
    const dueState = getDueState(issue.dueDate, columnBucket(column?.name ?? "") === "closed");

    return (
        <div className="flex flex-col gap-6">
            <PropertyGroup title={t("issue.properties")}>
                <PropertyMenu
                    {...menu("state")}
                    label={t("issue.status")}
                    placeholder={t("issue.changeStatus")}
                    shortcut="S"
                    value={issue.columnId}
                    options={columns.map((candidate) => ({ value: candidate.id, label: translateStatusName(candidate.name, t), icon: <StateIcon name={candidate.name} color={candidate.color} /> }))}
                    onSelect={(value) => save({ columnId: value })}
                >
                    <PropertyIcon><StateIcon name={column?.name ?? ""} color={column?.color} /></PropertyIcon>
                    <span className="truncate">{column ? translateStatusName(column.name, t) : t("issue.unknownStatus")}</span>
                </PropertyMenu>
                <PropertyMenu
                    {...menu("priority")}
                    label={t("issue.priority")}
                    placeholder={t("issue.setPriority")}
                    shortcut="P"
                    value={issue.priority}
                    options={PRIORITY_OPTIONS.map((priority) => ({ value: priority, label: t(priorityLabelKey(priority)), icon: <PriorityIcon priority={priority} /> }))}
                    onSelect={(value) => save({ priority: value as UpdateIssueInput["priority"] })}
                >
                    <PropertyIcon><PriorityIcon priority={issue.priority} /></PropertyIcon>
                    <span className={cx("truncate", issue.priority === "none" && "text-tertiary")}>{issue.priority === "none" ? t("issue.setPriorityAction") : t(priorityLabelKey(issue.priority))}</span>
                </PropertyMenu>
                <PropertyMenu
                    {...menu("assignee")}
                    label={t("issue.assignee")}
                    placeholder={t("issue.assignTo")}
                    shortcut="A"
                    value={issue.assigneeId ?? ""}
                    options={[{ value: "", label: t("issue.unassigned"), icon: <EmptyAvatar /> }, ...members.map((member) => ({ value: member.id, label: member.name, icon: avatar(member) }))]}
                    onSelect={(value) => save({ assigneeId: value || null })}
                >
                    <PropertyIcon>{assignee ? avatar(assignee) : <EmptyAvatar />}</PropertyIcon>
                    <span className={cx("truncate", !assignee && "text-tertiary")}>{assignee?.name ?? t("issue.assign")}</span>
                </PropertyMenu>
                <PropertyMenu
                    {...menu("estimate")}
                    label={t("issue.estimate")}
                    placeholder={t("issue.setEstimate")}
                    value={String(issue.estimate ?? "")}
                    options={[{ value: "", label: t("issue.noEstimate"), icon: <EstimateOutline className="size-3.5 text-tertiary" /> }, ...[1, 2, 3, 5, 8].map((points) => ({ value: String(points), label: t("projects.points", { count: points }), icon: <EstimateOutline className="size-3.5 text-tertiary" /> }))]}
                    onSelect={(value) => save({ estimate: value ? Number(value) : null })}
                >
                    <PropertyIcon><EstimateOutline className="size-3.5 text-tertiary" /></PropertyIcon>
                    <span className={cx("truncate", issue.estimate == null && "text-tertiary")}>{issue.estimate != null ? t("projects.points", { count: issue.estimate }) : t("issue.estimateAction")}</span>
                </PropertyMenu>
                <DueDatePopover
                    {...menu("due")}
                    value={issue.dueDate}
                    onChange={(dueDate) => save({ dueDate })}
                    triggerLabel={t("issue.dueDate")}
                    triggerClassName={propertyButton}
                >
                    <PropertyIcon><CalendarDays className={cx("size-3.5", dueState ? dueStateClass[dueState] : "text-tertiary")} /></PropertyIcon>
                    <span className={cx("truncate", !issue.dueDate ? "text-tertiary" : dueState !== "upcoming" && dueState ? dueStateClass[dueState] : undefined)}>
                        {issue.dueDate ? formatDueDate(issue.dueDate, i18n.language) : t("issue.dueDateAction")}
                    </span>
                    {dueState === "overdue" && <span className="ml-auto shrink-0 text-[11px] text-danger-primary">{t("issue.isOverdue")}</span>}
                    {dueState === "today" && <span className="ml-auto shrink-0 text-[11px] text-warning-primary">{t("issue.isDueToday")}</span>}
                </DueDatePopover>
                <PropertyMenu
                    {...menu("parent")}
                    label={t("issue.parent")}
                    placeholder={t("issue.setParent")}
                    value={issue.parent?.id ?? ""}
                    options={[{ value: "", label: t("issue.noParent"), icon: <ParentOutline className="size-3.5 text-tertiary" /> }, ...projectIssues.filter((candidate) => candidate.id !== issue.id).map((candidate) => ({ value: candidate.id, label: `${candidate.identifier} ${candidate.title}`, icon: <ParentOutline className="size-3.5 text-tertiary" /> }))]}
                    onSelect={(value) => save({ parentIssueId: value || null })}
                >
                    <PropertyIcon><ParentOutline className="size-3.5 text-tertiary" /></PropertyIcon>
                    <span className={cx("truncate", !issue.parent && "text-tertiary")}>{parent ? <><span className="text-tertiary">{parent.identifier}</span> {parent.title}</> : issue.parent ? issue.parent.title : t("issue.addParentIssue")}</span>
                </PropertyMenu>
            </PropertyGroup>

            <PropertyGroup title={t("issue.labels")}>
                <LabelsPicker
                    {...menu("label")}
                    labels={categories}
                    state={labelEditor.state}
                    onToggle={labelEditor.toggle}
                    onClose={labelEditor.reset}
                    triggerLabel={t("issue.labels")}
                    triggerClassName={cx(propertyButton, issueLabels.length > 0 && "h-auto min-h-8 flex-wrap gap-1 py-1")}
                >
                    {issueLabels.length > 0 ? (
                        issueLabels.map((label) => <LabelChip key={label.id} label={label} className="h-6 max-w-full px-2 text-[12px]" />)
                    ) : (
                        <>
                            <PropertyIcon><LabelsOutline className="size-3.5 text-tertiary" /></PropertyIcon>
                            <span className="truncate text-tertiary">{t("issue.addLabel")}</span>
                        </>
                    )}
                </LabelsPicker>
            </PropertyGroup>

            <PropertyGroup title={t("issue.project")}>
                <Link to={urls.project(issue.project.issueKey)} className={propertyButton}>
                    <ProjectIcon icon={projectIcon} className="size-4 shrink-0" />
                    <span className="truncate">{issue.project.name}</span>
                </Link>
            </PropertyGroup>

            <p className="px-2 text-[12px] text-placeholder">{t("issue.createdByOn", { name: issue.createdBy.name, date: created })}</p>
            {error && <p role="alert" className="animate-enter px-2 text-xs text-danger-primary">{error}</p>}
        </div>
    );
}

function IssueSubIssues({ issue, columns, isCreating, onCreate }: { issue: IssueDetail; columns: Array<{ id: string; name: string; color: string | null }>; isCreating: boolean; onCreate: (title: string) => Promise<void> }) {
    const { t } = useTranslation();
    const [adding, setAdding] = useState(false);
    const [draft, setDraft] = useState("");
    const [error, setError] = useState<string | null>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    const children = issue.children ?? [];
    const columnOf = (columnId: string) => columns.find((column) => column.id === columnId);
    const done = children.filter((child) => /done|complete|conclu/i.test(columnOf(child.columnId)?.name ?? "")).length;
    useEffect(() => {
        if (adding) inputRef.current?.focus();
    }, [adding]);

    async function submit(event: React.FormEvent<HTMLFormElement>) {
        event.preventDefault();
        const value = draft.trim();
        if (!value) return;
        setError(null);
        try {
            await onCreate(value);
            setDraft("");
        } catch (reason) {
            setError(errorMessage(reason, t("issue.couldNotCreateSubIssue")));
        }
    }

    return (
        <section className="mt-8" aria-label={t("issue.subIssues")}>
            {children.length > 0 && (
                <>
                    <div className="mb-1 flex items-center gap-2 px-2 text-[13px]">
                        <span className="font-medium text-secondary">{t("issue.subIssues")}</span>
                        <span className="text-tertiary tabular-nums">{done}/{children.length}</span>
                    </div>
                    <ul className="flex flex-col">
                        {children.map((child) => {
                            const identifier = `${issue.project.issueKey}-${child.number}`;
                            const column = columnOf(child.columnId);
                            return (
                                <li key={child.id} className="animate-enter" data-issue-id={child.id} data-issue-context="true" data-project-id={issue.projectId} data-issue-identifier={identifier} data-issue-title={child.title}>
                                    <Link to={urls.issue(identifier, child.title)} className="flex h-9 items-center gap-2.5 rounded-md px-2 text-[13px] transition-colors duration-150 hover:bg-layer-transparent-hover">
                                        <StateIcon name={column?.name ?? ""} color={column?.color} />
                                        <span className="w-16 shrink-0 text-tertiary">{identifier}</span>
                                        <span className="min-w-0 truncate text-primary">{child.title}</span>
                                    </Link>
                                </li>
                            );
                        })}
                    </ul>
                </>
            )}
            <Collapse open={adding} lazy={false}>
                <form onSubmit={submit} className="mt-1 flex h-10 items-center gap-2.5 rounded-lg border border-subtle bg-layer-1 pr-1.5 pl-2.5">
                    <StateIcon name={defaultIssueColumn(columns)?.name ?? ""} color={defaultIssueColumn(columns)?.color} />
                    <input
                        ref={inputRef}
                        value={draft}
                        disabled={isCreating}
                        placeholder={t("issue.subIssueTitle")}
                        aria-label={t("issue.subIssueTitle")}
                        onChange={(event) => setDraft(event.target.value)}
                        onKeyDown={(event) => {
                            if (event.key === "Escape") {
                                setAdding(false);
                                setDraft("");
                            }
                        }}
                        className="min-w-0 flex-1 bg-transparent text-[13px] text-primary outline-none placeholder:text-placeholder"
                    />
                    <Button type="button" size="xs" color="tertiary" onClick={() => { setAdding(false); setDraft(""); }}>{t("common.cancel")}</Button>
                    <Button type="submit" size="xs" isDisabled={!draft.trim()} isLoading={isCreating}>{t("common.add")}</Button>
                </form>
            </Collapse>
            {error && <p role="alert" className="animate-enter mt-1 px-2 text-xs text-danger-primary">{error}</p>}
            {!adding && (
                <button type="button" onClick={() => setAdding(true)} className="mt-1 flex h-8 items-center gap-2 rounded-md px-2 text-[13px] text-tertiary transition-colors duration-150 hover:bg-layer-transparent-hover hover:text-primary">
                    <Plus className="size-3.5" />
                    {t("issue.addSubIssue")}
                </button>
            )}
        </section>
    );
}

type RelationType = "blocks" | "blocked_by" | "related" | "duplicate";

function IssueRelations({
    projectId,
    issueId,
    projectIssues,
    relations,
    formOpen,
    onFormOpenChange,
    isPending,
    onAdd,
    onDelete,
}: {
    projectId: string;
    issueId: string;
    projectIssues: Array<{ id: string; identifier: string; title: string }>;
    relations: Array<{ id: string; type: string; target: { id: string; number: number; title: string; projectId: string; project: { issueKey: string } } }>;
    formOpen: boolean;
    onFormOpenChange: (open: boolean) => void;
    isPending: boolean;
    onAdd: (targetIssueIdentifier: string, type: RelationType) => Promise<void>;
    onDelete: (relationId: string) => void;
}) {
    const { t } = useTranslation();
    const [targetIssueIdentifier, setTargetIssueIdentifier] = useState("");
    const [type, setType] = useState<RelationType>("related");
    const [error, setError] = useState<string | null>(null);
    const typeLabels: Record<RelationType, string> = { related: t("issue.relatedTo"), blocks: t("issue.blocks"), blocked_by: t("issue.blockedBy"), duplicate: t("issue.duplicateOf") };

    async function addRelation(event: React.FormEvent<HTMLFormElement>) {
        event.preventDefault();
        const target = targetIssueIdentifier.trim();
        if (!target) {
            setError(t("issue.chooseIssueToRelate"));
            return;
        }
        if (projectIssues.length > 0 && !projectIssues.some((projectIssue) => projectIssue.identifier.toLowerCase() === target.toLowerCase())) {
            setError(t("issue.chooseIssueFromProject"));
            return;
        }
        setError(null);
        try {
            await onAdd(target, type);
            setTargetIssueIdentifier("");
            onFormOpenChange(false);
        } catch (reason) {
            setError(reason instanceof ApiError ? reason.message : t("issue.couldNotAddRelation"));
        }
    }

    return (
        <section className="mt-8" aria-label={t("issue.relations")}>
            <div className="mb-1 flex items-center justify-between gap-2 px-2">
                <span className="text-[13px] font-medium text-secondary">{t("issue.relations")}</span>
                {relations.length > 0 && <ButtonUtility icon={Plus} size="xs" color="tertiary" tooltip={t("issue.addRelation")} onClick={() => onFormOpenChange(!formOpen)} />}
            </div>
            <ul className="flex flex-col">
                {relations.map((relation) => {
                    const identifier = `${relation.target.project.issueKey}-${relation.target.number}`;
                    const targetProjectId = relation.target.projectId || projectId;
                    return (
                        <li key={relation.id} className="group/relation animate-enter flex h-9 items-center gap-2.5 rounded-md px-2 text-[13px] transition-colors duration-150 hover:bg-layer-transparent-hover">
                            <span className="w-24 shrink-0 truncate text-tertiary">{typeLabels[relation.type as RelationType] ?? relation.type}</span>
                            <Link
                                to={urls.issue(identifier, relation.target.title)}
                                className="flex min-w-0 flex-1 items-center gap-2"
                                data-issue-id={relation.target.id}
                                data-issue-context="true"
                                data-project-id={targetProjectId}
                                data-issue-identifier={identifier}
                                data-issue-title={relation.target.title}
                            >
                                <span className="shrink-0 text-tertiary">{identifier}</span>
                                <span className="truncate text-primary">{relation.target.title}</span>
                            </Link>
                            <span className="opacity-0 transition-opacity group-hover/relation:opacity-100 focus-within:opacity-100">
                                <ButtonUtility icon={Trash2} size="xs" color="tertiary" tooltip={t("issue.removeRelation")} onClick={() => onDelete(relation.id)} isDisabled={isPending} />
                            </span>
                        </li>
                    );
                })}
            </ul>
            <Collapse open={formOpen} lazy={false}>
                <form className="mt-1 flex flex-col gap-2 rounded-lg border border-subtle bg-layer-1 p-2 sm:flex-row sm:items-center" onSubmit={addRelation}>
                    <Select
                        className="sm:w-40"
                        aria-label={t("issue.relationType")}
                        items={(Object.keys(typeLabels) as RelationType[]).map((id) => ({ id, label: typeLabels[id], icon: id === "blocks" ? Ban : id === "blocked_by" ? ShieldOff : id === "duplicate" ? Copy : Link2 }))}
                        selectedKey={type}
                        onSelectionChange={(next) => setType((next ?? "related") as RelationType)}
                        size="sm"
                    >
                        {(item) => <Select.Item id={item.id} icon={item.icon}>{item.label}</Select.Item>}
                    </Select>
                    <ComboBox
                        className="min-w-0 flex-1"
                        items={projectIssues.filter((projectIssue) => projectIssue.id !== issueId).map((projectIssue) => ({ id: projectIssue.identifier, label: `${projectIssue.identifier} · ${projectIssue.title}`, icon: ParentOutline }))}
                        selectedKey={targetIssueIdentifier || null}
                        onSelectionChange={(next) => setTargetIssueIdentifier(String(next ?? ""))}
                        placeholder={t("issue.issueIdentifier")}
                        size="sm"
                    >
                        {(item) => <ComboBoxItem item={item}>{item.label}</ComboBoxItem>}
                    </ComboBox>
                    <Button type="submit" size="xs" iconLeading={Plus} isLoading={isPending}>{t("common.add")}</Button>
                </form>
            </Collapse>
            {error && <p role="alert" className="animate-enter mt-1 px-2 text-xs text-danger-primary">{error}</p>}
        </section>
    );
}

type ActivityEntry = { id: string; type: string; createdAt: string; actor: { name: string; avatarUrl: string | null }; source?: ActionSource | null; payload: Record<string, unknown> };
type CommentEntry = { id: string; contentJson: TiptapDocument; authorId: string; author: { name: string; username?: string; avatarUrl: string | null }; source?: ActionSource | null; createdAt: string; updatedAt: string; reactions: ReactionGroup[]; parentCommentId: string | null };
interface TimelineLookups {
    columns: Array<{ id: string; name: string; color?: string | null }>;
    members: Array<{ id: string; name: string }>;
    categories: Array<{ id: string; name: string; color: string | null }>;
    projectIssues: Array<{ id: string; identifier: string; title: string }>;
}

/** Activity and comments in one chronological feed, followed by the comment composer. */
function IssueTimeline({
    activity,
    comments,
    isLoading,
    loadFailed,
    lookups,
    currentUserId,
    currentUser,
    mentionItems,
    onReact,
    onReply,
    value,
    onChange,
    isSubmitting,
    error,
    onSubmit,
    onDelete,
    onEdit,
}: {
    activity: ActivityEntry[];
    comments: CommentEntry[];
    isLoading: boolean;
    loadFailed: boolean;
    lookups: TimelineLookups;
    currentUserId?: string;
    /** Project members, for @mentions in comments. */
    mentionItems: MentionItem[];
    onReact: (commentId: string, emoji: string, add: boolean) => void;
    currentUser: { name: string; avatarUrl: string | null } | null;
    onReply: (parentCommentId: string, contentJson: TiptapDocument) => Promise<void>;
    value: TiptapDocument;
    onChange: (value: TiptapDocument) => void;
    isSubmitting: boolean;
    error?: string | null;
    onSubmit: () => void | Promise<void>;
    onDelete: (id: string) => void | Promise<void>;
    onEdit: (id: string, contentJson: TiptapDocument) => void | Promise<void>;
}) {
    const { t } = useTranslation();
    // Replies sit inside their thread, oldest first; only the comments that open a thread join the timeline.
    const replies = new Map<string, CommentEntry[]>();
    for (const comment of comments) {
        if (comment.parentCommentId) replies.set(comment.parentCommentId, [...(replies.get(comment.parentCommentId) ?? []), comment]);
    }
    for (const thread of replies.values()) thread.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    const entries = [
        ...activity.map((entry) => ({ kind: "activity" as const, at: entry.createdAt, entry })),
        ...comments.filter((entry) => !entry.parentCommentId).map((entry) => ({ kind: "comment" as const, at: entry.createdAt, entry })),
    ].sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());
    const canSend = hasMeaningfulTiptapContent(value) && !isSubmitting;

    return (
        <section aria-labelledby="issue-activity-heading">
            <h2 id="issue-activity-heading" className="text-[15px] font-medium text-primary">{t("issue.activity")}</h2>
            {isLoading ? (
                <div className="mt-4 space-y-3" role="status" aria-label={t("issue.loadingActivity")}><Skeleton className="h-5 w-3/5" /><Skeleton className="h-5 w-2/5" /><Skeleton className="h-20 w-full" /></div>
            ) : loadFailed ? (
                <p className="mt-4 text-sm text-danger-primary" role="alert">{t("issue.couldNotLoadActivity")}</p>
            ) : (
                <ol className="mt-3 flex flex-col">
                    {entries.map((item) =>
                        item.kind === "comment" ? (
                            <TimelineThread
                                key={`c-${item.entry.id}`}
                                entry={item.entry}
                                replies={replies.get(item.entry.id) ?? []}
                                currentUser={currentUser}
                                onReply={onReply}
                                currentUserId={currentUserId}
                                onReact={onReact}
                                mentionItems={mentionItems}
                                isSubmitting={isSubmitting}
                                onDelete={onDelete}
                                onEdit={onEdit}
                            />
                        ) : (
                            <TimelineActivity key={`a-${item.entry.id}`} entry={item.entry} lookups={lookups} />
                        ),
                    )}
                </ol>
            )}
            <div className="mt-4 rounded-xl border border-subtle bg-layer-1 transition-colors duration-150 focus-within:border-[var(--border-strong-1)]">
                <RichTextEditor toolbar={false} variant="comment" content={value} onChange={onChange} onSubmitShortcut={onSubmit} placeholder={t("issue.leaveComment")} mentionItems={mentionItems} className="issue-comment-composer" />
                <div className="flex items-center justify-end gap-2 px-3 pb-3">
                    <button
                        type="button"
                        aria-label={t("issue.commentAction")}
                        title={t("issue.commentAction")}
                        disabled={!canSend}
                        onClick={() => void onSubmit()}
                        className="grid size-7 place-items-center rounded-full bg-layer-2 text-tertiary transition-colors duration-150 enabled:bg-accent-primary enabled:text-white enabled:hover:opacity-90 disabled:cursor-not-allowed"
                    >
                        <ArrowUp className="size-3.5" />
                    </button>
                </div>
            </div>
            {error && <p role="alert" className="animate-enter mt-2 text-xs text-danger-primary">{error}</p>}
        </section>
    );
}

function TimelineActivity({ entry, lookups }: { entry: ActivityEntry; lookups: TimelineLookups }) {
    const { t, i18n } = useTranslation();
    const statusTo = entry.type === "status_changed" ? lookups.columns.find((column) => column.id === entry.payload.to) : undefined;
    const label = entry.type === "label_added" || entry.type === "label_removed" ? lookups.categories.find((category) => category.id === entry.payload.categoryId) : undefined;
    return (
        <li className="animate-enter flex items-center gap-2.5 py-1.5 pl-1 text-[13px] text-tertiary">
            <span className="grid h-5 min-w-5 shrink-0 place-items-center">
                {statusTo ? <StateIcon name={statusTo.name} color={statusTo.color} /> : <IssueAvatarGroup name={entry.actor.name} avatarUrl={entry.actor.avatarUrl} source={entry.source} className="size-4 text-[9px]" />}
            </span>
            <p className="min-w-0 flex-1">
                <span className="font-medium text-secondary">{entry.actor.name}</span>
                {statusTo && entry.source && <SourceAvatar source={entry.source} className="ml-1 size-4 align-middle" />}{" "}{activityLabelKeys[entry.type] ? t(activityLabelKeys[entry.type]) : entry.type}
                {label && <> <LabelChip label={label} className="inline-flex max-w-40 align-middle" /></>}
                {formatActivityChange(entry.payload, { ...lookups, columns: lookups.columns.map((column) => ({ ...column, name: translateStatusName(column.name, t) })) }, t("issue.noneValue"), i18n.language)}
                <span className="text-placeholder"> · </span>
                <time className="text-placeholder" title={formatFullIssueDate(entry.createdAt, i18n.language)} dateTime={entry.createdAt}>{formatDistanceToNow(entry.createdAt, i18n.language)}</time>
            </p>
        </li>
    );
}

type CommentActions = {
    currentUserId?: string;
    mentionItems: MentionItem[];
    isSubmitting: boolean;
    onReact: (commentId: string, emoji: string, add: boolean) => void;
    onDelete: (id: string) => void | Promise<void>;
    onEdit: (id: string, contentJson: TiptapDocument) => void | Promise<void>;
};

/**
 * A comment and its replies in one card, with a box at the bottom to reply. Threads are one level deep: replying
 * from the card always adds to the end of it.
 */
function TimelineThread({ entry, replies, currentUser, onReply, ...actions }: CommentActions & {
    entry: CommentEntry;
    replies: CommentEntry[];
    currentUser: { name: string; avatarUrl: string | null } | null;
    onReply: (parentCommentId: string, contentJson: TiptapDocument) => Promise<void>;
}) {
    return (
        <li className="animate-enter my-2 overflow-hidden rounded-xl border border-subtle bg-layer-1">
            <CommentItem entry={entry} replyCount={replies.length} {...actions} />
            {replies.map((reply) => (
                <div key={reply.id} className="animate-enter border-t border-subtle">
                    <CommentItem entry={reply} replyCount={0} {...actions} />
                </div>
            ))}
            <ReplyComposer currentUser={currentUser} mentionItems={actions.mentionItems} onSubmit={(contentJson) => onReply(entry.id, contentJson)} />
        </li>
    );
}

/** "Leave a reply…" under a thread. It grows as you type and sends with the arrow or Cmd/Ctrl+Enter. */
function ReplyComposer({ currentUser, mentionItems, onSubmit }: { currentUser: { name: string; avatarUrl: string | null } | null; mentionItems: MentionItem[]; onSubmit: (contentJson: TiptapDocument) => Promise<void> }) {
    const { t } = useTranslation();
    const [value, setValue] = useState<TiptapDocument>(EMPTY_TIPTAP_DOCUMENT);
    // Remounting the editor clears it once a reply is sent.
    const [editorKey, setEditorKey] = useState(0);
    const [sending, setSending] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const canSend = hasMeaningfulTiptapContent(value) && !sending;
    const send = async () => {
        if (!canSend) return;
        setSending(true);
        setError(null);
        try {
            await onSubmit(value);
            setValue(EMPTY_TIPTAP_DOCUMENT);
            setEditorKey((key) => key + 1);
        } catch (reason) {
            setError(errorMessage(reason, t("issue.couldNotAddReply")));
        } finally {
            setSending(false);
        }
    };
    return (
        <div className="border-t border-subtle">
            <div className="flex items-start gap-2.5 px-4 py-2.5">
                {currentUser && <IssueAvatar name={currentUser.name} avatarUrl={currentUser.avatarUrl} className="mt-1 size-5 shrink-0 text-[10px]" />}
                <RichTextEditor
                    key={editorKey}
                    toolbar={false}
                    variant="comment"
                    content={value}
                    onChange={setValue}
                    onSubmitShortcut={() => void send()}
                    placeholder={t("issue.leaveReply")}
                    mentionItems={mentionItems}
                    className="issue-reply-composer min-w-0 flex-1"
                />
                <button
                    type="button"
                    aria-label={t("issue.replyAction")}
                    title={t("issue.replyAction")}
                    disabled={!canSend}
                    onClick={() => void send()}
                    className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full bg-layer-2 text-tertiary transition-colors duration-150 enabled:bg-accent-primary enabled:text-white enabled:hover:opacity-90 disabled:cursor-not-allowed"
                >
                    <ArrowUp className="size-3.5" />
                </button>
            </div>
            {error && <p role="alert" className="animate-enter px-4 pb-2.5 text-xs text-danger-primary">{error}</p>}
        </div>
    );
}

function CommentItem({ entry, replyCount, currentUserId, onReact, mentionItems, isSubmitting, onDelete, onEdit }: CommentActions & { entry: CommentEntry; replyCount: number }) {
    const { t, i18n } = useTranslation();
    const [editing, setEditing] = useState(false);
    const [confirmDelete, setConfirmDelete] = useState(false);
    const [draft, setDraft] = useState<TiptapDocument>(entry.contentJson);
    const mine = entry.authorId === currentUserId;
    const edited = new Date(entry.updatedAt).getTime() > new Date(entry.createdAt).getTime();
    const remove = () => void Promise.resolve(onDelete(entry.id)).catch(() => undefined);
    return (
        <div className="group/comment px-4 py-3">
            <div className="mb-1.5 flex items-center gap-2 text-[13px]">
                <IssueAvatarGroup name={entry.author.name} avatarUrl={entry.author.avatarUrl} source={entry.source} className="size-5 text-[10px]" />
                <span className="font-medium text-primary">{entry.author.name}</span>
                {entry.source && <span className="text-tertiary">{t("issue.viaSource", { client: sourceLabel(entry.source) })}</span>}
                <time className="text-tertiary" title={formatFullIssueDate(entry.createdAt, i18n.language)} dateTime={entry.createdAt}>
                    {formatDistanceToNow(entry.createdAt, i18n.language)}{edited ? ` · ${t("issue.edited")}` : ""}
                </time>
                {!editing && (
                    <div className="ml-auto flex items-center gap-0.5 opacity-0 transition-opacity duration-150 group-hover/comment:opacity-100 focus-within:opacity-100 has-[[data-popup-open]]:opacity-100">
                        <ReactionPicker onPick={(emoji) => onReact(entry.id, emoji, !entry.reactions.find((group) => group.emoji === emoji)?.users.some((user) => user.id === currentUserId))} />
                        {mine && <>
                        <ButtonUtility icon={Pencil} size="xs" color="tertiary" tooltip={t("common.edit")} onClick={() => { setDraft(entry.contentJson); setEditing(true); }} />
                        {/* Deleting the comment that opens a thread deletes its replies too, so that asks first. */}
                        <ButtonUtility icon={Trash2} size="xs" color="tertiary" tooltip={t("common.delete")} isDisabled={isSubmitting} onClick={() => (replyCount > 0 ? setConfirmDelete(true) : remove())} />
                        </>}
                    </div>
                )}
            </div>
            {editing ? (
                <>
                    <RichTextEditor toolbar={false} variant="comment" content={draft} onChange={setDraft} mentionItems={mentionItems} className="issue-comment-composer" />
                    <div className="mt-2 flex justify-end gap-2">
                        <Button size="xs" color="tertiary" onClick={() => setEditing(false)}>{t("common.cancel")}</Button>
                        <Button size="xs" isLoading={isSubmitting} onClick={async () => {
                            try {
                                await onEdit(entry.id, draft);
                                setEditing(false);
                            } catch {
                                // The timeline shows the error and keeps the editor open.
                            }
                        }}>{t("common.save")}</Button>
                    </div>
                </>
            ) : (
                <>
                    <RichTextEditor variant="comment" content={entry.contentJson} editable={false} className="issue-comment-body" />
                    <ReactionChips reactions={entry.reactions} currentUserId={currentUserId} onToggle={(emoji, add) => onReact(entry.id, emoji, add)} />
                </>
            )}
            {replyCount > 0 && (
                <ConfirmDialog
                    open={confirmDelete}
                    onOpenChange={setConfirmDelete}
                    title={t("issue.deleteThreadTitle")}
                    description={replyCount === 1 ? t("issue.deleteThreadDescriptionOne") : t("issue.deleteThreadDescription", { count: replyCount })}
                    confirmLabel={t("common.delete")}
                    isPending={isSubmitting}
                    onConfirm={() => {
                        setConfirmDelete(false);
                        remove();
                    }}
                />
            )}
        </div>
    );
}

/** Same shape as Linear's branch names: `user/key-12-short-title`. */
function gitBranchName(username: string | undefined, identifier: string, title: string) {
    const slug = title
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 48)
        .replace(/-+$/g, "");
    const branch = [identifier.toLowerCase(), slug].filter(Boolean).join("-");
    return username ? `${username.toLowerCase()}/${branch}` : branch;
}

function IssueLoadingSkeleton() {
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

function formatFullIssueDate(value: string, locale: string) {
    return new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function formatActivityChange(payload: Record<string, unknown>, lookups: {
    columns: Array<{ id: string; name: string }>;
    members: Array<{ id: string; name: string }>;
    categories: Array<{ id: string; name: string }>;
    projectIssues: Array<{ id: string; identifier: string; title: string }>;
}, noneLabel: string, locale: string) {
    if (!("from" in payload) && !("to" in payload)) return "";
    const field = String(payload.field ?? "");
    const resolve = (value: unknown) => {
        if (value === null || value === undefined || value === "") return noneLabel;
        if (field === "dueDate") return formatDueDate(String(value), locale);
        const options = field === "columnId" ? lookups.columns : field === "assigneeId" ? lookups.members : field === "categoryId" ? lookups.categories : field === "parentIssueId" ? lookups.projectIssues : [];
        const match = options.find((option) => option.id === value);
        if (match && "identifier" in match) return match.identifier;
        if (match) return match.name;
        return String(value);
    };
    return ` · ${resolve(payload.from)} → ${resolve(payload.to)}`;
}

function formatDistanceToNow(value: string, locale: string) {
    const minutes = Math.max(1, Math.round((Date.now() - new Date(value).getTime()) / 60000));
    const formatter = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
    if (minutes < 60) return formatter.format(-minutes, "minute");
    const hours = Math.round(minutes / 60);
    if (hours < 24) return formatter.format(-hours, "hour");
    return formatter.format(-Math.round(hours / 24), "day");
}

function hasMeaningfulTiptapContent(document: TiptapDocument) {
    const visit = (nodes: unknown[]): boolean => nodes.some((candidate) => {
        if (!candidate || typeof candidate !== "object") return false;
        const node = candidate as { type?: unknown; text?: unknown; content?: unknown[] };
        if (node.type === "text" && typeof node.text === "string" && node.text.trim().length > 0) return true;
        if (["image", "horizontalRule", "hardBreak", "mention"].includes(String(node.type))) return true;
        return Array.isArray(node.content) && visit(node.content);
    });
    return visit(document.content ?? []);
}

function errorMessage(reason: unknown, fallback: string) {
    if (reason instanceof ApiError) return reason.message;
    return fallback;
}
