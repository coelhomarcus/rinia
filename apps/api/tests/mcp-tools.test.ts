import assert from "node:assert/strict";
import { afterEach, mock, spyOn, test } from "bun:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { can, markdownToTiptap, type ProjectAction, type ProjectRole } from "@rinia/shared";

// The services read their settings on import; give them what they need without a local .env.
process.env.JWT_SECRET ??= "test-secret";
process.env.DATABASE_URL ??= "postgres://localhost/unused";
process.env.SPECIAL_REGISTRATION_CODE ??= "test-code";
const { createMcpServer } = await import("../src/features/mcp/mcp.server");
const projectsService = await import("../src/features/projects/projects.service");
const membership = await import("../src/middleware/project-membership.middleware");
const columnsService = await import("../src/features/columns/columns.service");
const categoriesService = await import("../src/features/categories/categories.service");
const issuesService = await import("../src/features/issues/issues.service");
const documentsService = await import("../src/features/documents/documents.service");
const { HttpError } = await import("../src/lib/http-error");

// Every service the tools call is stubbed: these tests never touch a database.
afterEach(() => mock.restore());

const ana = { sub: "8b2d1f66-0000-4000-8000-000000000001", username: "ana", isAdmin: false };
const bruno = { id: "8b2d1f66-0000-4000-8000-000000000002", username: "bruno", name: "Bruno Lima" };
const project = { id: "8b2d1f66-0000-4000-8000-0000000000aa", issueKey: "RIN", name: "Rinia", description: null };
const columns = [
    { id: "c0000000-0000-4000-8000-000000000001", name: "Backlog" },
    { id: "c0000000-0000-4000-8000-000000000002", name: "A fazer" },
    { id: "c0000000-0000-4000-8000-000000000003", name: "Em andamento" },
    { id: "c0000000-0000-4000-8000-000000000004", name: "Concluído" },
];
const labels = [{ id: "l0000000-0000-4000-8000-000000000001", name: "Bug" }];
const members = [{ id: ana.sub, username: "ana", name: "Ana Souza" }, bruno];

function issue(overrides: Record<string, unknown> = {}) {
    return {
        id: "i0000000-0000-4000-8000-000000000004",
        projectId: project.id,
        project,
        number: 4,
        title: "Fix login",
        columnId: columns[1].id,
        priority: "high",
        assigneeId: null,
        estimate: null,
        dueDate: null,
        updatedAt: new Date("2026-11-01T10:00:00Z"),
        createdAt: new Date("2026-10-01T10:00:00Z"),
        createdBy: { username: "ana" },
        categories: [],
        categoryIds: [],
        descriptionJson: markdownToTiptap("Steps to reproduce", "description"),
        descriptionRevision: 3,
        parent: null,
        children: [],
        ...overrides,
    };
}

/** The workspace every tool loads: one project, its states, labels and members. `role` is the caller's. */
function stubWorkspace(role = "member") {
    spyOn(projectsService, "getProjectByKey").mockImplementation((async () => project) as never);
    spyOn(projectsService, "listProjectsForUser").mockImplementation((async () => [project]) as never);
    spyOn(projectsService, "listProjectMembers").mockImplementation((async () => members) as never);
    spyOn(membership, "assertProjectMembership").mockImplementation((async () => role) as never);
    spyOn(membership, "assertProjectAccess").mockImplementation((async (_projectId: string, _userId: string, action = "project.read") => {
        if (!can(role as ProjectRole, action as ProjectAction)) throw new HttpError(403, membership.ROLE_DENIED_MESSAGE);
        return { id: "membership", role };
    }) as never);
    spyOn(columnsService, "listColumns").mockImplementation((async () => columns) as never);
    spyOn(categoriesService, "listCategories").mockImplementation((async () => labels) as never);
}

async function connect(access: "read" | "write" = "write") {
    const server = createMcpServer({ user: ana, baseUrl: "https://rinia.test", client: "claude-code", access });
    const client = new Client({ name: "test", version: "1.0.0" });
    const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
    await Promise.all([server.connect(serverSide), client.connect(clientSide)]);
    return client;
}

async function call(client: Client, name: string, args: Record<string, unknown>) {
    const result = (await client.callTool({ name, arguments: args })) as { isError?: boolean; structuredContent?: Record<string, unknown>; content: Array<{ text: string }> };
    return { isError: result.isError ?? false, text: result.content[0].text, data: result.structuredContent };
}

