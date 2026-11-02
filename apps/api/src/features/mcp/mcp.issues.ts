import { columnBucket, createIssueSchema, defaultIssueColumn, dueDateSchema, issueEstimateValues, issuePriorityValues, issueRelationValues, markdownToTiptap, myIssuesFilterValues, nextLabels, tiptapToMarkdown, updateIssueSchema, type UpdateIssueInput } from "@rinia/shared";
import { z } from "zod";
import { HttpError } from "../../lib/http-error";
import {
    bulkUpdateIssues,
    createIssue,
    createIssueComment,
    createIssueRelation,
    deleteIssue,
    deleteIssueRelation,
    listIssueComments,
    listIssueRelations,
    listMyIssues,
    restoreIssue,
    searchIssues,
    updateIssue,
} from "../issues/issues.service";
import { matchByName, normalize, outputs, type McpContext, type Workspace } from "./mcp.context";

const SCOPES = ["open", "active", "backlog", "closed", "all"] as const;
const estimateSchema = z
    .number()
    .int()
    .refine((value) => issueEstimateValues.includes(value as (typeof issueEstimateValues)[number]), "Estimate must be 1, 2, 3, 5 or 8");

/** Where the next page starts, opaque to the model so it passes it back unchanged. */
const encodeCursor = (offset: number) => Buffer.from(JSON.stringify({ offset })).toString("base64url");
function decodeCursor(cursor: string | undefined) {
    if (!cursor) return 0;
    try {
        const { offset } = JSON.parse(Buffer.from(cursor, "base64url").toString()) as { offset?: unknown };
        if (typeof offset === "number" && Number.isInteger(offset) && offset >= 0) return offset;
    } catch {
        /* reported below */
    }
    throw new HttpError(400, "That cursor is not one list_issues returned. Leave it out to start from the first page.");
}

/** Relations read from the given issue's side: "blocks RIN-7" here is "blocked_by" on RIN-7. */
const fromSide = (type: (typeof issueRelationValues)[number], outgoing: boolean) =>
    outgoing ? type : type === "blocks" ? "blocked_by" : type === "blocked_by" ? "blocks" : type;

const relationOutput = z.object({ type: z.enum(issueRelationValues), issue: z.string(), title: z.string() });

