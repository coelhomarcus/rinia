/**
 * One request stays at 8 MB. Cloudflare refuses a proxied body over 100 MB on Free and Pro,
 * 200 MB on Business, and the zone can set the ceiling even lower. A long upload can also
 * die on the proxy timeout before it reaches that cap, so anything larger than one chunk
 * goes as several requests.
 * https://developers.cloudflare.com/support/troubleshooting/http-status-codes/4xx-client-error/error-413/
 */
export const UPLOAD_CHUNK_BYTES = 8 * 1024 * 1024;

const STORED_FILE_PATH = /^\/api\/files\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;

/** A file this server stored. The browser loads it from the same host; agents receive the absolute form. */
export function isStoredFilePath(value: string): boolean {
    return STORED_FILE_PATH.test(value.trim());
}

/** The id in a stored file path, or in an absolute URL whose path is one. */
export function storedFileId(value: string): string | null {
    const trimmed = value.trim();
    const relative = STORED_FILE_PATH.exec(trimmed);
    if (relative) return relative[1];
    return /^https?:\/\/[^/?#\s]+\/api\/files\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\/?(?:[?#].*)?$/i.exec(trimmed)?.[1] ?? null;
}

/**
 * Image sources an issue description may keep. An uploaded file is a path on this server.
 * Anything else has to be a web URL, so `javascript:`, `data:` and `file:` stay out.
 */
export function isAllowedIssueImageSource(value: string): boolean {
    const src = value.trim();
    if (isStoredFilePath(src)) return true;
    return /^https?:\/\/\S+$/i.test(src);
}

/** Turns `/api/files/<id>` into an absolute URL. Other addresses are left as written. */
export function absoluteFileReference(value: string, origin: string): string {
    const base = origin.replace(/\/$/, "");
    if (!base || !isStoredFilePath(value)) return value;
    return `${base}${value.trim()}`;
}

/** Rewrites stored-file links inside Markdown the same way. */
export function absoluteStoredFileUrls(markdown: string, origin: string): string {
    const base = origin.replace(/\/$/, "");
    if (!base) return markdown;
    return markdown.replace(/\]\((\/api\/files\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\)/gi, `](${base}$1)`);
}

/** Ids of stored files referenced by an image or a link in a document. */
export function storedFileIds(document: { content?: unknown[] } | null | undefined): string[] {
    const ids = new Set<string>();
    const visit = (nodes: unknown[]) => {
        for (const candidate of nodes) {
            if (!candidate || typeof candidate !== "object") continue;
            const node = candidate as { type?: unknown; attrs?: { src?: unknown }; marks?: unknown[]; content?: unknown[] };
            if (node.type === "image" && typeof node.attrs?.src === "string") {
                const id = storedFileId(node.attrs.src);
                if (id) ids.add(id);
            }
            for (const mark of node.marks ?? []) {
                if (!mark || typeof mark !== "object") continue;
                const href = (mark as { attrs?: { href?: unknown } }).attrs?.href;
                if (typeof href === "string") {
                    const id = storedFileId(href);
                    if (id) ids.add(id);
                }
            }
            if (Array.isArray(node.content)) visit(node.content);
        }
    };
    visit(document?.content ?? []);
    return [...ids];
}