test("a read-only connection lists only the tools that look, and every tool is typed and closed-world", async () => {
    const writer = (await (await connect("write")).listTools()).tools;
    const reader = (await (await connect("read")).listTools()).tools;
    assert.deepEqual(
        writer.map((tool) => tool.name).sort(),
        ["add_comment", "add_relation", "create_document", "create_issue", "delete_issue", "get_document", "get_issue", "list_documents", "list_issues", "list_my_issues", "list_notifications", "list_projects", "mark_notifications_read", "remove_relation", "restore_issue", "search", "update_document", "update_issue", "update_issues"],
    );
    assert.deepEqual(reader.map((tool) => tool.name).sort(), ["get_document", "get_issue", "list_documents", "list_issues", "list_my_issues", "list_notifications", "list_projects", "search"]);
    for (const tool of writer) {
        assert.equal(tool.annotations?.openWorldHint, false, tool.name);
        assert.equal(tool.outputSchema?.type, "object", tool.name);
    }
});

test("results come as typed structured content and as the same JSON in text", async () => {
    stubWorkspace();
    const result = await call(await connect(), "list_projects", {});
    assert.equal(result.isError, false);
    assert.deepEqual(JSON.parse(result.text), result.data);
    const [listed] = (result.data as { projects: Array<{ key: string; states: Array<{ name: string; kind: string }> }> }).projects;
    assert.equal(listed.key, "RIN");
    assert.deepEqual(listed.states.map((state) => state.kind), ["backlog", "active", "active", "closed"]);
});

test("get_issue returns the description revision that update_issue needs", async () => {
    stubWorkspace();
    spyOn(issuesService, "getIssueOrThrow").mockImplementation((async () => issue()) as never);
    spyOn(issuesService, "listIssueComments").mockImplementation((async () => []) as never);
    spyOn(issuesService, "listIssueRelations").mockImplementation((async () => []) as never);
    const { data } = await call(await connect(), "get_issue", { issue: "RIN-4" });
    assert.equal(data?.descriptionRevision, 3);
    assert.equal(data?.description, "Steps to reproduce");
});

