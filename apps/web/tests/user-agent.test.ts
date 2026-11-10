import { describe, expect, test } from "bun:test";
import { describeUserAgent } from "../src/lib/user-agent";

describe("describeUserAgent", () => {
    test("names the browser and system people use", () => {
        expect(describeUserAgent("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36")).toEqual({ browser: "Chrome", os: "macOS", mobile: false });
        expect(describeUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 Edg/130.0.0.0")).toEqual({ browser: "Edge", os: "Windows", mobile: false });
        expect(describeUserAgent("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1")).toEqual({ browser: "Safari", os: "iPhone", mobile: true });
        expect(describeUserAgent("Mozilla/5.0 (X11; Linux x86_64; rv:131.0) Gecko/20100101 Firefox/131.0")).toEqual({ browser: "Firefox", os: "Linux", mobile: false });
        expect(describeUserAgent("Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36")).toEqual({ browser: "Chrome", os: "Android", mobile: true });
    });

    test("says nothing it cannot tell", () => {
        expect(describeUserAgent(null)).toEqual({ browser: null, os: null, mobile: false });
        expect(describeUserAgent("curl/8.7.1")).toEqual({ browser: null, os: null, mobile: false });
    });
});
