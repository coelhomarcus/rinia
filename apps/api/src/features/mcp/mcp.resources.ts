import { ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { GetPromptResult, ReadResourceResult } from "@modelcontextprotocol/sdk/types.js";
import { appPaths, columnBucket } from "@rinia/shared";
import { z } from "zod";
import { getSavedDocument, listDocuments } from "../documents/documents.service";
import { listProjectsForUser } from "../projects/projects.service";
import type { McpContext } from "./mcp.context";

const MARKDOWN = "text/markdown";
const one = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value) ?? "";

type ResourceMetadata = { title: string; description: string; mimeType: string };
type Variables = Record<string, string | string[] | undefined>;

/**
 * Issues, pages and projects as resources, for clients that let people attach them to a conversation (such as an
 * @-mention in Claude Code), and prompts for the jobs people most often bring to Rinia.
 */
export function registerResourcesAndPrompts(context: McpContext) {
    const { server, user, link, workspace, viewer, projectByKey, issueByIdentifier, assertPageVisible, markdown } = context;
    // Plain signatures instead of the SDK's generic ones, which exhaust the TypeScript compiler on Zod shapes, as for tools.
    const resource = server.registerResource.bind(server) as unknown as (
        name: string,
        uri: string | ResourceTemplate,
        metadata: ResourceMetadata,
        read: (uri: URL, variables: Variables) => Promise<ReadResourceResult>,
    ) => void;
    const registerPrompt = server.registerPrompt.bind(server) as unknown as (
        name: string,
        config: { title: string; description: string; argsSchema?: z.ZodRawShape },
        build: (args: Record<string, string | undefined>) => GetPromptResult,
    ) => void;

    resource(
        "issue",
        new ResourceTemplate("rinia://issue/{identifier}", { list: undefined }),
        { title: "Issue", description: "An issue with its details and description, by identifier, such as rinia://issue/RIN-4.", mimeType: MARKDOWN },
        async (uri, { identifier }) => {
            const { issue, space } = await issueByIdentifier(one(identifier));
            const facts = [
                `State: ${space.stateName(issue.columnId) ?? "none"}`,
                `Priority: ${issue.priority}`,
                `Assignee: ${space.username(issue.assigneeId) ?? "unassigned"}`,
                issue.categories.length ? `Labels: ${issue.categories.map((label) => label.name).join(", ")}` : null,
                issue.dueDate ? `Due: ${issue.dueDate}` : null,
                `Link: ${link(appPaths.issue(space.identifier(issue), issue.title))}`,
            ].filter(Boolean);
            const text = `# ${space.identifier(issue)}: ${issue.title}\n\n${facts.map((fact) => `- ${fact}`).join("\n")}\n\n${markdown(issue.descriptionJson)}`;
            return { contents: [{ uri: uri.href, mimeType: MARKDOWN, text }] };
        },
    );

    resource(
        "page",
        new ResourceTemplate("rinia://page/{project}/{id}", {
            list: async () => {
                const projects = await listProjectsForUser(user.sub);
                const pages = await Promise.all(
                    projects.map(async (project) =>
                        (await listDocuments(project.id, await viewer(project.id))).map((document) => ({ uri: `rinia://page/${project.issueKey}/${document.id}`, name: `${project.issueKey}: ${document.title}`, mimeType: MARKDOWN })),
                    ),
                );
                return { resources: pages.flat() };
            },
        }),
        { title: "Page", description: "A project page (document) as Markdown.", mimeType: MARKDOWN },
        async (uri, { project, id }) => {
            const space = await projectByKey(one(project));
            await assertPageVisible(space.project.id, one(id));
            const document = await getSavedDocument(space.project.id, one(id));
            return { contents: [{ uri: uri.href, mimeType: MARKDOWN, text: `# ${document.title}\n\n${markdown(document.contentJson)}` }] };
        },
    );

    resource(
        "projects",
        "rinia://projects",
        { title: "Projects", description: "Every project you can see, with its states, labels and members.", mimeType: MARKDOWN },
        async (uri) => {
            const projects = await listProjectsForUser(user.sub);
            const sections = await Promise.all(
                projects.map(async (project) => {
                    const space = await workspace(project);
                    return [
                        `## ${project.name} (${project.issueKey})`,
                        project.description ?? "",
                        `- States: ${space.columns.map((column) => `${column.name} (${columnBucket(column.name)})`).join(", ")}`,
                        `- Labels: ${space.labels.map((label) => label.name).join(", ") || "none"}`,
                        `- Members: ${space.members.map((member) => member.username).join(", ")}`,
                    ]
                        .filter(Boolean)
                        .join("\n");
                }),
            );
            return { contents: [{ uri: uri.href, mimeType: MARKDOWN, text: sections.join("\n\n") || "You are not in any project yet." }] };
        },
    );

    const prompt = (text: string): GetPromptResult => ({ messages: [{ role: "user", content: { type: "text", text } }] });

    registerPrompt(
        "triage_inbox",
        { title: "Triage my inbox", description: "Goes through your unread Rinia notifications and says what needs you." },
        () =>
            prompt(
                "Use list_notifications to read my unread Rinia notifications. Group them by issue, open the ones that need a decision or a reply with get_issue, and tell me, most urgent first, what each one needs from me. Do not change anything until I say so; then mark what I have dealt with as read with mark_notifications_read.",
            ),
    );

    registerPrompt(
        "standup",
        {
            title: "Write my standup",
            description: "Summarises what you are working on, what you finished and what is blocked.",
            argsSchema: { project: z.string().optional().describe("Project key, such as RIN. Leave out for every project.") },
        },
        ({ project }) =>
            prompt(
                `Use list_my_issues (with includeClosed: true) and list_issues${project ? ` with project: "${project}"` : ""} to write my standup from Rinia: what I finished recently, what I am working on now, and what is blocked or waiting on someone (check relations with get_issue). Keep it to short bullets with issue identifiers and links.`,
            ),
    );

    registerPrompt(
        "work_on_issue",
        {
            title: "Work on an issue",
            description: "Reads an issue and its context, and plans the work before changing anything.",
            argsSchema: { issue: z.string().describe("Issue identifier, such as RIN-4.") },
        },
        ({ issue }) =>
            prompt(
                `Read ${issue} with get_issue, including its sub-issues, relations and comments, and any pages it links to with get_document. Then propose a plan: what to do, in what order, and what is unclear. Once I agree, move it to an in-progress state with update_issue, and comment on it with add_comment as the work progresses.`,
            ),
    );
}
