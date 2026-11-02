import { Marked, type Token, type TokenizerExtension, type Tokens } from "marked";
import type { TiptapDocument } from "./schemas/issues";

/**
 * The one Markdown converter. Agents write descriptions, comments and pages in Markdown through MCP, and read them back
 * the same way; the app copies issues as Markdown and turns pasted Markdown tables into tables. Parsing uses `marked`
 * (GitHub-flavoured Markdown, no DOM, so it runs the same in Bun and in the browser) and maps its tokens onto the nodes
 * of the shared schema. Writing is ours, so what it writes is exactly what the parser reads back.
 *
 * Supported: paragraphs, headings 1 to 3 (4 to 6 become 3), bold, italic, ~~strike~~, `code`, links, images, bullet,
 * numbered and task lists (nested), quotes, fenced code with a language, dividers, GFM tables, hard line breaks, and
 * mentions written as `[@ id="<user id>" label="<name>"]`. A single line break inside a paragraph is kept as a break.
 */
export type RichTextNode = { type: string; text?: string; attrs?: Record<string, unknown>; marks?: RichTextMark[]; content?: RichTextNode[] };
type RichTextMark = { type: string; attrs?: Record<string, unknown> };

/** Comments have no images, so the converter writes an image there as a link to it. */
export type MarkdownProfile = "document" | "description" | "comment";

// ---------------------------------------------------------------------------------------------------------------------
// Markdown → Tiptap JSON

const mentionTokenizer: TokenizerExtension = {
    name: "mention",
    level: "inline",
    start: (src) => {
        const index = src.indexOf("[@ ");
        return index < 0 ? undefined : index;
    },
    tokenizer(src) {
        const match = /^\[@ ([^\]\n]*)\]/.exec(src);
        if (!match) return undefined;
        const attrs: Record<string, string> = {};
        for (const [, key, value] of match[1].matchAll(/(\w+)="([^"]*)"/g)) attrs[key] = decodeEntities(value);
        if (!attrs.id) return undefined;
        return { type: "mention", raw: match[0], id: attrs.id, label: attrs.label ?? attrs.id };
    },
};

const markdown = new Marked({ gfm: true, extensions: [mentionTokenizer] });

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", "#39": "'" };

function decodeEntities(text: string): string {
    return text.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (entity, name: string) => {
        if (name[0] === "#") {
            const code = name[1].toLowerCase() === "x" ? parseInt(name.slice(2), 16) : parseInt(name.slice(1), 10);
            return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : entity;
        }
        return ENTITIES[name.toLowerCase()] ?? entity;
    });
}

const isBreakTag = (html: string) => /^<br\s*\/?>$/i.test(html.trim());

const MARK_ORDER = ["link", "bold", "italic", "strike", "code"];
const byMarkOrder = (a: RichTextMark, b: RichTextMark) => MARK_ORDER.indexOf(a.type) - MARK_ORDER.indexOf(b.type);

function withMark(nodes: RichTextNode[], mark: RichTextMark): RichTextNode[] {
    return nodes.map((node) => (node.type === "text" ? { ...node, marks: [...(node.marks ?? []), mark].sort(byMarkOrder) } : node));
}

/** A line break inside a paragraph is a break in the editor too, not a space. */
function textNodes(text: string): RichTextNode[] {
    return text.split("\n").flatMap((line, index) => [...(index ? [{ type: "hardBreak" }] : []), ...(line ? [{ type: "text", text: line }] : [])]);
}

function parseInline(tokens: Token[] = []): RichTextNode[] {
    return tokens.flatMap((token): RichTextNode[] => {
        switch (token.type) {
            case "text":
                return "tokens" in token && token.tokens?.length ? parseInline(token.tokens) : textNodes(decodeEntities(token.text));
            case "escape":
                return [{ type: "text", text: token.text }];
            case "strong":
                return withMark(parseInline(token.tokens), { type: "bold" });
            case "em":
                return withMark(parseInline(token.tokens), { type: "italic" });
            case "del":
                return withMark(parseInline(token.tokens), { type: "strike" });
            case "codespan":
                return token.text ? [{ type: "text", text: token.text, marks: [{ type: "code" }] }] : [];
            case "link": {
                const children = parseInline(token.tokens);
                return withMark(children.length ? children : [{ type: "text", text: token.href }], { type: "link", attrs: { href: token.href } });
            }
            case "image":
                return [{ type: "image", attrs: { src: token.href, alt: token.text || null, title: token.title || null } }];
            case "br":
                return [{ type: "hardBreak" }];
            case "html":
                return isBreakTag(token.text) ? [{ type: "hardBreak" }] : textNodes(token.text);
            case "mention":
                return [{ type: "mention", attrs: { id: token.id, label: token.label } }];
            case "checkbox":
                return [];
            default:
                return "text" in token && typeof token.text === "string" ? textNodes(decodeEntities(token.text)) : [];
        }
    });
}

