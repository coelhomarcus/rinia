import { describe, expect, test } from "bun:test";
import { DRAG_OVERSHOOT_PX, dragSettlePoint, dragTiltDegrees } from "../src/features/issues/components/drag-feedback";

describe("dragTiltDegrees", () => {
    test("leans a couple of degrees in the direction of movement", () => {
        expect(dragTiltDegrees(12, false)).toBeGreaterThanOrEqual(2);
        expect(dragTiltDegrees(12, false)).toBeLessThanOrEqual(3);
        expect(dragTiltDegrees(-12, false)).toBeLessThanOrEqual(-2);
        expect(dragTiltDegrees(400, false)).toBe(3);
        expect(dragTiltDegrees(-400, false)).toBe(-3);
    });

    test("stays upright when nothing has moved or motion is reduced", () => {
        expect(dragTiltDegrees(0, false)).toBe(0);
        expect(dragTiltDegrees(80, true)).toBe(0);
    });
});

describe("dragSettlePoint", () => {
    test("passes the slot by only a few pixels", () => {
        const landed = { x: 80, y: 60 };
        const past = dragSettlePoint({ x: 0, y: 0 }, landed);
        expect(Math.hypot(past.x - landed.x, past.y - landed.y)).toBeCloseTo(DRAG_OVERSHOOT_PX, 5);
        expect(past.x).toBeGreaterThan(landed.x);
        expect(past.y).toBeGreaterThan(landed.y);
    });

    test("does not pass a slot the overlay is already on", () => {
        expect(dragSettlePoint({ x: 4, y: 4 }, { x: 4, y: 4 })).toEqual({ x: 4, y: 4 });
    });
});
