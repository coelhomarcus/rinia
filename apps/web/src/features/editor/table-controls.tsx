import { useEffect, useState } from "react";
import { TextSelection } from "@tiptap/pm/state";
import { TableMap } from "@tiptap/pm/tables";
import type { Editor } from "@tiptap/react";
import { Plus } from "lucide-react";
import { useTranslation } from "react-i18next";

type Hovered = { table: HTMLTableElement; top: number; left: number; width: number; height: number };

/** Puts the cursor in the table's last row or column, then adds one after it. */
function addAtEnd(editor: Editor, table: HTMLTableElement, axis: "row" | "column") {
    const cell = table.querySelector("td, th");
    if (!cell) return;
    let position: number;
    try {
        position = editor.view.posAtDOM(cell, 0);
    } catch {
        return;
    }
    const $position = editor.state.doc.resolve(position);
    for (let depth = $position.depth; depth > 0; depth -= 1) {
        const node = $position.node(depth);
        if (node.type.name !== "table") continue;
        const start = $position.start(depth);
        const map = TableMap.get(node);
        const target = start + (axis === "row" ? map.map[map.map.length - 1] : map.map[map.width - 1]) + 1;
        const chain = editor
            .chain()
            .focus()
            .command(({ tr }) => {
                tr.setSelection(TextSelection.near(tr.doc.resolve(target)));
                return true;
            });
        (axis === "row" ? chain.addRowAfter() : chain.addColumnAfter()).run();
        return;
    }
}

/**
 * The "+" along a table's bottom and right edges while the pointer is over it. `container` is the positioned element
 * the buttons are placed in; it must contain the editor.
 */
export function TableControls({ editor, container }: { editor: Editor; container: HTMLElement | null }) {
    const { t } = useTranslation();
    const [hovered, setHovered] = useState<Hovered | null>(null);
    useEffect(() => {
        if (!container) return;
        let current: Hovered | null = null;
        const update = (next: Hovered | null) => {
            current = next;
            setHovered(next);
        };
        const move = (event: PointerEvent) => {
            if (!(event.target instanceof Element) || event.target.closest("[data-table-control]")) return;
            const table = event.target.closest("table");
            if (table && editor.isEditable && editor.view.dom.contains(table)) {
                const frame = (table.closest(".tableWrapper") ?? table).getBoundingClientRect();
                const base = container.getBoundingClientRect();
                const width = Math.min(frame.width, table.getBoundingClientRect().width);
                update({ table, top: frame.top - base.top, left: frame.left - base.left, width, height: frame.height });
                return;
            }
            // Leaving the table towards its buttons keeps them; leaving anywhere else hides them.
            if (current) {
                const base = container.getBoundingClientRect();
                const x = event.clientX - base.left;
                const y = event.clientY - base.top;
                const near = x >= current.left - 8 && x <= current.left + current.width + 32 && y >= current.top - 8 && y <= current.top + current.height + 32;
                if (!near) update(null);
            }
        };
        const leave = () => update(null);
        container.addEventListener("pointermove", move);
        container.addEventListener("pointerleave", leave);
        return () => {
            container.removeEventListener("pointermove", move);
            container.removeEventListener("pointerleave", leave);
        };
    }, [container, editor]);
    if (!hovered || !hovered.table.isConnected) return null;
    return (
        <>
            <button
                type="button"
                data-table-control=""
                className="rich-table-add rich-table-add-row"
                style={{ top: hovered.top + hovered.height + 4, left: hovered.left, width: hovered.width }}
                aria-label={t("editor.addRow")}
                title={t("editor.addRow")}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => addAtEnd(editor, hovered.table, "row")}
            >
                <Plus className="size-3" />
            </button>
            <button
                type="button"
                data-table-control=""
                className="rich-table-add rich-table-add-column"
                style={{ top: hovered.top, left: hovered.left + hovered.width + 4, height: hovered.height }}
                aria-label={t("editor.addColumn")}
                title={t("editor.addColumn")}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => addAtEnd(editor, hovered.table, "column")}
            >
                <Plus className="size-3" />
            </button>
        </>
    );
}
