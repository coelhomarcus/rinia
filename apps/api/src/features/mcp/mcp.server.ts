import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult, ToolAnnotations } from "@modelcontextprotocol/sdk/types.js";
import { appPaths, columnBucket, createDocumentSchema, createIssueSchema, defaultIssueColumn, dueDateSchema, issuePriorityValues, markdownToTiptap, matchDocumentSlug, nextLabels, tiptapToMarkdown, updateIssueSchema, type IssuePriority, type UpdateIssueInput } from "@rinia/shared";
import { z, ZodError } from "zod";
import { HttpError } from "../../lib/http-error";
import type { JwtPayload } from "../../lib/jwt";
import { assertProjectMembership } from "../../middleware/project-membership.middleware";
import { listCategories } from "../categories/categories.service";
import { listColumns } from "../columns/columns.service";
import { createDocument, getDocument, listDocuments } from "../documents/documents.service";
import { createIssue, createIssueComment, getIssueOrThrow, listIssueComments, listIssueRelations, listIssues, updateIssue } from "../issues/issues.service";
import { getProjectByKey, listProjectMembers, listProjectsForUser } from "../projects/projects.service";
import { searchWorkspace } from "../search/search.service";

export interface McpActor {
    user: JwtPayload;
    /** Where Rinia is opened, for the links in results: `https://rinia.example.com`. */
    baseUrl: string;
}

const INSTRUCTIONS = `Rinia is a project tracker. Projects are named by a short key such as RIN, and issues by their identifier, such as RIN-4.
Each project has its own states (the board's columns, such as "A fazer" or "Em andamento"), labels and members; list_projects shows them.
People are named by username, and "me" is the person who owns the API token. Descriptions, comments and pages are Markdown.
Every result carries a url that opens it in Rinia.`;

const SCOPES = ["open", "active", "backlog", "closed", "all"] as const;
const PRIORITY_RANK: Record<IssuePriority, number> = { urgent: 0, high: 1, medium: 2, low: 3, none: 4 };
const ISSUE_IDENTIFIER = /^[A-Za-z0-9]{2,8}-\d+$/;

/** Lowercase without accents, so "em andamento" finds "Em andamento" and "concluido" finds "Concluído". */
const normalize = (value: string) => value.normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase();

/** The items whose name is `wanted`, or failing that, those whose name contains it. */
function matchByName<T>(items: T[], wanted: string, name: (item: T) => string) {
    const target = normalize(wanted);
    const exact = items.filter((item) => normalize(name(item)) === target);
    return exact.length > 0 ? exact : items.filter((item) => normalize(name(item)).includes(target));
}

function errorMessage(error: unknown) {
    if (error instanceof ZodError) return `Invalid input: ${error.issues.map((issue) => `${issue.path.join(".") || "value"}: ${issue.message}`).join("; ")}`;
    if (error instanceof HttpError) return error.message;
    console.error("MCP tool failed", error);
    return "Something went wrong in Rinia. Try again.";
}

/** Runs a tool and returns what it found as JSON, or its error as a message the model can act on. */
async function respond(work: () => Promise<unknown>): Promise<CallToolResult> {
    try {
        return { content: [{ type: "text", text: JSON.stringify(await work(), null, 2) }] };
    } catch (error) {
        return { isError: true, content: [{ type: "text", text: errorMessage(error) }] };
    }
}

type ProjectRef = { id: string; issueKey: string; name: string };

/**
 * One MCP server per request, acting as the token's owner. Every tool goes through the same services as the web app,
 * after the same membership check, so permissions, notifications and live updates behave as if the person did it.
 */
