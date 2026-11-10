import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { pillTab } from "@/features/issues/components/issue-toolbar";
import { translateStatusName } from "@/i18n/status-label";
import type { BoardColumn } from "../api";
import { StateIcon } from "./issue-property-icons";

export function BoardColumnTabs({
    columns,
    counts,
    activeId,
    onSelect,
}: {
    columns: BoardColumn[];
    counts: Map<string, number>;
    activeId: string | null;
    onSelect: (columnId: string) => void;
}) {
    const { t } = useTranslation();
    const listRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!activeId) return;
        listRef.current?.querySelector<HTMLElement>(`[data-column-tab="${CSS.escape(activeId)}"]`)?.scrollIntoView({
            inline: "center",
            block: "nearest",
            behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
        });
    }, [activeId]);

    return (
        <div ref={listRef} role="tablist" aria-label={t("projects.boardColumns")} className="flex shrink-0 gap-1 overflow-x-auto px-3 pb-2">
            {columns.map((column) => {
                const label = translateStatusName(column.name, t);
                const active = column.id === activeId;
                return (
                    <button
                        key={column.id}
                        type="button"
                        role="tab"
                        aria-selected={active}
                        data-column-tab={column.id}
                        className={pillTab(active)}
                        onClick={() => onSelect(column.id)}
                    >
                        <StateIcon name={column.name} color={column.color} className="size-3.5" />
                        <span className="truncate">{label}</span>
                        <span className="text-tertiary tabular-nums">{counts.get(column.id) ?? 0}</span>
                    </button>
                );
            })}
        </div>
    );
}
