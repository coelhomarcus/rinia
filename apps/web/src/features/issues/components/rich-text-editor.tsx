import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { TiptapDocument } from "@rinia/shared";
import { checkRichText, richTextAllowsImages, richTextExtensionSet } from "@rinia/shared/src/rich-text-schema";
import { Bold, Check, CheckSquare, Code2, Heading2, ImagePlus, Italic, Link2, List, ListOrdered, Minus, MoreHorizontal, Quote, Strikethrough, Table2 } from "lucide-react";
import { Placeholder } from "@tiptap/extensions";
import { PluginKey } from "@tiptap/pm/state";
import { BubbleMenu } from "@tiptap/react/menus";
import { EditorContent, Extension, useEditor, useEditorState } from "@tiptap/react";
import Suggestion, { type SuggestionProps } from "@tiptap/suggestion";
import { Popover as BasePopover } from "@base-ui/react/popover";
import { Button, type Props as ButtonProps } from "@/components/base/buttons/button";
import { ButtonUtility } from "@/components/base/buttons/button-utility";
import { Input } from "@/components/base/input/input";
import { ToggleGroupItem, ToggleGroupRoot } from "@/components/base/toggle-group/toggle-group";
import { cx } from "@/utils/cx";
import { useTranslation } from "react-i18next";
import i18n from "@/i18n/i18n";
import { DocumentImage } from "@/features/documents/components/document-image";
import { type EditorCommand, commandIcons, executeBlockCommand, filterBlockCommands } from "@/features/editor/commands";
import { type FileUploadTarget } from "@/features/editor/file-api";
import { FileDrop } from "@/features/editor/file-upload";
import { MarkdownTablePaste } from "@/features/editor/markdown-paste";
import { TableControls } from "@/features/editor/table-controls";
import { TableActionsMenu } from "@/features/editor/table-menu";
import { UnsupportedContent } from "@/features/editor/unsupported-content";
import "@/features/editor/editor-ui.css";
import "./issue-rich-text-editor.css";

export const EMPTY_TIPTAP_DOCUMENT: TiptapDocument = { type: "doc", content: [] };

export interface MentionItem {
    id: string;
    label: string;
    description?: string;
}

type SuggestionItem = { id: string; label: string; description?: string; detail?: string };

function SuggestionMenu<T extends SuggestionItem>({ items, selectedIndex, onSelect }: { items: T[]; selectedIndex: number; onSelect: (item: T) => void }) {
    const { t } = useTranslation();
    return (
        <div role="listbox" aria-label={t("editor.editorSuggestions")} className="min-w-60 overflow-hidden rounded-lg border border-subtle bg-menu p-1 shadow-overlay-200">
            {items.length === 0 ? <p className="px-3 py-2 text-xs text-tertiary">{t("editor.noMatchingCommands")}</p> : items.map((item, index) => {
                const Icon = commandIcons[item.id];
                const detail = item.detail ?? item.description;
                return (
                    <button key={item.id} type="button" role="option" aria-selected={index === selectedIndex} className={cx("flex min-h-9 w-full items-center gap-2 rounded-md px-2.5 py-2 text-left", index === selectedIndex && "bg-surface-2")} onMouseDown={(event) => { event.preventDefault(); onSelect(item); }}>
                        {Icon && <Icon className="size-4 shrink-0 text-tertiary" />}
                        <span className="min-w-0"><span className="block text-sm font-medium text-primary">{item.label}</span>{detail && <span className="block truncate text-xs text-tertiary">{detail}</span>}</span>
                    </button>
                );
            })}
        </div>
    );
}

