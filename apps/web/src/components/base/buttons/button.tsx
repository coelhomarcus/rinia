import type { AnchorHTMLAttributes, ButtonHTMLAttributes, FC, ReactNode } from "react";
import React, { isValidElement } from "react";
import { Button as BaseButton } from "@base-ui/react/button";
import { cx, sortCx } from "@/utils/cx";
import { isReactComponent } from "@/utils/is-react-component";
import { controlScale } from "@/components/base/control-scale";

/*
 * Buttons are pills at every size, in a 500 weight. Hover changes color at once and eases back over 150ms; nothing
 * moves when pressed. Primary and destructive are filled; secondary is a raised control with a hairline alpha edge
 * that darkens on hover, so it reads the same on the page, in a card and in a menu.
 */
export const styles = sortCx({
    common: {
        root: [
            "group relative inline-flex h-max cursor-pointer items-center justify-center rounded-full font-medium whitespace-nowrap select-none before:absolute",
            "transition-[color,background-color,border-color,box-shadow,opacity] duration-150 ease-out hover:duration-0",
            "outline-accent-strong focus-visible:outline-2 focus-visible:outline-offset-2",
            // When button is used within `InputGroup`
            "in-data-input-wrapper:rounded-md in-data-input-wrapper:shadow-xs in-data-input-wrapper:focus:!z-50 in-data-input-wrapper:in-data-leading:-mr-px in-data-input-wrapper:in-data-leading:rounded-r-none in-data-input-wrapper:in-data-leading:before:rounded-r-none in-data-input-wrapper:in-data-trailing:-ml-px in-data-input-wrapper:in-data-trailing:rounded-l-none in-data-input-wrapper:in-data-trailing:before:rounded-l-none",
            // Disabled styles
            "disabled:cursor-not-allowed disabled:opacity-60 in-data-input-wrapper:disabled:opacity-100",
            // Same as `icon` but for SSR icons that cannot be passed to the client as functions.
            "*:data-icon:pointer-events-none *:data-icon:size-4 *:data-icon:shrink-0 *:data-icon:transition-inherit-all",
        ].join(" "),
        icon: "pointer-events-none size-4 shrink-0 transition-inherit-all",
    },
    sizes: {
        xs: {
            root: [
                controlScale.button.xs,
                "gap-1 data-icon-only:size-5 data-icon-only:p-0 has-[>[data-icon=inline-start]]:pl-1",
                "in-data-input-wrapper:px-3 in-data-input-wrapper:data-icon-only:size-7",
                "*:data-icon:size-3.5",
            ].join(" "),
            linkRoot: "gap-1 *:data-text:underline-offset-3",
        },
        sm: {
            root: [
                controlScale.button.sm,
                "gap-1 data-icon-only:size-6 data-icon-only:p-0 has-[>[data-icon=inline-start]]:pl-1.5",
                "in-data-input-wrapper:px-3 in-data-input-wrapper:data-icon-only:size-8",
                "*:data-icon:size-3.5",
            ].join(" "),
            linkRoot: "gap-1 *:data-text:underline-offset-3",
        },
        md: {
            root: [
                controlScale.button.md,
                "gap-1 data-icon-only:size-7 data-icon-only:p-0 has-[>[data-icon=inline-start]]:pl-2",
                "in-data-input-wrapper:px-4 in-data-input-wrapper:data-icon-only:size-9",
                "*:data-icon:size-3.5",
            ].join(" "),
            linkRoot: "gap-1 *:data-text:underline-offset-4",
        },
        lg: {
            root: `${controlScale.button.lg} gap-2 data-icon-only:size-8 data-icon-only:p-0 has-[>[data-icon=inline-start]]:pl-2.5`,
            linkRoot: "gap-2 *:data-text:underline-offset-4",
        },
        xl: {
            root: `${controlScale.button.xl} gap-2 data-icon-only:size-10 data-icon-only:p-0 has-[>[data-icon=inline-start]]:pl-3.5`,
            linkRoot: "gap-2 *:data-text:underline-offset-4",
        },
    },

    colors: {
        primary: {
            root: [
                "bg-accent-primary text-white shadow-raised-100",
                "hover:bg-accent-primary-hover active:bg-accent-primary-hover data-loading:bg-accent-primary-hover",
                "*:data-icon:text-current",
            ].join(" "),
        },
        secondary: {
            root: [
                "bg-layer-2 text-secondary shadow-[0_0_0_0.5px_var(--border-control),var(--elevation-low)]",
                "hover:bg-layer-2-hover hover:text-primary hover:shadow-[0_0_0_0.5px_var(--border-control-hover),var(--elevation-low)]",
                "active:bg-layer-2-hover data-loading:bg-layer-2-hover",
                // Icon styles
                "*:data-icon:text-tertiary hover:*:data-icon:text-secondary",
            ].join(" "),
        },
        tertiary: {
            root: [
                "text-tertiary hover:bg-layer-transparent-hover hover:text-secondary active:bg-layer-transparent-active data-loading:bg-layer-transparent-hover",
                // Icon styles
                "*:data-icon:text-tertiary hover:*:data-icon:text-secondary",
            ].join(" "),
        },
        "link-color": {
            root: [
                "justify-normal rounded p-0! text-accent-primary hover:text-accent-secondary",
                // Inner text underline
                "*:data-text:underline *:data-text:decoration-transparent hover:*:data-text:decoration-current",
                // Icon styles
                "*:data-icon:text-current",
            ].join(" "),
        },
        "link-gray": {
            root: [
                "justify-normal rounded p-0! text-tertiary hover:text-secondary",
                // Inner text underline
                "*:data-text:underline *:data-text:decoration-transparent hover:*:data-text:decoration-current",
                // Icon styles
                "*:data-icon:text-current",
            ].join(" "),
        },
        "primary-destructive": {
            root: [
                "bg-danger-primary text-white",
                "hover:bg-danger-primary-hover active:bg-danger-primary-hover data-loading:bg-danger-primary-hover",
                "focus-visible:outline-danger-strong",
                "*:data-icon:text-current",
            ].join(" "),
        },
        "secondary-destructive": {
            root: [
                "bg-layer-2 text-danger-primary shadow-[0_0_0_0.5px_var(--border-control),var(--elevation-low)]",
                "hover:bg-danger-subtle hover:shadow-[0_0_0_0.5px_var(--border-danger-subtle),var(--elevation-low)] data-loading:bg-danger-subtle",
                "focus-visible:outline-danger-strong",
                // Icon styles
                "*:data-icon:text-current",
            ].join(" "),
        },
        "tertiary-destructive": {
            root: [
                "text-danger-primary hover:bg-danger-subtle data-loading:bg-danger-subtle focus-visible:outline-danger-strong",
                // Icon styles
                "*:data-icon:text-current",
            ].join(" "),
        },
        "link-destructive": {
            root: [
                "justify-normal rounded p-0! text-danger-primary hover:text-danger-secondary focus-visible:outline-danger-strong",
                // Inner text underline
                "*:data-text:underline *:data-text:decoration-transparent *:data-text:underline-offset-2 hover:*:data-text:decoration-current",
                // Icon styles
                "*:data-icon:text-current",
            ].join(" "),
        },
    },
});