function sameMarks(a: RichTextMark[] = [], b: RichTextMark[] = []) {
    return a.length === b.length && a.every((mark, index) => mark.type === b[index].type && JSON.stringify(mark.attrs ?? null) === JSON.stringify(b[index].attrs ?? null));
}

/** Joins neighbouring text with the same marks and drops empty text, as the editor itself would. */
function tidyInline(nodes: RichTextNode[]): RichTextNode[] {
    const result: RichTextNode[] = [];
    for (const node of nodes) {
        if (node.type === "text" && !node.text) continue;
        const previous = result[result.length - 1];
        if (node.type === "text" && previous?.type === "text" && sameMarks(previous.marks, node.marks)) previous.text += node.text ?? "";
        else result.push(node.type === "text" && !node.marks?.length ? { type: "text", text: node.text } : { ...node });
    }
    while (result[result.length - 1]?.type === "hardBreak") result.pop();
    return result;
}

const paragraph = (content: RichTextNode[]): RichTextNode => (content.length ? { type: "paragraph", content } : { type: "paragraph" });

/**
 * Images are blocks in the schema but inline in Markdown, so a paragraph with an image is split around it. Where images
 * are not allowed, the image becomes a link to it.
 */
function inlineBlocks(content: RichTextNode[], profile: MarkdownProfile): RichTextNode[] {
    const blocks: RichTextNode[] = [];
    let run: RichTextNode[] = [];
    let afterImage = false;
    // Text beside an image is trimmed where the image was, since that space separated the two.
    const flush = (beforeImage: boolean) => {
        const tidy = tidyInline(run);
        while (tidy[0]?.type === "hardBreak") tidy.shift();
        const first = tidy[0];
        const last = tidy[tidy.length - 1];
        if (afterImage && first?.type === "text") first.text = first.text?.trimStart();
        if (beforeImage && last?.type === "text") last.text = last.text?.trimEnd();
        const kept = tidy.filter((node) => node.type !== "text" || node.text);
        if (kept.length) blocks.push(paragraph(kept));
        run = [];
    };
    for (const node of content) {
        if (node.type !== "image") {
            run.push(node);
            continue;
        }
        const src = String(node.attrs?.src ?? "");
        if (profile === "comment") {
            run.push({ type: "text", text: String(node.attrs?.alt || src), marks: [{ type: "link", attrs: { href: src } }] });
            continue;
        }
        flush(true);
        blocks.push(node);
        afterImage = true;
    }
    flush(false);
    return blocks.length ? blocks : [paragraph([])];
}

function tableCell(type: "tableHeader" | "tableCell", cell: Tokens.TableCell): RichTextNode {
    const content = tidyInline(parseInline(cell.tokens).filter((node) => node.type !== "image"));
    return { type, content: [paragraph(content)] };
}

/** A list item starts with a paragraph in the schema, even when its Markdown starts with a nested list. */
function listItemContent(item: Tokens.ListItem, profile: MarkdownProfile, keepCheckbox = false): RichTextNode[] {
    const blocks = parseBlocks(item.tokens, profile);
    // In a list where only some items have a checkbox, the checkbox stays as the text it was.
    if (keepCheckbox && item.task) {
        const box = { type: "text", text: item.checked ? "[x] " : "[ ] " };
        if (blocks[0]?.type === "paragraph") blocks[0] = paragraph(tidyInline([box, ...(blocks[0].content ?? [])]));
        else blocks.unshift(paragraph([box]));
    }
    return blocks[0]?.type === "paragraph" ? blocks : [paragraph([]), ...blocks];
}

