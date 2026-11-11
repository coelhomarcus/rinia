import { useEffect, useMemo, useState, type ReactNode, type SyntheticEvent } from "react";
import { Popover } from "@base-ui/react/popover";
import { CalendarDays, ChevronLeft, ChevronRight, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Sheet } from "@/components/base/sheet/sheet";
import { overlayChrome } from "@/components/overlay/overlay-chrome";
import { addDays, dayToDate, dueState, dueStateClass, formatDueDate, localDay, nextWeek } from "@/features/issues/lib/due-date";
import { cx } from "@/utils/cx";

const popupMotion =
    "origin-[var(--transform-origin)] transition-[opacity,transform] duration-150 ease-out data-[ending-style]:scale-95 data-[ending-style]:opacity-0 data-[starting-style]:scale-95 data-[starting-style]:opacity-0";
const shortcutClass = "flex h-8 w-full items-center gap-2.5 rounded px-2 text-left text-[13px] text-secondary transition-colors duration-100 hover:bg-layer-2-hover hover:text-primary hover:duration-0";

/** Shortcuts, a month to pick any day from, and a way to clear the date. */
export function DueDateCalendar({ value, onChange, touch = false }: { value: string | null; onChange: (dueDate: string | null) => void; touch?: boolean }) {
    const { t, i18n } = useTranslation();
    const today = localDay();
    const [month, setMonth] = useState(() => (value ?? today).slice(0, 7));
    useEffect(() => {
        if (value) setMonth(value.slice(0, 7));
    }, [value]);

    const weeks = useMemo(() => {
        const first = dayToDate(`${month}-01`);
        const start = addDays(`${month}-01`, -first.getDay());
        return Array.from({ length: 6 }, (_, week) => Array.from({ length: 7 }, (_, day) => addDays(start, week * 7 + day)));
    }, [month]);
    const weekdays = useMemo(() => {
        const format = new Intl.DateTimeFormat(i18n.language, { weekday: "narrow" });
        return weeks[0].map((day) => format.format(dayToDate(day)));
    }, [i18n.language, weeks]);
    const monthLabel = new Intl.DateTimeFormat(i18n.language, { month: "long", year: "numeric" }).format(dayToDate(`${month}-01`));
    const shiftMonth = (step: number) => {
        const date = dayToDate(`${month}-01`);
        date.setMonth(date.getMonth() + step);
        setMonth(localDay(date).slice(0, 7));
    };
    const shortcuts = [
        { label: t("issue.dueToday"), day: today },
        { label: t("issue.dueTomorrow"), day: addDays(today, 1) },
        { label: t("issue.dueNextWeek"), day: nextWeek(today) },
    ];
    const row = touch ? "h-11" : undefined;
    const dayCell = touch ? "h-11" : "h-7";

    return (
        <div className="flex flex-col gap-1">
            {shortcuts.map((shortcut) => (
                <button key={shortcut.label} type="button" className={cx(shortcutClass, row)} onClick={() => onChange(shortcut.day)}>
                    <CalendarDays className="size-3.5 shrink-0 text-tertiary" />
                    <span className="flex-1">{shortcut.label}</span>
                    <span className="text-[11px] text-placeholder">{formatDueDate(shortcut.day, i18n.language)}</span>
                </button>
            ))}
            <div className="my-1 h-px bg-[var(--border-subtle)]" />
            <div className="flex items-center justify-between px-1">
                <span className="text-[13px] font-medium text-primary first-letter:uppercase">{monthLabel}</span>
                <span className="flex items-center gap-0.5">
                    <button type="button" aria-label={t("issue.previousMonth")} onClick={() => shiftMonth(-1)} className={cx("grid place-items-center rounded text-tertiary hover:bg-layer-2-hover hover:text-primary", touch ? "size-11" : "size-6")}>
                        <ChevronLeft className="size-3.5" />
                    </button>
                    <button type="button" aria-label={t("issue.nextMonth")} onClick={() => shiftMonth(1)} className={cx("grid place-items-center rounded text-tertiary hover:bg-layer-2-hover hover:text-primary", touch ? "size-11" : "size-6")}>
                        <ChevronRight className="size-3.5" />
                    </button>
                </span>
            </div>
            <div role="grid" aria-label={monthLabel} className="grid grid-cols-7 gap-0.5 px-0.5 text-center">
                {weekdays.map((weekday, index) => (
                    <span key={index} aria-hidden="true" className="py-1 text-[11px] text-placeholder">{weekday}</span>
                ))}
                {weeks.flat().map((day) => {
                    const selected = day === value;
                    const outside = !day.startsWith(month);
                    return (
                        <button
                            key={day}
                            type="button"
                            aria-pressed={selected}
                            aria-label={new Intl.DateTimeFormat(i18n.language, { dateStyle: "full" }).format(dayToDate(day))}
                            onClick={() => onChange(day)}
                            className={cx(
                                "grid place-items-center rounded text-[12px] tabular-nums transition-colors duration-100",
                                dayCell,
                                selected ? "bg-accent-primary text-white" : "hover:bg-layer-2-hover hover:text-primary",
                                !selected && (outside ? "text-placeholder" : "text-secondary"),
                                !selected && day === today && "font-semibold text-primary ring-1 ring-[var(--border-strong-1)] ring-inset",
                            )}
                        >
                            {Number(day.slice(8))}
                        </button>
                    );
                })}
            </div>
            {value && (
                <>
                    <div className="my-1 h-px bg-[var(--border-subtle)]" />
                    <button type="button" className={cx(shortcutClass, row)} onClick={() => onChange(null)}>
                        <X className="size-3.5 shrink-0 text-tertiary" />
                        {t("issue.clearDueDate")}
                    </button>
                </>
            )}
        </div>
    );
}

