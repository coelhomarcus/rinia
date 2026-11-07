import type { ActionSource, TiptapDocument } from "@rinia/shared";
import { absoluteFileReference, absoluteStoredFileUrls, isStoredFilePath, tiptapToMarkdown } from "@rinia/shared";
import i18n from "../../../i18n/i18n";
import type { TranslationKey } from "../../../i18n/resources";
import { translateStatusName } from "../../../i18n/status-label";
import type { IssueActivity, IssueComment, IssueDetail, IssueRelation } from "../api";
import { priorityLabelKey } from "./priority";

/** Names already loaded on the page. When these are present, copying does not ask for them again. */
export interface IssuePromptLookups {
    columns: Array<{ id: string; name: string }>;
    members: Array<{ id: string; name: string }>;
    categories: Array<{ id: string; name: string }>;
    issues?: Array<{ id: string; identifier: string; title: string }>;
}

export interface IssuePromptInput {
    issue: IssueDetail;
    comments: IssueComment[];
    activity: IssueActivity[];
    relations: IssueRelation[];
    overrides?: { title?: string; description?: TiptapDocument };
    lookups?: IssuePromptLookups;
    locale: string;
    timeZone: string;
    /** Public origin, so a stored file becomes a URL an agent can request. */
    origin?: string;
}

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

const relationLabelKeys: Record<IssueRelation["type"], TranslationKey> = {
    blocks: "issue.blocks",
    blocked_by: "issue.blockedBy",
    related: "issue.relatedTo",
    duplicate: "issue.duplicateOf",
};

const SECTION_TAGS = ["Instructions", "Task", "Title", "Metadata", "Description", "Subtasks", "Relations", "Attachments", "Comments", "Activity"];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type RichNode = { type?: string; text?: string; attrs?: Record<string, unknown>; marks?: RichNode[]; content?: RichNode[] };

