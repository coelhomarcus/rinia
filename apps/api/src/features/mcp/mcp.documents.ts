import { appPaths, createDocumentSchema, markdownToTiptap, matchDocumentSlug, tiptapToMarkdown, type TiptapDocument } from "@rinia/shared";
import { z } from "zod";
import { HttpError } from "../../lib/http-error";
import { createDocument, getSavedDocument, listDocuments, updateDocument, writeDocumentContent } from "../documents/documents.service";
import { matchByName, outputs, type McpContext, type Workspace } from "./mcp.context";

/** Appending is rebuilt from the page as it stands; this many tries ride out someone saving at the same moment. */
const APPEND_ATTEMPTS = 3;

const pageOutput = { ...outputs.page.shape, revision: z.number().describe("Pass this to update_document to replace the content."), updatedAt: z.string(), content: z.string() };

export function registerDocumentTools(context: McpContext) {
    const { tool, user, source, link, projectByKey, projectsOrAll } = context;
    const pageUrl = (space: Workspace, document: { id: string; title: string }) => link(appPaths.document(space.project.issueKey, document));

    /** A page by its id, URL, slug or title. */
    async function findPage(space: Workspace, reference: string) {
        const documents = await listDocuments(space.project.id);
        const cleaned = reference.trim().replace(/[?#].*$/, "").replace(/\/+$/, "");
        const match = matchDocumentSlug(cleaned.slice(cleaned.lastIndexOf("/") + 1), documents) ?? matchByName(documents, cleaned, (document) => document.title)[0];
        if (!match) throw new HttpError(404, `${space.project.issueKey} has no page "${reference}". Its pages are: ${documents.map((document) => document.title).join(", ") || "none"}.`);
        return match;
    }

    function describe(space: Workspace, document: { id: string; title: string; revision: number; updatedAt: Date; contentJson: Parameters<typeof tiptapToMarkdown>[0] }) {
        return {
            id: document.id,
            title: document.title,
            project: space.project.issueKey,
            url: pageUrl(space, document),
            revision: document.revision,
            updatedAt: document.updatedAt.toISOString(),
            content: tiptapToMarkdown(document.contentJson),
        };
    }

    tool(
        "list_documents",
        {
            title: "List pages",
            description: "Lists the pages (documents) of a project, or of every project you can see, without their content.",
            inputSchema: { project: z.string().optional().describe("Project key, such as RIN. Leave out to list every project's pages.") },
            outputSchema: { documents: z.array(outputs.page.extend({ createdBy: z.string().nullable(), updatedAt: z.string() })) },
            annotations: { readOnlyHint: true },
        },
        async (args) => {
            const spaces = await projectsOrAll(args.project);
            const lists = await Promise.all(
                spaces.map(async (space) =>
                    (await listDocuments(space.project.id)).map((document) => ({
                        id: document.id,
                        title: document.title,
                        project: space.project.issueKey,
                        url: pageUrl(space, document),
                        createdBy: space.username(document.createdBy),
                        updatedAt: document.updatedAt.toISOString(),
                    })),
                ),
            );
            return { documents: lists.flat() };
        },
    );

    tool(
        "get_document",
        {
            title: "Get a page",
            description: "Reads a project page (document) as Markdown, including edits people are making right now. Keep revision: update_document needs it to replace the content.",
            inputSchema: {
                project: z.string().describe("Project key, such as RIN."),
                document: z.string().describe("The page's id, its URL or slug, or its title."),
            },
            outputSchema: pageOutput,
            annotations: { readOnlyHint: true },
        },
        async (args) => {
            const space = await projectByKey(args.project);
            const match = await findPage(space, args.document);
            return describe(space, await getSavedDocument(space.project.id, match.id));
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
                content: z.string().optional().describe("Markdown, including tables, task lists and images."),
            },
            outputSchema: outputs.page.shape,
            annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
        },
        async (args) => {
            const space = await projectByKey(args.project);
            const input = createDocumentSchema.parse({ title: args.title, contentJson: markdownToTiptap(args.content, "document") });
            const document = await createDocument(space.project.id, user.sub, input, source);
            return { id: document.id, title: document.title, project: space.project.issueKey, url: pageUrl(space, document) };
        },
    );

    tool(
        "update_document",
        {
            title: "Update a page",
            description:
                'Changes a page\'s title or content. People who have the page open see the change arrive as they would a collaborator\'s. mode "append" adds the Markdown at the end and needs no revision. mode "replace" (the default) rewrites the whole page and needs the revision get_document returned: if the page changed since, nothing changes and the error asks you to read it again.',
            inputSchema: {
                project: z.string().describe("Project key, such as RIN."),
                document: z.string().describe("The page's id, its URL or slug, or its title."),
                title: z.string().trim().min(1).max(200).optional(),
                content: z.string().optional().describe("Markdown, including tables, task lists and images."),
                mode: z.enum(["replace", "append"]).optional(),
                revision: z.number().int().positive().optional().describe("Required to replace the content: the revision from get_document."),
            },
            outputSchema: pageOutput,
            annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
        },
        async (args) => {
            const space = await projectByKey(args.project);
            const match = await findPage(space, args.document);
            if (args.title === undefined && args.content === undefined) throw new HttpError(400, "Choose something to change: title or content.");
            const mode = args.mode ?? "replace";
            if (args.content !== undefined && mode === "replace" && args.revision === undefined) {
                throw new HttpError(400, `To replace the content of "${match.title}", pass revision: ${(await getSavedDocument(space.project.id, match.id)).revision} (from get_document), after reading the page so you keep what others wrote. Or use mode "append" to add to the end.`);
            }
            if (args.title !== undefined) await updateDocument(space.project.id, match.id, user.sub, { title: args.title });
            if (args.content !== undefined) {
                const added = markdownToTiptap(args.content, "document");
                if (mode === "replace") await writeDocumentContent(space.project.id, match.id, { contentJson: added, expectedRevision: args.revision });
                else await appendTo(space, match.id, added);
            }
            return describe(space, await getSavedDocument(space.project.id, match.id));
        },
    );

    /** Adds blocks after the page's last one, retrying when someone saves between the read and the write. */
    async function appendTo(space: Workspace, documentId: string, added: TiptapDocument) {
        for (let attempt = 1; ; attempt++) {
            const current = await getSavedDocument(space.project.id, documentId);
            const contentJson = { type: "doc" as const, content: [...(current.contentJson.content ?? []), ...(added.content ?? [])] };
            try {
                return await writeDocumentContent(space.project.id, documentId, { contentJson, expectedRevision: current.revision });
            } catch (error) {
                if (!(error instanceof HttpError) || error.statusCode !== 409 || attempt >= APPEND_ATTEMPTS) throw error;
            }
        }
    }
}