/** The calendar in a popover. Picking a day or clearing it closes the popover. */
export function DueDatePopover({
    value,
    onChange,
    open,
    onOpenChange,
    triggerClassName,
    triggerLabel,
    stopPropagation = false,
    presentation = "popover",
    children,
}: {
    value: string | null;
    onChange: (dueDate: string | null) => void;
    open?: boolean;
    onOpenChange?: (open: boolean) => void;
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
    const setOpen = onOpenChange ?? setOwnOpen;
    const stop = (event: SyntheticEvent) => stopPropagation && event.stopPropagation();
    const contained = { onClick: stop, onPointerDown: stop, onKeyDown: stop };
    const calendar = (
        <DueDateCalendar
            value={value}
            touch={presentation === "sheet"}
            onChange={(next) => {
                if (next !== value) onChange(next);
                setOpen(false);
            }}
        />
    );
    if (presentation === "sheet") {
        return (
            <>
                <button type="button" aria-label={triggerLabel} aria-expanded={isOpen} className={triggerClassName} {...contained} onClick={() => setOpen(true)}>
                    {children}
                </button>
                <Sheet open={isOpen} onOpenChange={setOpen} title={t("issue.dueDate")} side="bottom" nested size="full">
                    <header className="flex h-11 shrink-0 items-center justify-between gap-3 border-b border-subtle px-4">
                        <h2 className="text-[13px] font-medium text-primary">{t("issue.dueDate")}</h2>
                        <button type="button" aria-label={t("common.close")} onClick={() => setOpen(false)} className="grid size-11 place-items-center rounded-md text-tertiary hover:bg-layer-transparent-hover hover:text-primary">
                            <X className="size-4" />
                        </button>
                    </header>
                    <div className="min-h-0 flex-1 overflow-y-auto p-3">{calendar}</div>
                </Sheet>
            </>
        );
    }
    return (
        <Popover.Root open={isOpen} onOpenChange={setOpen}>
            <Popover.Trigger aria-label={triggerLabel} className={triggerClassName} {...contained}>
                {children}
            </Popover.Trigger>
            <Popover.Portal>
                <Popover.Positioner side="bottom" align="start" sideOffset={4} collisionPadding={12} className="z-50">
                    <Popover.Popup className={cx("w-64 p-1", overlayChrome.popup, popupMotion)} {...contained}>
                        <Popover.Title className="sr-only">{t("issue.dueDate")}</Popover.Title>
                        {calendar}
                    </Popover.Popup>
                </Popover.Positioner>
            </Popover.Portal>
        </Popover.Root>
    );
}

/** The due date as a small chip for list rows and board cards, colored when late or due today. */
export function DueDateMenu({ value, closed, onChange, className }: { value: string | null; closed: boolean; onChange: (dueDate: string | null) => void; className?: string }) {
    const { t, i18n } = useTranslation();
    const state = dueState(value, closed);
    const label = value ? t("issue.dueDateValue", { date: formatDueDate(value, i18n.language) }) : t("issue.setDueDate");
    return (
        <DueDatePopover
            value={value}
            onChange={onChange}
            stopPropagation
            triggerLabel={label}
            triggerClassName={cx(
                "flex h-5 shrink-0 items-center gap-1 rounded px-1 text-[11px] outline-none hover:bg-layer-1-hover focus-visible:ring-2 focus-visible:ring-accent-strong",
                state ? dueStateClass[state] : "text-tertiary",
                className,
            )}
        >
            <CalendarDays className="size-3.5 shrink-0" />
            {value && <span className="whitespace-nowrap">{formatDueDate(value, i18n.language)}</span>}
        </DueDatePopover>
    );
}
