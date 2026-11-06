import type { TiptapDocument } from "@rinia/shared";
import { listColumns } from "@/features/board/api";
import { listCategories } from "@/features/categories/api";
import { listProjectMembers } from "@/features/projects/api";
import i18n from "@/i18n/i18n";
import { getIssue, listIssueActivity, listIssueComments, listIssueRelations } from "../api";
import { buildIssuePrompt, type IssuePromptLookups } from "./issue-prompt";

type IssueContentOverrides = {
    title?: string;
    description?: TiptapDocument;
};

/**
 * Loads the issue the identifier points at — a sub-issue stays that sub-issue — and copies one prompt.
 * Lookups already on the page are reused; otherwise the project names needed to explain the history are loaded.
 */
export async function fetchIssueClipboardContent(identifier: string, overrides?: IssueContentOverrides, locale = i18n.language, lookups?: IssuePromptLookups): Promise<string> {
    const [issue, comments, activity, relations] = await Promise.all([
        getIssue(identifier),
        listIssueComments(identifier),
        listIssueActivity(identifier),
        listIssueRelations(identifier),
    ]);
    const [columns, members, categories] = lookups
        ? [lookups.columns, lookups.members, lookups.categories]
        : await Promise.all([listColumns(issue.project.id), listProjectMembers(issue.project.id), listCategories(issue.project.id)]);

    return buildIssuePrompt({
        issue,
        comments,
        activity,
        relations,
        overrides,
        lookups: { columns, members, categories, issues: lookups?.issues },
        locale,
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    });
}
