import { useState } from "react";
import type { ActionSource, TiptapDocument } from "@rinia/shared";
import { ArrowUp, Pencil, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/base/buttons/button";
import { ButtonUtility } from "@/components/base/buttons/button-utility";
import { Tooltip } from "@/components/base/tooltip/tooltip";
import { ConfirmDialog } from "@/components/overlay/confirm-dialog";
import { IssueAvatar, IssueAvatarGroup, sourceLabel } from "@/features/board/components/issue-property-icons";
import { RichTextView } from "@/features/editor/rich-text-view";
import type { FileUploadTarget } from "@/features/editor/file-api";
import { cx } from "@/utils/cx";
import type { ReactionGroup } from "../../api";
import { errorMessage } from "../../lib/error-message";
import { formatDistanceToNow, formatFullIssueDate } from "../../lib/relative-time";
import { hasMeaningfulTiptapContent } from "../../lib/tiptap-content";
import { ReactionChips, ReactionPicker } from "../comment-reactions";
import { EMPTY_TIPTAP_DOCUMENT, RichTextEditor, type MentionItem } from "../rich-text-editor";

export type CommentEntry = { id: string; contentJson: TiptapDocument; authorId: string; author: { name: string; username?: string; avatarUrl: string | null }; source?: ActionSource | null; createdAt: string; updatedAt: string; reactions: ReactionGroup[]; parentCommentId: string | null; pending?: boolean };

type CommentActions = {
    currentUserId?: string;
    mentionItems: MentionItem[];
    isSubmitting: boolean;
    onReact: (commentId: string, emoji: string, add: boolean) => void;
    onDelete: (id: string) => void | Promise<void>;
    onEdit: (id: string, contentJson: TiptapDocument) => void | Promise<void>;
    uploads?: FileUploadTarget | null;
};

/**
 * A comment and its replies in one card, with a box at the bottom to reply. Threads are one level deep: replying
 * from the card always adds to the end of it.
 */
export function TimelineThread({ entry, replies, currentUser, onReply, ...actions }: CommentActions & {
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
            <ReplyComposer currentUser={currentUser} mentionItems={actions.mentionItems} uploads={actions.uploads} onSubmit={(contentJson) => onReply(entry.id, contentJson)} />
        </li>
    );
}

/**
 * "Leave a reply…" under a thread. It grows as you type and sends with the arrow or Cmd/Ctrl+Enter. Until someone clicks
 * into it, it is plain text: a long discussion has a reply box per thread, and each editor costs as much as a comment.
 */
function ReplyComposer({ currentUser, mentionItems, uploads = null, onSubmit }: { currentUser: { name: string; avatarUrl: string | null } | null; mentionItems: MentionItem[]; uploads?: FileUploadTarget | null; onSubmit: (contentJson: TiptapDocument) => Promise<void> }) {
    const { t } = useTranslation();
    const [active, setActive] = useState(false);
    const [value, setValue] = useState<TiptapDocument>(EMPTY_TIPTAP_DOCUMENT);
    // Remounting the editor clears it once a reply is sent.
    const [editorKey, setEditorKey] = useState(0);
    const [sending, setSending] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const canSend = hasMeaningfulTiptapContent(value) && !sending;
    const send = async () => {
        if (!canSend) return;
        const submitted = value;
        setSending(true);
        setError(null);
        setValue(EMPTY_TIPTAP_DOCUMENT);
        setEditorKey((key) => key + 1);
        try {
            await onSubmit(submitted);
            setActive(false);
        } catch (reason) {
            setValue(submitted);
            setError(errorMessage(reason, t("issue.couldNotAddReply")));
        } finally {
            setSending(false);
        }
    };
    return (
        <div
            className="border-t border-subtle"
            onBlur={(event) => {
                if (!event.currentTarget.contains(event.relatedTarget) && !hasMeaningfulTiptapContent(value) && !sending) setActive(false);
            }}
        >
            <div className="flex items-start gap-2.5 px-4 py-2.5">
                {currentUser && <IssueAvatar name={currentUser.name} avatarUrl={currentUser.avatarUrl} className="mt-1 size-5 shrink-0 text-[10px]" />}
                {active ? (
                    <RichTextEditor
                        key={editorKey}
                        toolbar={false}
                        variant="comment"
                        content={value}
                        onChange={setValue}
                        onSubmitShortcut={() => void send()}
                        placeholder={t("issue.leaveReply")}
                        mentionItems={mentionItems}
                        uploads={uploads}
                        autoFocus
                        className="issue-reply-composer min-w-0 flex-1"
                    />
                ) : (
                    <button type="button" className="min-h-7 min-w-0 flex-1 cursor-text py-1 text-left text-[14px] leading-[22px] text-placeholder outline-none" onClick={() => setActive(true)} onFocus={() => setActive(true)}>
                        {t("issue.leaveReply")}
                    </button>
                )}
                <Tooltip title={t("issue.replyAction")}>
                    <span className={cx("inline-flex", !canSend && "cursor-not-allowed")}>
                        <button
                            type="button"
                            aria-label={t("issue.replyAction")}
                            disabled={!canSend}
                            onClick={() => void send()}
                            className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full bg-layer-2 text-tertiary transition-colors duration-150 enabled:bg-accent-primary enabled:text-white enabled:hover:opacity-90 disabled:pointer-events-none"
                        >
                            <ArrowUp className="size-3.5" />
                        </button>
                    </span>
                </Tooltip>
            </div>
            {error && <p role="alert" className="animate-enter px-4 pb-2.5 text-xs text-danger-primary">{error}</p>}
        </div>
    );
}

function CommentItem({ entry, replyCount, currentUserId, onReact, mentionItems, uploads = null, isSubmitting, onDelete, onEdit }: CommentActions & { entry: CommentEntry; replyCount: number }) {
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
                <Tooltip title={formatFullIssueDate(entry.createdAt, i18n.language)}>
                    <time className="text-tertiary" dateTime={entry.createdAt}>
                        {entry.pending ? t("issue.sendingComment") : formatDistanceToNow(entry.createdAt, i18n.language)}{!entry.pending && edited ? ` · ${t("issue.edited")}` : ""}
                    </time>
                </Tooltip>
                {!editing && !entry.pending && (
                    <div className="ml-auto flex items-center gap-0.5 transition-opacity duration-150 can-hover:opacity-0 can-hover:group-hover/comment:opacity-100 focus-within:opacity-100 has-[[data-popup-open]]:opacity-100">
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
                    <RichTextEditor toolbar={false} variant="comment" content={draft} onChange={setDraft} mentionItems={mentionItems} uploads={uploads} className="issue-comment-composer" />
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
                    <RichTextView profile="comment" content={entry.contentJson} className="issue-comment-body" />
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
