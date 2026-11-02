import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { createMcpContext, type McpActor } from "./mcp.context";
import { registerDocumentTools } from "./mcp.documents";
import { registerInboxTools } from "./mcp.inbox";
import { registerIssueTools } from "./mcp.issues";
import { registerResourcesAndPrompts } from "./mcp.resources";
import { registerWorkspaceTools } from "./mcp.workspace";

export type { McpActor } from "./mcp.context";

/** What the converter in @rinia/shared reads and writes, so agents send what the editors show. */
const MARKDOWN_GUIDE = `Markdown (GitHub-flavoured) supports: headings # to ### (#### and deeper become ###), **bold**, *italic*, ~~strike~~, \`code\`, [links](https://...),
bullet, numbered and task lists (- [ ] / - [x]) nested by indentation, > quotes, fenced code blocks with a language, --- dividers,
tables (| a | b | with a | --- | --- | row; use <br> for a line break inside a cell and \\| for a pipe), and images ![alt](https://...) in descriptions and pages
(in comments an image becomes a link). A line break inside a paragraph is kept. Mention someone with [@ id="<user id>" label="<name>"], as get_issue returns them.
HTML is shown as text.`;

const INSTRUCTIONS = `Rinia is a project tracker. Projects are named by a short key such as RIN, and issues by their identifier, such as RIN-4.
Each project has its own states (the board's columns, such as "A fazer" or "Em andamento"), labels and members; list_projects shows them.
People are named by username, and "me" is the person who signed in. Descriptions, comments and pages are Markdown.
Other people edit the same issues and pages: read before you rewrite. Replacing a description or a page needs the revision you read
(descriptionRevision from get_issue, revision from get_document), and a stale one is refused with the current text so you can merge.
Lists come a page at a time; pass nextCursor back as cursor for the next page. Every result carries a url that opens it in Rinia.

${MARKDOWN_GUIDE}`;

const READ_ONLY_NOTE = "\n\nThis connection can only read: tools that change things are not available.";

/**
 * One MCP server per request, acting as the token's owner. Every tool goes through the same services as the web app,
 * after the same membership check, so permissions, notifications and live updates behave as if the person did it.
 */
export function createMcpServer(actor: McpActor) {
    const server = new McpServer({ name: "rinia", version: "1.1.0" }, { instructions: INSTRUCTIONS + (actor.access === "read" ? READ_ONLY_NOTE : "") });
    const context = createMcpContext(server, actor);
    registerWorkspaceTools(context);
    registerIssueTools(context);
    registerDocumentTools(context);
    registerInboxTools(context);
    registerResourcesAndPrompts(context);
    return server;
}
