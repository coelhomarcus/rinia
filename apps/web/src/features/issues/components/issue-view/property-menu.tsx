import { useEffect, useId, useState, type ReactNode } from "react";
import { Popover } from "@base-ui/react/popover";
import { Check } from "lucide-react";
import { useTranslation } from "react-i18next";
import { overlayChrome } from "@/components/overlay/overlay-chrome";
import { cx } from "@/utils/cx";
import { numberedOptions, optionForKeyEvent, type NumberingMode } from "../../lib/numbered-options";
import { OptionNumber, type PropertyOption } from "../property-options";
import { popupMotion, propertyButton } from "./styles";

export type PropertyMenuId = "state" | "priority" | "assignee" | "estimate" | "due" | "parent" | "label";

/**
 * A property row that opens a searchable list. Arrow keys move, Enter picks, and the number keys pick directly
 * while the search is empty: 1-9 pick the options in order (estimates: the value itself) and Backspace clears where the options are not numbered in order.
 */
export function PropertyMenu<V>({
    open,
    onOpenChange,
    label,
    placeholder,
    shortcut,
    value,
    options,
    mode = "positional",
    onSelect,
    disabled,
    children,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    label: string;
    placeholder: string;
    /** The letter that opens this menu from the issue screen, announced to assistive technology. */
    shortcut?: string;
    value: V;
    options: PropertyOption<V>[];
    mode?: NumberingMode;
    onSelect: (value: V) => void;
    disabled?: boolean;
    children: ReactNode;
}) {
    const { t } = useTranslation();
    const listId = useId();
    const [query, setQuery] = useState("");
    const [active, setActive] = useState(0);
    const normalized = query.trim().toLowerCase();
    const filtered = normalized ? options.filter((option) => option.label.toLowerCase().includes(normalized)) : options;
    const numbered = numberedOptions(options, mode);
    useEffect(() => {
        if (!open) return;
        setQuery("");
        setActive(Math.max(0, options.findIndex((option) => option.value === value)));
        // Only reset when the menu opens; option identity changes on every render.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open]);

    function choose(option: PropertyOption<V> | undefined) {
        if (!option) return;
        if (option.value !== value) onSelect(option.value);
        onOpenChange(false);
    }

    return (
        <Popover.Root open={open} onOpenChange={onOpenChange}>
            <Popover.Trigger aria-label={label} aria-keyshortcuts={shortcut} disabled={disabled} className={propertyButton}>
                {children}
            </Popover.Trigger>
            <Popover.Portal>
                <Popover.Positioner side="bottom" align="start" sideOffset={4} collisionPadding={12} className="z-50">
                    <Popover.Popup className={cx("w-64 p-1", overlayChrome.popup, popupMotion)}>
                        <Popover.Title className="sr-only">{label}</Popover.Title>
                        <div className="mb-1 flex items-center gap-2 border-b border-subtle px-2 pb-1">
                            <input
                                autoFocus
                                value={query}
                                placeholder={placeholder}
                                aria-label={placeholder}
                                role="combobox"
                                aria-expanded="true"
                                aria-autocomplete="list"
                                aria-controls={listId}
                                aria-activedescendant={filtered[active] ? `${listId}-${active}` : undefined}
                                onChange={(event) => {
                                    setQuery(event.target.value);
                                    setActive(0);
                                }}
                                onKeyDown={(event) => {
                                    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                                        event.preventDefault();
                                        const step = event.key === "ArrowDown" ? 1 : -1;
                                        setActive((current) => (current + step + filtered.length) % Math.max(filtered.length, 1));
                                    } else if (event.key === "Enter") {
                                        event.preventDefault();
                                        if (!event.nativeEvent.isComposing) choose(filtered[active]);
                                    } else {
                                        const option = optionForKeyEvent(numbered, event, query);
                                        if (option) {
                                            event.preventDefault();
                                            choose(option);
                                        }
                                    }
                                }}
                                className="h-8 min-w-0 flex-1 bg-transparent text-[13px] text-primary outline-none placeholder:text-placeholder"
                            />
                            {numbered.hint && !query && <span className="shrink-0 text-[11px] text-placeholder tabular-nums">{numbered.hint}</span>}
                        </div>
                        <div id={listId} role="listbox" aria-label={label} className="max-h-72 overflow-y-auto">
                            {filtered.map((option, index) => (
                                <button
                                    key={option.key}
                                    id={`${listId}-${index}`}
                                    type="button"
                                    role="option"
                                    tabIndex={-1}
                                    aria-selected={option.value === value}
                                    aria-keyshortcuts={query ? undefined : numbered.ariaKeyFor(option)}
                                    onMouseEnter={() => setActive(index)}
                                    onClick={() => choose(option)}
                                    className={cx("flex h-8 w-full items-center gap-2.5 rounded px-2 text-left text-[13px] text-secondary transition-colors duration-100", index === active && "bg-layer-2-hover text-primary")}
                                >
                                    <span className="grid size-4 shrink-0 place-items-center">{option.icon}</span>
                                    <span className="min-w-0 flex-1 truncate">{option.label}</span>
                                    {option.value === value && <Check className="size-3.5 shrink-0 text-secondary" />}
                                    <OptionNumber value={query ? null : numbered.labelFor(option)} />
                                </button>
                            ))}
                            {filtered.length === 0 && <p className="px-2 py-2 text-[13px] text-placeholder">{t("common.noResults")}</p>}
                        </div>
                    </Popover.Popup>
                </Popover.Positioner>
            </Popover.Portal>
        </Popover.Root>
    );
}
