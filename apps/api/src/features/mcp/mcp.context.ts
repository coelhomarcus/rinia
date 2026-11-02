import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult, ToolAnnotations } from "@modelcontextprotocol/sdk/types.js";
import { appPaths, issuePriorityValues, type ActionSource, type ApiTokenAccess, type IssuePriority } from "@rinia/shared";
import { z, ZodError } from "zod";
import { HttpError } from "../../lib/http-error";
import type { JwtPayload } from "../../lib/jwt";
import { logFor } from "../../lib/request-context";
import { assertProjectMembership } from "../../middleware/project-membership.middleware";
import { listCategories } from "../categories/categories.service";
import { listColumns } from "../columns/columns.service";
import { getIssueOrThrow } from "../issues/issues.service";
import { getProjectByKey, listProjectMembers, listProjectsForUser } from "../projects/projects.service";

export interface McpActor {
    user: JwtPayload;
    /** Where Rinia is opened, for the links in results: `https://rinia.example.com`. */
    baseUrl: string;
    /** The tool making the request, such as `claude-code`, when it said. Recorded on what it changes. */
    client?: string | null;
    /** What the token may do. A read-only token gets only the tools that look, and none that change anything. */
    access?: ApiTokenAccess;
}

export const ISSUE_IDENTIFIER = /^[A-Za-z0-9]{2,8}-\d+$/;

/** Lowercase without accents, so "em andamento" finds "Em andamento" and "concluido" finds "Concluído". */
export const normalize = (value: string) => value.normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase();

/** The items whose name is `wanted`, or failing that, those whose name contains it. */
export function matchByName<T>(items: T[], wanted: string, name: (item: T) => string) {
    const target = normalize(wanted);
    const exact = items.filter((item) => normalize(name(item)) === target);
    return exact.length > 0 ? exact : items.filter((item) => normalize(name(item)).includes(target));
}

/** A refusal or bad arguments the model can correct, as opposed to a fault in Rinia. */
const isExpectedError = (error: unknown) => error instanceof ZodError || error instanceof HttpError;

function errorMessage(error: unknown) {
    if (error instanceof ZodError) return `Invalid input: ${error.issues.map((issue) => `${issue.path.join(".") || "value"}: ${issue.message}`).join("; ")}`;
    if (error instanceof HttpError) return error.message;
    return "Something went wrong in Rinia. Try again.";
}

/** One `mcp.tool` line per call: which tool, from which client, for whom, how long, and how it ended. */
function logToolCall(call: { tool: string; source: ActionSource; userId: string; startedAt: number }, error?: unknown) {
    const entry = { event: "mcp.tool", tool: call.tool, client: call.source.client, userId: call.userId, durationMs: Math.round(performance.now() - call.startedAt), ok: error === undefined };
    const log = logFor("mcp");
    if (error === undefined) log.info(entry, `tool ${call.tool}`);
    else if (isExpectedError(error)) {
        log.info({ ...entry, status: error instanceof HttpError ? error.statusCode : 400, fields: error instanceof ZodError ? error.issues.map((issue) => issue.path.join(".")) : undefined }, `tool ${call.tool} refused`);
    } else log.error({ ...entry, err: error }, `tool ${call.tool} failed`);
}

/**
 * Runs a tool and returns what it found twice: as typed `structuredContent` for clients that read the output schema,
 * and as JSON text for those that do not. Its error comes back as a message the model can act on.
 */
async function respond(call: { tool: string; source: ActionSource; userId: string }, work: () => Promise<Record<string, unknown>>): Promise<CallToolResult> {
    const startedAt = performance.now();
    try {
        // Through JSON, so dates arrive as the strings the output schemas describe.
        const structuredContent = JSON.parse(JSON.stringify(await work())) as Record<string, unknown>;
        logToolCall({ ...call, startedAt });
        return { structuredContent, content: [{ type: "text", text: JSON.stringify(structuredContent, null, 2) }] };
    } catch (error) {
        logToolCall({ ...call, startedAt }, error);
        return { isError: true, content: [{ type: "text", text: errorMessage(error) }] };
    }
}

