import { describe, expect, test } from "bun:test";
import { asciiBar } from "../src/features/projects/components/overview/people-performance";

describe("asciiBar", () => {
    test("fills whole cells, then one partial block, then the dotted track", () => {
        expect(asciiBar(0.5, 10)).toEqual({ filled: "█████", track: "·····" });
        expect(asciiBar(0.25, 10)).toEqual({ filled: "██▌", track: "·······" });
    });

    test("always spans exactly the cells it is given", () => {
        for (const ratio of [0, 0.13, 0.5, 0.99, 1]) {
            const bar = asciiBar(ratio, 17);
            expect([...bar.filled].length + bar.track.length).toBe(17);
        }
    });

    test("clamps ratios outside 0 to 1", () => {
        expect(asciiBar(2, 4)).toEqual({ filled: "████", track: "" });
        expect(asciiBar(-1, 4)).toEqual({ filled: "", track: "····" });
    });
});