export function registerIssueTools(context: McpContext) {
    const { tool, user, source, projectsOrAll, projectByKey, issueByIdentifier, resolveState, resolveAssignee, resolveLabels, issueUrl, summarize } = context;

    async function relationsOf(issueId: string) {
        const relations = await listIssueRelations(issueId, user.sub);
        return relations.map((relation) => ({
            id: relation.id,
            type: fromSide(relation.type, relation.sourceIssueId === issueId),
            issue: `${relation.target.project.issueKey}-${relation.target.number}`,
            title: relation.target.title,
        }));
    }

    tool(
        "list_issues",
        {
            title: "List issues",
            description:
                'Lists issues, most urgent first, then most recently updated, a page at a time. Without a project it looks across every project you can see. For "my issues in progress" pass mine: true and state: "Em andamento" (or "In Progress"). When nextCursor is not null, pass it as cursor to get the next page.',
            inputSchema: {
                project: z.string().optional().describe("Project key, such as RIN. Leave out to search every project."),
                state: z.string().optional().describe('A state by name, such as "Em andamento". Matches without accents or case, and partial names.'),
                scope: z.enum(SCOPES).optional().describe('Used when no state is given. "open" (the default) hides closed issues; "active" also hides the backlog.'),
                mine: z.boolean().optional().describe("Only issues assigned to you."),
                assignee: z.string().optional().describe('A username, "me", or "none" for unassigned issues.'),
                priority: z.enum(issuePriorityValues).optional(),
                label: z.string().optional().describe("A label name."),
                limit: z.number().int().min(1).max(200).optional().describe("At most this many issues per page. Default 50."),
                cursor: z.string().optional().describe("nextCursor from the previous page."),
            },
            outputSchema: { total: z.number(), issues: z.array(outputs.issueSummary), nextCursor: z.string().nullable() },
            annotations: { readOnlyHint: true },
        },
        async (args) => {
            const spaces = await projectsOrAll(args.project);
            const scope = args.scope ?? "open";
            const assignee = args.mine ? "me" : args.assignee;

            // States and labels are per project; their ids are unique, so one query covers every project.
            const columnIds = spaces.flatMap((space) => {
                if (args.state) return matchByName(space.columns, args.state, (column) => column.name).map((column) => column.id);
                if (scope === "all") return space.columns.map((column) => column.id);
                return space.columns.filter((column) => (scope === "open" ? columnBucket(column.name) !== "closed" : columnBucket(column.name) === scope)).map((column) => column.id);
            });
            if (args.state && columnIds.length === 0) {
                const states = [...new Set(spaces.flatMap((space) => space.columns.map((column) => column.name)))];
                throw new HttpError(400, `No state matches "${args.state}". States: ${states.join(", ")}.`);
            }
            const categoryIds = args.label ? spaces.flatMap((space) => matchByName(space.labels, args.label!, (label) => label.name).map((label) => label.id)) : undefined;
            if (args.label && categoryIds?.length === 0) {
                const labels = [...new Set(spaces.flatMap((space) => space.labels.map((label) => label.name)))];
                throw new HttpError(400, `No label matches "${args.label}". Labels: ${labels.join(", ") || "none"}.`);
            }

            let assigneeId: string | null | undefined;
            if (assignee !== undefined) {
                if (normalize(assignee) === "me") assigneeId = user.sub;
                else if (normalize(assignee) === "none") assigneeId = null;
                else {
                    const wanted = normalize(assignee.replace(/^@/, ""));
                    const member = spaces.flatMap((space) => space.members).find((candidate) => normalize(candidate.username) === wanted);
                    if (!member) throw new HttpError(400, `"${assignee}" is not a member of ${args.project ?? "any of your projects"}.`);
                    assigneeId = member.id;
                }
            }

            const offset = decodeCursor(args.cursor);
            const limit = args.limit ?? 50;
            const found = await searchIssues({ projectIds: spaces.map((space) => space.project.id), columnIds, categoryIds, assigneeId, priority: args.priority, offset, limit });
            const byProject = new Map<string, Workspace>(spaces.map((space) => [space.project.id, space]));
            return {
                total: found.total,
                issues: found.issues.map((issue) => summarize(byProject.get(issue.projectId)!, issue)),
                nextCursor: offset + found.issues.length < found.total ? encodeCursor(offset + found.issues.length) : null,
            };
        },
    );

    tool(
        "list_my_issues",
        {
            title: "List my issues",
            description: "Lists issues across every project that are assigned to you, that you created, or that you follow, most recently updated first.",
            inputSchema: {
                filter: z.enum(myIssuesFilterValues).optional().describe('"assigned" (the default), "created" or "following".'),
                includeClosed: z.boolean().optional().describe("Also list issues in closed states, such as Done. Default false."),
                limit: z.number().int().min(1).max(200).optional().describe("Default 50."),
            },
            outputSchema: { total: z.number(), issues: z.array(outputs.issueSummary.extend({ project: z.string() })) },
            annotations: { readOnlyHint: true },
        },
        async (args) => {
            const rows = await listMyIssues(user.sub, { filter: args.filter ?? "assigned", orderBy: "updated" });
            const visible = rows.filter((issue) => args.includeClosed || columnBucket(issue.column?.name ?? "") !== "closed");
            return {
                total: visible.length,
                issues: visible.slice(0, args.limit ?? 50).map((issue) => ({
                    identifier: issue.identifier,
                    title: issue.title,
                    state: issue.column?.name ?? null,
                    priority: issue.priority,
                    assignee: issue.assignee?.username ?? null,
                    labels: issue.categories.map((label) => label.name),
                    estimate: issue.estimate,
                    dueDate: issue.dueDate,
                    updatedAt: issue.updatedAt.toISOString(),
                    url: issueUrl(issue.identifier, issue.title),
                    project: issue.project.issueKey,
                })),
            };
        },
    );

    tool(
        "get_issue",
        {
            title: "Get an issue",
            description: "Reads one issue with its description, sub-issues, relations and comments. Keep descriptionRevision: update_issue needs it to change the description.",
            inputSchema: { issue: z.string().describe("Issue identifier, such as RIN-4.") },
            outputSchema: {
                ...outputs.issueSummary.shape,
                project: z.object({ key: z.string(), name: z.string() }),
                createdBy: z.string(),
                createdAt: z.string(),
                parent: z.object({ identifier: z.string(), title: z.string() }).nullable(),
                description: z.string(),
                descriptionRevision: z.number().describe("Pass this to update_issue when changing the description."),
                subIssues: z.array(z.object({ identifier: z.string(), title: z.string(), state: z.string().nullable(), priority: z.enum(issuePriorityValues) })),
                relations: z.array(relationOutput),
                comments: z.array(z.object({ id: z.string(), author: z.string(), createdAt: z.string(), body: z.string(), replies: z.array(z.object({ id: z.string(), author: z.string(), createdAt: z.string(), body: z.string() })) })),
            },
            annotations: { readOnlyHint: true },
        },
        async (args) => {
            const { issue, space } = await issueByIdentifier(args.issue);
            const [comments, relations] = await Promise.all([listIssueComments(issue.id, user.sub), relationsOf(issue.id)]);
            const comment = (entry: (typeof comments)[number]) => ({ id: entry.id, author: entry.author.username, createdAt: entry.createdAt.toISOString(), body: tiptapToMarkdown(entry.contentJson) });
            return {
                ...summarize(space, issue),
                project: { key: space.project.issueKey, name: space.project.name },
                createdBy: issue.createdBy.username,
                createdAt: issue.createdAt.toISOString(),
                parent: issue.parent && { identifier: space.identifier(issue.parent), title: issue.parent.title },
                description: tiptapToMarkdown(issue.descriptionJson),
                descriptionRevision: issue.descriptionRevision,
                subIssues: issue.children.map((child) => ({ identifier: space.identifier(child), title: child.title, state: space.stateName(child.columnId), priority: child.priority })),
                relations: relations.map(({ id: _id, ...relation }) => relation),
                comments: comments.filter((entry) => !entry.parentCommentId).map((entry) => ({ ...comment(entry), replies: comments.filter((reply) => reply.parentCommentId === entry.id).map(comment) })),
            };
        },
    );

    tool(
        "create_issue",
        {
            title: "Create an issue",
            description: 'Creates an issue. It starts in the project\'s first active state (such as "A fazer") unless you choose one.',
            inputSchema: {
                project: z.string().describe("Project key, such as RIN."),
                title: z.string(),
                description: z.string().optional().describe("Markdown, including tables and task lists."),
                state: z.string().optional(),
                assignee: z.string().nullable().optional().describe('A username, or "me".'),
                priority: z.enum(issuePriorityValues).optional(),
                estimate: estimateSchema.nullable().optional().describe("Points: 1, 2, 3, 5 or 8."),
                labels: z.array(z.string()).optional().describe("Label names."),
                parent: z.string().optional().describe("Identifier of the parent issue, to make this a sub-issue."),
                dueDate: dueDateSchema.nullable().optional().describe("YYYY-MM-DD."),
            },
            outputSchema: outputs.issueSummary.shape,
            annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
        },
        async (args) => {
            const space = await projectByKey(args.project);
            const parent = args.parent ? (await issueByIdentifier(args.parent)).issue : undefined;
            const columnId = args.state ? resolveState(space, args.state) : defaultIssueColumn(space.columns)?.id;
            if (!columnId) throw new HttpError(400, `${space.project.issueKey} has no states to put the issue in.`);
            const input = createIssueSchema.parse({
                columnId,
                title: args.title,
                descriptionJson: args.description ? markdownToTiptap(args.description, "description") : undefined,
                assigneeId: args.assignee === undefined ? undefined : resolveAssignee(space, args.assignee),
                priority: args.priority,
                estimate: args.estimate,
                categoryIds: args.labels ? resolveLabels(space, args.labels) : undefined,
                parentIssueId: parent?.id,
                dueDate: args.dueDate,
            });
            const created = await createIssue(space.project.id, input, user.sub, source);
            const { issue } = await issueByIdentifier(created.identifier);
            return summarize(space, issue);
        },
    );

    tool(
        "update_issue",
        {
            title: "Update an issue",
            description:
                "Changes an issue's state, assignee, priority, estimate, labels, title, description, due date or parent. Fields you leave out stay as they are. To change the description, pass the descriptionRevision get_issue returned: if someone edited it since, nothing changes and the error shows the current text to merge with.",
            inputSchema: {
                issue: z.string().describe("Issue identifier, such as RIN-4."),
                title: z.string().optional(),
                description: z.string().optional().describe("Markdown, including tables and task lists. Replaces the whole description."),
                descriptionRevision: z.number().int().positive().optional().describe("Required with description: the descriptionRevision from get_issue."),
                state: z.string().optional().describe('A state by name, such as "Em andamento" or "Concluído".'),
                assignee: z.string().nullable().optional().describe('A username, "me", or null to unassign.'),
                priority: z.enum(issuePriorityValues).optional(),
                estimate: estimateSchema.nullable().optional().describe("Points: 1, 2, 3, 5 or 8, or null to clear it."),
                labels: z.array(z.string()).optional().describe("Replaces every label with these names."),
                addLabels: z.array(z.string()).optional(),
                removeLabels: z.array(z.string()).optional(),
                dueDate: dueDateSchema.nullable().optional().describe("YYYY-MM-DD, or null to clear it."),
                parent: z.string().nullable().optional().describe("Identifier of the new parent issue, or null to make it a top-level issue."),
            },
            outputSchema: outputs.issueSummary.shape,
            annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
        },
        async (args) => {
            const { issue, space } = await issueByIdentifier(args.issue);
            const identifier = space.identifier(issue);
            if (args.description !== undefined && args.descriptionRevision === undefined) {
                throw new HttpError(400, `To change ${identifier}'s description, pass descriptionRevision: ${issue.descriptionRevision} (from get_issue), after reading the current description so you keep what others wrote.`);
            }
            const touchesLabels = args.labels !== undefined || args.addLabels !== undefined || args.removeLabels !== undefined;
            const patch: UpdateIssueInput = {
                title: args.title,
                ...(args.description === undefined ? {} : { descriptionJson: markdownToTiptap(args.description, "description"), expectedDescriptionRevision: args.descriptionRevision }),
                columnId: args.state ? resolveState(space, args.state) : undefined,
                assigneeId: args.assignee === undefined ? undefined : resolveAssignee(space, args.assignee),
                priority: args.priority,
                estimate: args.estimate,
                categoryIds: touchesLabels
                    ? nextLabels(issue.categoryIds, {
                          categoryIds: args.labels && resolveLabels(space, args.labels),
                          addCategoryIds: args.addLabels && resolveLabels(space, args.addLabels),
                          removeCategoryIds: args.removeLabels && resolveLabels(space, args.removeLabels),
                      })
                    : undefined,
                dueDate: args.dueDate,
                parentIssueId: args.parent === undefined ? undefined : args.parent === null ? null : (await issueByIdentifier(args.parent)).issue.id,
            };
            const input = updateIssueSchema.parse(Object.fromEntries(Object.entries(patch).filter(([, value]) => value !== undefined)));
            if (Object.keys(input).length === 0) throw new HttpError(400, "Choose something to change.");
            try {
                await updateIssue(issue.id, input, user.sub, source);
            } catch (error) {
                if (!(error instanceof HttpError) || error.statusCode !== 409 || args.description === undefined) throw error;
                const { issue: current } = await issueByIdentifier(identifier);
                throw new HttpError(
                    409,
                    `${identifier}'s description changed after revision ${args.descriptionRevision}; it is now at revision ${current.descriptionRevision}. Nothing was changed. Its description is now:\n\n${tiptapToMarkdown(current.descriptionJson)}\n\nMerge your change into this text and call update_issue again with descriptionRevision: ${current.descriptionRevision}.`,
                );
            }
            return summarize(space, (await issueByIdentifier(identifier)).issue);
        },
    );

    tool(
        "update_issues",
        {
            title: "Update several issues",
            description: "Applies the same change to several issues of one project at once, such as moving them to a state or adding a label. Either every issue changes or none does.",
            inputSchema: {
                issues: z.array(z.string()).min(1).max(250).describe("Issue identifiers, all from the same project."),
                state: z.string().optional(),
                assignee: z.string().nullable().optional().describe('A username, "me", or null to unassign.'),
                priority: z.enum(issuePriorityValues).optional(),
                estimate: estimateSchema.nullable().optional(),
                dueDate: dueDateSchema.nullable().optional(),
                labels: z.array(z.string()).optional().describe("Replaces every label with these names."),
                addLabels: z.array(z.string()).optional(),
                removeLabels: z.array(z.string()).optional(),
            },
            outputSchema: { issues: z.array(outputs.issueSummary) },
            annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
        },
        async (args) => {
            const found = await Promise.all([...new Set(args.issues.map((identifier) => identifier.trim().toUpperCase()))].map(issueByIdentifier));
            const space = found[0].space;
            const strangers = found.filter((entry) => entry.space.project.id !== space.project.id).map((entry) => entry.space.identifier(entry.issue));
            if (strangers.length) throw new HttpError(400, `Every issue must be in the same project. ${strangers.join(", ")} ${strangers.length === 1 ? "is" : "are"} not in ${space.project.issueKey}.`);
            const patch = Object.fromEntries(
                Object.entries({
                    columnId: args.state ? resolveState(space, args.state) : undefined,
                    assigneeId: args.assignee === undefined ? undefined : resolveAssignee(space, args.assignee),
                    priority: args.priority,
                    estimate: args.estimate,
                    dueDate: args.dueDate,
                    categoryIds: args.labels && resolveLabels(space, args.labels),
                    addCategoryIds: args.addLabels && resolveLabels(space, args.addLabels),
                    removeCategoryIds: args.removeLabels && resolveLabels(space, args.removeLabels),
                }).filter(([, value]) => value !== undefined),
            );
            if (Object.keys(patch).length === 0) throw new HttpError(400, "Choose something to change.");
            const updated = await bulkUpdateIssues(space.project.id, { issueIds: found.map((entry) => entry.issue.id), patch }, user.sub, source);
            return { issues: updated.map((issue) => summarize(space, issue)) };
        },
    );

    tool(
        "delete_issue",
        {
            title: "Delete an issue",
            description: "Deletes an issue and its sub-issues. It can be brought back with restore_issue, passing the deletedAt this returns, for a short while after.",
            inputSchema: { issue: z.string().describe("Issue identifier, such as RIN-4.") },
            outputSchema: { issue: z.string(), deletedAt: z.string().describe("Pass this to restore_issue to undo.") },
            annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false },
        },
        async (args) => {
            const { issue, space } = await issueByIdentifier(args.issue);
            const { deletedAt } = await deleteIssue(issue.id, user.sub);
            return { issue: space.identifier(issue), deletedAt };
        },
    );

    tool(
        "restore_issue",
        {
            title: "Restore a deleted issue",
            description: "Brings back an issue deleted with delete_issue, with the sub-issues deleted alongside it.",
            inputSchema: {
                issue: z.string().describe("Identifier of the deleted issue."),
                deletedAt: z.string().datetime({ offset: true }).describe("The deletedAt delete_issue returned."),
            },
            outputSchema: outputs.issueSummary.shape,
            annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
        },
        async (args) => {
            const space = await projectByKey(args.issue.slice(0, args.issue.lastIndexOf("-")));
            await restoreIssue(args.issue.trim(), user.sub, new Date(args.deletedAt));
            return summarize(space, (await issueByIdentifier(args.issue)).issue);
        },
    );

    tool(
        "add_relation",
        {
            title: "Relate two issues",
            description: 'Records that an issue blocks, is blocked by, relates to or duplicates another issue of the same project. "RIN-4 blocks RIN-7" is type "blocks" on RIN-4.',
            inputSchema: {
                issue: z.string().describe("Issue identifier, such as RIN-4."),
                type: z.enum(issueRelationValues),
                target: z.string().describe("The other issue, such as RIN-7."),
            },
            outputSchema: { issue: z.string(), relations: z.array(relationOutput) },
            annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
        },
        async (args) => {
            const { issue, space } = await issueByIdentifier(args.issue);
            const target = (await issueByIdentifier(args.target)).issue;
            await createIssueRelation(issue.id, { targetIssueIdentifier: target.id, type: args.type }, user.sub, source);
            return { issue: space.identifier(issue), relations: (await relationsOf(issue.id)).map(({ id: _id, ...relation }) => relation) };
        },
    );

    tool(
        "remove_relation",
        {
            title: "Remove a relation",
            description: "Removes a relation between two issues. Leave out type to remove every relation between them.",
            inputSchema: {
                issue: z.string().describe("Issue identifier, such as RIN-4."),
                target: z.string().describe("The other issue, such as RIN-7."),
                type: z.enum(issueRelationValues).optional().describe("Read from the first issue's side, as get_issue shows it."),
            },
            outputSchema: { issue: z.string(), relations: z.array(relationOutput) },
            annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true },
        },
        async (args) => {
            const { issue, space } = await issueByIdentifier(args.issue);
            const target = space.identifier((await issueByIdentifier(args.target)).issue);
            const doomed = (await relationsOf(issue.id)).filter((relation) => relation.issue === target && (!args.type || relation.type === args.type));
            if (!doomed.length) throw new HttpError(404, `${space.identifier(issue)} has no ${args.type ? `"${args.type}" ` : ""}relation with ${target}.`);
            for (const relation of doomed) await deleteIssueRelation(relation.id, user.sub, source);
            return { issue: space.identifier(issue), relations: (await relationsOf(issue.id)).map(({ id: _id, ...relation }) => relation) };
        },
    );

    tool(
        "add_comment",
        {
            title: "Comment on an issue",
            description: "Adds a comment to an issue, or a reply to one of its comments.",
            inputSchema: {
                issue: z.string().describe("Issue identifier, such as RIN-4."),
                body: z.string().min(1).describe("Markdown, including tables and task lists. Images become links."),
                replyTo: z.string().uuid().optional().describe("Id of the comment to reply to, from get_issue."),
            },
            outputSchema: { id: z.string(), issue: z.string(), author: z.string(), createdAt: z.string(), url: z.string() },
            annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
        },
        async (args) => {
            const { issue, space } = await issueByIdentifier(args.issue);
            const comment = await createIssueComment(issue.id, { contentJson: markdownToTiptap(args.body, "comment"), parentCommentId: args.replyTo }, user.sub, source);
            if (!comment) throw new HttpError(500, "The comment was saved but could not be read back.");
            const identifier = space.identifier(issue);
            return { id: comment.id, issue: identifier, author: comment.author.username, createdAt: comment.createdAt.toISOString(), url: issueUrl(identifier, issue.title) };
        },
    );
}
