import { Popover } from "@base-ui/react/popover";
import type { Editor } from "@tiptap/react";
import { Table2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { TranslationKey } from "@/i18n/resources";

const ACTIONS: Array<[TranslationKey, (editor: Editor) => boolean]> = [
    ["editor.addRowAbove", (editor) => editor.chain().focus().addRowBefore().run()],
    ["editor.addRowBelow", (editor) => editor.chain().focus().addRowAfter().run()],
    ["editor.addColumnBefore", (editor) => editor.chain().focus().addColumnBefore().run()],
    ["editor.addColumnAfter", (editor) => editor.chain().focus().addColumnAfter().run()],
    ["editor.toggleHeaderRow", (editor) => editor.chain().focus().toggleHeaderRow().run()],
    ["editor.deleteRow", (editor) => editor.chain().focus().deleteRow().run()],
    ["editor.deleteColumn", (editor) => editor.chain().focus().deleteColumn().run()],
    ["editor.deleteTable", (editor) => editor.chain().focus().deleteTable().run()],
];

/** The table's actions, behind one button in an editor's format menu while the cursor is in a table. */
export function TableActionsMenu({ editor, triggerClassName = "document-format-button" }: { editor: Editor; triggerClassName?: string }) {
    const { t } = useTranslation();
    return (
        <Popover.Root>
            <Popover.Trigger className={triggerClassName} aria-label={t("editor.tableActions")} title={t("editor.tableActions")}>
                <Table2 className="size-4" />
            </Popover.Trigger>
            <Popover.Portal>
                <Popover.Positioner side="bottom" sideOffset={8} collisionPadding={12} className="document-overlay">
                    <Popover.Popup finalFocus={() => editor.view.dom} className="document-popover w-60">
                        <Popover.Title className="mb-2 px-2 text-xs font-medium text-tertiary">{t("editor.table")}</Popover.Title>
                        <div className="flex flex-col">
                            {ACTIONS.map(([label, action]) => (
                                <button key={label} type="button" className="document-menu-item" onMouseDown={(event) => event.preventDefault()} onClick={() => action(editor)}>
                                    {t(label)}
                                </button>
                            ))}
                        </div>
                    </Popover.Popup>
                </Popover.Positioner>
            </Popover.Portal>
        </Popover.Root>
    );
}
