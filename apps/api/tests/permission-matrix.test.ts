import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import type { Server } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, afterEach, beforeAll, beforeEach, mock, spyOn, test } from "bun:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { can, projectActionValues, projectRoleValues, type ProjectAction, type ProjectRole } from "@rinia/shared";
import type { Router } from "express";
import { db } from "../src/db";
import { sessionCookie, stubSessionAccounts } from "./fixtures/sessions";

// The app reads its settings on import; give it what it needs without a local .env.
process.env.JWT_SECRET ??= "test-secret";
process.env.DATABASE_URL ??= "postgres://localhost/unused";
process.env.SPECIAL_REGISTRATION_CODE ??= "test-code";
const { app } = await import("../src/app");
const schema = await import("../src/db/schema");
const { ROLE_DENIED_MESSAGE } = await import("../src/middleware/project-membership.middleware");
const { createMcpServer } = await import("../src/features/mcp/mcp.server");
const { projectsRouter } = await import("../src/features/projects/projects.routes");
const { documentsRouter } = await import("../src/features/documents/documents.routes");
const { issueCommentsRouter, issueRelationsRouter, issuesRouter, projectIssuesRouter } = await import("../src/features/issues/issues.routes");
const { categoriesRouter } = await import("../src/features/categories/categories.routes");
const { columnsRouter } = await import("../src/features/columns/columns.routes");
const { viewPreferencesRouter } = await import("../src/features/view-preferences/view-preferences.routes");
const { viewsRouter } = await import("../src/features/views/views.routes");
const { filesRouter } = await import("../src/features/files/files.routes");
const { favoritesRouter } = await import("../src/features/favorites/favorites.routes");
const { resetRateLimits } = await import("../src/lib/rate-limit");

/**
 * Every role against every project endpoint and every MCP tool. The database is stubbed with rows that let each request
 * get past every lookup, so the only thing that can refuse it is the role (403) or, for a guest, not having the issue or
 * page shared with them (404). Each case expects exactly what `projectPermissions` says.
 */

afterEach(() => mock.restore());

const me = "9c1d2e3f-0000-4000-8000-000000000001";
const other = "9c1d2e3f-0000-4000-8000-000000000002";
const projectId = "9c1d2e3f-0000-4000-8000-0000000000aa";
const issueId = "9c1d2e3f-0000-4000-8000-0000000000b1";
const commentId = "9c1d2e3f-0000-4000-8000-0000000000c1";
const documentId = "9c1d2e3f-0000-4000-8000-0000000000d1";
const viewId = "9c1d2e3f-0000-4000-8000-0000000000e1";
const columnId = "9c1d2e3f-0000-4000-8000-0000000000f1";
const categoryId = "9c1d2e3f-0000-4000-8000-0000000000f2";
const relationId = "9c1d2e3f-0000-4000-8000-0000000000f3";
const revisionId = "9c1d2e3f-0000-4000-8000-0000000000f4";
const fileId = "9c1d2e3f-0000-4000-8000-0000000000f5";
const uploadId = "9c1d2e3f-0000-4000-8000-0000000000f6";
const favoriteId = "9c1d2e3f-0000-4000-8000-0000000000f7";

