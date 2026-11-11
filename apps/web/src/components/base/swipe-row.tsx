import { useRef, useState, type PointerEvent, type ReactNode } from "react";
import { cx } from "@/utils/cx";

const THRESHOLD = 72;

interface SwipeAction {
    label: string;
    icon: ReactNode;
    onTrigger: () => void;
}

/**
 * A row that answers a horizontal swipe on touch screens: dragging it left uncovers an action, and letting go past
 * the threshold runs it. Vertical scrolling stays with the browser (`touch-action: pan-y`), and a gesture only counts
 * as a swipe once it moves more sideways than up or down. A tap that turned into a swipe does not also open the row.
 * Mouse and pen input pass straight through, so desktop rows keep their hover actions.
 */
export function SwipeRow({ action, children, className }: { action: SwipeAction; children: ReactNode; className?: string }) {
    const [offset, setOffset] = useState(0);
    const [settling, setSettling] = useState(false);
    const gesture = useRef<{ id: number; x: number; y: number; horizontal: boolean | null } | null>(null);
    const current = useRef(0);
    const armed = useRef(false);
    const swiped = useRef(false);

    function move(next: number) {
        current.current = next;
        setOffset(next);
        const past = next <= -THRESHOLD;
        // A short tick the moment the action arms, where the device supports it.
        if (past !== armed.current) {
            armed.current = past;
            if (past) navigator.vibrate?.(8);
        }
    }

    function onPointerDown(event: PointerEvent<HTMLDivElement>) {
        if (event.pointerType !== "touch") return;
        gesture.current = { id: event.pointerId, x: event.clientX, y: event.clientY, horizontal: null };
        swiped.current = false;
        setSettling(false);
    }

    function onPointerMove(event: PointerEvent<HTMLDivElement>) {
        const state = gesture.current;
        if (!state || state.id !== event.pointerId) return;
        const dx = event.clientX - state.x;
        const dy = event.clientY - state.y;
        if (state.horizontal === null) {
            if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
            state.horizontal = Math.abs(dx) > Math.abs(dy);
            if (state.horizontal) event.currentTarget.setPointerCapture(event.pointerId);
        }
        if (!state.horizontal) return;
        swiped.current = true;
        const left = Math.min(0, dx);
        // Past the threshold the row follows at a third of the pace, so it feels held rather than loose.
        move(left < -THRESHOLD ? -THRESHOLD + (left + THRESHOLD) / 3 : left);
    }

    function finish() {
        const state = gesture.current;
        gesture.current = null;
        if (!state?.horizontal) return;
        if (current.current <= -THRESHOLD) action.onTrigger();
        armed.current = false;
        setSettling(true);
        move(0);
    }

    const progress = Math.min(1, -offset / THRESHOLD);
    return (
        <div className={cx("relative overflow-hidden", className)}>
            <div
                aria-hidden="true"
                className="absolute inset-0 flex items-center justify-end gap-2 bg-accent-primary pr-5 text-[13px] font-medium text-white"
                style={{ opacity: offset === 0 ? 0 : 0.35 + progress * 0.65 }}
            >
                <span className={cx("transition-transform duration-150", progress >= 1 ? "scale-110" : "scale-90")}>{action.icon}</span>
                {action.label}
            </div>
            <div
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={finish}
                onPointerCancel={finish}
                onClickCapture={(event) => {
                    if (!swiped.current) return;
                    swiped.current = false;
                    event.preventDefault();
                    event.stopPropagation();
                }}
                className={cx("relative bg-surface-1", settling && "transition-transform duration-(--motion-regular) ease-(--ease-out-quint)")}
                style={{ transform: offset ? `translateX(${offset}px)` : undefined, touchAction: "pan-y" }}
            >
                {children}
            </div>
        </div>
    );
}
