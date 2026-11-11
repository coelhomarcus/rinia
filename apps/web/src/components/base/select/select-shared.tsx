import type { FC, ReactNode } from "react";
import { createContext, isValidElement } from "react";
import { controlScale } from "@/components/base/control-scale";
import { isReactComponent } from "@/utils/is-react-component";

export type SelectItemType = {
    /** Unique identifier for the item. */
    id: string | number;
    /** The primary display text. */
    label?: string;
    /** Avatar image URL. */
    avatarUrl?: string;
    /** Whether the item is disabled. */
    isDisabled?: boolean;
    /** Secondary text displayed alongside the label. */
    supportingText?: string;
    /** Leading icon component or element. */
    icon?: FC | ReactNode;
};

export interface CommonProps {
    /** Helper text displayed below the input. */
    hint?: string;
    /** Field label displayed above the input. */
    label?: string;
    /** Tooltip text for the help icon next to the label. */
    tooltip?: string;
    /**
     * The size of the component.
     * @default "md"
     */
    size?: "sm" | "md" | "lg";
    /** Placeholder text when no value is selected. */
    placeholder?: string;
    /** Whether to hide the required indicator from the label. */
    hideRequiredIndicator?: boolean;
}

/** Heights follow the field scale; icons size themselves (`SelectItemGraphic`), so a wider graphic such as a theme swatch keeps its shape. */
export const sizes = {
    sm: { root: `${controlScale.field.sm} gap-2`, item: "h-7", text: "text-[13px]", textContainer: "gap-x-2", shortcut: "pr-2" },
    md: { root: `${controlScale.field.md} gap-2`, item: "h-8", text: "text-[13px]", textContainer: "gap-x-2", shortcut: "pr-2" },
    lg: { root: `${controlScale.field.lg} gap-2`, item: "h-9", text: "text-md", textContainer: "gap-x-2", shortcut: "pr-2" },
};

export const SelectContext = createContext<{ size: "sm" | "md" | "lg" }>({ size: "md" });

export function SelectItemGraphic({ icon }: { icon?: FC | ReactNode }) {
    if (!icon) return null;
    if (isReactComponent(icon)) {
        const Icon = icon as FC<{ className?: string }>;
        return <Icon data-icon aria-hidden="true" className="size-4 shrink-0 text-tertiary" />;
    }
    if (isValidElement(icon)) {
        return <span data-icon className="inline-flex shrink-0 items-center justify-center [&>svg]:size-4">{icon}</span>;
    }
    return null;
}
