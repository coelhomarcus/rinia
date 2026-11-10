import { documentSlug, slugify, tiptapToMarkdown } from "@rinia/shared";
import { zipStore } from "../../lib/zip";

/** The page body, in the Markdown `update_document` reads. Image links stay `/api/files/<id>`, which is what the page stores. */
export function documentMarkdown(content: { content?: unknown[] } | null | undefined) {
    return tiptapToMarkdown(content);
}

/** `overview-notes-222222222222.md`: the same slug the page URL uses, so two titles never collide. */
export function markdownFilename(document: { id: string; title: string }) {
    return `${documentSlug(document)}.md`;
}

export function attachmentDisposition(filename: string) {
    const ascii = filename.replace(/[^\x20-\x7E]/g, "_").replace(/["\\]/g, "_");
    return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}

export interface ExportPage {
    id: string;
    title: string;
    contentJson: { content?: unknown[] } | null;
}

/** One Markdown file per page. Pages are not nested, so the archive is flat. */
export function projectMarkdownZip(pages: ExportPage[]) {
    return zipStore(
        pages.map((page) => ({
            name: markdownFilename(page),
            data: Buffer.from(documentMarkdown(page.contentJson), "utf8"),
        })),
    );
}

export function projectExportFilename(issueKey: string | null | undefined) {
    const key = slugify(issueKey ?? "");
    return key ? `${key}-pages.zip` : "pages.zip";
}
