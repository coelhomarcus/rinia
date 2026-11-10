import type { PointerEvent as ReactPointerEvent } from "react";
import { KeyboardSensor, PointerSensor, type PointerSensorOptions, TouchSensor, useSensor, useSensors } from "@dnd-kit/core";
import { sortableKeyboardCoordinates } from "@dnd-kit/sortable";

/** Mouse and pen still start after a short movement. */
export const POINTER_DRAG_ACTIVATION = { distance: 4 };

/** A finger must hold still. Moving farther than the tolerance cancels the drag so the board can scroll. */
export const TOUCH_DRAG_ACTIVATION = { delay: 250, tolerance: 5 };

/**
 * Pointer events include touch. Leaving those to `TouchSensor` keeps a scroll from winning the race
 * against the distance constraint.
 */
export class DragPointerSensor extends PointerSensor {
    static activators = [
        {
            eventName: "onPointerDown" as const,
            handler: ({ nativeEvent }: ReactPointerEvent, { onActivation }: PointerSensorOptions) => {
                if (nativeEvent.pointerType === "touch" || !nativeEvent.isPrimary || nativeEvent.button !== 0) return false;
                onActivation?.({ event: nativeEvent });
                return true;
            },
        },
    ];
}

export const issueDragSensorSetup = {
    pointer: { sensor: DragPointerSensor, activationConstraint: POINTER_DRAG_ACTIVATION },
    touch: { sensor: TouchSensor, activationConstraint: TOUCH_DRAG_ACTIVATION },
} as const;

const pointerSensorOptions = { activationConstraint: issueDragSensorSetup.pointer.activationConstraint };
const touchSensorOptions = { activationConstraint: issueDragSensorSetup.touch.activationConstraint };
const keyboardSensorOptions = { coordinateGetter: sortableKeyboardCoordinates };

/** Pointer for mouse and pen, long-press for touch, keyboard unchanged. */
export function useIssueDragSensors() {
    return useSensors(
        useSensor(issueDragSensorSetup.pointer.sensor, pointerSensorOptions),
        useSensor(issueDragSensorSetup.touch.sensor, touchSensorOptions),
        useSensor(KeyboardSensor, keyboardSensorOptions),
    );
}

/** The finger can pan. A long-press must not select text or open the platform callout. */
export const dragSurfaceClass = "touch-manipulation select-none [-webkit-touch-callout:none]";

/** Extra pop on the overlay once a long-press picks the item up. Mouse drags leave it off. */
export const touchLiftClass = "scale-[1.02]";

export function isTouchDrag(event: Event) {
    if ("touches" in event) return true;
    return "pointerType" in event && (event as PointerEvent).pointerType === "touch";
}

/**
 * Call when a drag starts, which for touch is the moment the long-press delay elapses.
 * Vibrates where the device supports it, and reports whether this pickup was a touch.
 */
export function signalLongPress(event: Event) {
    const touch = isTouchDrag(event);
    if (touch && typeof navigator !== "undefined" && typeof navigator.vibrate === "function") navigator.vibrate(10);
    return touch;
}
