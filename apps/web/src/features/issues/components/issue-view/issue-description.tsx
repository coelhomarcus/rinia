import { memo, useMemo, type Ref } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/base/buttons/button";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/features/auth/hooks/use-auth";
import { issueFilesKey } from "@/features/editor/file-api";
import { useProjectMembers } from "@/features/projects/hooks/use-project-members";
import type { IssueDetail } from "../../api";
import { DescriptionHistorySheet } from "../description-history";
import { RichTextEditor } from "../rich-text-editor";
import { useIssueDescription, type DescriptionControls } from "./use-issue-description";
import type { IssueUpdater } from "./use-issue-mutations";

/**
 * The description editor with what goes around it: its save status, the conflict choices when someone else changed
 * the text, and the history sheet. The text, its draft and its saving live here, so typing re-renders only this.
 */
export const IssueDescription = memo(function IssueDescription({
    issue,
    updater,
    getTitle,
    controls,
    historyOpen,
    onHistoryOpenChange,
    onDirtyChange,
    onSavingChange,
}: {
    issue: IssueDetail;
    updater: IssueUpdater;
    getTitle: () => string;
    controls: Ref<DescriptionControls>;
    historyOpen: boolean;
    onHistoryOpenChange: (open: boolean) => void;
    onDirtyChange: (dirty: boolean) => void;
    onSavingChange: (saving: boolean) => void;
}) {
    const { t } = useTranslation();
    const queryClient = useQueryClient();
    const { user } = useAuth();
    const { data: members } = useProjectMembers(issue.projectId);
    const mentionItems = useMemo(() => (members ?? []).map((member) => ({ id: member.id, label: member.username, description: member.name })), [members]);
    const description = useIssueDescription({ issue, userId: user?.id, updater, getTitle, controls, onDirtyChange, onSavingChange });
    const uploads = useMemo(
        () => ({ projectId: issue.projectId, issueId: issue.id, onUploaded: () => void queryClient.invalidateQueries({ queryKey: issueFilesKey(issue.projectId, issue.id) }) }),
        [issue.projectId, issue.id, queryClient],
    );

    return (
        <>
            <div className="issue-description mt-4">
                <RichTextEditor
                    toolbar={false}
                    variant="description"
                    content={description.description}
                    uploads={uploads}
                    onChange={description.onChange}
                    mentionItems={mentionItems}
                    placeholder={t("issue.describeIssue")}
                />
            </div>
            {description.notice && <p role="status" className="animate-enter mt-2 text-xs text-warning-primary">{description.notice}</p>}
            {description.saveError && description.status !== "conflict" && <p role="alert" className="mt-2 text-xs text-danger-primary">{description.saveError}</p>}
            {description.status === "conflict" && (
                <div className="animate-enter mt-3 flex flex-wrap items-center justify-end gap-2 rounded-lg border border-fg-warning-primary/40 bg-warning-primary/10 p-3">
                    <Button size="xs" color="tertiary" onClick={description.keepSavedDescription}>{t("issue.useSavedDescription")}</Button>
                    <Button size="xs" color="primary" isLoading={description.isCreatingFromDraft} onClick={() => void description.createIssueFromDraft()}>{t("issue.createIssueFromDraft")}</Button>
                </div>
            )}
            <DescriptionHistorySheet identifier={issue.identifier} open={historyOpen} onOpenChange={onHistoryOpenChange} isRestoring={description.isRestoring} onRestore={description.restoreVersion} />
        </>
    );
});
