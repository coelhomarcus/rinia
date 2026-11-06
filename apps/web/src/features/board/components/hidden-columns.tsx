import { useState } from "react";
import { Menu } from "@base-ui/react/menu";
import { Eye, EyeOff } from "lucide-react";
import { Tooltip } from "@/components/base/tooltip/tooltip";
import { overlayChrome } from "@/components/overlay/overlay-chrome";
import { translateStatusName } from "@/i18n/status-label";
import { cx } from "@/utils/cx";
import { useTranslation } from "react-i18next";
import type { BoardColumn } from "../api";
import { StateIcon } from "./issue-property-icons";

function storageKey(projectId: string) {
    return `rinia-hidden-columns:${projectId}`;
}

function readHidden(projectId: string): Set<string> {
    try {
        const stored = JSON.parse(localStorage.getItem(storageKey(projectId)) ?? "[]");
        if (Array.isArray(stored)) return new Set(stored.filter((id): id is string => typeof id === "string"));
    } catch {
        /* ignore invalid storage */
    }
    return new Set();
}

/** Columns the user hid on this project's board, remembered in this browser. */
export function useHiddenColumns(projectId: string) {
    const [hidden, setHidden] = useState(() => readHidden(projectId));
    const [forProject, setForProject] = useState(projectId);
    if (forProject !== projectId) {
        setForProject(projectId);
        setHidden(readHidden(projectId));
    }
    function update(change: (next: Set<string>) => void) {
        setHidden((current) => {
            const next = new Set(current);
            change(next);
            try {
                localStorage.setItem(storageKey(projectId), JSON.stringify([...next]));
            } catch {
                /* Storage is optional; the choice still applies for this visit. */
            }
            return next;
        });
    }
    return {
        hidden,
        hideColumn: (columnId: string) => update((next) => next.add(columnId)),
        showColumn: (columnId: string) => update((next) => next.delete(columnId)),
        showAllColumns: () => update((next) => next.clear()),
    };
}

/** Compact board-toolbar control for restoring columns hidden on this project. */
export function HiddenColumnsMenu({
    columns,
    countFor,
    onShow,
    onShowAll,
}: {
    columns: BoardColumn[];
    countFor: (columnId: string) => number;
    onShow: (columnId: string) => void;
    onShowAll: () => void;
}) {
    const { t } = useTranslation();
    return (
        <Menu.Root>
            <Tooltip title={t("projects.hiddenColumns")}>
            <Menu.Trigger
                type="button"
                aria-label={`${t("projects.hiddenColumns")} (${columns.length})`}
                className="relative flex size-7 shrink-0 items-center justify-center rounded-full border border-strong bg-layer-2 text-placeholder outline-none transition-colors hover:bg-layer-2-hover hover:text-secondary focus-visible:ring-2 focus-visible:ring-accent-strong data-[popup-open]:bg-layer-2-hover data-[popup-open]:text-secondary"
            >
                <EyeOff className="size-4" />
                {columns.length > 0 && (
                    <span aria-hidden="true" className="absolute -top-0.5 -right-0.5 grid min-w-3.5 place-items-center rounded-full bg-layer-3 px-0.5 text-[9px] leading-3 text-secondary tabular-nums">
                        {columns.length}
                    </span>
                )}
            </Menu.Trigger>
            </Tooltip>
            <Menu.Portal>
                <Menu.Positioner side="bottom" align="end" sideOffset={6} className="z-50">
                    <Menu.Popup className={cx("max-h-80 w-64 origin-[var(--transform-origin)] overflow-y-auto transition-[opacity,transform] duration-150 data-[ending-style]:scale-95 data-[ending-style]:opacity-0 data-[starting-style]:scale-95 data-[starting-style]:opacity-0", overlayChrome.menu)}>
                        <div className="px-2 py-1 text-[11px] text-placeholder">{t("projects.hiddenColumns")}</div>
                        {columns.length === 0 ? (
                            <div className="px-2 py-2 text-[13px] text-tertiary">{t("projects.noHiddenColumns")}</div>
                        ) : (
                            <>
                                {columns.length > 1 && (
                                    <Menu.Item onClick={onShowAll} className="flex h-8 cursor-pointer items-center gap-2 rounded px-2 text-[13px] text-secondary outline-none data-highlighted:bg-layer-2-hover data-highlighted:text-primary">
                                        <Eye className="size-4 text-tertiary" />
                                        {t("projects.showAllColumns")}
                                    </Menu.Item>
                                )}
                                {columns.map((column) => {
                                    const label = translateStatusName(column.name, t);
                                    return (
                                        <Menu.Item key={column.id} onClick={() => onShow(column.id)} className="flex h-8 cursor-pointer items-center gap-2 rounded px-2 text-[13px] text-secondary outline-none data-highlighted:bg-layer-2-hover data-highlighted:text-primary">
                                            <StateIcon name={column.name} color={column.color} className="size-4" />
                                            <span className="min-w-0 flex-1 truncate">{label}</span>
                                            <span className="text-tertiary tabular-nums">{countFor(column.id)}</span>
                                            <Eye className="size-3.5 text-tertiary" />
                                        </Menu.Item>
                                    );
                                })}
                            </>
                        )}
                    </Menu.Popup>
                </Menu.Positioner>
            </Menu.Portal>
        </Menu.Root>
    );
}