function createSuggestionRenderer<T extends SuggestionItem>() {
    let popup: HTMLDivElement | null = null;
    let root: Root | null = null;
    let selectedIndex = 0;
    let currentItems: T[] = [];
    let selectItem: ((item: T) => void) | null = null;
    let currentRect: (() => DOMRect | null) | null = null;
    let positionFrame: number | null = null;

    const reposition = () => {
        if (positionFrame !== null) cancelAnimationFrame(positionFrame);
        positionFrame = requestAnimationFrame(() => {
            positionFrame = null;
            if (!popup || !currentRect) return;
            const rect = currentRect();
            if (!rect || rect.bottom < 0 || rect.top > window.innerHeight || rect.right < 0 || rect.left > window.innerWidth) {
                popup.style.visibility = "hidden";
                return;
            }
            const bounds = popup.getBoundingClientRect();
            const margin = 12;
            const maxLeft = Math.max(margin, window.innerWidth - bounds.width - margin);
            const left = Math.min(maxLeft, Math.max(margin, rect.left));
            let top = rect.bottom + 6;
            if (top + bounds.height > window.innerHeight - margin) top = rect.top - bounds.height - 6;
            const maxTop = Math.max(margin, window.innerHeight - bounds.height - margin);
            top = Math.min(maxTop, Math.max(margin, top));
            popup.style.left = `${left}px`;
            popup.style.top = `${top}px`;
            popup.style.maxWidth = `calc(100vw - ${margin * 2}px)`;
            popup.style.maxHeight = `calc(100vh - ${margin * 2}px)`;
            popup.style.overflowY = "auto";
            popup.style.visibility = "visible";
        });
    };

    const render = (props: SuggestionProps<T, T>) => {
        currentItems = props.items;
        selectedIndex = Math.min(selectedIndex, Math.max(0, currentItems.length - 1));
        selectItem = props.command;
        currentRect = props.clientRect ?? null;
        if (!popup) {
            popup = document.createElement("div");
            popup.className = "fixed z-[100]";
            document.body.appendChild(popup);
            root = createRoot(popup);
            window.addEventListener("scroll", reposition, true);
            window.addEventListener("resize", reposition);
        }
        root?.render(<SuggestionMenu items={currentItems} selectedIndex={selectedIndex} onSelect={(item) => selectItem?.(item)} />);
        reposition();
    };

    return {
        onStart: render,
        onUpdate: render,
        onKeyDown: ({ event }: { event: KeyboardEvent }) => {
            if (!popup) return false;
            if (event.key === "ArrowDown" && currentItems.length > 0) {
                selectedIndex = (selectedIndex + 1) % currentItems.length;
                root?.render(<SuggestionMenu items={currentItems} selectedIndex={selectedIndex} onSelect={(item) => selectItem?.(item)} />);
                return true;
            }
            if (event.key === "ArrowUp" && currentItems.length > 0) {
                selectedIndex = (selectedIndex + currentItems.length - 1) % currentItems.length;
                root?.render(<SuggestionMenu items={currentItems} selectedIndex={selectedIndex} onSelect={(item) => selectItem?.(item)} />);
                return true;
            }
            if (event.key === "Enter" && currentItems[selectedIndex]) {
                selectItem?.(currentItems[selectedIndex]);
                return true;
            }
            return event.key === "Escape";
        },
        onExit: () => {
            window.removeEventListener("scroll", reposition, true);
            window.removeEventListener("resize", reposition);
            if (positionFrame !== null) cancelAnimationFrame(positionFrame);
            positionFrame = null;
            currentRect = null;
            root?.unmount();
            popup?.remove();
            root = null;
            popup = null;
            currentItems = [];
            selectItem = null;
            selectedIndex = 0;
        },
    };
}

/** `getItems` is read on every keystroke, so people who load after the editor is created still appear. */
function createMentionSuggestion(getItems: () => MentionItem[]) {
    return {
        items: ({ query }: { query: string }) => getItems().filter((item) => `${item.label} ${item.description ?? ""}`.toLowerCase().includes(query.toLowerCase())).slice(0, 8),
        render: () => createSuggestionRenderer<MentionItem>(),
    };
}

const SLASH_PLUGIN_KEY = new PluginKey("rinia-slash-commands");

