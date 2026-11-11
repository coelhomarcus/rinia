import type { FC, ReactNode, RefAttributes } from "react";
import { useId } from "react";
import { Select as BaseSelect } from "@base-ui/react/select";
import { ChevronDown } from "lucide-react";
import { Avatar } from "@/components/base/avatar/avatar";
import { HintText } from "@/components/base/input/hint-text";
import { Label } from "@/components/base/input/label";
import { cx } from "@/utils/cx";
import { ComboBox } from "./combobox";
import { SelectItem } from "./select-item";
import { type CommonProps, SelectContext, SelectItemGraphic, type SelectItemType, sizes } from "./select-shared";
import { useTranslation } from "react-i18next";

export { SelectContext, sizes, type CommonProps, type SelectItemType } from "./select-shared";

export interface SelectProps extends RefAttributes<HTMLDivElement>, CommonProps {
    items?: SelectItemType[];
    popoverClassName?: string;
    icon?: FC | ReactNode;
    selectedKey?: string | number | null;
    defaultSelectedKey?: string | number | null;
    value?: string | number | null;
    defaultValue?: string | number | null;
    onSelectionChange?: (key: string | number | null) => void;
    onChange?: (value: string | number | null) => void;
    isDisabled?: boolean;
    isRequired?: boolean;
    isInvalid?: boolean;
    className?: string;
    "aria-label"?: string;
    children: ReactNode | ((item: SelectItemType) => ReactNode);
}

const SelectValue = ({
    icon,
    size,
    placeholder,
    items,
}: {
    icon?: FC | ReactNode;
    size: "sm" | "md" | "lg";
    placeholder?: string;
    items: SelectItemType[];
}) => (
    <BaseSelect.Value className={cx("flex min-w-0 flex-1 items-center gap-2 truncate text-left", sizes[size].text)} placeholder={placeholder}>
        {(value) => {
            const selected = value as SelectItemType | string | number | null;
            const selectedItem = (typeof selected === "object" && selected ? selected : items.find((item) => item.id === selected)) ?? null;
            const label = selectedItem?.label ?? (typeof selected === "string" || typeof selected === "number" ? String(selected) : null);

            return (
                <>
                    {selectedItem?.avatarUrl && <Avatar size="xs" src={selectedItem.avatarUrl} alt={selectedItem.label} />}
                    <SelectItemGraphic icon={selectedItem?.icon ?? icon} />
                    <span className={cx("min-w-0 truncate", label ? "text-secondary" : "text-placeholder")}>
                        {label ?? placeholder}
                        {selectedItem?.supportingText && <span className="text-tertiary"> {selectedItem.supportingText}</span>}
                    </span>
                </>
            );
        }}
    </BaseSelect.Value>
);

/** Field heights for the trigger, matching inputs of the same size. */
const triggerHeight = { sm: "h-7", md: "h-8", lg: "h-10" } as const;

const Select = ({
    placeholder,
    icon,
    size = "md",
    children,
    items = [],
    label,
    hint,
    tooltip,
    hideRequiredIndicator,
    className,
    popoverClassName,
    selectedKey,
    defaultSelectedKey,
    value,
    defaultValue,
    onSelectionChange,
    onChange,
    isDisabled,
    isRequired,
    isInvalid,
    "aria-label": ariaLabel,
    ...rest
}: SelectProps) => {
    const { t } = useTranslation();
    const resolvedPlaceholder = placeholder ?? t("common.select");
    const selectedValue = selectedKey !== undefined ? selectedKey : value;
    const initialValue = defaultSelectedKey !== undefined ? defaultSelectedKey : defaultValue;
    const triggerId = useId();
    const renderedItems = typeof children === "function" ? items.map((item) => children(item)) : children;

    return (
        <SelectContext.Provider value={{ size }}>
            <BaseSelect.Root
                {...rest}
                value={selectedValue}
                defaultValue={initialValue}
                items={items.map((item) => ({ value: item.id, label: item.label ?? String(item.id) }))}
                disabled={isDisabled}
                required={isRequired}
                onValueChange={(nextValue) => {
                    onSelectionChange?.(nextValue);
                    onChange?.(nextValue);
                }}
                aria-label={ariaLabel}
            >
                <div className={cx("flex flex-col gap-2", className)} data-invalid={isInvalid || undefined}>
                    {label && (
                        <Label htmlFor={triggerId} isRequired={hideRequiredIndicator ? false : isRequired} isInvalid={isInvalid} tooltip={tooltip}>
                            {label}
                        </Label>
                    )}
                    {/*
                     * A raised control like a secondary button, squared to a field: lighter than the card it sits on,
                     * a hairline edge that darkens on hover. It is as wide as its value unless the caller sizes it.
                     */}
                    <BaseSelect.Trigger
                        id={triggerId}
                        aria-label={ariaLabel ?? label}
                        className={cx(
                            "relative inline-flex w-full min-w-0 cursor-pointer items-center gap-2 rounded-lg bg-layer-2 pr-2 pl-3 outline-none select-none",
                            "shadow-[0_0_0_0.5px_var(--border-control),var(--elevation-low)] transition-[background-color,box-shadow] duration-150 hover:duration-0",
                            "hover:bg-layer-2-hover hover:shadow-[0_0_0_0.5px_var(--border-control-hover),var(--elevation-low)] data-[popup-open]:bg-layer-2-hover",
                            "outline-accent-strong focus-visible:outline-2 focus-visible:outline-offset-2",
                            "disabled:cursor-not-allowed disabled:opacity-60",
                            "aria-[invalid=true]:shadow-[0_0_0_1px_var(--border-danger-strong)]",
                            triggerHeight[size],
                        )}
                        aria-invalid={isInvalid || undefined}
                    >
                        <SelectValue icon={icon} size={size} placeholder={resolvedPlaceholder} items={items} />
                        <BaseSelect.Icon className="ml-auto shrink-0 text-tertiary">
                            <ChevronDown aria-hidden="true" className="size-3.5" strokeWidth={2.25} />
                        </BaseSelect.Icon>
                    </BaseSelect.Trigger>
                    {/* The list opens with the chosen option over the trigger, so the eye does not have to move to find it. */}
                    <BaseSelect.Portal>
                        <BaseSelect.Positioner className="z-50 outline-none" sideOffset={4} alignItemWithTrigger>
                            <BaseSelect.Popup
                                className={cx(
                                    "overlay-motion min-w-(--anchor-width) overflow-hidden rounded-xl border border-subtle bg-menu p-1 shadow-overlay-200 outline-none",
                                    popoverClassName,
                                )}
                            >
                                <BaseSelect.List className="flex max-h-80 flex-col gap-px overflow-y-auto outline-none">{renderedItems}</BaseSelect.List>
                            </BaseSelect.Popup>
                        </BaseSelect.Positioner>
                    </BaseSelect.Portal>
                    {hint && <HintText isInvalid={isInvalid}>{hint}</HintText>}
                </div>
            </BaseSelect.Root>
        </SelectContext.Provider>
    );
};

const _Select = Select as typeof Select & {
    ComboBox: typeof ComboBox;
    Item: typeof SelectItem;
};
_Select.ComboBox = ComboBox;
_Select.Item = SelectItem;

export { _Select as Select };
