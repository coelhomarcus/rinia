import { describe, expect, test } from "bun:test";
import { toastDepth, toastRemaining, toastStackTransform } from "../src/components/feedback/toast-stack";
import { countToward } from "../src/features/projects/components/overview/count-up";

describe("countToward", () => {
    test("lands on the exact value and stays inside the range", () => {
        expect(countToward(0, 10, 1)).toBe(10);
        expect(countToward(0, 10, 4)).toBe(10);
        expect(countToward(8, 3, 1)).toBe(3);
        expect(countToward(5, 5, 0.4)).toBe(5);
        for (let step = 0; step <= 20; step += 1) {
            const up = countToward(2, 9, step / 20);
            const down = countToward(9, 2, step / 20);
            expect(up).toBeGreaterThanOrEqual(2);
            expect(up).toBeLessThanOrEqual(9);
            expect(down).toBeGreaterThanOrEqual(2);
            expect(down).toBeLessThanOrEqual(9);
        }
    });
});

describe("toast stack", () => {
    test("puts the newest toast in front", () => {
        expect(toastDepth(2, 3)).toBe(0);
        expect(toastDepth(0, 3)).toBe(2);
    });

    test("opens the stack when it is expanded and keeps a pause from going negative", () => {
        expect(toastStackTransform(0, false, true)).toBe("translateY(0px) scale(1)");
        expect(toastStackTransform(1, true, true)).toContain("100%");
        expect(toastStackTransform(1, false, false)).toContain("scale(0.96)");
        expect(toastRemaining(4000, 1500)).toBe(2500);
        expect(toastRemaining(400, 900)).toBe(0);
    });
});