/** The slash menu offers the shared block catalog, filtered to what this profile's schema allows. */
function createSlashSuggestion(profile: RichTextProfile) {
    return Extension.create({
        name: "slashCommands",
        addProseMirrorPlugins() {
            return [Suggestion<EditorCommand>({
                editor: this.editor,
                pluginKey: SLASH_PLUGIN_KEY,
                char: "/",
                items: ({ query }) => filterBlockCommands(query, profile),
                allow: ({ state }) => state.selection.empty && !state.selection.$from.parent.type.spec.code,
                command: ({ editor, range, props }) => executeBlockCommand(editor, props, range),
                render: () => createSuggestionRenderer<EditorCommand>(),
            })];
        },
    });
}

type RichTextProfile = "description" | "comment";

interface RichTextEditorProps {
    content: TiptapDocument;
    editable?: boolean;
    onChange?: (content: TiptapDocument) => void;
    placeholder?: string;
    mentionItems?: MentionItem[];
    className?: string;
    onSubmitShortcut?: () => void;
    toolbar?: boolean;
    variant?: RichTextProfile;
    /** Puts the cursor at the end once the editor is ready, for editors that appear when someone clicks to write. */
    autoFocus?: boolean;
    /** Where a pasted or dropped file is uploaded. Comments receive a link; descriptions receive an image. */
    uploads?: FileUploadTarget | null;
}

/**
 * The editor for issue descriptions and comments. Its schema comes from the shared profile, the same one the API checks
 * on save. Content the profile cannot read is never loaded: the editor shows it as saved and sends no changes, so
 * nothing is overwritten with an empty document.
 */
export const RichTextEditor = ({ content, editable = true, onChange, placeholder, mentionItems = [], className, onSubmitShortcut, variant = "description", toolbar = true, autoFocus = false, uploads = null }: RichTextEditorProps) => {
    const { t } = useTranslation();
    const mentionItemsRef = useRef(mentionItems);
    mentionItemsRef.current = mentionItems;
    const mentionSuggestion = useMemo(() => createMentionSuggestion(() => mentionItemsRef.current), []);
    const contentRef = useRef(content);
    const onChangeRef = useRef(onChange);
    const onSubmitShortcutRef = useRef(onSubmitShortcut);
    const placeholderRef = useRef(placeholder);
    const syncingRef = useRef(false);
    const emittedRef = useRef<TiptapDocument | null>(null);
    const [container, setContainer] = useState<HTMLDivElement | null>(null);
    const [uploading, setUploading] = useState(false);
    const [uploadError, setUploadError] = useState<string | null>(null);
    const uploadsRef = useRef(uploads);
    const variantRef = useRef(variant);
    uploadsRef.current = uploads;
    variantRef.current = variant;
    onChangeRef.current = onChange;
    onSubmitShortcutRef.current = onSubmitShortcut;
    placeholderRef.current = placeholder;
    // What the editor itself just sent back is known to be valid, so typing does not re-check the whole document.
    const check = useMemo(() => (content === emittedRef.current ? { ok: true as const } : checkRichText(content, variant)), [content, variant]);
    const readable = check.ok;
    const readableRef = useRef(readable);
    readableRef.current = readable;
    const editor = useEditor({
        immediatelyRender: false,
        editable: editable && readable,
        autofocus: autoFocus && editable && readable ? "end" : false,
        content: readable ? content : EMPTY_TIPTAP_DOCUMENT,
        editorProps: {
            attributes: { class: "rinia-prose", "data-profile": variant },
            handleKeyDown: (_view, event) => {
                if (onSubmitShortcutRef.current && (event.metaKey || event.ctrlKey) && event.key === "Enter") {
                    event.preventDefault();
                    onSubmitShortcutRef.current();
                    return true;
                }
                return false;
            },
        },
        extensions: (() => {
            const shared = richTextExtensionSet(variant);
            return [
                shared.starterKit,
                shared.link.configure({ openOnClick: !editable }),
                shared.taskList,
                shared.taskItem,
                shared.table,
                ...(shared.image ? [DocumentImage] : []),
                shared.mention.configure({ suggestion: mentionSuggestion }),
                Placeholder.configure({ placeholder: () => placeholderRef.current ?? i18n.t("editor.writeSomething") }),
                ...(editable ? [createSlashSuggestion(variant), MarkdownTablePaste.configure({ profile: variant }), FileDrop.configure({ target: () => uploadsRef.current, profile: () => variantRef.current, onStart: () => { setUploadError(null); setUploading(true); }, onDone: () => setUploading(false), onError: setUploadError })] : []),
            ];
        })(),
        onUpdate: ({ editor: currentEditor }) => {
            if (syncingRef.current || !readableRef.current) return;
            const nextContent = currentEditor.getJSON() as TiptapDocument;
            if (JSON.stringify(nextContent) === JSON.stringify(contentRef.current)) return;
            contentRef.current = nextContent;
            emittedRef.current = nextContent;
            onChangeRef.current?.(nextContent);
        },
    });

    useEffect(() => {
        if (!editor) return;
        contentRef.current = content;
        syncingRef.current = true;
        if (editor.isEditable !== (editable && readable)) editor.setEditable(editable && readable);
        if (readable && JSON.stringify(editor.getJSON()) !== JSON.stringify(content)) editor.commands.setContent(content, { emitUpdate: false });
        syncingRef.current = false;
    }, [content, editable, editor, readable]);

    useEffect(() => {
        if (!editor) return;
        editor.view.dom.setAttribute("aria-label", t("editor.documentContent"));
        editor.view.dispatch(editor.state.tr.setMeta("language-change", true));
    }, [editor, t]);

    if (!check.ok) return <UnsupportedContent content={content} unsupported={check.unsupported} className={className} />;

    return <div ref={setContainer} className={cx("tiptap-editor relative", editable && "min-h-32", !editable && "tiptap-editor-readonly", `tiptap-editor-${variant}`, className)}>
        {editable && toolbar && editor && <RichTextToolbar editor={editor} showImages={richTextAllowsImages(variant)} />}
        {editable && editor && <RichTextBubbleMenu editor={editor} />}
        {editable && editor && <TableControls editor={editor} container={container} />}
        <EditorContent editor={editor} />
        {(uploading || uploadError) && <p role="status" className={cx("px-1 pt-1 text-xs", uploadError ? "text-danger-primary" : "text-tertiary")}>{uploadError ?? t("editor.uploadingImage")}</p>}
    </div>;
};

