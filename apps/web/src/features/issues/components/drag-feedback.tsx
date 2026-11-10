import { type CSSProperties, type ReactNode, useCallback, useRef, useState } from "react";
import { type DragMoveEvent, type DropAnimation, defaultDropAnimationSideEffects } from "@dnd-kit/core";
import { CSS, type Transform } from "@dnd-kit/utilities";
import { useReducedMotion } from "@/hooks/use-reduced-motion";
import { cx } from "@/utils/cx";
import { touchLiftClass } from "../lib/drag-sensors";

/** Lean at least this far once the pointer has actually moved, and never past the max. */
const TILT_MIN = 2;
const TILT_MAX = 3;
/** The settle travels this many pixels past the slot, then comes back. */
export const DRAG_OVERSHOOT_PX = 3;

export const DRAG_LIFT_SHADOW = "0 18px 36px -14px rgb(0 0 0 / 0.38), 0 8px 16px -10px rgb(0 0 0 / 0.22)";

/** Dashed outline left in the slot the card or row was picked up from. */
export const dragSlotClass = "border-dashed border-strong";

/** Degrees of tilt from horizontal movement. Reduced motion stays upright. */
export function dragTiltDegrees(deltaX: number, reducedMotion: boolean) {
    if (reducedMotion || deltaX === 0) return 0;
    const extra = Math.min(TILT_MAX - TILT_MIN, Math.abs(deltaX) / 80);
    return (Math.sign(deltaX) * Math.round((TILT_MIN + extra) * 10)) / 10;
}

/** A point a few pixels past where the overlay is going, along the direction it is already moving. */
export function dragSettlePoint(initial: { x: number; y: number }, final: { x: number; y: number }) {
    const dx = final.x - initial.x;
    const dy = final.y - initial.y;
    const distance = Math.hypot(dx, dy);
    if (distance < 1) return { x: final.x, y: final.y };
    return {
        x: final.x + (dx / distance) * DRAG_OVERSHOOT_PX,
        y: final.y + (dy / distance) * DRAG_OVERSHOOT_PX,
    };
}

function transformString(transform: Transform) {
    return CSS.Transform.toString(transform) ?? "";
}

/** Short settle. The middle frame passes the slot by a few pixels, then the last frame lands on it. */
export const dragDropAnimation: DropAnimation = {
    duration: 180,
    easing: "cubic-bezier(0.2, 0.85, 0.2, 1)",
    sideEffects: defaultDropAnimationSideEffects({
        styles: { active: { opacity: "0" } },
    }),
    keyframes({ transform: { initial, final } }) {
        const past = dragSettlePoint(initial, final);
        const middle: Transform = { ...final, x: past.x, y: past.y };
        return [{ transform: transformString(initial) }, { transform: transformString(middle), offset: 0.72 }, { transform: transformString(final) }];
    },
};

/** Tilt that follows the drag, updated only when the rounded angle changes so the board is not redrawn every frame. */
export function useDragTilt() {
    const reducedMotion = useReducedMotion() === true;
    const [tilt, setTilt] = useState(0);
    const shown = useRef(0);

    const onDragMove = useCallback(
        (event: DragMoveEvent) => {
            const next = dragTiltDegrees(event.delta.x, reducedMotion);
            if (next === shown.current) return;
            shown.current = next;
            setTilt(next);
        },
        [reducedMotion],
    );

    const resetTilt = useCallback(() => {
        if (shown.current === 0) return;
        shown.current = 0;
        setTilt(0);
    }, []);

    return { tilt, reducedMotion, onDragMove, resetTilt, dropAnimation: reducedMotion ? null : dragDropAnimation };
}

/** Scale, directional tilt and a deeper shadow for whatever is on the drag overlay. */
export function DragLift({
    tilt,
    reducedMotion,
    className,
    style,
    children,
}: {
    tilt: number;
    reducedMotion: boolean;
    className?: string;
    style?: CSSProperties;
    children: ReactNode;
}) {
    return (
        <div className={cx(touchLiftClass, className)} style={{ ...style, rotate: reducedMotion ? "0deg" : `${tilt}deg`, boxShadow: DRAG_LIFT_SHADOW }}>
            {children}
        </div>
    );
}