function parseBlocks(tokens: Token[], profile: MarkdownProfile): RichTextNode[] {
    return tokens.flatMap((token): RichTextNode[] => {
        switch (token.type) {
            case "space":
            case "def":
            case "checkbox":
                return [];
            case "heading":
                return [{ type: "heading", attrs: { level: Math.min(3, token.depth) }, content: tidyInline(parseInline(token.tokens).filter((node) => node.type !== "image")) }];
            case "paragraph":
                return inlineBlocks(parseInline(token.tokens), profile);
            case "text":
                return inlineBlocks("tokens" in token && token.tokens?.length ? parseInline(token.tokens) : textNodes(decodeEntities(token.text)), profile);
            case "code": {
                const text = token.text.replace(/\n$/, "");
                return [{ type: "codeBlock", attrs: { language: token.lang?.trim().split(/\s+/)[0] || null }, ...(text && { content: [{ type: "text", text }] }) }];
            }
            case "blockquote": {
                const content = parseBlocks(token.tokens ?? [], profile);
                return [{ type: "blockquote", content: content.length ? content : [paragraph([])] }];
            }
            case "hr":
                return [{ type: "horizontalRule" }];
            case "list": {
                const items = token.items as Tokens.ListItem[];
                if (items.length && items.every((item) => item.task))
                    return [{ type: "taskList", content: items.map((item) => ({ type: "taskItem", attrs: { checked: !!item.checked }, content: listItemContent(item, profile) })) }];
                const content = items.map((item) => ({ type: "listItem", content: listItemContent(item, profile, true) }));
                if (!token.ordered) return [{ type: "bulletList", content }];
                const start = Number(token.start);
                return [{ type: "orderedList", attrs: { start: Number.isInteger(start) ? start : 1 }, content }];
            }
            case "table": {
                const table = token as Tokens.Table;
                const header = { type: "tableRow", content: table.header.map((cell) => tableCell("tableHeader", cell)) };
                const rows = table.rows.map((row) => ({ type: "tableRow", content: row.map((cell) => tableCell("tableCell", cell)) }));
                return [{ type: "table", content: [header, ...rows] }];
            }
            case "html":
                return token.text.trim() ? [paragraph(tidyInline(textNodes(token.text.trim())))] : [];
            default:
                return "text" in token && typeof token.text === "string" && token.text.trim() ? [paragraph(tidyInline(textNodes(token.text)))] : [];
        }
    });
}

export function markdownToTiptap(source: string | null | undefined, profile: MarkdownProfile = "document"): TiptapDocument {
    const text = (source ?? "").replace(/\r\n?/g, "\n");
    return { type: "doc", content: parseBlocks(markdown.lexer(text), profile) };
}

/** Whether pasted plain text is a Markdown table, which the editors turn into a table rather than lines of pipes. */
export function isMarkdownTable(text: string): boolean {
    const lines = text.trim().split(/\r?\n/);
    return lines.length >= 2 && lines[0].includes("|") && /^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$/.test(lines[1]);
}

// ---------------------------------------------------------------------------------------------------------------------
// Tiptap JSON → Markdown

const DELIMITERS: Record<string, string> = { bold: "**", italic: "*", strike: "~~" };

function escapeText(text: string, inTable: boolean): string {
    let escaped = text
        .replace(/[\\`*[\]~]/g, "\\$&")
        .replace(/_/g, (match, offset: number, whole: string) => (/[\p{L}\p{N}]/u.test(whole[offset - 1] ?? "") && /[\p{L}\p{N}]/u.test(whole[offset + 1] ?? "") ? match : "\\_"))
        .replace(/<(?=[A-Za-z/!?])/g, "\\<")
        .replace(/&(?=#?\w+;)/g, "\\&");
    if (inTable) escaped = escaped.replace(/\|/g, "\\|");
    return escaped;
}

/** Whatever would start a block at the beginning of a line is escaped, so a paragraph that says "1. x" stays one. */
function escapeLineStarts(line: string): string {
    return line
        .replace(/^(\s{0,3})(#{1,6})(?=\s|$)/, "$1\\$2")
        .replace(/^(\s{0,3})([-+>])(?=\s|$)/, "$1\\$2")
        .replace(/^(\s{0,3})>/, "$1\\>")
        .replace(/^(\s{0,3}\d{1,9})([.)])(?=\s|$)/, "$1\\$2")
        .replace(/^(\s{0,3})([-=])(?=\2*\s*$)/, "$1\\$2");
}

function codeSpan(text: string): string {
    const longest = Math.max(0, ...(text.match(/`+/g) ?? []).map((run) => run.length));
    const fence = "`".repeat(longest + 1);
    const pad = text.startsWith("`") || text.endsWith("`") ? " " : "";
    return `${fence}${pad}${text}${pad}${fence}`;
}