/**
 * Common props shared between button and anchor variants
 */
export interface CommonProps {
    /** Disables the button and shows a disabled state */
    isDisabled?: boolean;
    /** Shows a loading spinner and disables the button */
    isLoading?: boolean;
    /** The size variant of the button */
    size?: keyof typeof styles.sizes;
    /** The color variant of the button */
    color?: keyof typeof styles.colors;
    /** Icon component or element to show before the text */
    iconLeading?: FC<{ className?: string }> | ReactNode;
    /** Icon component or element to show after the text */
    iconTrailing?: FC<{ className?: string }> | ReactNode;
    /** Removes horizontal padding from the text content */
    noTextPadding?: boolean;
    /** When true, keeps the text visible during loading state */
    showTextWhileLoading?: boolean;
}

/**
 * Props for the button variant (non-link)
 */
export interface ButtonProps extends CommonProps, Omit<ButtonHTMLAttributes<HTMLButtonElement>, "color"> {
    onPress?: () => void;
}

/**
 * Props for the link variant (anchor tag)
 */
interface LinkProps extends CommonProps, Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "color"> {
    onPress?: () => void;
}

/** Union type of button and link props */
export type Props = ButtonProps | LinkProps;

export const Button = ({
    size = "sm",
    color = "primary",
    children,
    className,
    noTextPadding,
    iconLeading: IconLeading,
    iconTrailing: IconTrailing,
    isDisabled: disabled,
    isLoading: loading,
    showTextWhileLoading,
    onPress,
    ...otherProps
}: Props) => {
    const href = "href" in otherProps ? otherProps.href : undefined;

    const isIcon = (IconLeading || IconTrailing) && !children;
    const isLinkType = ["link-gray", "link-color", "link-destructive"].includes(color);

    noTextPadding = noTextPadding ?? true;

    const props = href
        ? { ...otherProps, href: disabled || loading ? undefined : href, onClick: onPress ? () => onPress() : otherProps.onClick }
        : { ...otherProps, type: otherProps.type || "button", disabled: disabled || loading, onClick: onPress ? () => onPress() : otherProps.onClick };

    const Component = (href ? "a" : BaseButton) as React.ElementType;
    const componentProps = props as Record<string, unknown>;

    return (
        <Component
            data-loading={loading ? true : undefined}
            data-icon-only={isIcon ? true : undefined}
            {...componentProps}
            className={cx(
                styles.common.root,
                styles.sizes[size].root,
                styles.colors[color].root,
                isLinkType && styles.sizes[size].linkRoot,
                (loading || (href && (disabled || loading))) && "pointer-events-none",
                // If in `loading` state, hide everything except the loading icon (and text if `showTextWhileLoading` is true).
                loading && (showTextWhileLoading ? "[&>*:not([data-icon=loading]):not([data-text])]:hidden" : "[&>*:not([data-icon=loading])]:invisible"),
                className,
            )}
        >
            {/* Leading icon */}
            {isValidElement(IconLeading) && IconLeading}
            {isReactComponent(IconLeading) && <IconLeading data-icon="inline-start" className={styles.common.icon} />}

            {loading && (
                <svg
                    fill="none"
                    data-icon="loading"
                    viewBox="0 0 20 20"
                    className={cx(styles.common.icon, !showTextWhileLoading && "absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2")}
                >
                    {/* Background circle */}
                    <circle className="stroke-current opacity-30" cx="10" cy="10" r="8" fill="none" strokeWidth="2" />
                    {/* Spinning circle */}
                    <circle
                        className="origin-center animate-spin stroke-current"
                        cx="10"
                        cy="10"
                        r="8"
                        fill="none"
                        strokeWidth="2"
                        strokeDasharray="12.5 50"
                        strokeLinecap="round"
                    />
                </svg>
            )}

            {children && (
                <span data-text className={cx("transition-inherit-all", !noTextPadding && "px-0.5")}>
                    {children}
                </span>
            )}

            {/* Trailing icon */}
            {isValidElement(IconTrailing) && IconTrailing}
            {isReactComponent(IconTrailing) && <IconTrailing data-icon="inline-end" className={styles.common.icon} />}
        </Component>
    );
};
