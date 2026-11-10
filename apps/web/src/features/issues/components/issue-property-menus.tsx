import { useState, type ReactNode, type SyntheticEvent } from "react";
import { Menu } from "@base-ui/react/menu";
import { Tag } from "lucide-react";
import type { IssuePriority } from "@rinia/shared";
import { useTranslation } from "react-i18next";
import { overlayChrome } from "@/components/overlay/overlay-chrome";
import { PriorityIcon, StateIcon } from "@/features/board/components/issue-property-icons";
import { cx } from "@/utils/cx";
import { numberedOptions, optionForKeyEvent, type NumberingMode } from "../lib/numbered-options";
import { LabelChip, LabelsPicker, useLabelToggle } from "./labels-picker";
import { AssigneeAvatar, EstimateIcon, OptionNumber, UnassignedIcon, assigneeOptions, estimateOptions, priorityOptions, propertyIcon, statusOptions, type PropertyOption } from "./property-options";

export { AssigneeAvatar, UnassignedIcon, propertyIcon };

const menuItem = "flex h-8 cursor-pointer items-center gap-2 rounded px-2 text-[13px] text-secondary outline-none data-highlighted:bg-layer-2-hover";

type Person = { id: string; name: string; avatarUrl: string | null };
type Status = { id: string; name: string; color: string | null };
type Label = { id: string; name: string; color: string | null };

// These menus live inside clickable, draggable cards. Their events must not reach the card, and React
// bubbles events from the portaled popup through the component tree, so the trigger and popup both stop them.
const stop = (event: SyntheticEvent) => event.stopPropagation();
const contained = { onClick: stop, onPointerDown: stop, onKeyDown: stop };

/**
 * A property icon that opens a menu of values. `trigger` is what the icon shows. The number keys pick options
 * by the numbers `numberedOptions` assigns, the same ones the menu displays, and then close the menu.
 */
function PropertyMenu<V>({ property, label, triggerLabel, trigger, className, options, mode = "positional", value, onSelect }: {
    /** Names the menu for keyboard shortcuts that open it from outside (`data-property`). */
    property: string;
    label: string;
    triggerLabel?: string;
    trigger: ReactNode;
    className?: string;
    options: PropertyOption<V>[];
    mode?: NumberingMode;
    value: unknown;
    onSelect: (value: V) => void;
}) {
    const [open, setOpen] = useState(false);
    const numbered = numberedOptions(options, mode);

    function pick(option: PropertyOption<V>) {
        if (option.value !== value) onSelect(option.value);
        setOpen(false);
    }

    return (
        <Menu.Root open={open} onOpenChange={setOpen}>
            <Menu.Trigger
                aria-label={triggerLabel ?? label}
                data-property={property}
                className={cx("flex h-5 min-w-5 shrink-0 items-center justify-center gap-1 rounded outline-none hover:bg-layer-1-hover focus-visible:ring-2 focus-visible:ring-accent-strong", className)}
                {...contained}
            >
                {trigger}
            </Menu.Trigger>
            <Menu.Portal>
                <Menu.Positioner sideOffset={6} className="z-50">
                    <Menu.Popup
                        className={cx("max-h-80 w-56 overflow-y-auto", overlayChrome.menu)}
                        {...contained}
                        onKeyDown={(event) => {
                            event.stopPropagation();
                            const option = optionForKeyEvent(numbered, event);
                            if (!option) return;
                            event.preventDefault();
                            pick(option);
                        }}
                    >
                        <div className="flex items-center justify-between px-2 py-1 text-[11px] text-placeholder">
                            <span>{label}</span>
                            {numbered.hint && <span className="tabular-nums">{numbered.hint}</span>}
                        </div>
                        {options.map((option, index) => {
                            return (
                                <Menu.Item key={option.key} className={menuItem} aria-keyshortcuts={numbered.ariaKeyFor(option)} onClick={() => pick(option)}>
                                    {option.icon}
                                    <span className="flex-1 truncate">{option.label}</span>
                                    <OptionNumber value={numbered.labels[index]} />
                                </Menu.Item>
                            );
                        })}
                    </Menu.Popup>
                </Menu.Positioner>
            </Menu.Portal>
        </Menu.Root>
    );
}

