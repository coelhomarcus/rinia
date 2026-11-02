import type { RichTextProfile } from "@rinia/shared/src/rich-text-schema";
import type { Editor } from "@tiptap/react";
import { Code2, Heading1, Heading2, Heading3, Image as ImageIcon, List, ListChecks, ListOrdered, type LucideIcon, Minus, Quote, Table2, Type } from "lucide-react";
import i18n from "@/i18n/i18n";
import type { TranslationKey } from "@/i18n/resources";

/**
 * The blocks someone can insert from a slash menu, in one catalog for every editor. Each editor filters it by its
 * profile, so a block shows up wherever the schema allows it and nowhere else.
 */
export interface EditorCommand {
    id: string;
    label: string;
    detail?: string;
    group?: string;
    aliases?: string[];
    /** The profiles that offer this block. Absent means all of them. */
    profiles?: readonly RichTextProfile[];
    run?: (editor: Editor, range: { from: number; to: number }) => void;
}

export const blockCommands: EditorCommand[] = [
    {
        id: "text",
        label: "Text",
        detail: "Plain paragraph",
        group: "Text",
        aliases: ["paragraph", "plain"],
        run: (e, range) => e.chain().focus().deleteRange(range).setParagraph().run(),
    },
    ...([1, 2, 3] as const).map((level) => ({
        id: `heading-${level}`,
        label: `Heading ${level}`,
        detail: "Section heading",
        group: "Text",
        aliases: [`h${level}`, `heading${level}`],
        run: (e: Editor, range: { from: number; to: number }) => e.chain().focus().deleteRange(range).setHeading({ level }).run(),
    })),
    {
        id: "bullet",
        label: "Bullet list",
        detail: "Unordered list",
        group: "Lists",
        aliases: ["bullets", "unordered", "ul"],
        run: (e, range) => e.chain().focus().deleteRange(range).toggleBulletList().run(),
    },
    {
        id: "numbered",
        label: "Numbered list",
        detail: "Ordered list",
        group: "Lists",
        aliases: ["ordered", "number", "ol"],
        run: (e, range) => e.chain().focus().deleteRange(range).toggleOrderedList().run(),
    },
    {
        id: "task",
        label: "To-do list",
        detail: "Checklist",
        group: "Lists",
        aliases: ["todo", "task list", "checklist"],
        run: (e, range) => e.chain().focus().deleteRange(range).toggleTaskList().run(),
    },
    {
        id: "quote",
        label: "Quote",
        detail: "Block quote",
        group: "Blocks",
        aliases: ["blockquote", "citation"],
        run: (e, range) => e.chain().focus().deleteRange(range).toggleBlockquote().run(),
    },
    {
        id: "code",
        label: "Code block",
        detail: "Preformatted text",
        group: "Blocks",
        aliases: ["pre", "codeblock"],
        run: (e, range) => e.chain().focus().deleteRange(range).toggleCodeBlock().run(),
    },
    {
        id: "divider",
        label: "Divider",
        detail: "Horizontal rule",
        group: "Blocks",
        aliases: ["horizontal rule", "hr", "separator"],
        run: (e, range) => e.chain().focus().deleteRange(range).setHorizontalRule().run(),
    },
    {
        id: "image",
        label: "Image",
        detail: "Insert an image URL",
        group: "Media",
        aliases: ["img", "picture", "photo"],
        profiles: ["document", "description"],
        run: (e, range) => e.chain().focus().deleteRange(range).setImage({ src: "", alt: "" }).run(),
    },
    {
        id: "table",
        label: "Table",
        detail: "3 × 3 with a header row",
        group: "Media",
        aliases: ["grid", "tabela"],
        run: (e, range) => e.chain().focus().deleteRange(range).insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run(),
    },
];

const commandKeys: Record<string, [TranslationKey, TranslationKey, TranslationKey]> = {
    text: ["editor.text", "editor.paragraph", "editor.blocks"],
    "heading-1": ["editor.heading", "editor.sectionHeading", "editor.blocks"],
    "heading-2": ["editor.heading", "editor.sectionHeading", "editor.blocks"],
    "heading-3": ["editor.heading", "editor.sectionHeading", "editor.blocks"],
    bullet: ["editor.bulletList", "editor.unorderedList", "editor.lists"],
    numbered: ["editor.numberedList", "editor.orderedList", "editor.lists"],
    task: ["editor.todoList", "editor.checklist", "editor.lists"],
    quote: ["editor.quote", "editor.blockquote", "editor.blocks"],
    code: ["editor.codeBlock", "editor.preformatted", "editor.blocks"],
    divider: ["editor.divider", "editor.horizontalRule", "editor.blocks"],
    image: ["editor.image", "editor.insertImageUrl", "editor.media"],
    table: ["editor.table", "editor.tableDimensions", "editor.media"],
};

function localizeCommand(item: EditorCommand): EditorCommand {
    const keys = commandKeys[item.id];
    if (!keys) return item;
    const headingLevel = item.id.startsWith("heading-") ? Number(item.id.slice(-1)) : undefined;
    const translate = i18n.getFixedT(null, "translation") as unknown as (key: TranslationKey, options?: Record<string, string | number>) => string;
    const label = headingLevel ? translate(keys[0], { level: headingLevel }) : translate(keys[0]);
    return { ...item, label, detail: translate(keys[1]), group: translate(keys[2]) };
}

/** The profile's blocks in the current language, matching `query` in either language or by an alias. */
export function filterBlockCommands(query: string, profile: RichTextProfile) {
    const normalizedQuery = query.trim().toLowerCase();
    const available = blockCommands.filter((command) => !command.profiles || command.profiles.includes(profile));
    const localized = available.map(localizeCommand);
    if (!normalizedQuery) return localized;
    return localized.filter((item, index) => [item.label, item.detail, available[index].label, available[index].detail, ...(item.aliases ?? [])].filter(Boolean).join(" ").toLowerCase().includes(normalizedQuery));
}

/** Runs a command only while its `/query` is still what the menu was opened for, so a late click cannot delete text. */
export function executeBlockCommand(editor: Editor, item: EditorCommand, range: { from: number; to: number }) {
    const { selection, doc } = editor.state;
    if (editor.isDestroyed || !selection.empty || range.from < 0 || range.to < range.from || range.to > doc.content.size) return;
    if (selection.from !== range.to || !doc.textBetween(range.from, range.to, "\n", "\n").startsWith("/")) return;
    item.run?.(editor, range);
}

export const commandIcons: Record<string, LucideIcon> = {
    text: Type,
    "heading-1": Heading1,
    "heading-2": Heading2,
    "heading-3": Heading3,
    bullet: List,
    numbered: ListOrdered,
    task: ListChecks,
    quote: Quote,
    code: Code2,
    divider: Minus,
    image: ImageIcon,
    table: Table2,
};