test("get_issue gives an agent an absolute file URL", async () => {
    stubWorkspace();
    const id = "11111111-2222-4333-8444-555555555555";
    spyOn(issuesService, "getIssueOrThrow").mockImplementation((async () => issue({
        descriptionJson: { type: "doc", content: [{ type: "image", attrs: { src: `/api/files/${id}`, alt: "shot" } }] },
    })) as never);
    spyOn(issuesService, "listIssueComments").mockImplementation((async () => []) as never);
    spyOn(issuesService, "listIssueRelations").mockImplementation((async () => []) as never);
    const { data } = await call(await connect(), "get_issue", { issue: "RIN-4" });
    assert.match(String(data?.description), new RegExp(`https://rinia\\.test/api/files/${id}`));
    assert.doesNotMatch(String(data?.description), /\]\(\/api\/files\//);
});

test("changing a description without the revision read is refused before anything is saved", async () => {
    stubWorkspace();
    spyOn(issuesService, "getIssueOrThrow").mockImplementation((async () => issue()) as never);
    const update = spyOn(issuesService, "updateIssue").mockImplementation((async () => ({})) as never);
    const result = await call(await connect(), "update_issue", { issue: "RIN-4", description: "New text" });
    assert.equal(result.isError, true);
    assert.match(result.text, /descriptionRevision: 3/);
    assert.equal(update.mock.calls.length, 0);
});

test("a new issue's description, still at revision 0, can be replaced with that revision", async () => {
    stubWorkspace();
    const fresh = issue({ descriptionRevision: 0, descriptionJson: markdownToTiptap("", "description") });
    spyOn(issuesService, "getIssueOrThrow").mockImplementation((async () => fresh) as never);
    const update = spyOn(issuesService, "updateIssue").mockImplementation((async () => fresh) as never);
    const client = await connect();

    const schema = (await client.listTools()).tools.find((tool) => tool.name === "update_issue")?.inputSchema as {
        properties?: { descriptionRevision?: { minimum?: number; exclusiveMinimum?: number } };
    };
    assert.equal(schema.properties?.descriptionRevision?.minimum, 0);
    assert.equal(schema.properties?.descriptionRevision?.exclusiveMinimum, undefined);

    const result = await call(client, "update_issue", { issue: "RIN-4", description: "First real description", descriptionRevision: 0 });
    assert.equal(result.isError, false, result.text);
    assert.equal((update.mock.calls[0][1] as { expectedDescriptionRevision: number }).expectedDescriptionRevision, 0);
});

test("a new page starts at revision 1, which update_document already accepts", async () => {
    stubWorkspace();
    const page = { id: "d0000000-0000-4000-8000-000000000001", title: "Roadmap", createdBy: ana.sub, updatedAt: new Date("2026-11-01T10:00:00Z") };
    spyOn(documentsService, "listDocuments").mockImplementation((async () => [page]) as never);
    spyOn(documentsService, "getSavedDocument").mockImplementation((async () => ({ ...page, revision: 1, contentJson: markdownToTiptap("Draft", "document") })) as never);
    const write = spyOn(documentsService, "writeDocumentContent").mockImplementation((async () => ({})) as never);
    const result = await call(await connect(), "update_document", { project: "RIN", document: "Roadmap", content: "Published", revision: 1 });
    assert.equal(result.isError, false, result.text);
    assert.equal((write.mock.calls[0][2] as { expectedRevision: number }).expectedRevision, 1);
});

test("the revision the model read is the one checked, and a stale one comes back with the current text", async () => {
    stubWorkspace();
    let current = issue();
    spyOn(issuesService, "getIssueOrThrow").mockImplementation((async () => current) as never);
    const update = spyOn(issuesService, "updateIssue").mockImplementation((async () => {
        // Someone else saved revision 4 in the meantime.
        current = issue({ descriptionRevision: 4, descriptionJson: markdownToTiptap("Steps to reproduce, and a screenshot", "description") });
        throw new HttpError(409, "This issue description was updated elsewhere. Your draft has been kept.");
    }) as never);
    const result = await call(await connect(), "update_issue", { issue: "RIN-4", description: "New text", descriptionRevision: 2 });
    assert.equal((update.mock.calls[0][1] as { expectedDescriptionRevision: number }).expectedDescriptionRevision, 2);
    assert.equal(result.isError, true);
    assert.match(result.text, /now at revision 4/);
    assert.match(result.text, /and a screenshot/);
    assert.match(result.text, /descriptionRevision: 4/);
});

test("list_issues filters in the query and pages with a cursor", async () => {
    stubWorkspace();
    const search = spyOn(issuesService, "searchIssues").mockImplementation((async () => ({ total: 3, issues: [issue(), issue({ number: 5, id: "i5" })] })) as never);
    const client = await connect();

    const first = await call(client, "list_issues", { project: "RIN", assignee: "@bruno", limit: 2 });
    const query = search.mock.calls[0][0] as { columnIds: string[]; assigneeId: string; offset: number; limit: number };
    // "open" by default: every state but the closed one.
    assert.deepEqual(query.columnIds, [columns[0].id, columns[1].id, columns[2].id]);
    assert.equal(query.assigneeId, bruno.id);
    assert.deepEqual([query.offset, query.limit], [0, 2]);
    const page = first.data as { total: number; issues: Array<{ identifier: string; state: string }>; nextCursor: string | null };
    assert.deepEqual(page.issues.map((entry) => entry.identifier), ["RIN-4", "RIN-5"]);
    assert.equal(page.issues[0].state, "A fazer");
    assert.ok(page.nextCursor);

    await call(client, "list_issues", { project: "RIN", state: "em andamento", cursor: page.nextCursor });
    const next = search.mock.calls[1][0] as { columnIds: string[]; offset: number };
    assert.deepEqual(next.columnIds, [columns[2].id]);
    assert.equal(next.offset, 2);

    const unassigned = await call(client, "list_issues", { assignee: "none" });
    assert.equal(unassigned.isError, false);
    assert.equal((search.mock.calls[2][0] as { assigneeId: unknown }).assigneeId, null);

    const badState = await call(client, "list_issues", { state: "Shipped" });
    assert.match(badState.text, /No state matches "Shipped". States: Backlog, A fazer, Em andamento, Concluído/);
    const badCursor = await call(client, "list_issues", { cursor: "not-a-cursor" });
    assert.match(badCursor.text, /not one list_issues returned/);
});

test("update_issues refuses issues from different projects and changes the rest in one call", async () => {
    stubWorkspace();
    const other = { ...project, id: "8b2d1f66-0000-4000-8000-0000000000bb", issueKey: "OPS" };
    spyOn(issuesService, "getIssueOrThrow").mockImplementation((async (identifier: string) => (identifier.startsWith("OPS") ? issue({ projectId: other.id, project: other, id: "o1", number: 1 }) : issue())) as never);
    const bulk = spyOn(issuesService, "bulkUpdateIssues").mockImplementation((async () => [issue({ columnId: columns[3].id })]) as never);
    const client = await connect();

    const mixed = await call(client, "update_issues", { issues: ["RIN-4", "OPS-1"], state: "Concluído" });
    assert.match(mixed.text, /OPS-1 is not in RIN/);
    assert.equal(bulk.mock.calls.length, 0);

    const done = await call(client, "update_issues", { issues: ["RIN-4"], state: "concluido", addLabels: ["bug"] });
    assert.equal(done.isError, false);
    const [projectId, input, actorId, source] = bulk.mock.calls[0] as unknown as [string, { patch: Record<string, unknown> }, string, unknown];
    assert.equal(projectId, project.id);
    assert.deepEqual(input.patch, { columnId: columns[3].id, addCategoryIds: [labels[0].id] });
    assert.equal(actorId, ana.sub);
    assert.deepEqual(source, { via: "mcp", client: "claude-code" });
});

test("relations are added and removed from the first issue's side", async () => {
    stubWorkspace();
    const target = issue({ id: "i7", number: 7, title: "Session cookie" });
    spyOn(issuesService, "getIssueOrThrow").mockImplementation((async (identifier: string) => (identifier === "RIN-7" ? target : issue())) as never);
    const relations = [{ id: "r1", type: "blocks", sourceIssueId: target.id, target: { number: 4, title: "Fix login", project } }];
    spyOn(issuesService, "listIssueRelations").mockImplementation((async () => relations) as never);
    const create = spyOn(issuesService, "createIssueRelation").mockImplementation((async () => ({})) as never);
    const remove = spyOn(issuesService, "deleteIssueRelation").mockImplementation((async () => undefined) as never);
    const client = await connect();

    // RIN-7 blocks RIN-4, so from RIN-4 it reads "blocked_by RIN-7".
    const { data } = await call(client, "add_relation", { issue: "RIN-4", type: "related", target: "RIN-7" });
    assert.deepEqual(create.mock.calls[0].slice(0, 2), [issue().id, { targetIssueIdentifier: target.id, type: "related" }]);
    assert.deepEqual((data as { relations: unknown[] }).relations, [{ type: "blocked_by", issue: "RIN-4", title: "Fix login" }]);

    await call(client, "remove_relation", { issue: "RIN-4", target: "RIN-4", type: "blocked_by" });
    assert.equal(remove.mock.calls[0][0], "r1");
    const missing = await call(client, "remove_relation", { issue: "RIN-4", target: "RIN-7", type: "duplicate" });
    assert.match(missing.text, /no "duplicate" relation with RIN-7/);
});

test("a page is replaced only with the revision read, and appending builds on what is there", async () => {
    stubWorkspace();
    const page = { id: "d0000000-0000-4000-8000-000000000001", title: "Roadmap", createdBy: ana.sub, updatedAt: new Date("2026-11-01T10:00:00Z") };
    spyOn(documentsService, "listDocuments").mockImplementation((async () => [page]) as never);
    spyOn(documentsService, "getSavedDocument").mockImplementation((async () => ({ ...page, revision: 8, contentJson: markdownToTiptap("Q1: ship MCP", "document") })) as never);
    const write = spyOn(documentsService, "writeDocumentContent").mockImplementation((async () => ({})) as never);
    const client = await connect();

    const unread = await call(client, "update_document", { project: "RIN", document: "roadmap", content: "Everything new" });
    assert.match(unread.text, /pass revision: 8/);
    assert.equal(write.mock.calls.length, 0);

    await call(client, "update_document", { project: "RIN", document: "Roadmap", content: "Everything new", revision: 7 });
    assert.equal((write.mock.calls[0][2] as { expectedRevision: number }).expectedRevision, 7);

    const appended = await call(client, "update_document", { project: "RIN", document: "Roadmap", content: "Q2: OAuth", mode: "append" });
    assert.equal(appended.isError, false);
    const sent = write.mock.calls[1][2] as { contentJson: { content: unknown[] }; expectedRevision: number };
    assert.equal(sent.expectedRevision, 8);
    assert.equal(sent.contentJson.content.length, 2);
});

test("issues and pages are readable resources, and the prompts are offered", async () => {
    stubWorkspace();
    spyOn(issuesService, "getIssueOrThrow").mockImplementation((async () => issue({ assigneeId: bruno.id })) as never);
    const client = await connect("read");
    const templates = (await client.listResourceTemplates()).resourceTemplates.map((template) => template.uriTemplate);
    assert.deepEqual(templates.sort(), ["rinia://issue/{identifier}", "rinia://page/{project}/{id}"]);
    const read = await client.readResource({ uri: "rinia://issue/RIN-4" });
    const text = (read.contents[0] as { text: string }).text;
    assert.match(text, /^# RIN-4: Fix login/);
    assert.match(text, /Assignee: bruno/);
    assert.deepEqual((await client.listPrompts()).prompts.map((prompt) => prompt.name).sort(), ["standup", "triage_inbox", "work_on_issue"]);
});
