import { appPaths, columnBucket, issuePriorityValues } from "@rinia/shared";
import { z } from "zod";
import { listProjectsForUser } from "../projects/projects.service";
import { searchWorkspace } from "../search/search.service";
import { outputs, type McpContext } from "./mcp.context";

export function registerWorkspaceTools(context: McpContext) {
    const { tool, user, link, workspace, projectByKey, issueUrl } = context;

    tool(
        "list_projects",
        {
            title: "List projects",
            description: "Lists the projects you can see, with each one's key, states, labels and members.",
            inputSchema: {},
            outputSchema: {
                projects: z.array(
                    z.object({
                        key: z.string(),
                        name: z.string(),
                        description: z.string().nullable(),
                        states: z.array(z.object({ name: z.string(), kind: z.enum(["active", "backlog", "closed"]) })),
                        labels: z.array(z.string()),
                        members: z.array(z.object({ username: z.string(), name: z.string() })),
                        url: z.string(),
                    }),
                ),
            },
            annotations: { readOnlyHint: true },
        },
        async () => {
            const projects = await listProjectsForUser(user.sub);
            return {
                projects: await Promise.all(
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
                ),
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
            outputSchema: {
                issues: z.array(z.object({ identifier: z.string(), title: z.string(), state: z.string().nullable(), priority: z.enum(issuePriorityValues), project: z.string(), url: z.string() })),
                documents: z.array(outputs.page),
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
}
