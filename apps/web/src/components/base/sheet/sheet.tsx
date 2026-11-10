import type { ReactNode } from "react";
import { Dialog as BaseDialog } from "@base-ui/react/dialog";
import { cx } from "@/utils/cx";

interface SheetProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    title: string;
    children: ReactNode;
    className?: string;
}

/** A controlled right-side panel built on Base UI Dialog primitives. */
export const Sheet = ({ open, onOpenChange, title, children, className }: SheetProps) => (
    <BaseDialog.Root open={open} onOpenChange={onOpenChange}>
        <BaseDialog.Portal>
            <BaseDialog.Backdrop className="fixed inset-0 z-30 bg-transparent transition-opacity duration-300 ease-out data-[ending-style]:opacity-0 data-[starting-style]:opacity-0" />
            <BaseDialog.Viewport className="fixed top-[env(safe-area-inset-top,0px)] right-[env(safe-area-inset-right,0px)] bottom-[env(safe-area-inset-bottom,0px)] left-[env(safe-area-inset-left,0px)] z-40 flex justify-end md:top-[max(2.5rem,env(safe-area-inset-top,0px))] md:right-[max(0.5rem,env(safe-area-inset-right,0px))] md:bottom-[max(0.5rem,env(safe-area-inset-bottom,0px))] md:left-[max(0.5rem,env(safe-area-inset-left,0px))]">
                <BaseDialog.Popup className={cx("flex h-full w-full min-w-0 flex-col border-l border-subtle bg-surface-1 outline-none transition-[transform,opacity] duration-300 ease-out data-[ending-style]:translate-x-6 data-[ending-style]:opacity-0 data-[starting-style]:translate-x-6 data-[starting-style]:opacity-0 md:w-1/2 md:rounded-r-lg", className)}>
                    <BaseDialog.Title className="sr-only">{title}</BaseDialog.Title>
                    {children}
                </BaseDialog.Popup>
            </BaseDialog.Viewport>
        </BaseDialog.Portal>
    </BaseDialog.Root>
);