function FormatButton({ icon: Icon, label, active, onClick }: { icon: ButtonProps["iconLeading"]; label: string; active?: boolean; onClick: () => void }) {
    return <ButtonUtility icon={Icon} size="xs" color={active ? "secondary" : "tertiary"} tooltip={label} aria-label={label} aria-pressed={active} onClick={onClick} />;
}

function RichTextToolbar({ editor, showImages }: { editor: NonNullable<ReturnType<typeof useEditor>>; showImages: boolean }) {
    const { t } = useTranslation();
    const [isLinkEditorOpen, setIsLinkEditorOpen] = useState(false);
    const [isMoreOpen, setIsMoreOpen] = useState(false);
    const [url, setUrl] = useState("");
    const toggleLink = () => { setUrl(editor.getAttributes("link").href ?? ""); setIsLinkEditorOpen(true); setIsMoreOpen(false); };
    const saveLink = (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        const href = url.trim();
        if (!href) editor.chain().focus().unsetLink().run();
        else editor.chain().focus().setLink({ href }).run();
        setIsLinkEditorOpen(false);
    };
    return <div className="tiptap-toolbar sticky top-0 z-10 flex flex-wrap items-center gap-1 border-b border-subtle bg-surface-1 px-2 py-1.5">
        <ToggleGroupRoot aria-label={t("editor.textFormatting")}>
            <ToggleGroupItem value="bold" aria-label={t("editor.bold")} pressed={editor.isActive("bold")} onPressedChange={() => editor.chain().focus().toggleBold().run()}><Bold className="size-4" /></ToggleGroupItem>
            <ToggleGroupItem value="italic" aria-label={t("editor.italic")} pressed={editor.isActive("italic")} onPressedChange={() => editor.chain().focus().toggleItalic().run()}><Italic className="size-4" /></ToggleGroupItem>
            <ToggleGroupItem value="strike" aria-label={t("editor.strikethrough")} pressed={editor.isActive("strike")} onPressedChange={() => editor.chain().focus().toggleStrike().run()}><Strikethrough className="size-4" /></ToggleGroupItem>
        </ToggleGroupRoot>
        <span className="mx-1 h-5 w-px bg-border-secondary" aria-hidden="true" />
        <FormatButton icon={Heading2} label={t("editor.headingFormat")} active={editor.isActive("heading", { level: 2 })} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} />
        {showImages && <FormatButton icon={ImagePlus} label={t("editor.insertImageUrl")} onClick={() => editor.chain().focus().setImage({ src: "", alt: "" }).run()} />}
        <FormatButton icon={Table2} label={t("editor.table")} onClick={() => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()} />
        <BasePopover.Root open={isLinkEditorOpen} onOpenChange={setIsLinkEditorOpen}>
            <BasePopover.Trigger
                render={<button type="button" aria-label={t("editor.linkAction")} aria-pressed={editor.isActive("link")} className={cx("inline-flex size-7 items-center justify-center rounded-md text-tertiary outline-accent-strong transition-colors hover:bg-layer-1-hover hover:text-primary", editor.isActive("link") && "bg-surface-2 text-primary")} onClick={toggleLink} />}
            >
                <Link2 className="size-4" />
            </BasePopover.Trigger>
            <BasePopover.Portal>
                <BasePopover.Positioner side="bottom" align="start" sideOffset={6} className="z-50">
                    <BasePopover.Popup className="overlay-motion w-72 rounded-lg border border-subtle bg-menu p-3 shadow-overlay-200 outline-none">
                        <form className="flex flex-col gap-2" onSubmit={saveLink}>
                            <label className="text-xs font-medium text-secondary" htmlFor="tiptap-link-url">{t("editor.linkUrl")}</label>
                            <Input autoFocus id="tiptap-link-url" size="sm" type="url" value={url} onChange={setUrl} placeholder="https://example.com" />
                            <div className="flex justify-end gap-2 pt-1">
                                <Button type="button" size="xs" color="tertiary" onClick={() => { editor.chain().focus().unsetLink().run(); setIsLinkEditorOpen(false); }}>{t("editor.removeLink")}</Button>
                                <Button type="submit" size="xs" iconLeading={Check}>{t("editor.saveLink")}</Button>
                            </div>
                        </form>
                    </BasePopover.Popup>
                </BasePopover.Positioner>
            </BasePopover.Portal>
        </BasePopover.Root>
        <div className="relative">
            <FormatButton icon={MoreHorizontal} label={t("editor.moreFormatting")} active={isMoreOpen} onClick={() => setIsMoreOpen((open) => !open)} />
            {isMoreOpen && <div className="absolute top-9 left-0 z-20 flex min-w-44 flex-col gap-1 rounded-lg border border-subtle bg-menu p-1 shadow-overlay-200">
                <Button size="xs" color="tertiary" className="justify-start" iconLeading={List} onClick={() => editor.chain().focus().toggleBulletList().run()}>{t("editor.bulletList")}</Button>
                <Button size="xs" color="tertiary" className="justify-start" iconLeading={ListOrdered} onClick={() => editor.chain().focus().toggleOrderedList().run()}>{t("editor.numberedList")}</Button>
                <Button size="xs" color="tertiary" className="justify-start" iconLeading={CheckSquare} onClick={() => editor.chain().focus().toggleTaskList().run()}>{t("editor.todoList")}</Button>
                <Button size="xs" color="tertiary" className="justify-start" iconLeading={Quote} onClick={() => editor.chain().focus().toggleBlockquote().run()}>{t("editor.quote")}</Button>
                <Button size="xs" color="tertiary" className="justify-start" iconLeading={Code2} onClick={() => editor.chain().focus().toggleCodeBlock().run()}>{t("editor.codeBlock")}</Button>
                <Button size="xs" color="tertiary" className="justify-start" iconLeading={Minus} onClick={() => editor.chain().focus().setHorizontalRule().run()}>{t("editor.divider")}</Button>
            </div>}
        </div>
    </div>;
}

