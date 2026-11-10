import type { PointerEvent as ReactPointerEvent } from "react";
import { TouchSensor } from "@dnd-kit/core";
import { describe, expect, mock, test } from "bun:test";
import {
    DragPointerSensor,
    POINTER_DRAG_ACTIVATION,
    TOUCH_DRAG_ACTIVATION,
    dragSurfaceClass,
    isTouchDrag,
    issueDragSensorSetup,
    signalLongPress,
    touchLiftClass,
} from "../src/features/issues/lib/drag-sensors";

function pointerDown(pointerType: string, extra: { isPrimary?: boolean; button?: number } = {}) {
    const activated: Event[] = [];
    const event = {
        nativeEvent: { pointerType, isPrimary: extra.isPrimary ?? true, button: extra.button ?? 0 },
    } as ReactPointerEvent;
    const started = DragPointerSensor.activators[0]!.handler(event, { onActivation: ({ event: native }) => activated.push(native) }, { active: null as never });
    return { started, activated };
}

describe("drag sensors", () => {
    test("a touch pointer does not arm the pointer sensor", () => {
        const { started, activated } = pointerDown("touch");
        expect(started).toBe(false);
        expect(activated).toHaveLength(0);
    });

    test("mouse and pen still arm after a short movement", () => {
        expect(pointerDown("mouse").started).toBe(true);
        expect(pointerDown("pen").started).toBe(true);
        expect(pointerDown("mouse").activated).toHaveLength(1);
        expect(POINTER_DRAG_ACTIVATION).toEqual({ distance: 4 });
        expect(issueDragSensorSetup.pointer.sensor).toBe(DragPointerSensor);
        expect(issueDragSensorSetup.pointer.activationConstraint).toEqual(POINTER_DRAG_ACTIVATION);
    });

    test("a secondary or non-primary pointer does not arm a drag", () => {
        expect(pointerDown("mouse", { button: 2 }).started).toBe(false);
        expect(pointerDown("mouse", { isPrimary: false }).started).toBe(false);
    });

    test("touch drags wait for a long-press and ignore a small slip", () => {
        expect(TOUCH_DRAG_ACTIVATION).toEqual({ delay: 250, tolerance: 5 });
        expect(issueDragSensorSetup.touch.sensor).toBe(TouchSensor);
        expect(issueDragSensorSetup.touch.activationConstraint).toEqual(TOUCH_DRAG_ACTIVATION);
    });

    test("the draggable surface can scroll and does not select or call out", () => {
        expect(dragSurfaceClass.split(" ")).toEqual(expect.arrayContaining(["touch-manipulation", "select-none", "[-webkit-touch-callout:none]"]));
        expect(dragSurfaceClass.includes("touch-none")).toBe(false);
        expect(touchLiftClass).toBe("scale-[1.02]");
    });
});

describe("signalLongPress", () => {
    test("recognizes a touch activation and ignores mouse and keyboard", () => {
        expect(isTouchDrag({ type: "touchstart", touches: [] } as unknown as Event)).toBe(true);
        expect(isTouchDrag({ type: "pointerdown", pointerType: "touch" } as unknown as Event)).toBe(true);
        expect(isTouchDrag({ type: "pointerdown", pointerType: "mouse" } as unknown as Event)).toBe(false);
        expect(isTouchDrag({ type: "keydown" } as unknown as Event)).toBe(false);
    });

    test("vibrates once the long-press threshold starts a touch drag", () => {
        const vibrate = mock(() => true);
        const nav = globalThis.navigator as Navigator & { vibrate?: (duration: number) => boolean };
        const original = nav.vibrate;
        nav.vibrate = vibrate;
        try {
            signalLongPress({ type: "touchstart", touches: [] } as unknown as Event);
            signalLongPress({ type: "pointerdown", pointerType: "mouse" } as unknown as Event);
            signalLongPress({ type: "keydown" } as unknown as Event);
            expect(vibrate).toHaveBeenCalledTimes(1);
            expect(vibrate).toHaveBeenCalledWith(10);
        } finally {
            nav.vibrate = original;
        }
    });

    test("stays quiet when the device cannot vibrate", () => {
        const nav = globalThis.navigator as Navigator & { vibrate?: (duration: number) => boolean };
        const original = nav.vibrate;
        nav.vibrate = undefined;
        try {
            expect(() => signalLongPress({ type: "touchstart", touches: [] } as unknown as Event)).not.toThrow();
        } finally {
            nav.vibrate = original;
        }
    });
});