function LabelIcon({ color, muted = false }: { color?: string | null; muted?: boolean }) {
    return <Tag className={cx(propertyIcon, "shrink-0", muted && "text-placeholder")} style={muted ? undefined : { color: color ?? "#7a5af8" }} />;
}

export function StatusMenu({ value, statuses, onChange, className }: { value?: Status; statuses: Status[]; onChange: (columnId: string) => void; className?: string }) {
    const { t } = useTranslation();
    return (
        <PropertyMenu
            property="status"
            label={t("issue.status")}
            className={cx("text-tertiary", className)}
            trigger={<StateIcon name={value?.name ?? ""} color={value?.color} className={propertyIcon} />}
            options={statusOptions(statuses, t)}
            value={value?.id}
            onSelect={onChange}
        />
    );
}

export function PriorityMenu({ value, onChange, className }: { value: string; onChange: (priority: IssuePriority) => void; className?: string }) {
    const { t } = useTranslation();
    return (
        <PropertyMenu
            property="priority"
            label={t("issue.priority")}
            className={className}
            trigger={<PriorityIcon priority={value} className={propertyIcon} />}
            options={priorityOptions(t)}
            value={value}
            onSelect={onChange}
        />
    );
}

export function AssigneeMenu({ value, people, onChange, className }: { value?: Person; people: Person[]; onChange: (assigneeId: string | null) => void; className?: string }) {
    const { t } = useTranslation();
    return (
        <PropertyMenu
            property="assignee"
            label={t("issue.assignee")}
            triggerLabel={value?.name ?? t("issue.unassigned")}
            className={className}
            trigger={value ? <AssigneeAvatar person={value} /> : <UnassignedIcon />}
            options={assigneeOptions(people, t)}
            value={value?.id ?? null}
            onSelect={onChange}
        />
    );
}

/** How many label chips a row or card shows before folding the rest into "+N". */
const VISIBLE_LABELS = 2;

/** Shows the issue's labels as chips; an unlabeled issue shows a faint icon to add some. Opens the multi-select picker. */
export function LabelMenu({ value, labels, onChange, className }: { value: Label[]; labels: Label[]; onChange: (categoryIds: string[]) => void; className?: string }) {
    const { t } = useTranslation();
    const editor = useLabelToggle(value.map((label) => label.id), onChange);
    const hidden = value.length - VISIBLE_LABELS;
    return (
        <LabelsPicker
            labels={labels}
            state={editor.state}
            onToggle={editor.toggle}
            onClose={editor.reset}
            stopPropagation
            triggerLabel={value.length ? value.map((label) => label.name).join(", ") : t("issue.addLabel")}
            triggerClassName={cx("flex h-5 min-w-0 shrink items-center gap-1 rounded outline-none hover:bg-layer-1-hover focus-visible:ring-2 focus-visible:ring-accent-strong data-[popup-open]:bg-layer-1-hover", className)}
        >
            {value.length === 0 && <LabelIcon muted />}
            {value.slice(0, VISIBLE_LABELS).map((label) => <LabelChip key={label.id} label={label} className="max-w-28" />)}
            {hidden > 0 && <span className="shrink-0 px-0.5 text-[11px] text-tertiary">+{hidden}</span>}
        </LabelsPicker>
    );
}

/** Shows the points next to the icon when the issue is estimated; otherwise a faint icon to set them. */
export function EstimateMenu({ value, onChange, className }: { value: number | null; onChange: (estimate: number | null) => void; className?: string }) {
    const { t } = useTranslation();
    return (
        <PropertyMenu
            property="estimate"
            label={t("issue.estimate")}
            triggerLabel={value != null ? t("projects.points", { count: value }) : t("issue.setEstimate")}
            className={cx(value != null && "px-1 text-[11px] text-secondary", className)}
            trigger={value != null ? <><EstimateIcon />{value}</> : <EstimateIcon muted />}
            options={estimateOptions(t)}
            mode="value"
            value={value}
            onSelect={onChange}
        />
    );
}
