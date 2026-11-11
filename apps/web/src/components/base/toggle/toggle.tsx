import type { ComponentProps, ReactNode } from "react";
import { Switch as BaseSwitch } from "@base-ui/react/switch";
import { cx } from "@/utils/cx";

/*
 * A switch: a gray track with a white knob that slides to the accent side when on. The knob sits 2px inside the track,
 * moves on the settle curve, and stretches a little while pressed, as a held finger squeezes it. Its look follows Base
 * UI's `data-checked`, so a switch nobody controls still shows its state.
 */
const sizes = {
    sm: { track: "h-5 w-8", thumb: "size-4 group-active/switch:w-[18px]", on: "data-[checked]:translate-x-3 group-active/switch:data-[checked]:translate-x-2.5" },
    md: { track: "h-6 w-10", thumb: "size-5 group-active/switch:w-[22px]", on: "data-[checked]:translate-x-4 group-active/switch:data-[checked]:translate-x-3.5" },
} as const;

const trackClass = cx(
    "group/switch relative inline-flex shrink-0 cursor-pointer items-center rounded-full bg-[var(--bg-switch-off)] p-0.5 outline-accent-strong",
    "transition-colors duration-200 ease-out data-[checked]:bg-accent-primary",
    "focus-visible:outline-2 focus-visible:outline-offset-2 data-[disabled]:cursor-not-allowed data-[disabled]:opacity-50",
);

const thumbClass = cx(
    "block rounded-full bg-white shadow-[0_1px_2px_rgb(0_0_0/0.25),0_0_0_0.5px_rgb(0_0_0/0.04)]",
    "transition-[translate,width] duration-200 ease-(--ease-out-quint) motion-reduce:transition-none",
);

interface ToggleProps extends Omit<ComponentProps<typeof BaseSwitch.Root>, "children" | "checked" | "defaultChecked" | "disabled" | "onCheckedChange" | "className"> {
    className?: string;
    size?: "sm" | "md";
    label?: string;
    hint?: ReactNode;
    isSelected?: boolean;
    defaultSelected?: boolean;
    isDisabled?: boolean;
    onChange?: (selected: boolean) => void;
}

export const Toggle = ({ label, hint, className, size = "sm", isSelected, defaultSelected, isDisabled, onChange, ...props }: ToggleProps) => {
    const switchElement = (
        <BaseSwitch.Root
            {...props}
            checked={isSelected}
            defaultChecked={defaultSelected}
            disabled={isDisabled}
            onCheckedChange={(checked) => onChange?.(checked)}
            className={cx(trackClass, sizes[size].track, !(label || hint) && className)}
        >
            <BaseSwitch.Thumb className={cx(thumbClass, sizes[size].thumb, sizes[size].on)} />
        </BaseSwitch.Root>
    );
    if (!label && !hint) return switchElement;
    // With a label, the whole line toggles the switch.
    return (
        <label className={cx("flex w-max cursor-pointer items-center gap-2", isDisabled && "cursor-not-allowed", className)}>
            {switchElement}
            <span className="flex flex-col gap-0.5">
                {label && <span className={cx("text-secondary select-none", size === "md" ? "text-md" : "text-[13px]")}>{label}</span>}
                {hint && <span className="text-xs text-tertiary">{hint}</span>}
            </span>
        </label>
    );
};
