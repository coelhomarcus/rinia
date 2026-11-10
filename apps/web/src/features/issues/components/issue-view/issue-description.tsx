import { memo, useMemo, type Ref } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/base/buttons/button";
import { Alert, InlineNotice } from "@/components/base/feedback/alert";
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
    editable = true,
}: {
    issue: IssueDetail;
    updater: IssueUpdater;
    getTitle: () => string;
    controls: Ref<DescriptionControls>;
    historyOpen: boolean;
    onHistoryOpenChange: (open: boolean) => void;
    onDirtyChange: (dirty: boolean) => void;
    onSavingChange: (saving: boolean) => void;
    editable?: boolean;
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
                    editable={editable}
                    variant="description"
                    content={description.description}
                    uploads={uploads}
                    onChange={description.onChange}
                    mentionItems={mentionItems}
                    placeholder={t("issue.describeIssue")}
                />
            </div>
            {description.status === "conflict" ? (
                <Alert
                    tone="warning"
                    className="mt-3"
                    actions={
                        <>
                            <Button size="xs" color="tertiary" onClick={description.keepSavedDescription}>{t("issue.useSavedDescription")}</Button>
                            <Button size="xs" color="primary" isLoading={description.isCreatingFromDraft} onClick={() => void description.createIssueFromDraft()}>{t("issue.createIssueFromDraft")}</Button>
                        </>
                    }
                >
                    {description.notice}
                </Alert>
            ) : (
                <>
                    {description.notice && <InlineNotice tone={description.status === "error" ? "error" : "warning"} className="mt-2">{description.notice}</InlineNotice>}
                    {description.saveError && <InlineNotice tone="error" className="mt-2">{description.saveError}</InlineNotice>}
                </>
            )}
            <DescriptionHistorySheet identifier={issue.identifier} open={historyOpen} onOpenChange={onHistoryOpenChange} isRestoring={description.isRestoring} onRestore={description.restoreVersion} />
        </>
    );
});