export function createMcpServer({ user, baseUrl }: McpActor) {
    const server = new McpServer({ name: "rinia", version: "1.0.0" }, { instructions: INSTRUCTIONS });
    const link = (path: string) => new URL(path, baseUrl).toString();
    const workspaces = new Map<string, ReturnType<typeof loadWorkspace>>();

    /**
     * Registers a tool whose arguments are checked against `inputSchema`. The SDK's own generic signature is not used:
     * inferring it for every Zod shape exhausts the TypeScript compiler.
     */
    function tool<Shape extends z.ZodRawShape>(
        name: string,
        config: { title: string; description: string; inputSchema: Shape; annotations: ToolAnnotations },
        handler: (args: z.output<z.ZodObject<Shape>>) => Promise<unknown>,
    ) {
        const schema = z.object(config.inputSchema);
        const register = server.registerTool.bind(server) as unknown as (name: string, config: object, callback: (args: unknown) => Promise<CallToolResult>) => void;
        register(name, config, (args) => respond(() => handler(schema.parse(args))));
    }

    /** A project's states, labels and members, loaded once per request. */
    function workspace(project: ProjectRef) {
        let loaded = workspaces.get(project.id);
        if (!loaded) workspaces.set(project.id, (loaded = loadWorkspace(project)));
        return loaded;
    }

    async function loadWorkspace(project: ProjectRef) {
        const [columns, labels, members] = await Promise.all([listColumns(project.id), listCategories(project.id), listProjectMembers(project.id)]);
        return {
            project,
            columns,
            labels,
            members,
            stateName: (columnId: string) => columns.find((column) => column.id === columnId)?.name ?? null,
            username: (userId: string | null) => (userId ? (members.find((member) => member.id === userId)?.username ?? null) : null),
            identifier: (issue: { number: number }) => `${project.issueKey}-${issue.number}`,
        };
    }
    type Workspace = Awaited<ReturnType<typeof loadWorkspace>>;

    async function projectByKey(key: string) {
        const project = await getProjectByKey(key);
        await assertProjectMembership(project.id, user.sub);
        return workspace(project);
    }

    async function issueByIdentifier(identifier: string) {
        if (!ISSUE_IDENTIFIER.test(identifier.trim())) throw new HttpError(400, `"${identifier}" is not an issue identifier. Use one such as RIN-4.`);
        const issue = await getIssueOrThrow(identifier.trim());
        await assertProjectMembership(issue.projectId, user.sub);
        return { issue, space: await workspace(issue.project) };
    }

    function resolveState(space: Workspace, state: string) {
        const [column] = matchByName(space.columns, state, (column) => column.name);
        if (!column) throw new HttpError(400, `${space.project.issueKey} has no state "${state}". Its states are: ${space.columns.map((column) => column.name).join(", ")}.`);
        return column.id;
    }

    /** "me", a username (with or without @) or a name; null or "none" leaves the issue unassigned. */
    function resolveAssignee(space: Workspace, assignee: string | null) {
        if (assignee === null || normalize(assignee) === "none") return null;
        if (normalize(assignee) === "me") return user.sub;
        const wanted = assignee.replace(/^@/, "");
        const member = space.members.find((member) => normalize(member.username) === normalize(wanted)) ?? matchByName(space.members, wanted, (member) => member.name)[0];
        if (!member) throw new HttpError(400, `"${assignee}" is not a member of ${space.project.issueKey}. Members: ${space.members.map((member) => member.username).join(", ")}.`);
        return member.id;
    }

    function resolveLabels(space: Workspace, names: string[]) {
        return names.map((name) => {
            const [label] = matchByName(space.labels, name, (label) => label.name);
            if (!label) throw new HttpError(400, `${space.project.issueKey} has no label "${name}". Its labels are: ${space.labels.map((label) => label.name).join(", ") || "none"}.`);
            return label.id;
        });
    }

    function issueUrl(identifier: string, title: string) {
        return link(appPaths.issue(identifier, title));
    }

    function summarize(space: Workspace, issue: { number: number; title: string; columnId: string; priority: IssuePriority; assigneeId: string | null; dueDate: string | null; updatedAt: Date; categories: Array<{ name: string }> }) {
        const identifier = space.identifier(issue);
        return {
            identifier,
            title: issue.title,
            state: space.stateName(issue.columnId),
            priority: issue.priority,
            assignee: space.username(issue.assigneeId),
            labels: issue.categories.map((label) => label.name),
            dueDate: issue.dueDate,
            updatedAt: issue.updatedAt,
            url: issueUrl(identifier, issue.title),
        };
    }

    tool(
        "list_projects",
        {
            title: "List projects",
            description: "Lists the projects you can see, with each one's key, states, labels and members.",
            inputSchema: {},
            annotations: { readOnlyHint: true },
        },
        async () => {
                const projects = await listProjectsForUser(user.sub);
                return Promise.all(
                    projects.map(async (project) => {
                        const space = await workspace(project);
                        return {
                            key: project.issueKey,
                            name: project.name,
                            description: project.description,
                            states: space.columns.map((column) => ({ name: column.name, kind: columnBucket(column.name) })),
                            labels: space.labels.map((label) => label.name),
                            members: space.members.map((member) => ({ username: member.username, name: member.name })),
                            url: link(appPaths.project(project.issueKey)),
                        };
                    }),
                );
        },
    );

    tool(
        "list_issues",
        {
            title: "List issues",
            description:
                'Lists issues, most urgent first, then most recently updated. Without a project it looks across every project you can see. For "my issues in progress" pass mine: true and state: "Em andamento" (or "In Progress").',
            inputSchema: {
                project: z.string().optional().describe("Project key, such as RIN. Leave out to search every project."),
                state: z.string().optional().describe('A state by name, such as "Em andamento". Matches without accents or case, and partial names.'),
                scope: z.enum(SCOPES).optional().describe('Used when no state is given. "open" (the default) hides closed issues; "active" also hides the backlog.'),
                mine: z.boolean().optional().describe("Only issues assigned to you."),
                assignee: z.string().optional().describe('A username, "me", or "none" for unassigned issues.'),
                priority: z.enum(issuePriorityValues).optional(),
                label: z.string().optional().describe("A label name."),
                limit: z.number().int().min(1).max(200).optional().describe("At most this many issues. Default 50."),
            },
            annotations: { readOnlyHint: true },
        },
        async (args) => {
                const spaces = args.project
                    ? [await projectByKey(args.project)]
                    : await Promise.all((await listProjectsForUser(user.sub)).map((project) => workspace(project)));
                const assignee = args.mine ? "me" : args.assignee;
                const scope = args.scope ?? "open";

                let matchedState = !args.state;
                const found = await Promise.all(
                    spaces.map(async (space) => {
                        const stateIds = args.state ? new Set(matchByName(space.columns, args.state, (column) => column.name).map((column) => column.id)) : null;
                        if (stateIds?.size) matchedState = true;
                        if (stateIds && stateIds.size === 0) return [];
                        const labelIds = args.label ? matchByName(space.labels, args.label, (label) => label.name).map((label) => label.id) : undefined;
                        if (labelIds && labelIds.length === 0) return [];
                        const assigneeId = assignee === undefined ? undefined : assignee && normalize(assignee) === "me" ? user.sub : undefined;
                        const rows = await listIssues(space.project.id, { orderBy: "updated", priority: args.priority, assigneeId, categoryIds: labelIds });
                        return rows
                            .filter((issue) => {
                                if (stateIds) return stateIds.has(issue.columnId);
                                const bucket = columnBucket(space.stateName(issue.columnId) ?? "");
                                return scope === "all" || (scope === "open" ? bucket !== "closed" : bucket === scope);
                            })
                            .filter((issue) => {
                                if (assignee === undefined || normalize(assignee) === "me") return true;
                                if (normalize(assignee) === "none") return issue.assigneeId === null;
                                return normalize(space.username(issue.assigneeId) ?? "") === normalize(assignee.replace(/^@/, ""));
                            })
                            .map((issue) => summarize(space, issue));
                    }),
                );
                if (!matchedState) {
                    const states = [...new Set(spaces.flatMap((space) => space.columns.map((column) => column.name)))];
                    throw new HttpError(400, `No state matches "${args.state}". States: ${states.join(", ")}.`);
                }
                const issues = found
                    .flat()
                    .sort((left, right) => PRIORITY_RANK[left.priority] - PRIORITY_RANK[right.priority] || right.updatedAt.getTime() - left.updatedAt.getTime());
                const limit = args.limit ?? 50;
                return { total: issues.length, issues: issues.slice(0, limit) };
        },
    );

    tool(
        "get_issue",
        {
            title: "Get an issue",
            description: "Reads one issue with its description, sub-issues, relations and comments.",
            inputSchema: { issue: z.string().describe("Issue identifier, such as RIN-4.") },
            annotations: { readOnlyHint: true },
        },
        async (args) => {
                const { issue, space } = await issueByIdentifier(args.issue);
                const [comments, relations] = await Promise.all([listIssueComments(issue.id, user.sub), listIssueRelations(issue.id, user.sub)]);
                const comment = (entry: (typeof comments)[number]) => ({ id: entry.id, author: entry.author.username, createdAt: entry.createdAt, body: tiptapToMarkdown(entry.contentJson) });
                return {
                    ...summarize(space, issue),
                    project: { key: space.project.issueKey, name: space.project.name },
                    createdBy: issue.createdBy.username,
                    estimate: issue.estimate,
                    createdAt: issue.createdAt,
                    parent: issue.parent && { identifier: space.identifier(issue.parent), title: issue.parent.title },
                    description: tiptapToMarkdown(issue.descriptionJson),
                    subIssues: issue.children.map((child) => ({ identifier: space.identifier(child), title: child.title, state: space.stateName(child.columnId), priority: child.priority })),
                    // Each relation reads from this issue's side: "blocks RIN-7" here is "blocked_by" on RIN-7.
                    relations: relations.map((relation) => ({
                        type: relation.sourceIssueId === issue.id ? relation.type : relation.type === "blocks" ? "blocked_by" : relation.type === "blocked_by" ? "blocks" : relation.type,
                        issue: `${relation.target.project.issueKey}-${relation.target.number}`,
                        title: relation.target.title,
                    })),
                    comments: comments.filter((entry) => !entry.parentCommentId).map((entry) => ({ ...comment(entry), replies: comments.filter((reply) => reply.parentCommentId === entry.id).map(comment) })),
                };
        },
    );

    tool(
        "search",
        {
            title: "Search",
            description: "Finds issues and pages whose title or text contains the words, or an issue by its identifier.",
            inputSchema: {
                query: z.string().trim().min(1).max(200),
                project: z.string().optional().describe("Project key, to search only that project."),
                limit: z.number().int().min(1).max(50).optional().describe("At most this many of each kind. Default 20."),
            },
            annotations: { readOnlyHint: true },
        },
        async (args) => {
                const space = args.project ? await projectByKey(args.project) : undefined;
                const found = await searchWorkspace(user.sub, args.query, { projectId: space?.project.id, limit: args.limit });
                return {
                    issues: found.issues.map((issue) => {
                        const identifier = `${issue.issueKey}-${issue.number}`;
                        return { identifier, title: issue.title, state: issue.state, priority: issue.priority, project: issue.projectName, url: issueUrl(identifier, issue.title) };
                    }),
                    documents: found.documents.map((document) => ({ id: document.id, title: document.title, project: document.issueKey, url: link(appPaths.document(document.issueKey, document)) })),
                };
        },
    );

    tool(
        "get_document",
        {
            title: "Get a page",
            description: "Reads a project page (document) as Markdown, including edits people are making right now.",
            inputSchema: {
                project: z.string().describe("Project key, such as RIN."),
                document: z.string().describe("The page's id, its URL or slug, or its title."),
            },
            annotations: { readOnlyHint: true },
        },
        async (args) => {
                const space = await projectByKey(args.project);
                const documents = await listDocuments(space.project.id);
                const reference = args.document.trim().replace(/[?#].*$/, "").replace(/\/+$/, "");
                const match = matchDocumentSlug(reference.slice(reference.lastIndexOf("/") + 1), documents) ?? matchByName(documents, reference, (document) => document.title)[0];
                if (!match) throw new HttpError(404, `${space.project.issueKey} has no page "${args.document}". Its pages are: ${documents.map((document) => document.title).join(", ") || "none"}.`);
                const document = await getDocument(space.project.id, match.id);
                return {
                    id: document.id,
                    title: document.title,
                    project: space.project.issueKey,
                    updatedAt: document.updatedAt,
                    url: link(appPaths.document(space.project.issueKey, document)),
                    content: tiptapToMarkdown(document.contentJson),
                };
        },
    );

    tool(
        "create_issue",
        {
            title: "Create an issue",
            description: "Creates an issue. It starts in the project's first active state (such as \"A fazer\") unless you choose one.",
            inputSchema: {
                project: z.string().describe("Project key, such as RIN."),
                title: z.string(),
                description: z.string().optional().describe("Markdown."),
                state: z.string().optional(),
                assignee: z.string().nullable().optional().describe('A username, or "me".'),
                priority: z.enum(issuePriorityValues).optional(),
                labels: z.array(z.string()).optional().describe("Label names."),
                parent: z.string().optional().describe("Identifier of the parent issue, to make this a sub-issue."),
                dueDate: dueDateSchema.nullable().optional().describe("YYYY-MM-DD."),
            },
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
                    descriptionJson: args.description ? markdownToTiptap(args.description) : undefined,
                    assigneeId: args.assignee === undefined ? undefined : resolveAssignee(space, args.assignee),
                    priority: args.priority,
                    categoryIds: args.labels ? resolveLabels(space, args.labels) : undefined,
                    parentIssueId: parent?.id,
                    dueDate: args.dueDate,
                });
                const created = await createIssue(space.project.id, input, user.sub);
                const { issue } = await issueByIdentifier(created.identifier);
                return summarize(space, issue);
        },
    );

    tool(
        "update_issue",
        {
            title: "Update an issue",
            description: "Changes an issue's state, assignee, priority, labels, title, description, due date or parent. Fields you leave out stay as they are.",
            inputSchema: {
                issue: z.string().describe("Issue identifier, such as RIN-4."),
                title: z.string().optional(),
                description: z.string().optional().describe("Markdown. Replaces the whole description."),
                state: z.string().optional().describe('A state by name, such as "Em andamento" or "Concluído".'),
                assignee: z.string().nullable().optional().describe('A username, "me", or null to unassign.'),
                priority: z.enum(issuePriorityValues).optional(),
                labels: z.array(z.string()).optional().describe("Replaces every label with these names."),
                addLabels: z.array(z.string()).optional(),
                removeLabels: z.array(z.string()).optional(),
                dueDate: dueDateSchema.nullable().optional().describe("YYYY-MM-DD, or null to clear it."),
                parent: z.string().nullable().optional().describe("Identifier of the new parent issue, or null to make it a top-level issue."),
            },
            annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
        },
        async (args) => {
                const { issue, space } = await issueByIdentifier(args.issue);
                const touchesLabels = args.labels !== undefined || args.addLabels !== undefined || args.removeLabels !== undefined;
                const patch: UpdateIssueInput = {
                    title: args.title,
                    ...(args.description === undefined ? {} : { descriptionJson: markdownToTiptap(args.description), expectedDescriptionRevision: issue.descriptionRevision }),
                    columnId: args.state ? resolveState(space, args.state) : undefined,
                    assigneeId: args.assignee === undefined ? undefined : resolveAssignee(space, args.assignee),
                    priority: args.priority,
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
                await updateIssue(issue.id, input, user.sub);
                return summarize(space, (await issueByIdentifier(args.issue)).issue);
        },
    );

    tool(
        "add_comment",
        {
            title: "Comment on an issue",
            description: "Adds a comment to an issue, or a reply to one of its comments.",
            inputSchema: {
                issue: z.string().describe("Issue identifier, such as RIN-4."),
                body: z.string().min(1).describe("Markdown."),
                replyTo: z.string().uuid().optional().describe("Id of the comment to reply to, from get_issue."),
            },
            annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
        },
        async (args) => {
                const { issue, space } = await issueByIdentifier(args.issue);
                const comment = await createIssueComment(issue.id, { contentJson: markdownToTiptap(args.body), parentCommentId: args.replyTo }, user.sub);
                const identifier = space.identifier(issue);
                return { id: comment?.id, issue: identifier, author: comment?.author.username, createdAt: comment?.createdAt, url: issueUrl(identifier, issue.title) };
        },
    );

    tool(
        "create_document",
        {
            title: "Create a page",
            description: "Creates a project page (document) from Markdown.",
            inputSchema: {
                project: z.string().describe("Project key, such as RIN."),
                title: z.string(),
                content: z.string().optional().describe("Markdown."),
            },
            annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
        },
        async (args) => {
                const space = await projectByKey(args.project);
                const input = createDocumentSchema.parse({ title: args.title, contentJson: markdownToTiptap(args.content) });
                const document = await createDocument(space.project.id, user.sub, input);
                return { id: document.id, title: document.title, project: space.project.issueKey, url: link(appPaths.document(space.project.issueKey, { id: document.id, title: document.title })) };
        },
    );

    return server;
}
