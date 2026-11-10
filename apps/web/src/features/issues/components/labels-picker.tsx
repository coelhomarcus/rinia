import { useEffect, useRef, useState, type ReactNode, type SyntheticEvent } from "react";
import { Popover } from "@base-ui/react/popover";
import { X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { CheckboxBase } from "@/components/base/checkbox/checkbox";
import { Sheet } from "@/components/base/sheet/sheet";
import { overlayChrome } from "@/components/overlay/overlay-chrome";
import { cx } from "@/utils/cx";

export type LabelOption = { id: string; name: string; color: string | null };
/** Checked on every issue, on some of them (when editing several at once), or on none. */
export type LabelCheck = "checked" | "mixed" | "unchecked";

const popupMotion =
    "origin-[var(--transform-origin)] transition-[opacity,transform] duration-150 ease-out data-[ending-style]:scale-95 data-[ending-style]:opacity-0 data-[starting-style]:scale-95 data-[starting-style]:opacity-0";

export const labelColor = (label: { color: string | null }) => label.color ?? "#7a5af8";

/** A label as a small pill: its color dot and name. */
export function LabelChip({ label, className }: { label: LabelOption; className?: string }) {
    return (
        <span className={cx("flex h-5 min-w-0 items-center gap-1 rounded-full border border-subtle px-1.5 text-[11px] text-secondary", className)}>
            <span className="size-1.5 shrink-0 rounded-full" style={{ backgroundColor: labelColor(label) }} />
            <span className="truncate">{label.name}</span>
        </span>
    );
}

/**
 * Picks any number of labels. Each toggle applies right away and the list stays open, so several labels go on
 * in one visit. Typing filters the list; arrows move and Enter toggles.
 */
export function LabelsPicker({
    labels,
    state,
    onToggle,
    open,
    onOpenChange,
    onClose,
    triggerClassName,
    triggerLabel,
    stopPropagation = false,
    presentation = "popover",
    children,
}: {
    labels: LabelOption[];
    /** Whether each label is on. Labels missing from it are off. */
    state: (labelId: string) => LabelCheck;
    /** `add` is false only when the label is on everywhere; a partly applied label is completed first. */
    onToggle: (labelId: string, add: boolean) => void;
    open?: boolean;
    onOpenChange?: (open: boolean) => void;
    /** Called when the list closes, so pending toggles can be forgotten. */
    onClose?: () => void;
    triggerClassName?: string;
    triggerLabel: string;
    /** For triggers inside clickable rows and cards, which must not also open the issue. */
    stopPropagation?: boolean;
    presentation?: "popover" | "sheet";
    children: ReactNode;
}) {
    const { t } = useTranslation();
    const [ownOpen, setOwnOpen] = useState(false);
    const isOpen = open ?? ownOpen;
    const setOpen = (next: boolean) => {
        (onOpenChange ?? setOwnOpen)(next);
        if (!next) onClose?.();
    };
    const [query, setQuery] = useState("");
    const [active, setActive] = useState(0);
    const normalized = query.trim().toLowerCase();
    const filtered = normalized ? labels.filter((label) => label.name.toLowerCase().includes(normalized)) : labels;
    const stop = (event: SyntheticEvent) => stopPropagation && event.stopPropagation();
    const contained = { onClick: stop, onPointerDown: stop };
    useEffect(() => {
        if (!isOpen) return;
        setQuery("");
        setActive(0);
    }, [isOpen]);
    const toggle = (label: LabelOption | undefined) => label && onToggle(label.id, state(label.id) !== "checked");
    const sheet = presentation === "sheet";
    const search = (
        <div className={cx("flex items-center gap-2 border-b border-subtle", sheet ? "px-3 py-2" : "mb-1 px-2 pb-1")}>
            <input
                autoFocus
                value={query}
                placeholder={t("issue.addLabelPlaceholder")}
                aria-label={t("issue.addLabelPlaceholder")}
                onChange={(event) => {
                    setQuery(event.target.value);
                    setActive(0);
                }}
                onKeyDown={(event) => {
                    if (stopPropagation) event.stopPropagation();
                    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                        event.preventDefault();
                        const step = event.key === "ArrowDown" ? 1 : -1;
                        setActive((current) => (current + step + filtered.length) % Math.max(filtered.length, 1));
                    } else if (event.key === "Enter") {
                        event.preventDefault();
                        toggle(filtered[active]);
                    }
                }}
                className={cx("min-w-0 flex-1 bg-transparent text-[13px] text-primary outline-none placeholder:text-placeholder", sheet ? "h-11" : "h-8")}
            />
            {!sheet && <kbd className="rounded border border-subtle px-1.5 font-sans text-[11px] text-tertiary">L</kbd>}
        </div>
    );
    const list = (
        <div role="listbox" aria-multiselectable="true" aria-label={t("issue.labels")} className={sheet ? "min-h-0 flex-1 overflow-y-auto px-2 py-1" : "max-h-72 overflow-y-auto"}>
            {filtered.map((label, index) => {
                const check = state(label.id);
                return (
                    <button
                        key={label.id}
                        type="button"
                        role="option"
                        aria-selected={check === "checked"}
                        onMouseEnter={() => setActive(index)}
                        onClick={() => toggle(label)}
                        className={cx(
                            "flex w-full items-center gap-2.5 rounded px-2 text-left text-[13px] text-secondary transition-colors duration-100",
                            sheet ? "min-h-11" : "h-8",
                            index === active && "bg-layer-2-hover text-primary",
                        )}
                    >
                        <CheckboxBase isSelected={check === "checked"} isIndeterminate={check === "mixed"} />
                        <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: labelColor(label) }} />
                        <span className="min-w-0 flex-1 truncate">{label.name}</span>
                    </button>
                );
            })}
            {filtered.length === 0 && <p className="px-2 py-2 text-[13px] text-placeholder">{t("common.noResults")}</p>}
        </div>
    );

    if (sheet) {
        return (
            <>
                <button type="button" aria-label={triggerLabel} aria-expanded={isOpen} className={triggerClassName} {...contained} onKeyDown={stop} onClick={() => setOpen(true)}>
                    {children}
                </button>
                <Sheet open={isOpen} onOpenChange={setOpen} title={t("issue.labels")} side="bottom" nested size="full">
                    <header className="flex h-11 shrink-0 items-center justify-between gap-3 border-b border-subtle px-4">
                        <h2 className="text-[13px] font-medium text-primary">{t("issue.labels")}</h2>
                        <button type="button" aria-label={t("common.close")} onClick={() => setOpen(false)} className="grid size-11 place-items-center rounded-md text-tertiary hover:bg-layer-transparent-hover hover:text-primary">
                            <X className="size-4" />
                        </button>
                    </header>
                    {search}
                    {list}
                </Sheet>
            </>
        );
    }

    return (
        <Popover.Root open={isOpen} onOpenChange={setOpen}>
            <Popover.Trigger aria-label={triggerLabel} className={triggerClassName} {...contained} onKeyDown={stop}>
                {children}
            </Popover.Trigger>
            <Popover.Portal>
                <Popover.Positioner side="bottom" align="start" sideOffset={4} collisionPadding={12} className="z-[60]">
                    <Popover.Popup className={cx("w-64 p-1", overlayChrome.popup, popupMotion)} {...contained}>
                        <Popover.Title className="sr-only">{t("issue.labels")}</Popover.Title>
                        {search}
                        {list}
                    </Popover.Popup>
                </Popover.Positioner>
            </Popover.Portal>
        </Popover.Root>
    );
}

/** The labels behind `categoryIds`, in that order, skipping any the project no longer has. */
export function resolveLabels(categoryIds: string[], byId: Map<string, LabelOption>) {
    return categoryIds.flatMap((id) => {
        const label = byId.get(id);
        return label ? [label] : [];
    });
}

/**
 * Toggles one issue's labels. Each toggle builds on the last one sent, not on the issue as last loaded, so quick
 * toggles in a row never drop one another while the saves are on their way.
 */
export function useLabelToggle(current: string[], onChange: (categoryIds: string[]) => void) {
    const pending = useRef<string[] | null>(null);
    return {
        state: (id: string): LabelCheck => ((pending.current ?? current).includes(id) ? "checked" : "unchecked"),
        toggle: (id: string, add: boolean) => {
            const next = toggleLabel(pending.current ?? current, id, add);
            pending.current = next;
            onChange(next);
        },
        reset: () => {
            pending.current = null;
        },
    };
}

/** Adds or removes one label from a set, keeping the order labels were added in. */
export function toggleLabel(current: string[], labelId: string, add: boolean) {
    return add ? (current.includes(labelId) ? current : [...current, labelId]) : current.filter((id) => id !== labelId);
}