/** Formatting for selected text, and the table's actions while the cursor is in a table, as on pages. */
function RichTextBubbleMenu({ editor }: { editor: NonNullable<ReturnType<typeof useEditor>> }) {
    const { t } = useTranslation();
    const state = useEditorState({ editor, selector: ({ editor: e }) => ({ bold: e.isActive("bold"), italic: e.isActive("italic"), strike: e.isActive("strike"), table: e.isActive("table"), empty: e.state.selection.empty }) });
    return <BubbleMenu
        editor={editor}
        appendTo={() => document.body}
        options={{ strategy: "fixed", placement: "top", offset: 8, flip: { padding: 12 }, shift: { padding: 12 } }}
        shouldShow={({ view, state: editorState, element }) => (view.hasFocus() || element.contains(document.activeElement)) && (!editorState.selection.empty || editor.isActive("table")) && !editor.isActive("image")}
        className="z-[100] flex items-center gap-1 rounded-lg border border-subtle bg-menu p-1 shadow-overlay-200"
    >
        {!state.empty && <>
            <FormatButton icon={Bold} label={t("editor.bold")} active={state.bold} onClick={() => editor.chain().focus().toggleBold().run()} />
            <FormatButton icon={Italic} label={t("editor.italic")} active={state.italic} onClick={() => editor.chain().focus().toggleItalic().run()} />
            <FormatButton icon={Strikethrough} label={t("editor.strikethrough")} active={state.strike} onClick={() => editor.chain().focus().toggleStrike().run()} />
            <LinkPopover editor={editor} />
        </>}
        {state.table && <TableActionsMenu editor={editor} triggerClassName="inline-flex size-7 items-center justify-center rounded-md text-tertiary outline-accent-strong transition-colors hover:bg-layer-1-hover hover:text-primary" />}
    </BubbleMenu>;
}