/** The prompt both copy actions produce. Same input, same text. */
export function buildIssuePrompt(input: IssuePromptInput): string {
    const { issue, comments, activity, relations, overrides, lookups, locale, timeZone, origin = "" } = input;
    const t = i18n.getFixedT(locale);
    const title = overrides?.title ?? issue.title;
    const description = overrides?.description ?? issue.descriptionJson;
    const none = t("issue.noneValue");
    const columns = lookups?.columns ?? [];
    const members = lookups?.members ?? [];
    const categories = lookups?.categories ?? [];
    const knownIssues = new Map<string, string>();
    for (const known of lookups?.issues ?? []) knownIssues.set(known.id, `${known.identifier}: ${known.title}`);
    if (issue.parent) knownIssues.set(issue.parent.id, `${issue.project.issueKey}-${issue.parent.number}: ${issue.parent.title}`);
    for (const child of issue.children) knownIssues.set(child.id, `${issue.project.issueKey}-${child.number}: ${child.title}`);
    for (const relation of relations) knownIssues.set(relation.target.id, `${relation.target.project.issueKey}-${relation.target.number}: ${relation.target.title}`);

    const statusName = (id: unknown) => {
        const column = columns.find((candidate) => candidate.id === id) ?? (issue.column.id === id ? issue.column : undefined) ?? issue.children.find((child) => child.column?.id === id)?.column;
        return column ? translateStatusName(column.name, t) : null;
    };
    const memberName = (id: unknown) => {
        const listed = members.find((member) => member.id === id)?.name;
        if (listed) return listed;
        if (issue.assignee && issue.assignee.id === id) return issue.assignee.name;
        if (issue.createdBy.id === id) return issue.createdBy.name;
        return undefined;
    };
    const categoryName = (id: unknown) => categories.find((category) => category.id === id)?.name ?? issue.categories.find((category) => category.id === id)?.name;

    const hideUnknown = (value: unknown, label: string | undefined) => {
        if (label) return label;
        if (typeof value === "string" && UUID.test(value)) return null;
        return value === null || value === undefined ? null : String(value);
    };

    const resolveField = (field: string, value: unknown): string | null => {
        if (value === null || value === undefined || value === "") return none;
        if (field === "priority") return t(priorityLabelKey(String(value)));
        if (field === "estimate" || field === "dueDate") return String(value);
        if (field === "columnId") return hideUnknown(value, statusName(value) ?? undefined);
        if (field === "assigneeId" || field === "categoryId") return hideUnknown(value, (field === "assigneeId" ? memberName(value) : categoryName(value)) ?? undefined);
        if (field === "parentIssueId") return hideUnknown(value, knownIssues.get(String(value)));
        return hideUnknown(value, undefined);
    };

    const changeSentence = (actor: string, action: string, from: string | null, to: string | null) => {
        if (from && to) return t("issue.activityChange", { actor, action, from, to });
        if (to) return t("issue.activityChangeTo", { actor, action, to });
        if (from) return t("issue.activityChangeFrom", { actor, action, from });
        return t("issue.activitySentence", { actor, action });
    };

    const describe = (entry: IssueActivity) => {
        const actor = entry.actor.name;
        const action = activityLabelKeys[entry.type] ? t(activityLabelKeys[entry.type]) : entry.type;
        let sentence: string;
        if (entry.type === "label_added" || entry.type === "label_removed") {
            const name = categoryName(entry.payload.categoryId);
            sentence = name ? t("issue.activityWithValue", { actor, action, value: name }) : t("issue.activitySentence", { actor, action });
        } else if (entry.type === "relation_added" || entry.type === "relation_removed") {
            const relationType = entry.payload.relationType;
            const relation = typeof relationType === "string" && relationType in relationLabelKeys ? t(relationLabelKeys[relationType as IssueRelation["type"]]) : null;
            const target = typeof entry.payload.targetIssueId === "string" ? knownIssues.get(entry.payload.targetIssueId) : undefined;
            const detail = [relation, target].filter(Boolean).join(" ");
            sentence = detail ? t("issue.activityRelation", { actor, action, detail }) : t("issue.activitySentence", { actor, action });
        } else if ("from" in entry.payload || "to" in entry.payload) {
            const field = String(entry.payload.field ?? "");
            const from = "from" in entry.payload ? resolveField(field, entry.payload.from) : null;
            const to = "to" in entry.payload ? resolveField(field, entry.payload.to) : null;
            sentence = changeSentence(actor, action, from, to);
        } else {
            sentence = t("issue.activitySentence", { actor, action });
        }
        const tool = toolName(entry.source);
        return tool ? `${sentence} (${t("issue.viaSource", { client: tool })})` : sentence;
    };

    const metadata = [
        [t("issue.project"), issue.project.name],
        [t("issue.status"), translateStatusName(issue.column.name, t)],
        [t("issue.priority"), t(priorityLabelKey(issue.priority))],
        [t("issue.assignee"), issue.assignee?.name ?? t("issue.unassigned")],
        [t("issue.labels"), issue.categories.length ? issue.categories.map((category) => category.name).join(", ") : none],
        [t("issue.estimate"), issue.estimate ?? none],
        [t("issue.dueDate"), issue.dueDate ?? none],
        [t("issue.createdBy"), issue.createdBy.name],
        [t("issue.created"), formatPromptDate(issue.createdAt, timeZone)],
        [t("issue.updated"), formatPromptDate(issue.updatedAt, timeZone)],
        [t("issue.parent"), issue.parent ? `${issue.project.issueKey}-${issue.parent.number}: ${issue.parent.title}` : none],
    ];

    const markdown = (document: TiptapDocument | null | undefined) => absoluteStoredFileUrls(tiptapToMarkdown(document), origin);
    const documents = [description, ...comments.map((comment) => comment.contentJson)];
    const sections = [
        block("Title", indent(guard(title), 4)),
        block("Metadata", metadata.map(([label, value]) => `    ${label}: ${guard(String(value))}`).join("\n")),
        block("Description", guard(markdown(description)) || `(${t("issue.noDescription")})`),
    ];

    if (issue.children.length > 0) {
        const lines = [...issue.children]
            .sort((left, right) => left.number - right.number)
            .map((child) => {
                const name = child.column?.name ?? columns.find((column) => column.id === child.columnId)?.name;
                const status = name ? translateStatusName(name, t) : "";
                return `    - ${issue.project.issueKey}-${child.number}: ${guard(child.title)}${status ? ` — ${status}` : ""}`;
            });
        sections.push(block("Subtasks", lines.join("\n")));
    }

    if (relations.length > 0) {
        const lines = relations.map((relation) => `    - ${t(relationLabelKeys[relation.type])}: ${relation.target.project.issueKey}-${relation.target.number}: ${guard(relation.target.title)}`);
        sections.push(block("Relations", lines.join("\n")));
    }

    const attachments = collectAttachments(documents, origin);
    if (attachments.length > 0) sections.push(block("Attachments", attachments.map((line) => `    ${guard(line)}`).join("\n")));

    if (comments.length > 0) {
        const lines = [...comments]
            .sort((left, right) => Date.parse(left.createdAt) - Date.parse(right.createdAt) || left.id.localeCompare(right.id))
            .map((comment) => {
                const markers = [
                    comment.parentCommentId ? t("issue.promptReply") : "",
                    Date.parse(comment.updatedAt) > Date.parse(comment.createdAt) ? t("issue.edited") : "",
                ].filter(Boolean);
                const body = guard(markdown(comment.contentJson)) || `(${t("issue.emptyComment")})`;
                const reactions = formatReactions(comment.reactions, t("issue.promptReactions"));
                return [`- ${formatPromptDate(comment.createdAt, timeZone)} — ${guard(comment.author.name)}${markers.length ? ` · ${markers.join(" · ")}` : ""}:`, body, reactions]
                    .filter(Boolean)
                    .join("\n");
            });
        sections.push(block("Comments", lines.join("\n\n")));
    }

    if (activity.length > 0) {
        const lines = [...activity]
            .sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt) || left.id.localeCompare(right.id))
            .map((entry) => `    - ${formatPromptDate(entry.createdAt, timeZone)}:\n      ${guard(describe(entry))}`);
        sections.push(block("Activity", lines.join("\n\n")));
    }

    const taskId = issue.identifier.replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;");
    const instructions = documents.some(documentHasStoredFile) ? `${t("issue.promptInstructions")}\n\n${t("issue.promptFileAccess")}` : t("issue.promptInstructions");
    return `<Instructions>\n${instructions}\n</Instructions>\n\n<Task id="${taskId}">\n${sections.join("\n\n")}\n</Task>`;
}

