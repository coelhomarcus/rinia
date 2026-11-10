import { expect, test } from "bun:test";
import { ApiError } from "../src/lib/api-client";
import { queryClient, shouldRetryQuery } from "../src/lib/query-client";

test("4xx responses are not retried, except timeouts and rate limits", () => {
    for (const status of [400, 401, 403, 404, 409, 422]) {
        expect(shouldRetryQuery(0, new ApiError(status, "no"))).toBe(false);
    }
    expect(shouldRetryQuery(0, new ApiError(408, "timeout"))).toBe(true);
    expect(shouldRetryQuery(0, new ApiError(429, "slow down"))).toBe(true);
});

test("network errors and 5xx still retry a couple of times", () => {
    expect(shouldRetryQuery(0, new TypeError("Failed to fetch"))).toBe(true);
    expect(shouldRetryQuery(1, new TypeError("Failed to fetch"))).toBe(true);
    expect(shouldRetryQuery(2, new TypeError("Failed to fetch"))).toBe(false);
    expect(shouldRetryQuery(0, new ApiError(500, "boom"))).toBe(true);
    expect(shouldRetryQuery(1, new ApiError(503, "busy"))).toBe(true);
    expect(shouldRetryQuery(2, new ApiError(502, "gateway"))).toBe(false);
});

test("mutations do not retry", () => {
    expect(queryClient.getDefaultOptions().mutations?.retry).toBe(false);
});
