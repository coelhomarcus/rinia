import { describe, expect, test } from "bun:test";
import { tokenExpiry } from "../src/features/agent/token-expiry";

const now = new Date("2026-11-10T12:00:00Z").getTime();

describe("tokenExpiry", () => {
    test("a token without an expiry never expires", () => {
        expect(tokenExpiry(null, now)).toEqual({ state: "never" });
    });

    test("counts the whole days left", () => {
        expect(tokenExpiry("2026-12-10T12:00:00Z", now)).toEqual({ state: "active", days: 30 });
        expect(tokenExpiry("2026-11-12T11:59:00Z", now)).toEqual({ state: "active", days: 1 });
        expect(tokenExpiry("2026-11-10T20:00:00Z", now)).toEqual({ state: "active", days: 0 });
    });

    test("a token is expired from the moment it expires", () => {
        expect(tokenExpiry("2026-11-10T12:00:00Z", now)).toEqual({ state: "expired" });
        expect(tokenExpiry("2026-10-01T00:00:00Z", now)).toEqual({ state: "expired" });
    });
});
