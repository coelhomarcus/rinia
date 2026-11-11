import { describe, expect, test } from "bun:test";
import { dragTiltTarget } from "../src/features/issues/components/drag-feedback";

describe("dragTiltTarget", () => {
    test("leans toward the movement, further the faster it goes", () => {
        expect(dragTiltTarget(0.5, false)).toBeGreaterThan(0);
        expect(dragTiltTarget(-0.5, false)).toBeLessThan(0);
        expect(dragTiltTarget(1, false)).toBeGreaterThan(dragTiltTarget(0.5, false));
    });

    test("never leans past the cap", () => {
        expect(dragTiltTarget(40, false)).toBe(5);
        expect(dragTiltTarget(-40, false)).toBe(-5);
    });

    test("stays upright when the pointer is still or motion is reduced", () => {
        expect(dragTiltTarget(0, false)).toBe(0);
        expect(dragTiltTarget(2, true)).toBe(0);
    });
});