function block(tag: string, body: string) {
    return `  <${tag}>\n${body}\n  </${tag}>`;
}

function indent(text: string, spaces: number) {
    const pad = " ".repeat(spaces);
    return text.split("\n").map((line) => (line ? pad + line : line)).join("\n");
}

/** Keeps a literal copy of our section tags from closing the section early. The rest of the text stays as written. */
function guard(text: string) {
    return SECTION_TAGS.reduce((value, tag) => value.replaceAll(`</${tag}>`, `<\\/${tag}>`).replaceAll(`<${tag}`, `<\\${tag}`), text);
}

function formatReactions(reactions: IssueComment["reactions"], label: string) {
    const groups = reactions.filter((group) => group.users.length > 0).map((group) => `${group.emoji} ${group.users.map((user) => user.name).join(", ")}`);
    return groups.length > 0 ? `${label}: ${groups.join(" · ")}` : "";
}

function collectAttachments(documents: Array<TiptapDocument | null | undefined>, origin: string) {
    const lines: string[] = [];
    const seen = new Set<string>();
    const visit = (node: RichNode) => {
        if (node.type === "image") {
            const src = absoluteFileReference(String(node.attrs?.src ?? ""), origin);
            if (src && !seen.has(`image:${src}`)) {
                seen.add(`image:${src}`);
                lines.push(`- ![${String(node.attrs?.alt ?? "")}](${src})`);
            }
        }
        for (const mark of node.marks ?? []) {
            if (mark.type !== "link") continue;
            const href = absoluteFileReference(String(mark.attrs?.href ?? ""), origin);
            if (!href || seen.has(`link:${href}`)) continue;
            seen.add(`link:${href}`);
            lines.push(`- [${node.text?.trim() || href}](${href})`);
        }
        for (const child of node.content ?? []) visit(child);
    };
    for (const document of documents) {
        if (document) visit(document as RichNode);
    }
    return lines;
}

function documentHasStoredFile(document: TiptapDocument | null | undefined) {
    if (!document) return false;
    const visit = (node: RichNode): boolean => {
        if (node.type === "image" && isStoredFilePath(String(node.attrs?.src ?? ""))) return true;
        if ((node.marks ?? []).some((mark) => mark.type === "link" && isStoredFilePath(String(mark.attrs?.href ?? "")))) return true;
        return (node.content ?? []).some(visit);
    };
    return visit(document as RichNode);
}

function toolName(source: ActionSource | null) {
    if (!source) return null;
    if (source.client?.startsWith("claude-code")) return "Claude Code";
    return source.client ?? "MCP";
}

function formatPromptDate(value: string, timeZone: string) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(date);
    const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value ?? "";
    return `${part("year")}-${part("month")}-${part("day")} ${part("hour").padStart(2, "0")}:${part("minute").padStart(2, "0")}`;
}
