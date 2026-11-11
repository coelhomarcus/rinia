import { type CSSProperties, type ReactNode, useCallback, useEffect, useMemo } from "react";
import { type DragMoveEvent, type DropAnimation, defaultDropAnimationSideEffects } from "@dnd-kit/core";
import { useReducedMotion } from "@/hooks/use-reduced-motion";
import { cx } from "@/utils/cx";
import { touchLiftClass } from "../lib/drag-sensors";

/** The furthest a dragged card leans, and how far it leans per px/ms of sideways speed. */
const TILT_MAX = 5;
const TILT_PER_SPEED = 4;
/** The spring that carries the lean: a little under critical damping, so a quick flick swings once and settles. */
const SPRING_STIFFNESS = 260;
const SPRING_DAMPING = 22;

/** One curve for everything that lands: the drop and the cards making room. */
const SETTLE_EASE = "cubic-bezier(0.23, 1, 0.32, 1)";
const DROP_MS = 260;

export const DRAG_LIFT_SHADOW = "0 18px 36px -14px rgb(0 0 0 / 0.38), 0 8px 16px -10px rgb(0 0 0 / 0.22)";

/** Dashed outline left in the slot the card or row was picked up from. */
export const dragSlotClass = "border-dashed border-strong";

/** How the cards and rows that make room glide into their new places. */
export const sortableTransition = { duration: DROP_MS, easing: SETTLE_EASE };

/** The lean that sideways speed asks for, in degrees: toward the movement, capped. Reduced motion stays upright. */
export function dragTiltTarget(speedX: number, reducedMotion: boolean) {
    if (reducedMotion || speedX === 0) return 0;
    return Math.max(-TILT_MAX, Math.min(TILT_MAX, speedX * TILT_PER_SPEED));
}

/**
 * The lean of whatever is on the drag overlay, as a small spring. Moving sideways leans the card toward the motion,
 * the faster the further; when the pointer slows or stops, it swings back upright, the way a held card would. It runs
 * on animation frames and writes the element's `rotate` directly, so the board is never re-rendered for it.
 */
export class DragTilt {
    reducedMotion = false;
    private element: HTMLElement | null = null;
    private angle = 0;
    private spin = 0;
    private speed = 0;
    private lastX: number | null = null;
    private lastTime = 0;
    private lastMove = 0;
    private previousFrame = 0;
    private frame = 0;

    attach(element: HTMLElement | null) {
        this.element = element;
        this.apply();
    }

    /** `x` is the drag's sideways distance from where it started, as dnd-kit reports it. */
    move(x: number, now: number) {
        if (this.lastX === null) {
            this.lastX = x;
            this.lastTime = now;
            return;
        }
        const elapsed = Math.max(1, now - this.lastTime);
        // Smoothed, so one jittery pointer event does not jerk the card.
        this.speed = this.speed * 0.6 + ((x - this.lastX) / elapsed) * 0.4;
        this.lastX = x;
        this.lastTime = now;
        this.lastMove = now;
        this.run();
    }

    /** The drag ended or a new one begins: forget the speed and let the spring bring the card upright. */
    reset() {
        this.lastX = null;
        this.speed = 0;
        this.run();
    }

    stop() {
        if (this.frame) cancelAnimationFrame(this.frame);
        this.frame = 0;
    }

    private run() {
        if (this.frame) return;
        this.previousFrame = performance.now();
        this.frame = requestAnimationFrame(this.step);
    }

    private step = (now: number) => {
        const seconds = Math.min(0.032, (now - this.previousFrame) / 1000);
        this.previousFrame = now;
        // A pointer that stopped moving has no speed left; let it fade within about a tenth of a second.
        if (now - this.lastMove > 40) this.speed *= Math.pow(0.001, seconds);
        const target = dragTiltTarget(this.speed, this.reducedMotion);
        const force = SPRING_STIFFNESS * (target - this.angle) - SPRING_DAMPING * this.spin;
        this.spin += force * seconds;
        this.angle += this.spin * seconds;
        if (Math.abs(target) < 0.01 && Math.abs(this.angle) < 0.02 && Math.abs(this.spin) < 0.05) {
            this.angle = 0;
            this.spin = 0;
            this.apply();
            this.frame = 0;
            return;
        }
        this.apply();
        this.frame = requestAnimationFrame(this.step);
    };

    private apply() {
        if (this.element) this.element.style.rotate = `${this.angle.toFixed(2)}deg`;
    }
}

/**
 * The drop: the overlay glides into the slot on the same curve the other cards use, while its lift (scale and
 * shadow) eases away, so it lands flat instead of snapping down at the end.
 */
export const dragDropAnimation: DropAnimation = {
    duration: DROP_MS,
    easing: SETTLE_EASE,
    sideEffects(parameters) {
        const cleanup = defaultDropAnimationSideEffects({ styles: { active: { opacity: "0" } } })(parameters);
        parameters.dragOverlay.node.querySelector<HTMLElement>("[data-drag-lift]")?.animate(
            [
                { scale: "1.02", boxShadow: DRAG_LIFT_SHADOW },
                { scale: "1", boxShadow: "0 0 0 0 transparent" },
            ],
            { duration: DROP_MS, easing: SETTLE_EASE, fill: "forwards" },
        );
        return cleanup;
    },
};

/** The lean for a drag overlay, with the handlers to feed it from dnd-kit. */
export function useDragTilt() {
    const reducedMotion = useReducedMotion() === true;
    const tilt = useMemo(() => new DragTilt(), []);
    tilt.reducedMotion = reducedMotion;
    useEffect(() => () => tilt.stop(), [tilt]);

    const onDragMove = useCallback((event: DragMoveEvent) => tilt.move(event.delta.x, performance.now()), [tilt]);
    const resetTilt = useCallback(() => tilt.reset(), [tilt]);

    return { tilt, reducedMotion, onDragMove, resetTilt, dropAnimation: reducedMotion ? null : dragDropAnimation };
}

/** Scale, the spring lean and a deeper shadow for whatever is on the drag overlay. It rises into the lift as it is picked up. */
export function DragLift({
    tilt,
    reducedMotion,
    className,
    style,
    children,
}: {
    tilt: DragTilt;
    reducedMotion: boolean;
    className?: string;
    style?: CSSProperties;
    children: ReactNode;
}) {
    return (
        <div
            ref={(element) => tilt.attach(element)}
            data-drag-lift
            className={cx(touchLiftClass, !reducedMotion && "animate-drag-lift", className)}
            style={{ ...style, boxShadow: DRAG_LIFT_SHADOW }}
        >
            {children}
        </div>
    );
}
