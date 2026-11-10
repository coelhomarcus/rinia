import { useState, type RefObject } from "react";
import type { ToastInput } from "@/components/feedback/toaster";
import { useToast } from "@/components/feedback/toaster";
import { useTranslation } from "react-i18next";
import { useColumns } from "@/features/board/hooks/use-board";
import { useAuth } from "@/features/auth/hooks/use-auth";
import { useCategories } from "@/features/categories/hooks/use-categories";
import { useProjectMembers } from "@/features/projects/hooks/use-project-members";
import { useClipboard } from "@/hooks/use-clipboard";
import { urls } from "@/lib/urls";
import type { IssueDetail } from "../../api";
import { useIssues } from "../../hooks/use-issues";
import { gitBranchName } from "../../lib/git-branch-name";
import { fetchIssueClipboardContent } from "../../lib/issue-clipboard";
import { EMPTY_TIPTAP_DOCUMENT } from "../rich-text-editor";
import type { CopyActions } from "./issue-actions-menu";
import type { DescriptionControls } from "./use-issue-description";

/** Copying the issue's link, identifier, branch name, or its text as a prompt for an AI tool. */
export function useIssueCopyActions(issue: IssueDetail, currentTitle: string, description: RefObject<DescriptionControls | null>): CopyActions {
    const { t } = useTranslation();
    const { user } = useAuth();
    const { copy } = useClipboard();
    const showToast = useToast();
    const { data: columns } = useColumns(issue.projectId);
    const { data: members } = useProjectMembers(issue.projectId);
    const { data: categories } = useCategories(issue.projectId);
    const { data: projectIssues } = useIssues(issue.projectId);
    const [isCopying, setIsCopying] = useState(false);

    const copyText = async (text: string, success: ToastInput) => {
        const result = await copy(text, "issue-meta");
        showToast(result.success ? success : { tone: "error", title: t("issue.couldNotCopy") });
    };
    const copyAsPrompt = async () => {
        setIsCopying(true);
        try {
            const content = await fetchIssueClipboardContent(issue.identifier, { title: currentTitle, description: description.current?.getContent() ?? issue.descriptionJson ?? EMPTY_TIPTAP_DOCUMENT }, undefined, columns && members && categories ? {
                columns,
                members,
                categories,
                issues: (projectIssues ?? []).map((item) => ({ id: item.id, identifier: item.identifier, title: item.title })),
            } : undefined);
            await copyText(content, { tone: "copy", title: t("issue.promptCopied") });
        } catch {
            showToast({ tone: "error", title: t("issue.couldNotCopyContent") });
        } finally {
            setIsCopying(false);
        }
    };

    return {
        onCopyLink: () => void copyText(`${window.location.origin}${urls.issue(issue.identifier, currentTitle)}`, { tone: "copy", title: t("issue.linkCopied") }),
        onCopyId: () => void copyText(issue.identifier, { tone: "copy", title: t("issue.idCopied", { id: issue.identifier }) }),
        onCopyBranch: () => {
            const branch = gitBranchName(user?.username, issue.identifier, currentTitle);
            void copyText(branch, { tone: "copy", title: branch, description: t("issue.branchCopied") });
        },
        onCopyPrompt: () => void copyAsPrompt(),
        isCopying,
    };
}