function LinkPopover({ editor }: { editor: NonNullable<ReturnType<typeof useEditor>> }) {
    const { t } = useTranslation();
    const [open, setOpen] = useState(false);
    const [url, setUrl] = useState("");

    function openEditor() {
        setUrl(editor.getAttributes("link").href ?? "");
        setOpen(true);
    }

    function save(event: FormEvent<HTMLFormElement>) {
        event.preventDefault();
        const href = url.trim();
        if (!href) editor.chain().focus().unsetLink().run();
        else editor.chain().focus().setLink({ href }).run();
        setOpen(false);
    }

    return <BasePopover.Root open={open} onOpenChange={setOpen}>
        <BasePopover.Trigger
            render={<button type="button" aria-label={t("editor.linkAction")} aria-pressed={editor.isActive("link")} className={cx("inline-flex size-7 items-center justify-center rounded-md text-tertiary outline-accent-strong transition-colors hover:bg-layer-1-hover hover:text-primary", editor.isActive("link") && "bg-surface-2 text-primary")} onClick={openEditor} />}
        >
            <Link2 className="size-4" />
        </BasePopover.Trigger>
        <BasePopover.Portal>
            <BasePopover.Positioner side="bottom" align="start" sideOffset={6} className="z-[110]">
                <BasePopover.Popup className="overlay-motion w-72 rounded-lg border border-subtle bg-menu p-3 shadow-overlay-200 outline-none">
                    <form className="flex flex-col gap-2" onSubmit={save}>
                        <label className="text-xs font-medium text-secondary" htmlFor="tiptap-bubble-link-url">{t("editor.linkUrl")}</label>
                        <Input autoFocus id="tiptap-bubble-link-url" size="sm" type="url" value={url} onChange={setUrl} placeholder="https://example.com" />
                        <div className="flex justify-end gap-2 pt-1">
                            <Button type="button" size="xs" color="tertiary" onClick={() => { editor.chain().focus().unsetLink().run(); setOpen(false); }}>{t("editor.removeLink")}</Button>
                            <Button type="submit" size="xs" iconLeading={Check}>{t("editor.saveLink")}</Button>
                        </div>
                    </form>
                </BasePopover.Popup>
            </BasePopover.Positioner>
        </BasePopover.Portal>
    </BasePopover.Root>;
}