function destination(href: string): string {
    let depth = 0;
    for (const character of href) {
        depth += character === "(" ? 1 : character === ")" ? -1 : 0;
        if (depth < 0) break;
    }
    return /[\s<>]/.test(href) || depth !== 0 ? `<${href.replace(/[<>]/g, (c) => encodeURI(c))}>` : href;
}

const mentionAttr = (value: unknown) => String(value ?? "").replace(/&/g, "&amp;").replace(/"/g, "&quot;");

function mentionMarkdown(attrs: Record<string, unknown> = {}): string {
    const label = attrs.label ?? attrs.id;
    return `[@ id="${mentionAttr(attrs.id)}"${label ? ` label="${mentionAttr(label)}"` : ""}]`;
}

const sortMarks = (marks: RichTextMark[] = []) => marks.filter((mark) => MARK_ORDER.includes(mark.type)).sort(byMarkOrder);
const markEquals = (a: RichTextMark, b: RichTextMark) => a.type === b.type && (a.type !== "link" || a.attrs?.href === b.attrs?.href);

/**
 * Inline content with its marks. Marks stay open across neighbouring text that shares them, so `**a *b***` is not
 * written as `**a****b**`, and spaces at a mark's edges move outside it, where Markdown expects them.
 */
function inlineMarkdown(nodes: RichTextNode[] = [], inTable = false): string {
    let output = "";
    let active: RichTextMark[] = [];
    let trailing = "";
    const close = (mark: RichTextMark) => (mark.type === "link" ? `](${destination(String(mark.attrs?.href ?? ""))})` : (DELIMITERS[mark.type] ?? ""));
    const open = (mark: RichTextMark) => (mark.type === "link" ? "[" : (DELIMITERS[mark.type] ?? ""));
    const settle = (next: RichTextMark[]) => {
        let keep = 0;
        while (keep < active.length && next.some((mark) => markEquals(mark, active[keep]))) keep += 1;
        for (const mark of active.slice(keep).reverse()) output += close(mark);
        active = active.slice(0, keep);
        output += trailing;
        trailing = "";
    };
    nodes.forEach((node, index) => {
        const marks = node.type === "text" ? sortMarks(node.marks).filter((mark) => mark.type !== "code") : [];
        settle(marks);
        if (node.type !== "text") {
            if (node.type === "hardBreak") output += inTable ? "<br>" : "\\\n";
            else if (node.type === "mention") output += mentionMarkdown(node.attrs);
            else if (node.type === "image") output += imageMarkdown(node);
            else output += inlineMarkdown(node.content, inTable);
            return;
        }
        let text = node.text ?? "";
        const opening = marks.filter((mark) => !active.some((current) => markEquals(current, mark)));
        if (opening.length) {
            const lead = /^\s*/.exec(text)?.[0] ?? "";
            output += lead;
            text = text.slice(lead.length);
        }
        output += opening.map(open).join("");
        active = [...active, ...opening];
        const next = nodes[index + 1];
        const nextMarks = next?.type === "text" ? sortMarks(next.marks) : [];
        if (active.some((mark) => !nextMarks.some((other) => markEquals(other, mark)))) {
            trailing = /\s*$/.exec(text)?.[0] ?? "";
            text = text.slice(0, text.length - trailing.length);
        }
        const isCode = node.marks?.some((mark) => mark.type === "code");
        // A table splits cells on every unescaped pipe, even inside code.
        output += isCode ? (inTable ? codeSpan(text).replace(/\|/g, "\\|") : codeSpan(text)) : escapeText(text, inTable);
    });
    settle([]);
    return output;
}

function imageMarkdown(node: RichTextNode): string {
    const alt = String(node.attrs?.alt ?? "").replace(/[\\[\]]/g, "\\$&");
    const src = String(node.attrs?.src ?? "");
    return src ? `![${alt}](${destination(src)})` : "";
}

const indentLines = (text: string, indent: string) => text.split("\n").map((line, index) => (index && line ? indent + line : line)).join("\n");

function paragraphMarkdown(node: RichTextNode): string {
    return inlineMarkdown(node.content).split("\n").map(escapeLineStarts).join("\n");
}

function listMarkdown(node: RichTextNode, marker: (item: RichTextNode, index: number) => string): string {
    return (node.content ?? [])
        .map((item, index) => {
            const prefix = marker(item, index);
            const blocks = item.content ?? [];
            const body = blocks
                .map((block, blockIndex) => (blockIndex === 0 ? "" : /List$/.test(block.type) ? "\n" : "\n\n") + blockMarkdown(block))
                .join("");
            // Nested blocks line up with the item's text, which for a task starts before its checkbox.
            const indent = " ".repeat(prefix.replace(/\[[ x]\] $/, "").length);
            return prefix + indentLines(body, indent);
        })
        .join("\n");
}

function tableMarkdown(node: RichTextNode): string {
    const rows = (node.content ?? []).map((row) =>
        (row.content ?? []).map((cell) =>
            (cell.content ?? [])
                .map((block) => (block.type === "paragraph" || block.type === "heading" ? inlineMarkdown(block.content, true) : inlineMarkdown(flattenInline(block), true)))
                .filter(Boolean)
                .join("<br>")
                .trim(),
        ),
    );
    const width = Math.max(0, ...rows.map((row) => row.length));
    if (!width) return "";
    const line = (cells: string[]) => `| ${Array.from({ length: width }, (_, index) => cells[index] ?? "").join(" | ")} |`;
    return [line(rows[0]), line(Array.from({ length: width }, () => "---")), ...rows.slice(1).map(line)].join("\n");
}

/** The text of a block that cannot sit in a table cell, such as a list, with its blocks separated by breaks. */
function flattenInline(node: RichTextNode): RichTextNode[] {
    if (node.type === "text" || node.type === "mention" || node.type === "hardBreak") return [node];
    const children = node.content ?? [];
    const isBlockParent = children.some((child) => child.type !== "text" && child.type !== "mention" && child.type !== "hardBreak");
    return children.flatMap((child, index) => [...(isBlockParent && index ? [{ type: "hardBreak" }] : []), ...flattenInline(child)]);
}

/**
 * Two lists in a row with the same marker are one list in Markdown, so the second of a pair uses the other marker:
 * `*` for bullets and tasks, `1)` for numbers.
 */
function blockMarkdown(node: RichTextNode, alternate = false): string {
    const bullet = alternate ? "* " : "- ";
    switch (node.type) {
        case "paragraph":
            return paragraphMarkdown(node);
        case "heading": {
            const level = Math.max(1, Math.min(3, Number(node.attrs?.level) || 1));
            return `${"#".repeat(level)} ${inlineMarkdown(node.content).replace(/\\\n/g, " ")}`.trimEnd();
        }
        case "bulletList":
            return listMarkdown(node, () => bullet);
        case "orderedList": {
            const start = Number(node.attrs?.start) || 1;
            return listMarkdown(node, (_item, index) => `${start + index}${alternate ? ")" : "."} `);
        }
        case "taskList":
            return listMarkdown(node, (item) => `${bullet}${item.attrs?.checked ? "[x]" : "[ ]"} `);
        case "blockquote": {
            const body = blocksMarkdown(node.content);
            return (body || "")
                .split("\n")
                .map((line) => (line ? `> ${line}` : ">"))
                .join("\n");
        }
        case "codeBlock": {
            const text = (node.content ?? []).map((child) => child.text ?? "").join("");
            const fence = "`".repeat(Math.max(3, ...(text.match(/^`{3,}/gm) ?? []).map((run) => run.length + 1)));
            return `${fence}${String(node.attrs?.language ?? "")}\n${text}\n${fence}`;
        }
        case "horizontalRule":
            return "---";
        case "image":
            return imageMarkdown(node);
        case "table":
            return tableMarkdown(node);
        case "text":
        case "mention":
        case "hardBreak":
            return inlineMarkdown([node]);
        default:
            return (node.content ?? []).some((child) => child.type === "text") ? inlineMarkdown(node.content) : blocksMarkdown(node.content);
    }
}

const listFamily = (type: string) => (type === "bulletList" || type === "taskList" ? "bullet" : type === "orderedList" ? "ordered" : null);

function blocksMarkdown(nodes: RichTextNode[] = []): string {
    const parts: string[] = [];
    let previous: { family: string | null; alternate: boolean } = { family: null, alternate: false };
    for (const node of nodes) {
        const family = listFamily(node.type);
        const alternate = !!family && previous.family === family && !previous.alternate;
        const text = blockMarkdown(node, alternate);
        // An empty paragraph writes nothing, so it does not separate two lists either.
        if (!text.trim()) continue;
        parts.push(text);
        previous = { family, alternate };
    }
    return parts.join("\n\n");
}

/** Renders Tiptap JSON as Markdown, the reverse of `markdownToTiptap`, for readers outside the editor such as AI tools. */
export function tiptapToMarkdown(document: { content?: unknown[] } | null | undefined): string {
    return blocksMarkdown((document?.content ?? []) as RichTextNode[]);
}
