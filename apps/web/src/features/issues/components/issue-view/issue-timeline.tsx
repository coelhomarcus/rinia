import type { TiptapDocument } from "@rinia/shared";
import { ArrowUp } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Skeleton } from "@/components/base/feedback/skeleton";
import { Tooltip } from "@/components/base/tooltip/tooltip";
import type { FileUploadTarget } from "@/features/editor/file-upload";
import { cx } from "@/utils/cx";
import { hasMeaningfulTiptapContent } from "../../lib/tiptap-content";
import { RichTextEditor, type MentionItem } from "../rich-text-editor";
import { TimelineActivity, type ActivityEntry, type TimelineLookups } from "../timeline-activity";
import { TimelineThread, type CommentEntry } from "./comment-thread";

/** Activity and comments in one chronological feed, followed by the comment composer. */
export function IssueTimeline({
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
    uploads = null,
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
    uploads?: FileUploadTarget | null;
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
                                uploads={uploads}
                            />
                        ) : (
                            <TimelineActivity key={`a-${item.entry.id}`} entry={item.entry} lookups={lookups} />
                        ),
                    )}
                </ol>
            )}
            <div className="mt-4 rounded-xl border border-subtle bg-layer-1 transition-colors duration-150 focus-within:border-[var(--border-strong-1)]">
                <RichTextEditor toolbar={false} variant="comment" content={value} onChange={onChange} onSubmitShortcut={onSubmit} placeholder={t("issue.leaveComment")} mentionItems={mentionItems} uploads={uploads} className="issue-comment-composer" />
                <div className="flex items-center justify-end gap-2 px-3 pb-3">
                    <Tooltip title={t("issue.commentAction")}>
                        <span className={cx("inline-flex", !canSend && "cursor-not-allowed")}>
                            <button
                                type="button"
                                aria-label={t("issue.commentAction")}
                                disabled={!canSend}
                                onClick={() => void onSubmit()}
                                className="grid size-7 place-items-center rounded-full bg-layer-2 text-tertiary transition-colors duration-150 enabled:bg-accent-primary enabled:text-white enabled:hover:opacity-90 disabled:pointer-events-none"
                            >
                                <ArrowUp className="size-3.5" />
                            </button>
                        </span>
                    </Tooltip>
                </div>
            </div>
            {error && <p role="alert" className="animate-enter mt-2 text-xs text-danger-primary">{error}</p>}
        </section>
    );
}
