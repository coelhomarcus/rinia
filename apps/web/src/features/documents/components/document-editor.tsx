import { useEffect, useRef } from "react";
import { DOCUMENT_FRAGMENT, documentExtensions } from "@rinia/shared/src/document-extensions";
import Collaboration from "@tiptap/extension-collaboration";
import CollaborationCaret from "@tiptap/extension-collaboration-caret";
import { Placeholder } from "@tiptap/extensions";
import { Plugin } from "@tiptap/pm/state";
import { EditorContent, Extension, useEditor } from "@tiptap/react";
import Suggestion from "@tiptap/suggestion";
import { setMeta, yCursorPluginKey, ySyncPluginKey } from "@tiptap/y-tiptap";
import type { DocumentProvider } from "../collab/document-provider";
import { DocumentBlockControls } from "./document-block-controls";
import "./document-editor.css";
import { DocumentFormatMenu } from "./document-format-menu";
import { DocumentImage } from "./document-image";
import { type EditorCommand, documentMentionKey, documentSlashKey, documentSuggestions, executeBlockCommand, filterBlockCommands } from "./editor-suggestions";
import { useTranslation } from "react-i18next";
import i18n from "@/i18n/i18n";

const SlashCommands = Extension.create({
    name: "documentSlashCommands",
    addProseMirrorPlugins() {
        return [
            Suggestion<EditorCommand>({
                editor: this.editor,
                pluginKey: documentSlashKey,
                char: "/",
                items: ({ query }) => filterBlockCommands(query),
                allow: ({ state }) => {
                    const allowed = state.selection.empty && !state.selection.$from.parent.type.spec.code;
                    return allowed;
                },
                command: ({ editor, range, props }) => {
                    executeBlockCommand(editor, props, range);
                },
                render: () => documentSuggestions(documentSlashKey),
            }),
        ];
    },
});

const HeadingEnter = Extension.create({
    name: "documentHeadingEnter",
    addKeyboardShortcuts() {
        return {
            Enter: () => {
                const { editor } = this;
                const { selection } = editor.state;
                const { $from, $to } = selection;

                if (
                    editor.view.composing ||
                    documentSlashKey.getState(editor.state)?.active ||
                    documentMentionKey.getState(editor.state)?.active ||
                    !$from.sameParent($to) ||
                    $from.parent.type.name !== "heading"
                ) {
                    return false;
                }

                if ($from.parent.content.size === 0) return editor.commands.setParagraph();

                if (selection.empty && $from.parentOffset === 0) {
                    if ($from.depth !== 1) return false;
                    const position = $from.before();
                    editor
                        .chain()
                        .insertContentAt(position, { type: "paragraph" })
                        .setTextSelection(position + 1)
                        .run();
                    return true;
                }

                editor.chain().splitBlock().setParagraph().run();
                return true;
            },
        };
    },
});

/**
 * Other people's cursors are widgets that ProseMirror carries along while this tab types. A cursor sitting exactly
 * where someone types is pushed ahead with the new text, so it lands on their cursor and stays there until that
 * person edits or moves. Reading the cursors from awareness again after each local edit puts them back where they are.
 */
const RemoteCaretRefresh = Extension.create({
    name: "documentRemoteCaretRefresh",
    addProseMirrorPlugins() {
        return [
            new Plugin({
                view: () => ({
                    update: (view, previous) => {
                        if (view.state.doc === previous.doc || ySyncPluginKey.getState(view.state)?.isChangeOrigin) return;
                        setMeta(view, yCursorPluginKey, { awarenessUpdated: true });
                    },
                }),
            }),
        ];
    },
});

/** Cursors of up to five colours repeat across people; the same person has the same colour for everyone. */
const CURSOR_COLORS = ["var(--brand-600)", "var(--blue-600)", "var(--green-600)", "var(--amber-600)", "var(--red-600)"];
export function cursorColor(userId: string) {
    let hash = 0;
    for (const character of userId) hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
    return CURSOR_COLORS[hash % CURSOR_COLORS.length];
}

