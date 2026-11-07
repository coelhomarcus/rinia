import { getSchema } from "@tiptap/core";
import Image from "@tiptap/extension-image";
import Link from "@tiptap/extension-link";
import Mention from "@tiptap/extension-mention";
import { TableKit } from "@tiptap/extension-table";
import TaskItem from "@tiptap/extension-task-item";
import TaskList from "@tiptap/extension-task-list";
import type { Mark, Schema } from "@tiptap/pm/model";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import StarterKit from "@tiptap/starter-kit";

/** The URL itself, ignoring protocol and a trailing slash, so `example.com` and `https://example.com/` are one link. */
function urlKey(value: string) {
    return value.trim().replace(/\/+$/, "").replace(/^https?:\/\//i, "").toLowerCase();
}

/**
 * Where a link's text stops being its own URL. A space never belongs to a URL, so `https://a.co hello` keeps the link
 * on `https://a.co` and the rest is ordinary text. A phrase such as "see the docs" is not a URL and stays whole.
 * Returns null when there is nothing to cut.
 */
export function urlLinkCut(text: string, href: string): number | null {
    const match = /^(\S+)(?=\s)/.exec(text);
    const head = match?.[1];
    const key = head ? urlKey(head) : "";
    if (!head || !key || key !== urlKey(href)) return null;
    return head.length;
}

/** Drops the link mark from the space and the words after a URL. The cursor there must not keep typing the link. */
function exitUrlLink(): Plugin {
    return new Plugin({
        key: new PluginKey("exitUrlLink"),
        appendTransaction(transactions, _old, state) {
            if (!transactions.some((tr) => tr.docChanged) || transactions.some((tr) => tr.getMeta("exitUrlLink"))) return null;
            const link = state.schema.marks.link;
            if (!link) return null;
            const runs: { from: number; to: number; text: string; href: string }[] = [];
            state.doc.descendants((node, pos) => {
                if (!node.isText || !node.text) return;
                const mark = link.isInSet(node.marks);
                if (!mark) return;
                const href = String(mark.attrs.href ?? "");
                const from = pos;
                const to = pos + node.text.length;
                const previous = runs[runs.length - 1];
                if (previous && previous.to === from && previous.href === href) {
                    previous.to = to;
                    previous.text += node.text;
                } else runs.push({ from, to, text: node.text, href });
            });
            const tr = state.tr;
            let changed = false;
            for (const run of runs) {
                const cut = urlLinkCut(run.text, run.href);
                if (cut == null || cut >= run.text.length) continue;
                tr.removeMark(run.from + cut, run.to, link);
                changed = true;
            }
            if (!changed) return null;
            const stored = tr.storedMarks ?? state.storedMarks;
            const atCursor = tr.selection.empty ? tr.doc.resolve(tr.selection.from).marks() : null;
            if (stored?.some((mark: Mark) => mark.type === link) && atCursor && !link.isInSet(atCursor)) {
                tr.setStoredMarks(stored.filter((mark: Mark) => mark.type !== link));
            }
            tr.setMeta("exitUrlLink", true);
            return tr;
        },
    });
}

/** Autolink stays on, but the mark does not swallow the space typed after a URL. Tiptap's own link is inclusive whenever autolink is. */
const ExitOnSpaceLink = Link.extend({
    inclusive: () => false,
    addProseMirrorPlugins() {
        return [...(this.parent?.() ?? []), exitUrlLink()];
    },
});

/**
 * The rich text model, without any view code. Pages, issue descriptions and comments share it, each through a profile
 * that says which blocks it allows. The browser extends these with its own behaviour and the API builds the same
 * ProseMirror schema from them, so both sides agree on what a document may contain. It lives apart from the main entry
 * so only the editors and the server load Tiptap.
 */
export const richTextProfiles = ["document", "description", "comment"] as const;
export type RichTextProfile = (typeof richTextProfiles)[number];

export const DocumentImageNode = Image.extend({
    addAttributes() {
        return {
            ...this.parent?.(),
            widthPercent: {
                default: 100,
                parseHTML: (element) => Number(element.getAttribute("data-width-percent")) || 100,
                renderHTML: (attrs) => ({ "data-width-percent": attrs.widthPercent }),
            },
        };
    },
}).configure({ allowBase64: false });

/** Comments have no images yet; pages and descriptions do. */
export function richTextAllowsImages(profile: RichTextProfile) {
    return profile !== "comment";
}

/**
 * The extensions of one profile, by name, so an editor can configure or replace one (the image with its resizable view,
 * the mention with its suggestions) and keep the rest. Only pages resize table columns, and only pages leave undo to the
 * collaboration extension, which undoes what this person typed.
 */
export function richTextExtensionSet(profile: RichTextProfile) {
    return {
        starterKit: StarterKit.configure({ heading: { levels: [1, 2, 3] }, link: false, ...(profile === "document" && { undoRedo: false as const }) }),
        link: ExitOnSpaceLink.configure({ openOnClick: false, autolink: true, defaultProtocol: "https" }),
        taskList: TaskList,
        taskItem: TaskItem.configure({ nested: true }),
        table: TableKit.configure({ table: { resizable: profile === "document", renderWrapper: true, allowTableNodeSelection: true, cellMinWidth: 100 } }),
        mention: Mention.configure({ HTMLAttributes: { class: "mention" } }),
        ...(richTextAllowsImages(profile) && { image: DocumentImageNode }),
    };
}

export function richTextExtensions(profile: RichTextProfile) {
    return Object.values(richTextExtensionSet(profile));
}

const schemas = new Map<RichTextProfile, Schema>();

export function richTextSchema(profile: RichTextProfile): Schema {
    let schema = schemas.get(profile);
    if (!schema) {
        schema = getSchema(richTextExtensions(profile));
        schemas.set(profile, schema);
    }
    return schema;
}

/** The Yjs fragment that holds the page content. `@tiptap/extension-collaboration` uses the same name by default. */
export const DOCUMENT_FRAGMENT = "default";

export const documentExtensions = richTextExtensionSet("document");
export const documentSchema = richTextSchema("document");

const profileNames: Record<RichTextProfile, string> = { document: "a page", description: "an issue description", comment: "a comment" };

export type RichTextCheck = { ok: true } | { ok: false; message: string; unsupported: string[] };

/**
 * Whether `document` is valid Tiptap JSON for `profile`. Editors load content only after this passes, because Tiptap
 * replaces content it cannot read with an empty document, and the next save would then erase it. The API runs the same
 * check before saving, so the message is written for whoever sent the content, people and agents alike.
 */
export function checkRichText(document: unknown, profile: RichTextProfile): RichTextCheck {
    const schema = richTextSchema(profile);
    const unsupported = new Set<string>();
    const visit = (value: unknown) => {
        if (!value || typeof value !== "object") return;
        const node = value as { type?: unknown; marks?: unknown; content?: unknown };
        if (typeof node.type !== "string" || !schema.nodes[node.type]) unsupported.add(String(node.type));
        if (Array.isArray(node.marks)) for (const mark of node.marks) {
            const type = (mark as { type?: unknown } | null)?.type;
            if (typeof type !== "string" || !schema.marks[type]) unsupported.add(String(type));
        }
        if (Array.isArray(node.content)) node.content.forEach(visit);
    };
    visit(document);
    if (unsupported.size) {
        const names = [...unsupported].map((name) => `"${name}"`).join(", ");
        return { ok: false, unsupported: [...unsupported], message: `${names} ${unsupported.size === 1 ? "is" : "are"} not supported in ${profileNames[profile]}.` };
    }
    // An empty document is how the app stores "nothing written yet"; the editor fills in the paragraph it needs.
    if (Array.isArray((document as { content?: unknown[] }).content) && !(document as { content: unknown[] }).content.length) return { ok: true };
    try {
        schema.nodeFromJSON(document).check();
        return { ok: true };
    } catch (error) {
        return { ok: false, unsupported: [], message: `The content is not valid for ${profileNames[profile]}: ${error instanceof Error ? error.message : String(error)}` };
    }
}