const doc = { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Hi" }] }] };
const now = () => new Date().toISOString();

/** Who is calling: their role in the project (null for someone outside it), and whether the issue and page are shared with them. */
let caller: { role: ProjectRole | null; shared: boolean } = { role: "member", shared: false };

const project = { id: projectId, name: "Rinia", issueKey: "RIN", description: null, pageContent: "", nextIssueNumber: 5, createdBy: other };
const issueRow = () => ({
    id: issueId, projectId, number: 4, title: "Fix login", columnId, priority: "none", assigneeId: null, estimate: null, dueDate: null, parentIssueId: null, position: 1000,
    descriptionJson: doc, descriptionRevision: 1, createdBy: other, createdAt: new Date(), updatedAt: new Date(), deletedAt: null,
    labels: [], categories: [], categoryIds: [], project, parent: null, children: [], column: { id: columnId, name: "To do" }, assignee: null,
});

/** The row each `findFirst` answers with: one per table, all in the same project. */
function rowFor(table: string): unknown {
    switch (table) {
        case "projects": return project;
        case "issues": return issueRow();
        case "issueComments": return { id: commentId, issueId, authorId: me, parentCommentId: null, contentJson: doc, deletedAt: null, issue: { id: issueId, projectId, assigneeId: null, deletedAt: null }, author: { id: me } };
        case "projectShares": return caller.shared ? { id: "share" } : undefined;
        case "projectDocuments": return { id: documentId, projectId, title: "Page", createdBy: other, contentJson: doc, revision: 1, deletedAt: null, iconAppearance: null, createdAt: new Date(), updatedAt: new Date() };
        case "projectMembers": return { id: "target", projectId, userId: other, role: "member", joinedAt: new Date() };
        case "issueRelations": return { id: relationId, sourceIssueId: issueId, targetIssueId: issueId, type: "related" };
        case "issueDescriptionRevisions": return { id: revisionId, issueId, revision: 1, contentJson: doc, authorId: me, createdAt: new Date() };
        case "views": return { id: viewId, projectId, ownerId: me, shared: false, name: "Mine", filters: {}, owner: { id: me, name: "Me" }, createdAt: new Date(), updatedAt: new Date(), deletedAt: null };
        case "categories": return { id: categoryId, projectId, createdBy: me, name: "Bug", color: null };
        case "boardColumns": return { id: columnId, projectId, name: "To do", position: 1000 };
        case "users": return { id: other, name: "Bruno", username: "bruno", email: "bruno@test.local", avatarUrl: null, locale: "en" };
        case "files": return { id: fileId, projectId, issueId, filename: "a.png", contentType: "image/png", byteSize: 1, issue: { deletedAt: null } };
        case "favorites": return undefined;
        default: return undefined;
    }
}

/** A select, insert, update or delete: every builder method chains, and awaiting it gives `rows()`. */
function chain(rows: () => unknown[]): Record<string, unknown> {
    const query: Record<string, unknown> = {};
    for (const method of ["from", "where", "innerJoin", "rightJoin", "orderBy", "limit", "offset", "groupBy", "having", "as", "values", "set", "returning", "onConflictDoNothing", "onConflictDoUpdate", "$dynamic"]) {
        query[method] = () => query;
    }
    query.then = (resolve: (value: unknown) => unknown, reject: (error: unknown) => unknown) => Promise.resolve(rows()).then(resolve, reject);
    return query;
}

function stubDatabase() {
    stubSessionAccounts();
    // The membership lookup is the one select from projects joined to project_members; selects from issues find the issue.
    spyOn(db, "select").mockImplementation((() => {
        let table: unknown;
        let joined = false;
        const query = chain(() => {
            if (table === schema.projects && joined) return [{ issueKey: "RIN", membership: caller.role ? { id: "membership", projectId, userId: me, role: caller.role, joinedAt: new Date() } : null }];
            if (table === schema.issues) return [issueRow()];
            return [];
        });
        query.from = (from: unknown) => ((table = from), query);
        query.leftJoin = () => ((joined = true), query);
        return query;
    }) as never);
    for (const method of ["insert", "update", "delete"] as const) spyOn(db, method).mockImplementation((() => chain(() => [{ id: "written", ...issueRow() }])) as never);
    spyOn(db, "transaction").mockImplementation((async (work: (tx: typeof db) => unknown) => work(db)) as never);
    spyOn(db, "execute").mockImplementation((async () => ({ rows: [] })) as never);
    for (const [name, table] of Object.entries(db.query)) {
        if (name === "sessions") continue;
        const queries = table as unknown as { findFirst: () => Promise<unknown>; findMany: () => Promise<unknown[]> };
        spyOn(queries, "findFirst").mockImplementation((async () => rowFor(name)) as never);
        spyOn(queries, "findMany").mockImplementation((async () => []) as never);
    }
}

beforeEach(stubDatabase);

let server: Server;
let baseUrl = "";
// The stored file a download serves once the caller may read it.
const uploads = mkdtempSync(path.join(tmpdir(), "rinia-matrix-"));
const previousUploadDir = process.env.UPLOAD_DIR;
beforeAll(async () => {
    process.env.UPLOAD_DIR = uploads;
    server = app.listen(0);
    await new Promise((resolve) => server.once("listening", resolve));
    const address = server.address();
    baseUrl = `http://127.0.0.1:${typeof address === "object" && address ? address.port : 0}`;
});
afterAll(() => {
    server.close();
    process.env.UPLOAD_DIR = previousUploadDir;
    rmSync(uploads, { recursive: true, force: true });
});

/** Who may see the thing a case acts on: the whole project, or one issue or page a guest must have been given. */
type Scope = "project" | "issue" | "document";
interface Endpoint {
    action: ProjectAction;
    scope: Scope;
    url: string;
    body?: unknown;
}

const P = `/api/projects/${projectId}`;
const I = `/api/issues/${issueId}`;

/** Each project route, as Express declares it, with the action its role needs. */
const endpoints: Record<string, Endpoint> = {
    "GET /api/projects/by-key/:key": { action: "project.read", scope: "project", url: "/api/projects/by-key/RIN" },
    "GET /api/projects/:projectId": { action: "project.read", scope: "project", url: P },
    "PATCH /api/projects/:projectId": { action: "project.update", scope: "project", url: P, body: { name: "Renamed" } },
    "DELETE /api/projects/:projectId": { action: "project.delete", scope: "project", url: P },
    "POST /api/projects/:projectId/transfer": { action: "project.transfer", scope: "project", url: `${P}/transfer`, body: { userId: other } },
    "PATCH /api/projects/:projectId/page": { action: "project.page.update", scope: "project", url: `${P}/page`, body: { pageContent: "Hello" } },
    "GET /api/projects/:projectId/stats": { action: "project.stats", scope: "project", url: `${P}/stats` },
    "GET /api/projects/:projectId/files": { action: "project.read", scope: "issue", url: `${P}/files?issueId=${issueId}` },
    "POST /api/projects/:projectId/files": { action: "files.write", scope: "project", url: `${P}/files` },
    "DELETE /api/projects/:projectId/files/:fileId": { action: "files.write", scope: "project", url: `${P}/files/${fileId}` },
    "POST /api/projects/:projectId/files/uploads": { action: "files.write", scope: "project", url: `${P}/files/uploads`, body: {} },
    "PUT /api/projects/:projectId/files/uploads/:uploadId": { action: "files.write", scope: "project", url: `${P}/files/uploads/${uploadId}` },
    "POST /api/projects/:projectId/files/uploads/:uploadId/complete": { action: "files.write", scope: "project", url: `${P}/files/uploads/${uploadId}/complete`, body: {} },
    "GET /api/projects/:projectId/members": { action: "project.read", scope: "project", url: `${P}/members` },
    "GET /api/projects/:projectId/members/lookup": { action: "members.manage", scope: "project", url: `${P}/members/lookup?username=bruno` },
    "POST /api/projects/:projectId/members": { action: "members.manage", scope: "project", url: `${P}/members`, body: { username: "bruno", role: "viewer" } },
    "PATCH /api/projects/:projectId/members/:userId": { action: "members.manage", scope: "project", url: `${P}/members/${other}`, body: { role: "viewer" } },
    "DELETE /api/projects/:projectId/members/:userId": { action: "members.manage", scope: "project", url: `${P}/members/${other}` },

    "GET /api/projects/:projectId/documents/": { action: "project.read", scope: "project", url: `${P}/documents` },
    "POST /api/projects/:projectId/documents/": { action: "pages.write", scope: "project", url: `${P}/documents`, body: { title: "Page" } },
    "GET /api/projects/:projectId/documents/export": { action: "pages.export", scope: "project", url: `${P}/documents/export` },
    "GET /api/projects/:projectId/documents/:documentId/export": { action: "project.read", scope: "document", url: `${P}/documents/${documentId}/export` },
    "GET /api/projects/:projectId/documents/:documentId": { action: "project.read", scope: "document", url: `${P}/documents/${documentId}` },
    "PATCH /api/projects/:projectId/documents/:documentId": { action: "pages.write", scope: "document", url: `${P}/documents/${documentId}`, body: { title: "Renamed" } },
    "DELETE /api/projects/:projectId/documents/:documentId": { action: "pages.write", scope: "document", url: `${P}/documents/${documentId}` },
    "POST /api/projects/:projectId/documents/:documentId/restore": { action: "pages.write", scope: "document", url: `${P}/documents/${documentId}/restore`, body: { deletedAt: now() } },
    "GET /api/projects/:projectId/documents/:documentId/shares": { action: "shares.manage", scope: "document", url: `${P}/documents/${documentId}/shares` },
    "POST /api/projects/:projectId/documents/:documentId/shares": { action: "shares.manage", scope: "document", url: `${P}/documents/${documentId}/shares`, body: { userId: other } },
    "DELETE /api/projects/:projectId/documents/:documentId/shares/:userId": { action: "shares.manage", scope: "document", url: `${P}/documents/${documentId}/shares/${other}` },

    "GET /api/projects/:projectId/issues/": { action: "project.read", scope: "project", url: `${P}/issues` },
    "POST /api/projects/:projectId/issues/": { action: "issues.write", scope: "project", url: `${P}/issues`, body: { title: "New", columnId } },
    "PATCH /api/projects/:projectId/issues/bulk": { action: "issues.write", scope: "project", url: `${P}/issues/bulk`, body: { issueIds: [issueId], patch: { priority: "high" } } },
    "POST /api/projects/:projectId/issues/bulk-delete": { action: "issues.write", scope: "project", url: `${P}/issues/bulk-delete`, body: { issueIds: [issueId] } },
    "POST /api/projects/:projectId/issues/bulk-restore": { action: "issues.write", scope: "project", url: `${P}/issues/bulk-restore`, body: { issueIds: [issueId], deletedAt: now() } },

    "GET /api/projects/:projectId/categories/": { action: "project.read", scope: "project", url: `${P}/categories` },
    "POST /api/projects/:projectId/categories/": { action: "labels.create", scope: "project", url: `${P}/categories`, body: { name: "Bug" } },
    "PATCH /api/projects/:projectId/categories/:categoryId": { action: "labels.create", scope: "project", url: `${P}/categories/${categoryId}`, body: { name: "Defect" } },
    "DELETE /api/projects/:projectId/categories/:categoryId": { action: "labels.create", scope: "project", url: `${P}/categories/${categoryId}` },

    "GET /api/projects/:projectId/columns/": { action: "project.read", scope: "project", url: `${P}/columns` },
    "POST /api/projects/:projectId/columns/": { action: "states.manage", scope: "project", url: `${P}/columns`, body: { name: "Review" } },
    "PATCH /api/projects/:projectId/columns/:columnId": { action: "states.manage", scope: "project", url: `${P}/columns/${columnId}`, body: { name: "Doing" } },
    "DELETE /api/projects/:projectId/columns/:columnId": { action: "states.manage", scope: "project", url: `${P}/columns/${columnId}` },

    "GET /api/projects/:projectId/view-preference/": { action: "project.read", scope: "project", url: `${P}/view-preference` },
    "PATCH /api/projects/:projectId/view-preference/": { action: "project.read", scope: "project", url: `${P}/view-preference`, body: {} },

    "GET /api/projects/:projectId/views/": { action: "project.read", scope: "project", url: `${P}/views` },
    "POST /api/projects/:projectId/views/": { action: "views.create", scope: "project", url: `${P}/views`, body: { name: "Mine", shared: false, filters: {} } },
    "PATCH /api/projects/:projectId/views/:viewId": { action: "views.create", scope: "project", url: `${P}/views/${viewId}`, body: { name: "Renamed" } },
    "DELETE /api/projects/:projectId/views/:viewId": { action: "views.create", scope: "project", url: `${P}/views/${viewId}` },
    "POST /api/projects/:projectId/views/:viewId/restore": { action: "views.create", scope: "project", url: `${P}/views/${viewId}/restore`, body: { deletedAt: now() } },
    "POST /api/projects/:projectId/views/:viewId/duplicate": { action: "views.create", scope: "project", url: `${P}/views/${viewId}/duplicate`, body: {} },

    "GET /api/issues/:issueIdentifier": { action: "project.read", scope: "issue", url: I },
    "PATCH /api/issues/:issueIdentifier": { action: "issues.write", scope: "issue", url: I, body: { title: "Renamed" } },
    "DELETE /api/issues/:issueIdentifier": { action: "issues.write", scope: "issue", url: I },
    "POST /api/issues/:issueIdentifier/restore": { action: "issues.write", scope: "issue", url: "/api/issues/RIN-4/restore", body: { deletedAt: now() } },
    "GET /api/issues/:issueIdentifier/comments": { action: "project.read", scope: "issue", url: `${I}/comments` },
    "POST /api/issues/:issueIdentifier/comments": { action: "comments.write", scope: "issue", url: `${I}/comments`, body: { contentJson: doc } },
    "GET /api/issues/:issueIdentifier/activity": { action: "project.read", scope: "issue", url: `${I}/activity` },
    "GET /api/issues/:issueIdentifier/relations": { action: "project.read", scope: "issue", url: `${I}/relations` },
    "POST /api/issues/:issueIdentifier/relations": { action: "issues.write", scope: "issue", url: `${I}/relations`, body: { targetIssueIdentifier: "RIN-5", type: "related" } },
    "GET /api/issues/:issueIdentifier/description-revisions": { action: "project.read", scope: "issue", url: `${I}/description-revisions` },
    "POST /api/issues/:issueIdentifier/description-revisions/:revisionId/restore": { action: "issues.write", scope: "issue", url: `${I}/description-revisions/${revisionId}/restore` },
    "GET /api/issues/:issueIdentifier/subscription": { action: "issues.follow", scope: "issue", url: `${I}/subscription` },
    "PUT /api/issues/:issueIdentifier/subscription": { action: "issues.follow", scope: "issue", url: `${I}/subscription` },
    "DELETE /api/issues/:issueIdentifier/subscription": { action: "issues.follow", scope: "issue", url: `${I}/subscription` },
    "GET /api/issues/:issueIdentifier/shares": { action: "shares.manage", scope: "issue", url: `${I}/shares` },
    "POST /api/issues/:issueIdentifier/shares": { action: "shares.manage", scope: "issue", url: `${I}/shares`, body: { userId: other } },
    "DELETE /api/issues/:issueIdentifier/shares/:userId": { action: "shares.manage", scope: "issue", url: `${I}/shares/${other}` },

    "PATCH /api/comments/:commentId": { action: "comments.write", scope: "issue", url: `/api/comments/${commentId}`, body: { contentJson: doc } },
    "DELETE /api/comments/:commentId": { action: "comments.write", scope: "issue", url: `/api/comments/${commentId}` },
    "POST /api/comments/:commentId/restore": { action: "comments.write", scope: "issue", url: `/api/comments/${commentId}/restore`, body: { deletedAt: now() } },
    "POST /api/comments/:commentId/reactions": { action: "reactions.write", scope: "issue", url: `/api/comments/${commentId}/reactions`, body: { emoji: "👍" } },
    "DELETE /api/comments/:commentId/reactions/:emoji": { action: "reactions.write", scope: "issue", url: `/api/comments/${commentId}/reactions/${encodeURIComponent("👍")}` },
    "DELETE /api/relations/:relationId": { action: "issues.write", scope: "issue", url: `/api/relations/${relationId}` },

    "GET /api/files/:fileId": { action: "project.read", scope: "issue", url: `/api/files/${fileId}` },
    "POST /api/favorites/": { action: "project.read", scope: "issue", url: "/api/favorites", body: { kind: "issue", projectId, issueId } },
};

/** Routes outside any one project, which every list filters by what the user can see instead. */
const notProjectScoped = new Set([
    "GET /api/projects/", // the user's projects
    "POST /api/projects/", // creating one
    "GET /api/favorites/", // filtered by visibleIssues and visibleDocuments
    "DELETE /api/favorites/:favoriteId", // the user's own favorite
    "POST /api/favorites/:favoriteId/restore",
]);

/** The method and full path of every route the routers declare. */
function declaredRoutes() {
    const mounts: Array<[string, Router]> = [
        ["/api/projects", projectsRouter],
        ["/api/projects/:projectId/documents", documentsRouter],
        ["/api/projects/:projectId/issues", projectIssuesRouter],
        ["/api/projects/:projectId/categories", categoriesRouter],
        ["/api/projects/:projectId/columns", columnsRouter],
        ["/api/projects/:projectId/view-preference", viewPreferencesRouter],
        ["/api/projects/:projectId/views", viewsRouter],
        ["/api/issues", issuesRouter],
        ["/api/comments", issueCommentsRouter],
        ["/api/relations", issueRelationsRouter],
        ["/api/files", filesRouter],
        ["/api/favorites", favoritesRouter],
    ];
    return mounts.flatMap(([prefix, router]) =>
        (router.stack as Array<{ route?: { path: string; methods: Record<string, boolean> } }>).flatMap((layer) =>
            layer.route ? Object.keys(layer.route.methods).map((method) => `${method.toUpperCase()} ${prefix}${layer.route!.path}`) : [],
        ),
    );
}

/** Every role, someone outside the project, and a guest with and without the issue or page shared. */
const callers = [
    ...projectRoleValues.filter((role) => role !== "guest").map((role) => ({ role, shared: false })),
    { role: "guest" as const, shared: false },
    { role: "guest" as const, shared: true },
    { role: null, shared: false },
];

/** What the matrix expects: refused unless the role allows the action and, for a guest, the issue or page was shared. */
function expectedRefused(endpoint: Pick<Endpoint, "action" | "scope">, who: typeof caller) {
    if (!who.role) return true;
    if (who.role === "guest" && endpoint.scope !== "project" && !who.shared) return true;
    return !can(who.role, endpoint.action);
}

const REFUSALS = new Set([ROLE_DENIED_MESSAGE, "You are not a member of this project"]);
const HIDDEN = /^(Issue|Document|File) not found$/;
/** A refusal by role or membership, or a guest kept from what was not shared with them. */
const isRefusal = (status: number, message: string) => (status === 403 && REFUSALS.has(message)) || (status === 404 && HIDDEN.test(message));

test("the permission map is the policy: owner > admin > member > viewer, and guests only comment, react and follow", () => {
    // Written out by hand, so a change to the map has to change this table too.
    const policy: Record<ProjectRole, ProjectAction[]> = {
        owner: [...projectActionValues],
        admin: projectActionValues.filter((action) => action !== "project.delete" && action !== "project.transfer"),
        member: ["project.read", "project.page.update", "project.stats", "labels.create", "issues.readAll", "issues.write", "comments.write", "reactions.write", "issues.follow", "pages.readAll", "pages.write", "pages.export", "files.write", "shares.manage", "views.create", "views.share"],
        viewer: ["project.read", "project.stats", "issues.readAll", "reactions.write", "issues.follow", "pages.readAll", "pages.export", "views.create"],
        guest: ["project.read", "comments.write", "reactions.write", "issues.follow"],
    };
    for (const role of projectRoleValues) {
        assert.deepEqual(projectActionValues.filter((action) => can(role, action)).sort(), [...policy[role]].sort(), role);
    }
    assert.equal(can(null, "project.read"), false);
});

test("every project route is in the matrix", () => {
    const missing = declaredRoutes().filter((route) => !(route in endpoints) && !notProjectScoped.has(route));
    assert.deepEqual(missing, [], "add the new route to the permission matrix");
    const stale = Object.keys(endpoints).filter((route) => !declaredRoutes().includes(route));
    assert.deepEqual(stale, [], "the matrix names a route that no longer exists");
});

test("every role gets exactly what the permission map allows on every endpoint", async () => {
    const wrong: string[] = [];
    for (const [route, endpoint] of Object.entries(endpoints)) {
        const method = route.split(" ")[0]!;
        for (const who of callers) {
            caller = who;
            // Hundreds of refusals in a row would otherwise trip the per-user limits.
            resetRateLimits();
            // Deleting the file, as an allowed role does, removes its bytes; the download needs them back.
            writeFileSync(path.join(uploads, fileId), "x");
            const response = await fetch(`${baseUrl}${endpoint.url}`, {
                method,
                headers: { Cookie: sessionCookie(me), ...(endpoint.body === undefined ? {} : { "Content-Type": "application/json" }) },
                body: endpoint.body === undefined ? undefined : JSON.stringify(endpoint.body),
            });
            const text = await response.text();
            let message = "";
            try {
                message = (JSON.parse(text) as { error?: string }).error ?? "";
            } catch {
                /* A file or an archive. */
            }
            const refused = isRefusal(response.status, message);
            if (refused !== expectedRefused(endpoint, who)) {
                wrong.push(`${route} as ${who.role ?? "outsider"}${who.role === "guest" ? (who.shared ? " (shared)" : " (not shared)") : ""}: expected ${expectedRefused(endpoint, who) ? "refused" : "allowed"}, got ${response.status} ${message}`);
            }
        }
    }
    assert.deepEqual(wrong, []);
});

/** Each MCP tool with arguments that pass its schema, and the action and scope it needs. */
const tools: Record<string, { action: ProjectAction; scope: Scope; args: Record<string, unknown>; project?: false }> = {
    list_projects: { action: "project.read", scope: "project", args: {}, project: false },
    list_issues: { action: "project.read", scope: "project", args: { project: "RIN" } },
    list_my_issues: { action: "project.read", scope: "project", args: {}, project: false },
    get_issue: { action: "project.read", scope: "issue", args: { issue: "RIN-4" } },
    create_issue: { action: "issues.write", scope: "project", args: { project: "RIN", title: "New" } },
    update_issue: { action: "issues.write", scope: "issue", args: { issue: "RIN-4", title: "Renamed" } },
    update_issues: { action: "issues.write", scope: "issue", args: { issues: ["RIN-4"], priority: "high" } },
    delete_issue: { action: "issues.write", scope: "issue", args: { issue: "RIN-4" } },
    restore_issue: { action: "issues.write", scope: "issue", args: { issue: "RIN-4", deletedAt: now() } },
    add_relation: { action: "issues.write", scope: "issue", args: { issue: "RIN-4", target: "RIN-5", type: "related" } },
    remove_relation: { action: "issues.write", scope: "issue", args: { issue: "RIN-4", target: "RIN-5" } },
    add_comment: { action: "comments.write", scope: "issue", args: { issue: "RIN-4", body: "Hi" } },
    list_documents: { action: "project.read", scope: "project", args: { project: "RIN" } },
    get_document: { action: "project.read", scope: "document", args: { project: "RIN", document: documentId } },
    create_document: { action: "pages.write", scope: "project", args: { project: "RIN", title: "Page" } },
    update_document: { action: "pages.write", scope: "document", args: { project: "RIN", document: documentId, title: "Renamed" } },
    search: { action: "project.read", scope: "project", args: { query: "login" }, project: false },
    list_notifications: { action: "project.read", scope: "project", args: {}, project: false },
    mark_notifications_read: { action: "project.read", scope: "project", args: { all: true }, project: false },
};

test("every MCP tool gets exactly what the permission map allows, for every role", async () => {
    const server = createMcpServer({ user: { sub: me, username: "me", isAdmin: false } as never, baseUrl: "https://rinia.test", client: "matrix", access: "write" });
    const client = new Client({ name: "matrix", version: "1.0.0" });
    const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
    await Promise.all([server.connect(serverSide), client.connect(clientSide)]);

    const listed = (await client.listTools()).tools.map((tool) => tool.name).sort();
    assert.deepEqual(listed, Object.keys(tools).sort(), "add the new tool to the permission matrix");

    // The pages a project lists, so a page can be found by id.
    spyOn(db.query.projectDocuments, "findMany").mockImplementation((async () => [rowFor("projectDocuments")]) as never);
    const wrong: string[] = [];
    for (const [name, tool] of Object.entries(tools)) {
        for (const who of callers) {
            // A tool that reads across projects has nothing to refuse: each list is narrowed to what the caller can see.
            if (tool.project === false && !who.role) continue;
            caller = who;
            const result = (await client.callTool({ name, arguments: tool.args })) as { isError?: boolean; content: Array<{ text: string }> };
            const message = result.isError ? result.content[0]!.text : "";
            const refused = result.isError === true && (REFUSALS.has(message) || HIDDEN.test(message));
            if (refused !== expectedRefused(tool, who)) {
                wrong.push(`${name} as ${who.role ?? "outsider"}${who.role === "guest" ? (who.shared ? " (shared)" : " (not shared)") : ""}: expected ${expectedRefused(tool, who) ? "refused" : "allowed"}, got ${message || "ok"}`);
            }
        }
    }
    await client.close();
    assert.deepEqual(wrong, []);
});

const { PgDialect } = await import("drizzle-orm/pg-core");
const { listIssuePage, listMyIssues } = await import("../src/features/issues/issues.service");
const { listDocuments } = await import("../src/features/documents/documents.service");
const { listNotifications } = await import("../src/features/notifications/notifications.service");
const { searchWorkspace } = await import("../src/features/search/search.service");
const dialect = new PgDialect();
const render = (where: unknown) => dialect.sqlToQuery(where as Parameters<typeof dialect.sqlToQuery>[0]);

/** The `where` of each findMany on `table`, rendered, with the real query builder so subqueries render too. */
function captureWhere(table: keyof typeof db.query) {
    mock.restore();
    spyOn(db.query.projects, "findFirst").mockImplementation((async () => project) as never);
    const wheres: Array<{ sql: string; params: unknown[] }> = [];
    spyOn(db.query[table] as unknown as { findMany: () => Promise<unknown[]> }, "findMany").mockImplementation((async (config: { where: unknown }) => {
        wheres.push(render(config.where));
        return [];
    }) as never);
    return wheres;
}

test("a guest's issue list is only what was shared with or assigned to them; a viewer's is the whole project", async () => {
    const wheres = captureWhere("issues");
    await listIssuePage(projectId, { orderBy: "position" }, { userId: me, role: "guest" });
    await listIssuePage(projectId, { orderBy: "position" }, { userId: me, role: "viewer" });
    const [guest, viewer] = wheres;
    assert.match(guest!.sql, /"project_shares"/);
    assert.match(guest!.sql, /"assignee_id" = \$\d+/);
    assert.ok(guest!.params.includes(me));
    assert.doesNotMatch(viewer!.sql, /"project_shares"/);
});

test("a guest's page list is only the pages shared with them", async () => {
    const wheres = captureWhere("projectDocuments");
    await listDocuments(projectId, { userId: me, role: "guest" });
    await listDocuments(projectId, { userId: me, role: "member" });
    assert.match(wheres[0]!.sql, /"project_documents"."id" in \(select "document_id" from "project_shares"/);
    assert.match(wheres[0]!.sql, /"project_members"."role" = \$\d+/);
    assert.doesNotMatch(wheres[1]!.sql, /"project_shares"/);
});

test("my issues, the inbox and search never reach past what a guest was given", async () => {
    const issues = captureWhere("issues");
    await listMyIssues(me, { filter: "following", orderBy: "updated" } as never);
    const notifications: Array<{ sql: string; params: unknown[] }> = [];
    spyOn(db.query.notifications, "findMany").mockImplementation((async (config: { where: unknown }) => (notifications.push(render(config.where)), [])) as never);
    await listNotifications(me);
    // The full-access projects leave out the ones where the user is a guest; the rest is shares and assignments.
    for (const where of [issues[0]!, notifications[0]!]) {
        assert.match(where.sql, /"project_members"."role" <> \$\d+/);
        assert.match(where.sql, /"project_shares"/);
        assert.ok(where.params.includes("guest"));
    }

    const conditions: unknown[] = [];
    const select = db.select.bind(db);
    spyOn(db, "select").mockImplementation(((fields: never) => {
        // The two searches are the selects that name the project; subqueries keep the real builder so they render.
        if (!fields || !("projectName" in (fields as object))) return select(fields);
        const query = chain(() => []);
        query.where = (condition: unknown) => (conditions.push(condition), query);
        return query;
    }) as never);
    resetRateLimits();
    await searchWorkspace(me, "login");
    assert.equal(conditions.length >= 2, true);
    for (const condition of conditions.slice(-2)) {
        const sql = render(condition).sql;
        assert.match(sql, /"project_members"."role" <> \$\d+/);
        assert.match(sql, /"project_shares"/);
    }
});
