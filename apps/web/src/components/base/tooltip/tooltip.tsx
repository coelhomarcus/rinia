import { useLayoutEffect, useRef, useState, type ComponentProps, type ReactElement, type ReactNode } from "react";
import { Tooltip as BaseTooltip } from "@base-ui/react/tooltip";
import { cx } from "@/utils/cx";

interface TooltipProps {
    title: ReactNode;
    description?: ReactNode;
    arrow?: boolean;
    delay?: number;
    offset?: number;
    placement?: string;
    children: ReactElement;
    isDisabled?: boolean;
}

/**
 * One provider for the whole app, so tooltips behave as a group: the first waits a moment, and once one is showing,
 * moving to a neighbor opens it at once and without animation (`data-instant`), as long as the pointer gets there
 * within the timeout.
 */
export const TooltipGroup = ({ children }: { children: ReactNode }) => (
    <BaseTooltip.Provider delay={500} closeDelay={0} timeout={400}>
        {children}
    </BaseTooltip.Provider>
);

export const Tooltip = ({ title, description, arrow = false, delay, offset = 6, placement = "top", children, isDisabled, ...props }: TooltipProps) => {
    const side = placement.split(" ")[0] as "top" | "bottom" | "left" | "right";

    return (
        <BaseTooltip.Root disabled={isDisabled}>
            {/* Popup props, including ref, land here when a dialog or menu clones this component. */}
            <BaseTooltip.Trigger {...props} delay={delay} render={children} />
            <BaseTooltip.Portal>
                <BaseTooltip.Positioner side={side} sideOffset={offset}>
                    <BaseTooltip.Popup className={cx("overlay-motion z-50 flex max-w-xs flex-col items-start gap-1 rounded-lg border border-subtle bg-menu px-2 shadow-overlay-200", description ? "py-2" : "py-1")}>
                        {arrow && <BaseTooltip.Arrow className="fill-menu" />}
                        <span className="text-xs font-medium text-secondary">{title}</span>
                        {description && <span className="text-xs text-tertiary">{description}</span>}
                    </BaseTooltip.Popup>
                </BaseTooltip.Positioner>
            </BaseTooltip.Portal>
        </BaseTooltip.Root>
    );
};

/** Shows `title` only when the text actually overflows. The node stays the same element either way. */
export function OverflowTooltip({ title, children, className, as: Tag = "span" }: { title: string; children: ReactNode; className?: string; as?: "p" | "span" }) {
    const ref = useRef<HTMLElement | null>(null);
    const [cut, setCut] = useState(false);
    useLayoutEffect(() => {
        const node = ref.current;
        if (!node) return;
        const measure = () => setCut(node.scrollWidth - node.clientWidth > 1 || node.scrollHeight - node.clientHeight > 1);
        measure();
        const observer = new ResizeObserver(measure);
        observer.observe(node);
        return () => observer.disconnect();
    }, [children, className, title]);
    const setRef = (node: HTMLElement | null) => {
        ref.current = node;
    };
    const element = Tag === "p" ? <p ref={setRef} className={className}>{children}</p> : <span ref={setRef} className={className}>{children}</span>;
    return <Tooltip title={title} isDisabled={!cut}>{element}</Tooltip>;
}

export const TooltipTrigger = ({ children, className, isDisabled, ...props }: ComponentProps<typeof BaseTooltip.Trigger> & { isDisabled?: boolean }) => (
    <BaseTooltip.Trigger {...props} disabled={isDisabled} className={cx("h-max w-max outline-hidden", typeof className === "function" ? undefined : className)}>
        {children}
    </BaseTooltip.Trigger>
);
