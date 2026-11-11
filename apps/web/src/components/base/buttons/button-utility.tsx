import type { AnchorHTMLAttributes, ButtonHTMLAttributes, FC, ReactNode } from "react";
import { isValidElement } from "react";
import { Button as BaseButton } from "@base-ui/react/button";
import { Tooltip } from "@/components/base/tooltip/tooltip";
import { cx } from "@/utils/cx";
import { isReactComponent } from "@/utils/is-react-component";
import { controlScale } from "@/components/base/control-scale";

export const styles = {
    secondary: "bg-layer-2 text-tertiary shadow-[0_0_0_0.5px_var(--border-control),var(--elevation-low)] hover:bg-layer-2-hover hover:text-secondary hover:shadow-[0_0_0_0.5px_var(--border-control-hover),var(--elevation-low)]",
    tertiary: "text-tertiary hover:bg-layer-transparent-hover hover:text-secondary",
};

export interface CommonProps {
    isDisabled?: boolean;
    size?: "xs" | "sm";
    color?: "secondary" | "tertiary";
    icon?: FC<{ className?: string }> | ReactNode;
    tooltip?: string;
    tooltipPlacement?: "top" | "bottom" | "left" | "right";
}

export interface ButtonProps extends CommonProps, Omit<ButtonHTMLAttributes<HTMLButtonElement>, "color"> {}
interface LinkProps extends CommonProps, Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "color"> {}
export type Props = ButtonProps | LinkProps;

export const ButtonUtility = ({ tooltip, className, isDisabled, icon: Icon, size = "sm", color = "secondary", tooltipPlacement = "top", ...otherProps }: Props) => {
    const href = "href" in otherProps ? otherProps.href : undefined;
    const content = href ? (
        <a {...(otherProps as LinkProps)} href={isDisabled ? undefined : href} aria-disabled={isDisabled || undefined} className={cx("group relative inline-flex cursor-pointer items-center justify-center rounded-full transition-[color,background-color,box-shadow,opacity] duration-150 ease-out hover:duration-0 outline-accent-strong focus-visible:outline-2 focus-visible:outline-offset-2", controlScale.iconButton[size], isDisabled && "pointer-events-none opacity-60", styles[color], "*:data-icon:pointer-events-none *:data-icon:size-4 *:data-icon:shrink-0 *:data-icon:text-current", className)}>
            {isReactComponent(Icon) && <Icon data-icon />}{isValidElement(Icon) && Icon}
        </a>
    ) : (
        <BaseButton {...(otherProps as ButtonProps)} disabled={isDisabled} aria-label={tooltip} className={cx("group relative inline-flex cursor-pointer items-center justify-center rounded-full transition-[color,background-color,box-shadow,opacity] duration-150 ease-out hover:duration-0 outline-accent-strong focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-60", controlScale.iconButton[size], styles[color], "*:data-icon:pointer-events-none *:data-icon:size-4 *:data-icon:shrink-0 *:data-icon:text-current", className)}>
            {isReactComponent(Icon) && <Icon data-icon />}{isValidElement(Icon) && Icon}
        </BaseButton>
    );

    return tooltip ? <Tooltip title={tooltip} placement={tooltipPlacement} isDisabled={isDisabled} offset={size === "xs" ? 4 : 6}>{content}</Tooltip> : content;
};
