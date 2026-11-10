import type { ComponentProps, ReactNode, Ref } from "react";
import { Checkbox as BaseCheckbox } from "@base-ui/react/checkbox";
import { cx } from "@/utils/cx";

export interface CheckboxBaseProps {
    size?: "sm" | "md";
    className?: string;
    isFocusVisible?: boolean;
    isSelected?: boolean;
    isDisabled?: boolean;
    isIndeterminate?: boolean;
}

export const CheckboxBase = ({ className, isSelected, isDisabled, isIndeterminate, size = "sm", isFocusVisible = false }: CheckboxBaseProps) => (
    <span
        aria-hidden="true"
        className={cx(
            "relative flex size-4 shrink-0 cursor-pointer appearance-none items-center justify-center rounded bg-surface-1 ring-1 ring-strong transition-[background-color,box-shadow,transform] duration-150 ease-out ring-inset motion-safe:group-active/checkbox:scale-90",
            size === "md" && "size-5 rounded-md",
            (isSelected || isIndeterminate) ? "bg-accent-primary ring-brand-solid" : !isDisabled && "group-hover/checkbox:ring-strong-1",
            isDisabled && "cursor-not-allowed opacity-50 group-active/checkbox:scale-100",
            isDisabled && !(isSelected || isIndeterminate) && "bg-layer-2",
            isFocusVisible && "outline-2 outline-offset-2 outline-accent-strong",
            className,
        )}
    >
        <svg viewBox="0 0 14 14" fill="none" className={cx("pointer-events-none absolute h-3 w-2.5 scale-50 text-fg-white opacity-0 transition-[opacity,transform] duration-150 ease-(--motion-ease-enter)", size === "md" && "size-3.5", isIndeterminate && "scale-100 opacity-100")}>
            <path d="M2.91675 7H11.0834" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <svg viewBox="0 0 14 14" fill="none" className={cx("pointer-events-none absolute size-3 scale-50 text-fg-white opacity-0 transition-[opacity,transform] duration-150 ease-(--motion-ease-enter)", size === "md" && "size-3.5", isSelected && !isIndeterminate && "scale-100 opacity-100")}>
            <path d="M11.6666 3.5L5.24992 9.91667L2.33325 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
    </span>
);
CheckboxBase.displayName = "CheckboxBase";

interface CheckboxProps extends Omit<ComponentProps<typeof BaseCheckbox.Root>, "className" | "children" | "checked" | "defaultChecked" | "onCheckedChange"> {
    ref?: Ref<HTMLButtonElement>;
    size?: "sm" | "md";
    label?: ReactNode;
    hint?: ReactNode;
    isSelected?: boolean;
    defaultSelected?: boolean;
    isDisabled?: boolean;
    isIndeterminate?: boolean;
    isInvalid?: boolean;
    isFocusVisible?: boolean;
    className?: string;
    onChange?: (checked: boolean) => void;
}

export const Checkbox = ({ label, hint, size = "sm", className, isSelected, defaultSelected, isDisabled, isIndeterminate, isInvalid, isFocusVisible, onChange, ref, ...props }: CheckboxProps) => {
    const sizes = size === "md" ? { root: "gap-2", text: "text-md", hint: "text-md" } : { root: "gap-2", text: "text-sm", hint: "text-sm" };

    return (
        <BaseCheckbox.Root
            {...props}
            ref={ref}
            checked={isSelected}
            defaultChecked={defaultSelected}
            indeterminate={isIndeterminate}
            disabled={isDisabled}
            aria-invalid={isInvalid || undefined}
            onCheckedChange={(checked) => onChange?.(checked === true)}
            className={cx("group/checkbox flex items-start", sizes.root, isDisabled && "cursor-not-allowed", className)}
        >
            <CheckboxBase size={size} isSelected={isSelected} isIndeterminate={isIndeterminate} isDisabled={isDisabled} isFocusVisible={isFocusVisible} className={label || hint ? "mt-0.5" : ""} />
            {(label || hint) && (
                <span className="inline-flex flex-col gap-1">
                    {label && <span className={cx("text-secondary select-none", sizes.text)}>{label}</span>}
                    {hint && <span className={cx("text-tertiary", sizes.hint)}>{hint}</span>}
                </span>
            )}
        </BaseCheckbox.Root>
    );
};
Checkbox.displayName = "Checkbox";
