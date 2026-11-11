import { useContext } from "react";
import { Check } from "lucide-react";
import { Select as BaseSelect } from "@base-ui/react/select";
import { Avatar } from "@/components/base/avatar/avatar";
import { CheckboxBase } from "@/components/base/checkbox/checkbox";
import { cx } from "@/utils/cx";
import { SelectContext, SelectItemGraphic, sizes, type SelectItemType } from "./select-shared";

interface SelectItemProps extends SelectItemType {
    value?: string | number;
    selectionIndicator?: "checkmark" | "checkbox" | "none";
    selectionIndicatorAlign?: "left" | "right";
    children?: React.ReactNode;
    className?: string;
}

export const SelectItem = ({
    label,
    id,
    value,
    avatarUrl,
    supportingText,
    isDisabled,
    icon: Icon,
    className,
    children,
    selectionIndicator = "checkmark",
    selectionIndicatorAlign = "right",
}: SelectItemProps) => {
    const { size } = useContext(SelectContext);
    const text = label ?? (typeof children === "string" ? children : "");
    const isLeft = selectionIndicatorAlign === "left";

    return (
        <BaseSelect.Item
            value={value ?? id}
            label={text}
            disabled={isDisabled}
            className={cx(
                "flex w-full cursor-pointer items-center gap-2 rounded-lg px-2 text-secondary outline-none select-none",
                "data-[highlighted]:bg-menu-hover data-[highlighted]:text-primary data-[selected]:text-primary",
                "data-[disabled]:cursor-not-allowed data-[disabled]:opacity-50",
                sizes[size].item,
                sizes[size].text,
                className,
            )}
        >
            {isLeft && selectionIndicator === "checkbox" && <CheckboxBase size={size === "lg" ? "md" : "sm"} />}
            {avatarUrl && <Avatar aria-hidden="true" size="xs" src={avatarUrl} alt={label} />}
            <SelectItemGraphic icon={Icon} />
            <span className={cx("flex min-w-0 flex-1 items-baseline", sizes[size].textContainer)}>
                <span className="truncate whitespace-nowrap">{children ?? label}</span>
                {supportingText && <span className="whitespace-nowrap text-tertiary">{supportingText}</span>}
            </span>
            {/* The check stays quiet, the color of a secondary label; the row's highlight does the pointing. */}
            {selectionIndicator === "checkmark" && (
                <BaseSelect.ItemIndicator className="ml-3 shrink-0 text-tertiary">
                    <Check aria-hidden="true" className="size-4" />
                </BaseSelect.ItemIndicator>
            )}
            {!isLeft && selectionIndicator === "checkbox" && (
                <BaseSelect.ItemIndicator className="ml-auto">
                    <CheckboxBase size={size === "lg" ? "md" : "sm"} />
                </BaseSelect.ItemIndicator>
            )}
        </BaseSelect.Item>
    );
};
