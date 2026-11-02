import { tiptapToMarkdown, type TiptapDocument } from "@rinia/shared";
import { priorityLabelKey } from "./priority";
import i18n from "@/i18n/i18n";
import type { TranslationKey } from "@/i18n/resources";
import {
    getIssue,
    listIssueActivity,
    listIssueComments,
    listIssueRelations,
    type IssueActivity,
    type IssueComment,
    type IssueDetail,
    type IssueRelation,
} from "../api";

type IssueContentOverrides = {
    title?: string;
    description?: TiptapDocument;
};

const activityLabelKeys: Record<string, TranslationKey> = {
    created: "issue.createdThisIssue", status_changed: "issue.changedStatus", priority_changed: "issue.changedPriority",
    assignee_changed: "issue.changedAssignee", category_changed: "issue.changedCategory", cycle_changed: "issue.changedCycle",
    estimate_changed: "issue.changedEstimate", parent_changed: "issue.changedParent", relation_added: "issue.addedRelation", relation_removed: "issue.removedRelation",
};

/** Fetches the complete saved issue content before producing a clipboard-ready Markdown document. */
export async function fetchIssueClipboardContent(identifier: string, overrides?: IssueContentOverrides, locale = i18n.language): Promise<string> {
    const [issue, comments, activity, relations] = await Promise.all([
        getIssue(identifier),
        listIssueComments(identifier),
        listIssueActivity(identifier),
        listIssueRelations(identifier),
    ]);

    return buildIssueClipboardContent({ issue, comments, activity, relations, overrides, locale });
}

function buildIssueClipboardContent({
    issue,
    comments,
    activity,
    relations,
    overrides,
    locale,
}: {
    issue: IssueDetail;
    comments: IssueComment[];
    activity: IssueActivity[];
    relations: IssueRelation[];
    overrides?: IssueContentOverrides;
    locale: string;
}): string {
    const t = i18n.getFixedT(locale, "translation");
    const title = overrides?.title ?? issue.title;
    const description = overrides?.description ?? issue.descriptionJson;
    const lines = [
        `# ${issue.identifier}: ${title}`,
        "",
        `- **${t("issue.project")}:** ${issue.project.name}`,
        `- **${t("issue.status")}:** ${issue.column.name}`,
        `- **${t("issue.priority")}:** ${t(priorityLabelKey(issue.priority))}`,
        `- **${t("issue.assignee")}:** ${issue.assignee?.name ?? t("issue.unassigned")}`,
        `- **${t("issue.labels")}:** ${issue.categories.length ? issue.categories.map((category) => category.name).join(", ") : t("issue.noneValue")}`,
        `- **${t("issue.estimate")}:** ${issue.estimate ?? t("issue.noneValue")}`,
        `- **${t("issue.createdBy")}:** ${issue.createdBy.name}`,
        `- **${t("issue.created")}:** ${formatDate(issue.createdAt, locale)}`,
        `- **${t("issue.updated")}:** ${formatDate(issue.updatedAt, locale)}`,
        `- **${t("issue.parent")}:** ${issue.parent ? `${issue.project.issueKey}-${issue.parent.number}: ${issue.parent.title}` : t("issue.noneValue")}`,
        "",
        `## ${t("issue.description")}`,
        "",
        tiptapToMarkdown(description) || `(${t("issue.noDescription")})`,
    ];

    if (issue.children.length > 0) {
        lines.push("", `## ${t("issue.subIssues")} (${issue.children.length})`, "");
        issue.children.forEach((child) => {
            lines.push(`- [ ] ${issue.project.issueKey}-${child.number}: ${child.title} — ${t(priorityLabelKey(child.priority))}`);
        });
    }

    if (relations.length > 0) {
        lines.push("", `## ${t("issue.relations")}`, "");
        relations.forEach((relation) => {
            const relationTranslationKey: Record<IssueRelation["type"], TranslationKey> = {
                blocks: "issue.blocks",
                blocked_by: "issue.blockedBy",
                related: "issue.relatedTo",
                duplicate: "issue.duplicateOf",
            };
            lines.push(`- **${t(relationTranslationKey[relation.type])}:** ${relation.target.project.issueKey}-${relation.target.number}: ${relation.target.title}`);
        });
    }

    if (comments.length > 0) {
        lines.push("", `## ${t("issue.comments")} (${comments.length})`, "");
        comments.forEach((comment) => {
            lines.push(`### ${comment.author.name} — ${formatDate(comment.createdAt, locale)}`, "", tiptapToMarkdown(comment.contentJson) || `(${t("issue.emptyComment")})`, "");
        });
    }

    if (activity.length > 0) {
        lines.push(`## ${t("issue.activity")}`, "");
        activity.forEach((entry) => {
            const payload = Object.keys(entry.payload).length > 0 ? ` — ${JSON.stringify(entry.payload)}` : "";
            lines.push(`- ${formatDate(entry.createdAt, locale)} — ${entry.actor.name} ${activityLabelKeys[entry.type] ? t(activityLabelKeys[entry.type]) : entry.type}${payload}`);
        });
    }

    return lines.join("\n").trim();
}

function formatDate(value: string, locale: string): string {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" }).format(date);
}