/** Output pieces several tools share. Dates are ISO strings. */
export const outputs = {
    issueSummary: z.object({
        identifier: z.string(),
        title: z.string(),
        state: z.string().nullable(),
        priority: z.enum(issuePriorityValues),
        assignee: z.string().nullable().describe("Username, or null when unassigned."),
        labels: z.array(z.string()),
        estimate: z.number().nullable(),
        dueDate: z.string().nullable(),
        updatedAt: z.string(),
        url: z.string(),
    }),
    page: z.object({ id: z.string(), title: z.string(), project: z.string(), url: z.string() }),
};

type ProjectRef = { id: string; issueKey: string; name: string };

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
export type Workspace = Awaited<ReturnType<typeof loadWorkspace>>;

type IssueForSummary = { number: number; title: string; columnId: string; priority: IssuePriority; assigneeId: string | null; estimate: number | null; dueDate: string | null; updatedAt: Date; categories: Array<{ name: string }> };

/**
 * What every tool works with: the actor, links into Rinia, a project's states, labels and members (loaded once per
 * request), and lookups that turn the names a model uses into ids, or into errors that list the valid names.
 */
export function createMcpContext(server: McpServer, { user, baseUrl, client = null, access = "write" }: McpActor) {
    const source: ActionSource = { via: "mcp", client };
    const link = (path: string) => new URL(path, baseUrl).toString();
    const workspaces = new Map<string, Promise<Workspace>>();

    /**
     * Registers a tool whose arguments are checked against `inputSchema` and whose result is checked against
     * `outputSchema`. Tools that change something are left out for a read-only token, so the model never sees them.
     * The SDK's own generic signature is not used: inferring it for every Zod shape exhausts the TypeScript compiler.
     */
    function tool<Shape extends z.ZodRawShape, Output extends z.ZodRawShape>(
        name: string,
        config: { title: string; description: string; inputSchema: Shape; outputSchema: Output; annotations: ToolAnnotations },
        handler: (args: z.output<z.ZodObject<Shape>>) => Promise<z.input<z.ZodObject<Output>>>,
    ) {
        if (access === "read" && !config.annotations.readOnlyHint) return;
        const schema = z.object(config.inputSchema);
        const register = server.registerTool.bind(server) as unknown as (name: string, config: object, callback: (args: unknown) => Promise<CallToolResult>) => void;
        // Every tool works inside Rinia only.
        const annotations = { openWorldHint: false, ...config.annotations };
        register(name, { ...config, annotations }, (args) => respond({ tool: name, source, userId: user.sub }, () => handler(schema.parse(args)) as Promise<Record<string, unknown>>));
    }

    function workspace(project: ProjectRef) {
        let loaded = workspaces.get(project.id);
        if (!loaded) workspaces.set(project.id, (loaded = loadWorkspace(project)));
        return loaded;
    }

    async function projectByKey(key: string) {
        const project = await getProjectByKey(key);
        await assertProjectMembership(project.id, user.sub);
        return workspace(project);
    }

    /** One project by key, or every project the user is in. */
    async function projectsOrAll(key: string | undefined) {
        return key ? [await projectByKey(key)] : Promise.all((await listProjectsForUser(user.sub)).map((project) => workspace(project)));
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

    const issueUrl = (identifier: string, title: string) => link(appPaths.issue(identifier, title));

    function summarize(space: Workspace, issue: IssueForSummary): z.input<typeof outputs.issueSummary> {
        const identifier = space.identifier(issue);
        return {
            identifier,
            title: issue.title,
            state: space.stateName(issue.columnId),
            priority: issue.priority,
            assignee: space.username(issue.assigneeId),
            labels: issue.categories.map((label) => label.name),
            estimate: issue.estimate,
            dueDate: issue.dueDate,
            updatedAt: issue.updatedAt.toISOString(),
            url: issueUrl(identifier, issue.title),
        };
    }

    return { server, user, source, link, tool, workspace, projectByKey, projectsOrAll, issueByIdentifier, resolveState, resolveAssignee, resolveLabels, issueUrl, summarize };
}

export type McpContext = ReturnType<typeof createMcpContext>;
