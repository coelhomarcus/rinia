import { type PointerEvent, type ReactNode, useEffect, useRef, useState } from "react";
import { Dialog as BaseDialog } from "@base-ui/react/dialog";
import { cx } from "@/utils/cx";

interface SheetProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    title: string;
    children: ReactNode;
    className?: string;
    /** Right is the existing side panel. Bottom is a mobile sheet that sits on the home indicator. */
    side?: "right" | "bottom";
    /** A picker stacked on another sheet, so it paints above it. */
    nested?: boolean;
    /** Bottom sheets: `panel` is a list of rows; `full` is a searchable picker. */
    size?: "panel" | "full";
}

const dismissPx = 96;

/**
 * A controlled panel built on Base UI Dialog. The right side stays a full-height rail. The bottom side slides up,
 * dimming the page, and a downward drag on the handle or a tap on the backdrop closes it.
 */
export const Sheet = ({ open, onOpenChange, title, children, className, side = "right", nested = false, size = "panel" }: SheetProps) => {
    const drag = useRef<{ y: number; at: number; moved: boolean } | null>(null);
    const [dragY, setDragY] = useState(0);
    useEffect(() => {
        if (!open) setDragY(0);
    }, [open]);

    function finishDrag(event: PointerEvent<HTMLDivElement>) {
        const current = drag.current;
        drag.current = null;
        event.currentTarget.releasePointerCapture(event.pointerId);
        if (!current?.moved) {
            setDragY(0);
            return;
        }
        const offset = Math.max(0, event.clientY - current.y);
        const elapsed = Math.max(event.timeStamp - current.at, 1);
        if (offset > dismissPx || offset / elapsed > 0.5) onOpenChange(false);
        else setDragY(0);
    }

    const bottom = side === "bottom";
    const layer = nested ? "z-[60]" : "z-40";
    const backdropLayer = nested ? "z-[55]" : bottom ? "z-30" : "z-30";

    return (
        <BaseDialog.Root open={open} onOpenChange={onOpenChange}>
            <BaseDialog.Portal>
                <BaseDialog.Backdrop
                    className={cx(
                        "fixed inset-0 transition-opacity duration-300 ease-out data-[ending-style]:opacity-0 data-[starting-style]:opacity-0",
                        backdropLayer,
                        bottom ? "bg-overlay" : "bg-transparent",
                    )}
                />
                <BaseDialog.Viewport
                    className={cx(
                        "fixed flex",
                        layer,
                        bottom
                            ? "right-[env(safe-area-inset-right,0px)] bottom-0 left-[env(safe-area-inset-left,0px)] top-[env(safe-area-inset-top,0px)] items-end"
                            : "top-[env(safe-area-inset-top,0px)] right-[env(safe-area-inset-right,0px)] bottom-[env(safe-area-inset-bottom,0px)] left-[env(safe-area-inset-left,0px)] justify-end md:top-[max(2.5rem,env(safe-area-inset-top,0px))] md:right-[max(0.5rem,env(safe-area-inset-right,0px))] md:bottom-[max(0.5rem,env(safe-area-inset-bottom,0px))] md:left-[max(0.5rem,env(safe-area-inset-left,0px))]",
                    )}
                >
                    <BaseDialog.Popup
                        className={cx(
                            "flex min-w-0 flex-col bg-surface-1 outline-none",
                            bottom
                                ? cx(
                                      "w-full rounded-t-xl border-t border-subtle pb-[env(safe-area-inset-bottom,0px)] transition-[transform,opacity] duration-300 ease-out data-[ending-style]:translate-y-8 data-[ending-style]:opacity-0 data-[starting-style]:translate-y-8 data-[starting-style]:opacity-0 motion-reduce:transition-none",
                                      size === "full" ? "h-[min(100%,calc(100dvh-env(safe-area-inset-top,0px)-0.5rem))]" : "max-h-[min(85dvh,calc(100dvh-env(safe-area-inset-top,0px)-0.5rem))]",
                                  )
                                : "h-full w-full border-l border-subtle transition-[transform,opacity] duration-300 ease-out data-[ending-style]:translate-x-6 data-[ending-style]:opacity-0 data-[starting-style]:translate-x-6 data-[starting-style]:opacity-0 md:w-1/2 md:rounded-r-lg",
                            className,
                        )}
                        style={bottom && dragY > 0 ? { transform: `translateY(${dragY}px)`, transition: "none" } : undefined}
                    >
                        <BaseDialog.Title className="sr-only">{title}</BaseDialog.Title>
                        {bottom && (
                            <div
                                className="flex shrink-0 cursor-grab touch-none justify-center pt-2 pb-1 active:cursor-grabbing"
                                onPointerDown={(event) => {
                                    if (event.button !== 0) return;
                                    event.currentTarget.setPointerCapture(event.pointerId);
                                    drag.current = { y: event.clientY, at: event.timeStamp, moved: false };
                                }}
                                onPointerMove={(event) => {
                                    const current = drag.current;
                                    if (!current) return;
                                    const delta = event.clientY - current.y;
                                    if (!current.moved && Math.abs(delta) < 4) return;
                                    current.moved = true;
                                    setDragY(Math.max(0, delta));
                                }}
                                onPointerUp={finishDrag}
                                onPointerCancel={finishDrag}
                            >
                                <span aria-hidden="true" className="h-1 w-10 rounded-full bg-[var(--border-strong-1)]" />
                            </div>
                        )}
                        {children}
                    </BaseDialog.Popup>
                </BaseDialog.Viewport>
            </BaseDialog.Portal>
        </BaseDialog.Root>
    );
};
