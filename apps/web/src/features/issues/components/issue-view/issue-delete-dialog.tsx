import { useTranslation } from "react-i18next";
import { ConfirmDialog } from "@/components/overlay/confirm-dialog";
import type { IssueDetail } from "../../api";
import { useDeleteIssueAction } from "./use-issue-mutations";

/** Asks before deleting the issue, then deletes it and offers to undo. */
export function IssueDeleteDialog({ issue, open, onOpenChange }: { issue: IssueDetail; open: boolean; onOpenChange: (open: boolean) => void }) {
    const { t } = useTranslation();
    const { remove, isPending } = useDeleteIssueAction(issue);
    return (
        <ConfirmDialog
            open={open}
            onOpenChange={onOpenChange}
            title={t("issue.deleteIssue")}
            description={t("issue.deleteIssueDescription", { title: issue.title })}
            confirmLabel={t("issue.deleteIssue")}
            isPending={isPending}
            onConfirm={remove}
        />
    );
}