function renderCaret(user: Record<string, unknown>) {
    const caret = document.createElement("span");
    caret.classList.add("collaboration-carets__caret");
    caret.style.setProperty("--caret-color", cursorColor(String(user.id)));
    const label = document.createElement("div");
    label.classList.add("collaboration-carets__label");
    label.textContent = String(user.name ?? "");
    caret.append(label);
    return caret;
}

function renderSelection(user: Record<string, unknown>) {
    return { nodeName: "span", class: "collaboration-carets__selection", style: `--caret-color: ${cursorColor(String(user.id))}` };
}

export function DocumentEditor({
    provider,
    user,
    members,
    disabled = false,
}: {
    /** The page's collaborative document. Edits go straight into it, and other people's edits and cursors come out of it. */
    provider: DocumentProvider;
    user: { id: string; name: string };
    members: { id: string; name: string }[];
    disabled?: boolean;
}) {
    const { t } = useTranslation();
    const membersRef = useRef(members);
    membersRef.current = members;
    const editor = useEditor(
        {
            immediatelyRender: false,
            editorProps: { attributes: { "aria-label": t("editor.documentContent"), role: "textbox", "aria-multiline": "true", spellcheck: "true" } },
            extensions: [
                documentExtensions.starterKit.configure({ dropcursor: { color: "var(--bg-accent-primary)", width: 2 } }),
                documentExtensions.link,
                documentExtensions.taskList,
                documentExtensions.taskItem,
                DocumentImage,
                documentExtensions.table,
                Placeholder.configure({ placeholder: () => i18n.t("editor.writeOrSlash") }),
                documentExtensions.mention.configure({
                    suggestion: {
                        pluginKey: documentMentionKey,
                        items: ({ query }) =>
                            membersRef.current
                                .filter((member) => member.name.toLowerCase().includes(query.toLowerCase()))
                                .slice(0, 8)
                                .map((member) => ({ id: member.id, label: member.name })),
                        render: () => documentSuggestions(documentMentionKey),
                    },
                }),
                SlashCommands,
                HeadingEnter,
                Collaboration.configure({ document: provider.doc, field: DOCUMENT_FRAGMENT }),
                CollaborationCaret.configure({ provider, user: { id: user.id, name: user.name }, render: renderCaret, selectionRender: renderSelection }),
                RemoteCaretRefresh,
            ],
        },
        [provider],
    );
    useEffect(() => {
        editor?.setEditable(!disabled, false);
    }, [editor, disabled]);
    useEffect(() => {
        if (!editor) return;
        editor.view.dom.setAttribute("aria-label", t("editor.documentContent"));
        editor.view.dispatch(editor.state.tr.setMeta("document-language-changed", true));
    }, [editor, t]);
    // Native ProseMirror dragging supplies the drop cursor; keep long pages scrolling near the edges.
    useEffect(() => {
        if (!editor) return;
        const scroller = editor.view.dom.closest<HTMLElement>("[data-document-scroll]");
        if (!scroller) return;
        let frame = 0,
            velocity = 0;
        const tick = () => {
            scroller.scrollTop += velocity;
            frame = requestAnimationFrame(tick);
        };
        const drag = (event: DragEvent) => {
            const rect = scroller.getBoundingClientRect();
            velocity = event.clientY < rect.top + 64 ? -12 : event.clientY > rect.bottom - 64 ? 12 : 0;
            if (!frame) frame = requestAnimationFrame(tick);
        };
        const stop = () => {
            cancelAnimationFrame(frame);
            frame = 0;
            velocity = 0;
        };
        scroller.addEventListener("dragover", drag);
        scroller.addEventListener("dragleave", stop);
        window.addEventListener("drop", stop);
        window.addEventListener("dragend", stop);
        return () => {
            stop();
            scroller.removeEventListener("dragover", drag);
            scroller.removeEventListener("dragleave", stop);
            window.removeEventListener("drop", stop);
            window.removeEventListener("dragend", stop);
        };
    }, [editor]);
    return (
        <div
            className="document-editor"
            onClick={(event) => {
                if (event.target === event.currentTarget) editor?.commands.focus("end");
            }}
        >
            {editor && !disabled && (
                <>
                    <DocumentBlockControls editor={editor} />
                    <DocumentFormatMenu editor={editor} />
                </>
            )}
            <EditorContent editor={editor} className="document-editor-content" />
        </div>
    );
}
