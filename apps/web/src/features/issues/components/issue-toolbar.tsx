import { type FC, type ReactElement, type ReactNode, useMemo } from "react";
import { Menu } from "@base-ui/react/menu";
import { Popover } from "@base-ui/react/popover";
import type { IssueView } from "@rinia/shared";
import type { TFunction } from "i18next";
import { CalendarClock, CalendarDays, CalendarX2, Check, ChevronRight, CircleDashed, Hash, History, List, ListFilter, Minus, Plus, Search, SignalHigh, SlidersHorizontal, Tag, UserRound, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router";
import { AutoWidth } from "@/components/base/auto-width";
import { Button } from "@/components/base/buttons/button";
import { Tooltip } from "@/components/base/tooltip/tooltip";
import { CheckboxBase } from "@/components/base/checkbox/checkbox";
import { Presence, Reveal, usePresence } from "@/components/base/presence";
import { Select } from "@/components/base/select/select";
import { overlayChrome } from "@/components/overlay/overlay-chrome";
import { IssueAvatar, PriorityIcon, StateIcon } from "@/features/board/components/issue-property-icons";
import { useColumns } from "@/features/board/hooks/use-board";
import { useCategories } from "@/features/categories/hooks/use-categories";
import { PRIORITY_OPTIONS, priorityLabelKey } from "@/features/issues/lib/priority";
import { useProjectMembers } from "@/features/projects/hooks/use-project-members";
import { translateStatusName } from "@/i18n/status-label";
import { cx } from "@/utils/cx";
import { readIssueOrder, readLabels } from "../lib/issue-filters";
import { issueViews } from "../views";

/** Late open issues, and those due between today and Saturday. Shared with lists that span projects. */
export function dueFilter(t: TFunction): IssueFilter {
    return {
        key: "due",
        label: t("issue.dueDate"),
        icon: CalendarDays,
        items: [
            { id: "overdue", name: t("issue.overdue"), icon: <CalendarX2 className="size-3.5 text-danger-primary" /> },
            { id: "thisWeek", name: t("issue.dueThisWeek"), icon: <CalendarClock className="size-3.5 text-warning-primary" /> },
        ],
    };
}

/** A filter people can add. A `multiple` filter keeps several comma-separated ids and matches issues with any of them. */
export type IssueFilter = {
    key: string;
    label: string;
    icon?: FC<{ className?: string }>;
    multiple?: boolean;
    items: Array<{ id: string; name: string; icon?: ReactNode; avatarUrl?: string | null }>;
};
type DisplayOption = { id: string; label: string; icon: FC<{ className?: string }> };

/** Round icon buttons, the look of every icon control in the issues bar. */
export const roundIconButton = "rounded-full";

export { pillTab } from "@/components/base/pill-tab";

const menuItem =
    "flex h-8 cursor-pointer items-center gap-2 rounded-lg px-2 text-[13px] text-secondary outline-none data-highlighted:bg-menu-hover data-highlighted:text-primary";

/** The project's filters (or a cross-project list's own), what the address has on, and a setter that writes it. */
export function useIssueFilters(projectId = "", customFilters?: IssueFilter[]) {
    const [query, setQuery] = useSearchParams();
    const { t } = useTranslation();
    const { data: columns } = useColumns(customFilters ? "" : projectId);
    const { data: categories } = useCategories(customFilters ? "" : projectId);
    const { data: members } = useProjectMembers(customFilters ? "" : projectId);
    const filters: IssueFilter[] = customFilters ?? [
        {
            key: "status",
            label: t("issue.status"),
            icon: CircleDashed,
            items: (columns ?? []).map((item) => ({
                id: item.id,
                name: translateStatusName(item.name, t),
                icon: <StateIcon name={item.name} color={item.color} />,
            })),
        },
        {
            key: "priority",
            label: t("issue.priority"),
            icon: SignalHigh,
            items: PRIORITY_OPTIONS.map((id) => ({ id, name: t(priorityLabelKey(id)), icon: <PriorityIcon priority={id} /> })),
        },
        {
            key: "assignee",
            label: t("issue.assignee"),
            icon: UserRound,
            items: (members ?? []).map((member) => ({
                id: member.id,
                name: member.name,
                avatarUrl: member.avatarUrl,
                icon: <IssueAvatar name={member.name} avatarUrl={member.avatarUrl} />,
            })),
        },
        {
            key: "label",
            label: t("issue.label"),
            icon: Tag,
            multiple: true,
            items: (categories ?? []).map((item) => ({
                id: item.id,
                name: item.name,
                icon: <Tag className="size-3.5" style={{ color: item.color ?? "#7a5af8" }} />,
            })),
        },
        dueFilter(t),
    ];

    function update(changes: Record<string, string>) {
        setQuery(
            (current) => {
                const next = new URLSearchParams(current);
                for (const [key, value] of Object.entries(changes)) {
                    if (value) next.set(key, value);
                    else next.delete(key);
                }
                return next;
            },
            { replace: true },
        );
    }

    return {
        filters,
        query,
        set: (key: string, value: string) => update({ [key]: value }),
        /** Turns off every filter and the search, leaving grouping, order, and layout as they are. */
        clear: () => update(Object.fromEntries([...filters.map((filter) => [filter.key, ""]), ["q", ""]])),
        active: filters.filter((filter) => query.get(filter.key)).length + (query.get("q") ? 1 : 0),
    };
}

/** The filter and display controls on the right of the issues bar, as round icon buttons. */
export function IssueToolbar({
    projectId = "",
    filters: customFilters,
    orders,
    groups,
    defaultOrder = "position",
    defaultGroup = "status",
    layout = "list",
    onLayoutChange,
}: {
    /** The project whose states, priorities, people, and labels fill the filters. Lists that span projects pass `filters` instead. */
    projectId?: string;
    filters?: IssueFilter[];
    /** The orders and groupings offered under Display, when they differ from a project's. */
    orders?: DisplayOption[];
    groups?: DisplayOption[];
    defaultOrder?: string;
    /** The grouping the page uses when the address names none. */
    defaultGroup?: string;
    layout?: IssueView;
    /** Offers the list and board switch at the top of Display. */
    onLayoutChange?: (layout: IssueView) => void;
}) {
    const { t } = useTranslation();
    const { filters, query, set } = useIssueFilters(projectId, customFilters);
    // A dot on Display says the order or grouping is not the default, as a filter pill would for filters.
    const displayChanged = !!(query.get("order") || query.get("group"));
    return (
        <div className="flex items-center gap-1">
            <FilterMenu
                filters={filters}
                query={query}
                set={set}
                align="end"
                trigger={
                    <Tooltip title={t("issue.addFilter")}>
                        <Button
                            aria-label={t("issue.addFilter")}
                            size="xs"
                            color="secondary"
                            className={roundIconButton}
                            iconLeading={ListFilter}
                        />
                    </Tooltip>
                }
            />
            <Popover.Root>
                <span className="relative flex">
                    <Tooltip title={t("issue.display")}>
                        <Popover.Trigger
                            render={
                                <Button
                                    aria-label={t("issue.display")}
                                    size="xs"
                                    color="secondary"
                                    className={roundIconButton}
                                    iconLeading={SlidersHorizontal}
                                />
                            }
                        />
                    </Tooltip>
                    {displayChanged && (
                        <span
                            aria-hidden="true"
                            className="border-surface-1 pointer-events-none absolute -top-0.5 -right-0.5 size-2 rounded-full border bg-accent-primary"
                        />
                    )}
                </span>
                <Popover.Portal>
                    <Popover.Positioner sideOffset={8} align="end" className="z-30">
                        <Popover.Popup className={cx("grid w-[min(300px,calc(100vw-32px))] gap-3", overlayChrome.popupPadded)}>
                            <Popover.Title className="sr-only">{t("issue.displayOptions")}</Popover.Title>
                            {onLayoutChange && (
                                <div role="group" aria-label={t("issue.view")} className="grid grid-cols-2 gap-1">
                                    {issueViews.map(({ value, icon: Icon, label }) => (
                                        <button
                                            key={value}
                                            type="button"
                                            aria-pressed={layout === value}
                                            onClick={() => onLayoutChange(value)}
                                            className={cx(
                                                "flex h-8 items-center justify-center gap-2 rounded-md border text-[13px] transition-colors",
                                                layout === value
                                                    ? "border-strong bg-layer-1-selected text-primary"
                                                    : "border-subtle text-tertiary hover:bg-layer-transparent-hover hover:text-primary",
                                            )}
                                        >
                                            <Icon className="size-4" />
                                            {t(label)}
                                        </button>
                                    ))}
                                </div>
                            )}
                            <DisplayRow label={t("issue.orderBy")}>
                                <Select
                                    aria-label={t("issue.orderBy")}
                                    size="sm"
                                    selectedKey={orders ? (query.get("order") ?? defaultOrder) : readIssueOrder(query.get("order"))}
                                    onSelectionChange={(value) => set("order", value === defaultOrder ? "" : String(value ?? ""))}
                                    items={
                                        orders ?? [
                                            { id: "position", label: t("issue.manualOrder"), icon: List },
                                            { id: "priority", label: t("issue.priority"), icon: SignalHigh },
                                            { id: "updated", label: t("issue.recentlyUpdated"), icon: History },
                                            { id: "number", label: t("issue.issueNumber"), icon: Hash },
                                            { id: "due", label: t("issue.dueDate"), icon: CalendarDays },
                                        ]
                                    }
                                >
                                    {(item) => (
                                        <Select.Item id={item.id} icon={item.icon}>
                                            {item.label}
                                        </Select.Item>
                                    )}
                                </Select>
                            </DisplayRow>
                            {layout === "list" && (
                                <DisplayRow label={t("issue.groupBy")}>
                                    <Select
                                        aria-label={t("issue.groupBy")}
                                        size="sm"
                                        selectedKey={query.get("group") ?? defaultGroup}
                                        onSelectionChange={(value) => set("group", value === defaultGroup ? "" : String(value ?? ""))}
                                        items={
                                            groups ?? [
                                                { id: "none", label: t("issue.noGrouping"), icon: Minus },
                                                { id: "status", label: t("issue.status"), icon: CircleDashed },
                                                { id: "assignee", label: t("issue.assignee"), icon: UserRound },
                                            ]
                                        }
                                    >
                                        {(item) => (
                                            <Select.Item id={item.id} icon={item.icon}>
                                                {item.label}
                                            </Select.Item>
                                        )}
                                    </Select>
                                </DisplayRow>
                            )}
                        </Popover.Popup>
                    </Popover.Positioner>
                </Popover.Portal>
            </Popover.Root>
        </div>
    );
}

function DisplayRow({ label, children }: { label: string; children: ReactNode }) {
    return (
        <div className="flex items-center justify-between gap-3">
            <span className="text-[13px] text-tertiary">{label}</span>
            <div className="w-40">{children}</div>
        </div>
    );
}

type FilterControls = { filters: IssueFilter[]; query: URLSearchParams; set: (key: string, value: string) => void };

/** Adds a filter: pick a property, then its values, the way Linear does. */
function FilterMenu({ filters, query, set, trigger, align = "start" }: FilterControls & { trigger: ReactElement; align?: "start" | "end" }) {
    const { t } = useTranslation();
    return (
        <Menu.Root>
            <Menu.Trigger render={trigger} />
            <Menu.Portal>
                <Menu.Positioner sideOffset={8} align={align} className="z-30">
                    <Menu.Popup className={cx("w-56", overlayChrome.menu)}>
                        <div className="px-2 py-1 text-[11px] text-placeholder">{t("issue.addFilter")}</div>
                        {filters.map((filter) => {
                            const Icon = filter.icon ?? ListFilter;
                            const count = readLabels(query.get(filter.key)).length;
                            return (
                                <Menu.SubmenuRoot key={filter.key}>
                                    <Menu.SubmenuTrigger className={menuItem}>
                                        <Icon className="size-4 text-tertiary" />
                                        <span className="flex-1 truncate">{filter.label}</span>
                                        {count > 0 && <span className="text-[11px] text-placeholder tabular-nums">{count}</span>}
                                        <ChevronRight className="size-3.5 text-placeholder" />
                                    </Menu.SubmenuTrigger>
                                    <Menu.Portal>
                                        <Menu.Positioner sideOffset={4} alignOffset={-4} className="z-30">
                                            <Menu.Popup className={cx("max-h-80 w-60 overflow-y-auto", overlayChrome.menu)}>
                                                <FilterValues filter={filter} query={query} set={set} />
                                            </Menu.Popup>
                                        </Menu.Positioner>
                                    </Menu.Portal>
                                </Menu.SubmenuRoot>
                            );
                        })}
                    </Menu.Popup>
                </Menu.Positioner>
            </Menu.Portal>
        </Menu.Root>
    );
}

/** One filter's values. Several can be on for a `multiple` filter; otherwise picking the chosen value again turns it off. */
function FilterValues({ filter, query, set }: { filter: IssueFilter; query: URLSearchParams; set: (key: string, value: string) => void }) {
    const { t } = useTranslation();
    const selected = readLabels(query.get(filter.key));
    if (filter.items.length === 0) return <div className="px-2 py-2 text-[13px] text-tertiary">{t("issue.noOptions")}</div>;
    return filter.items.map((item) =>
        filter.multiple ? (
            <Menu.CheckboxItem
                key={item.id}
                className={menuItem}
                checked={selected.includes(item.id)}
                onCheckedChange={(on) => set(filter.key, (on ? [...selected, item.id] : selected.filter((id) => id !== item.id)).join(","))}
            >
                <CheckboxBase isSelected={selected.includes(item.id)} />
                {item.icon}
                <span className="truncate">{item.name}</span>
            </Menu.CheckboxItem>
        ) : (
            <Menu.Item key={item.id} className={menuItem} onClick={() => set(filter.key, selected.includes(item.id) ? "" : item.id)}>
                {item.icon}
                <span className="flex-1 truncate">{item.name}</span>
                {selected.includes(item.id) && <Check className="size-3.5 text-primary" />}
            </Menu.Item>
        ),
    );
}

/**
 * The row under the issues bar that shows each filter as a pill (property, "is", values, remove), with "+" to add
 * another and Clear. It eases open with the first filter and closed with the last. `actions` sits on the right,
 * after Clear; `keepOpen` holds the row open without filters, for actions that still apply (a changed saved view).
 */
export function IssueFilterRow({
    projectId = "",
    filters: customFilters,
    actions,
    keepOpen = false,
    className,
}: {
    projectId?: string;
    filters?: IssueFilter[];
    actions?: ReactNode;
    keepOpen?: boolean;
    /** The background around the row, to match the content under it. */
    className?: string;
}) {
    const { t } = useTranslation();
    const { filters, query, set, clear, active } = useIssueFilters(projectId, customFilters);
    const search = query.get("q") ?? "";
    const activePills = [
        ...(search ? [{ key: "q", label: t("issue.search"), icon: Search, values: search, multiple: false, valueIcon: null as ReactNode, valueId: "" }] : []),
        ...filters
            .filter((filter) => query.get(filter.key))
            .map((filter) => {
                const ids = readLabels(query.get(filter.key));
                const chosen = filter.items.filter((item) => ids.includes(item.id));
                return {
                    key: filter.key,
                    label: filter.label,
                    icon: filter.icon ?? ListFilter,
                    values: chosen.map((item) => item.name).join(", ") || t("issue.selected"),
                    multiple: ids.length > 1,
                    valueIcon: chosen[0]?.icon,
                    valueId: chosen[0]?.id ?? "",
                };
            }),
    ];
    // The pill list only changes when a pill's filter or text does. Keeping it stable between those changes lets a
    // removed pill ease out with the text it had.
    const signature = JSON.stringify(activePills.map(({ key, values, valueId, multiple }) => [key, values, valueId, multiple]));
    const pills = useMemo(() => activePills, [signature]);
    const rows = usePresence(pills, (pill) => pill.key);

    return (
        <Reveal show={active > 0 || keepOpen}>
            <div className={cx("px-3 pb-2", className)}>
                <div className="flex items-start gap-2 rounded-lg border border-subtle bg-layer-transparent-hover p-1">
                    <div className="flex min-w-0 flex-1 flex-wrap items-center gap-y-1">
                        {rows.map((row) => {
                            const pill = row.item;
                            const filter = filters.find((candidate) => candidate.key === pill.key);
                            const Icon = pill.icon;
                            const value = (
                                <>
                                    {pill.valueIcon}
                                    <AutoWidth className="max-w-44 truncate">{pill.values}</AutoWidth>
                                </>
                            );
                            return (
                                <Presence key={row.key} axis="x" leaving={row.leaving} entering={row.entering}>
                                    <div className="pr-1">
                                        <div className="flex h-7 shrink-0 items-center rounded-full border border-subtle bg-layer-1 text-xs">
                                            <span className="flex items-center gap-1 pr-2 pl-2.5 text-secondary">
                                                <Icon className="size-3.5 text-tertiary" />
                                                {pill.label}
                                            </span>
                                            <span className="flex items-center self-stretch border-l border-subtle px-2 text-tertiary">
                                                <AutoWidth>
                                                    {pill.key === "q"
                                                        ? t("issue.filterContains")
                                                        : pill.multiple
                                                          ? t("issue.filterIsAnyOf")
                                                          : t("issue.filterIs")}
                                                </AutoWidth>
                                            </span>
                                            {filter ? (
                                                <Menu.Root>
                                                    <Menu.Trigger className="flex items-center gap-1 self-stretch border-l border-subtle px-2 text-primary transition-colors outline-none hover:bg-layer-1-hover focus-visible:bg-layer-1-hover data-[popup-open]:bg-layer-1-hover">
                                                        {value}
                                                    </Menu.Trigger>
                                                    <Menu.Portal>
                                                        <Menu.Positioner sideOffset={6} align="start" className="z-30">
                                                            <Menu.Popup className={cx("max-h-80 w-60 overflow-y-auto", overlayChrome.menu)}>
                                                                <div className="px-2 py-1 text-[11px] text-placeholder">{filter.label}</div>
                                                                <FilterValues filter={filter} query={query} set={set} />
                                                            </Menu.Popup>
                                                        </Menu.Positioner>
                                                    </Menu.Portal>
                                                </Menu.Root>
                                            ) : (
                                                <span className="flex items-center gap-1 self-stretch border-l border-subtle px-2 text-primary">{value}</span>
                                            )}
                                            <button
                                                type="button"
                                                aria-label={t("issue.clearFilter", { filter: pill.label })}
                                                onClick={() => set(pill.key, "")}
                                                className="grid w-7 place-items-center self-stretch rounded-r-full border-l border-subtle text-placeholder transition-colors hover:bg-layer-1-hover hover:text-primary"
                                            >
                                                <X className="size-3" />
                                            </button>
                                        </div>
                                    </div>
                                </Presence>
                            );
                        })}
                        <FilterMenu
                            filters={filters}
                            query={query}
                            set={set}
                            trigger={
                                <Tooltip title={t("issue.addFilter")}>
                                    <Button
                                        aria-label={t("issue.addFilter")}
                                        size="xs"
                                        color="tertiary"
                                        className={roundIconButton}
                                        iconLeading={Plus}
                                    />
                                </Tooltip>
                            }
                        />
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                        {active > 0 && (
                            <Button size="md" color="tertiary" className={roundIconButton} onClick={clear}>
                                {t("issue.clear")}
                            </Button>
                        )}
                        {actions}
                    </div>
                </div>
            </div>
        </Reveal>
    );
}
