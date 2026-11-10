import { useEffect, useRef, useState } from "react";
import type { TiptapDocument } from "@rinia/shared";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useToast } from "@/components/feedback/toaster";
import { useAuth } from "@/features/auth/hooks/use-auth";
import { restoreIssueComment } from "../../api";
import { issueKey, useCreateIssueComment, useDeleteIssueComment, useToggleReaction, useUpdateIssueComment } from "../../hooks/use-issues";
import { errorMessage } from "../../lib/error-message";
import { issueDescriptionDrafts, issueDraftKey } from "../../lib/issue-description-drafts";
import { hasMeaningfulTiptapContent } from "../../lib/tiptap-content";
import { EMPTY_TIPTAP_DOCUMENT } from "../rich-text-editor";

interface Options {
    issueId: string;
    identifier: string;
    projectId: string;
    /** Whether the composer holds something not sent yet, for the page's leave warning. */
    onFilledChange: (filled: boolean) => void;
}

/**
 * The comment being written, kept as a draft in the browser until it is sent, and everything that can be done to the
 * comments of an issue: sending, replying, editing, deleting (with undo) and reacting.
 *
 * The draft lives here, with the composer, so typing a comment re-renders the activity and nothing else.
 */
export function useCommentComposer({ issueId, identifier, projectId, onFilledChange }: Options) {
    const { t } = useTranslation();
    const showToast = useToast();
    const queryClient = useQueryClient();
    const { user } = useAuth();
    const userId = user?.id;
    const createComment = useCreateIssueComment(identifier);
    const updateComment = useUpdateIssueComment(identifier);
    const deleteComment = useDeleteIssueComment(identifier);
    const toggleReaction = useToggleReaction(identifier, user ? { id: user.id, name: user.name, username: user.username, avatarUrl: user.avatarUrl } : null);
    const [comment, setComment] = useState<TiptapDocument>(EMPTY_TIPTAP_DOCUMENT);
    const [error, setError] = useState<string | null>(null);
    const draftRestoreIssue = useRef<string | null>(null);
    /** Set once the saved draft has been read, or the person has typed: from then on the box is what gets saved. */
    const draftOwner = useRef<string | null>(null);
    const latest = useRef(comment);
    latest.current = comment;

    useEffect(() => {
        if (!userId || draftRestoreIssue.current === issueId) return;
        draftRestoreIssue.current = issueId;
        const key = issueDraftKey(userId, projectId, issueId);
        let cancelled = false;
        void issueDescriptionDrafts.get(key).then((draft) => {
            if (cancelled || draftOwner.current) return;
            setComment(draft?.commentJson ?? EMPTY_TIPTAP_DOCUMENT);
            draftOwner.current = issueId;
        }).catch(() => { if (!cancelled) draftOwner.current = issueId; });
        return () => {
            cancelled = true;
            if (draftRestoreIssue.current === issueId) draftRestoreIssue.current = null;
        };
    }, [issueId, projectId, userId]);

    useEffect(() => {
        if (!userId || draftOwner.current !== issueId) return;
        const timer = window.setTimeout(() => {
            const key = issueDraftKey(userId, projectId, issueId);
            const content = hasMeaningfulTiptapContent(comment) ? comment : undefined;
            const save = content
                ? issueDescriptionDrafts.putComment({ key, userId, projectId, issueId, commentJson: content, updatedAt: Date.now() })
                : issueDescriptionDrafts.clearComment(key);
            void save.catch(() => undefined);
        }, 150);
        return () => window.clearTimeout(timer);
    }, [comment, issueId, projectId, userId]);

    // Leaving the issue keeps what was written.
    useEffect(() => () => {
        if (!userId || draftOwner.current !== issueId) return;
        const key = issueDraftKey(userId, projectId, issueId);
        const content = hasMeaningfulTiptapContent(latest.current) ? latest.current : undefined;
        const save = content
            ? issueDescriptionDrafts.putComment({ key, userId, projectId, issueId, commentJson: content, updatedAt: Date.now() })
            : issueDescriptionDrafts.clearComment(key);
        void save.catch(() => undefined);
    }, [issueId, projectId, userId]);

    useEffect(() => {
        onFilledChange(hasMeaningfulTiptapContent(comment));
    }, [comment, onFilledChange]);
    useEffect(() => () => onFilledChange(false), [onFilledChange]);

    const onChange = (value: TiptapDocument) => {
        draftOwner.current = issueId;
        setComment(value);
    };

    const submit = async () => {
        if (!hasMeaningfulTiptapContent(comment)) return;
        const submitted = comment;
        setError(null);
        setComment(EMPTY_TIPTAP_DOCUMENT);
        try {
            await createComment.mutateAsync({ contentJson: submitted });
        } catch (reason) {
            setComment(submitted);
            setError(errorMessage(reason, t("issue.couldNotAddComment")));
        }
    };

    const reply = async (parentCommentId: string, contentJson: TiptapDocument) => {
        await createComment.mutateAsync({ contentJson, parentCommentId });
    };

    const remove = async (commentId: string) => {
        setError(null);
        try {
            const { deletedAt } = await deleteComment.mutateAsync(commentId);
            showToast({
                title: t("issue.commentDeleted"),
                action: {
                    label: t("issue.undo"),
                    onClick: async () => {
                        try {
                            await restoreIssueComment(commentId, deletedAt);
                            await queryClient.invalidateQueries({ queryKey: [...issueKey(identifier), "comments"] });
                        } catch {
                            showToast({ tone: "error", title: t("issue.couldNotUndo") });
                        }
                    },
                },
            });
        } catch (reason) {
            setError(errorMessage(reason, t("issue.couldNotDeleteComment")));
            throw reason;
        }
    };

    const edit = async (commentId: string, contentJson: TiptapDocument) => {
        setError(null);
        try {
            await updateComment.mutateAsync({ commentId, input: { contentJson } });
        } catch (reason) {
            setError(errorMessage(reason, t("issue.couldNotUpdateComment")));
            throw reason;
        }
    };

    const react = (commentId: string, emoji: string, add: boolean) => toggleReaction.mutate({ commentId, emoji, add });

    return {
        value: comment,
        onChange,
        submit,
        reply,
        remove,
        edit,
        react,
        error,
        isSubmitting: createComment.isPending || updateComment.isPending || deleteComment.isPending,
    };
}
