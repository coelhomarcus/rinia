import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { CheckboxBase } from "@/components/base/checkbox/checkbox";
import { cx } from "@/utils/cx";

interface IssueSelection {
    selected: Set<string>;
    isSelected: (id: string) => boolean;
    /** Flips one issue, or with `range`, selects everything between the last flipped issue and this one. */
    toggle: (id: string, options?: { range?: boolean }) => void;
    clear: () => void;
    /** Which issue `X` acts on: the hovered row or card, or the one moved to with the arrow keys. */
    setFocused: (id: string | null) => void;
}

const SelectionContext = createContext<IssueSelection | null>(null);
const VisibleContext = createContext<(ids: string[]) => void>(() => undefined);

/** The selection of the surrounding issue list or board, or null where issues cannot be selected. */
export const useIssueSelection = () => useContext(SelectionContext);

/** Tells the selection which issues are on screen, in order, for ranges and for selecting all. `null` while hidden. */
export function useRegisterVisibleIssues(ids: string[] | null) {
    const register = useContext(VisibleContext);
    const key = ids?.join(",") ?? null;
    useEffect(() => {
        if (ids) register(ids);
        // The ids are compared by `key`; a new array with the same issues does not re-register.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [key, register]);
}

/** The checkbox that selects one issue. Shift-click selects every issue between the last one picked and this. */
export function IssueCheckbox({ issueId, className }: { issueId: string; className?: string }) {
    const selection = useIssueSelection();
    const { t } = useTranslation();
    if (!selection) return null;
    const checked = selection.isSelected(issueId);
    return (
        <button
            type="button"
            role="checkbox"
            aria-checked={checked}
            aria-label={t("issue.selectIssue")}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                selection.toggle(issueId, { range: event.shiftKey });
            }}
            className={cx(
                "grid size-5 shrink-0 place-items-center rounded outline-none transition-opacity duration-150 focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-accent-strong",
                checked || selection.selected.size > 0 ? "opacity-100" : "can-hover:opacity-0",
                className,
            )}
        >
            <CheckboxBase isSelected={checked} />
        </button>
    );
}

function isTyping(target: EventTarget | null) {
    const element = target as HTMLElement | null;
    return !!element?.closest("input, textarea, select, [contenteditable='true'], [role='dialog'], [role='menu'], [role='listbox']");
}

/**
 * Multi-select for one project's issues, shared by the list and the board. `X` selects the focused issue,
 * Shift+click selects a range, Cmd/Ctrl+A selects every visible issue, and Esc clears. Issues that leave the
 * screen (filtered out or deleted) leave the selection too.
 */
export function IssueSelectionProvider({ children }: { children: ReactNode }) {
    const [selected, setSelected] = useState<Set<string>>(() => new Set());
    const visible = useRef<string[]>([]);
    const anchor = useRef<string | null>(null);
    const focused = useRef<string | null>(null);

    const registerVisible = useCallback((ids: string[]) => {
        visible.current = ids;
        const present = new Set(ids);
        setSelected((current) => ([...current].every((id) => present.has(id)) ? current : new Set([...current].filter((id) => present.has(id)))));
    }, []);

    const toggle = useCallback((id: string, options?: { range?: boolean }) => {
        setSelected((current) => {
            const next = new Set(current);
            const order = visible.current;
            const from = anchor.current ? order.indexOf(anchor.current) : -1;
            const to = order.indexOf(id);
            if (options?.range && from >= 0 && to >= 0) {
                for (const rangeId of order.slice(Math.min(from, to), Math.max(from, to) + 1)) next.add(rangeId);
            } else if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
        anchor.current = id;
    }, []);

    const clear = useCallback(() => {
        setSelected((current) => (current.size ? new Set() : current));
        anchor.current = null;
    }, []);

    useEffect(() => {
        function handleKeyDown(event: KeyboardEvent) {
            if (isTyping(event.target)) return;
            if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "a" && visible.current.length > 0) {
                event.preventDefault();
                setSelected(new Set(visible.current));
                return;
            }
            if (event.metaKey || event.ctrlKey || event.altKey) return;
            if (event.key.toLowerCase() === "x" && focused.current && visible.current.includes(focused.current)) {
                event.preventDefault();
                toggle(focused.current, { range: event.shiftKey });
            } else if (event.key === "Escape") {
                setSelected((current) => (current.size ? new Set() : current));
            }
        }
        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [toggle]);

    const value = useMemo<IssueSelection>(
        () => ({
            selected,
            isSelected: (id) => selected.has(id),
            toggle,
            clear,
            setFocused: (id) => {
                focused.current = id;
            },
        }),
        [clear, selected, toggle],
    );

    return (
        <VisibleContext.Provider value={registerVisible}>
            <SelectionContext.Provider value={value}>{children}</SelectionContext.Provider>
        </VisibleContext.Provider>
    );
}
