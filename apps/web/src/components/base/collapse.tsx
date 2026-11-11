import { type ReactNode, useEffect, useState } from "react";
import { cx } from "@/utils/cx";
import { motionTiming } from "./motion";

/**
 * Animates a group open and closed by easing its height (or, with `axis="x"`, its width) and opacity. Closing is
 * quicker than opening. Content mounts on first open, so collapsed projects do not fetch their documents.
 * Once open and settled the content stops clipping, so focus rings and shadows show in full.
 */
export function Collapse({
    open,
    lazy = true,
    animate = true,
    axis = "y",
    children,
}: {
    open: boolean;
    lazy?: boolean;
    animate?: boolean;
    axis?: "x" | "y";
    children: ReactNode;
}) {
    const [mounted, setMounted] = useState(open || !lazy);
    const [settled, setSettled] = useState(true);
    useEffect(() => {
        if (open) setMounted(true);
    }, [open]);
    const [wasOpen, setWasOpen] = useState(open);
    if (wasOpen !== open) {
        setWasOpen(open);
        if (animate) setSettled(false);
    }
    // The cross axis is held to the container's size, so long unwrapped content (a truncated title) cannot widen it.
    const track = axis === "x" ? (open ? "grid-cols-[1fr]" : "grid-cols-[0fr]") : cx("grid-cols-[minmax(0,1fr)]", open ? "grid-rows-[1fr]" : "grid-rows-[0fr]");
    return (
        <div
            inert={!open}
            onTransitionEnd={(event) => event.target === event.currentTarget && setSettled(true)}
            className={cx(
                "grid",
                animate && "motion-reduce:transition-none",
                animate && (axis === "x" ? "transition-[grid-template-columns,opacity]" : "transition-[grid-template-rows,opacity]"),
                animate && motionTiming(open),
                track,
                open ? "opacity-100" : "opacity-0",
            )}
        >
            <div className={cx(axis === "x" ? "min-w-0" : "min-h-0 min-w-0", open && settled ? "overflow-visible" : "overflow-hidden")}>{mounted && children}</div>
        </div>
    );
}
