import { isMarkdownTable, markdownToTiptap } from "@rinia/shared";
import type { RichTextProfile } from "@rinia/shared/src/rich-text-schema";
import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";

/**
 * Pasting a Markdown table (`| a | b |`) makes a table. Spreadsheets and Notion copy an HTML table too, which the table
 * extension reads on its own, so this only steps in when the clipboard has no table of its own.
 */
export const MarkdownTablePaste = Extension.create<{ profile: RichTextProfile }>({
    name: "markdownTablePaste",
    addOptions: () => ({ profile: "document" }),
    addProseMirrorPlugins() {
        const { editor } = this;
        const { profile } = this.options;
        return [
            new Plugin({
                key: new PluginKey("markdown-table-paste"),
                props: {
                    handlePaste: (view, event) => {
                        const data = event.clipboardData;
                        if (!data || /<table[\s>]/i.test(data.getData("text/html"))) return false;
                        const text = data.getData("text/plain");
                        if (!isMarkdownTable(text) || view.state.selection.$from.parent.type.spec.code) return false;
                        return editor.commands.insertContent(markdownToTiptap(text, profile).content);
                    },
                },
            }),
        ];
    },
});
