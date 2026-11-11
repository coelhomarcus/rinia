import type { ReactNode } from "react";
import { cx } from "@/utils/cx";

/**
 * Two icons in one slot that trade places with a short cross-fade and scale (`icon-swap`), so a control that changes
 * state, such as copy turning into a check or a bell into a muted bell, reads as the same control changing its mind.
 * Both icons stay mounted; the hidden one is out of the accessibility tree.
 */
export function IconSwap({ on, onIcon, offIcon, className }: { on: boolean; onIcon: ReactNode; offIcon: ReactNode; className?: string }) {
    return (
        <span data-icon className={cx("relative inline-grid size-4 shrink-0 place-items-center", className)}>
            <span aria-hidden="true" data-hidden={on ? undefined : ""} className="icon-swap col-start-1 row-start-1 inline-flex">
                {onIcon}
            </span>
            <span aria-hidden="true" data-hidden={on ? "" : undefined} className="icon-swap col-start-1 row-start-1 inline-flex">
                {offIcon}
            </span>
        </span>
    );
}
