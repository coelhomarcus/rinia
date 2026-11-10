import assert from "node:assert/strict";
import { afterEach, spyOn, test } from "bun:test";
import type { Request, Response } from "express";

process.env.JWT_SECRET ??= "test-secret";
process.env.DATABASE_URL ??= "postgres://localhost/unused";
process.env.SPECIAL_REGISTRATION_CODE ??= "test-code";

const { RATE_LIMITS, consumeRateLimit, rateLimitRetry, requestRateGroup, resetRateLimits, takeRealtimeMessage } = await import("../src/lib/rate-limit");
const { enforceRequestLimit, limitRoute } = await import("../src/middleware/rate-limit.middleware");
const { requireAuth } = await import("../src/middleware/auth.middleware");
const tokens = await import("../src/features/api-tokens/api-tokens.service");
const { searchWorkspace } = await import("../src/features/search/search.service");
const { HttpError } = await import("../src/lib/http-error");

afterEach(() => resetRateLimits());

function response() {
    const headers = new Map<string, string>();
    let statusCode = 0;
    let body: { code?: string } | undefined;
    const res = {
        setHeader(name: string, value: string) {
            headers.set(name, value);
            return res;
        },
        status(code: number) {
            statusCode = code;
            return res;
        },
        json(payload: { code?: string }) {
            body = payload;
            return res;
        },
    };
    return { res: res as unknown as Response, headers, status: () => statusCode, body: () => body };
}

test("each budget refuses the request that crosses it and allows another after the window", () => {
    const groups = ["writes", "uploads", "search", "mcp", "oauth", "comments", "invalidBearer"] as const;
    for (const group of groups) {
        const { limit, windowMs } = RATE_LIMITS[group];
        for (let count = 0; count < limit; count += 1) assert.equal(consumeRateLimit(group, "user", 0).allowed, true, group);
        const blocked = consumeRateLimit(group, "user", 0);
        assert.equal(blocked.allowed, false, group);
        assert.ok(blocked.retryAfterSeconds >= 1);
        assert.equal(consumeRateLimit(group, "user", windowMs).allowed, true, group);
        resetRateLimits();
    }
});

test("routes spend the budget for their group", () => {
    assert.equal(requestRateGroup("POST", "/api/projects/p/issues"), "writes");
    assert.equal(requestRateGroup("POST", "/api/projects/p/files"), "uploads");
    assert.equal(requestRateGroup("PUT", "/api/projects/p/files/uploads/u"), "uploads");
    assert.equal(requestRateGroup("POST", "/api/issues/RIN-1/comments"), "comments");
    assert.equal(requestRateGroup("POST", "/api/comments/c/reactions"), "comments");
    assert.equal(requestRateGroup("POST", "/api/mcp"), "mcp");
    assert.equal(requestRateGroup("POST", "/api/oauth/register"), "oauth");
    assert.equal(requestRateGroup("GET", "/api/projects/p/issues"), null);
    assert.equal(requestRateGroup("PUT", "/api/users/me/password"), null);
    assert.ok(RATE_LIMITS.writes.limit >= 120);
    assert.ok(RATE_LIMITS.mcp.limit >= 120);
    assert.ok(RATE_LIMITS.realtime.refillPerSecond >= 30);
});

test("a signed-in write past the budget answers 429 with Retry-After", () => {
    for (let count = 0; count < RATE_LIMITS.writes.limit; count += 1) consumeRateLimit("writes", "user-1");
    const captured = response();
    const allowed = enforceRequestLimit({ method: "POST", originalUrl: "/api/projects/p/issues", user: { sub: "user-1" }, ip: "127.0.0.1" } as Request, captured.res);
    assert.equal(allowed, false);
    assert.equal(captured.status(), 429);
    assert.equal(captured.body()?.code, "errors.requestLimit");
    assert.ok(captured.headers.get("Retry-After"));
});

test("oauth registration is limited by address", () => {
    const middleware = limitRoute("oauth");
    let passed = 0;
    const next = () => {
        passed += 1;
    };
    for (let count = 0; count < RATE_LIMITS.oauth.limit; count += 1) middleware({ ip: "10.0.0.8", method: "POST", originalUrl: "/api/oauth/register" } as Request, response().res, next);
    const blocked = response();
    middleware({ ip: "10.0.0.8", method: "POST", originalUrl: "/api/oauth/register" } as Request, blocked.res, next);
    assert.equal(passed, RATE_LIMITS.oauth.limit);
    assert.equal(blocked.status(), 429);
});

test("workspace search stops before it reaches the database", async () => {
    for (let count = 0; count < RATE_LIMITS.search.limit; count += 1) consumeRateLimit("search", "reader");
    await assert.rejects(() => searchWorkspace("reader", "roadmap"), (error: unknown) => error instanceof HttpError && error.statusCode === 429 && error.retryAfter !== undefined);
});

test("invalid bearer tokens stop being checked once the address is over its budget", async () => {
    const lookup = spyOn(tokens, "authenticateApiToken").mockResolvedValue(null);
    for (let count = 0; count < RATE_LIMITS.invalidBearer.limit; count += 1) consumeRateLimit("invalidBearer", "10.1.1.1");
    assert.ok(rateLimitRetry("invalidBearer", "10.1.1.1"));
    const captured = response();
    await new Promise<void>((resolve, reject) => {
        requireAuth({ get: () => "Bearer nope", ip: "10.1.1.1", method: "GET", originalUrl: "/api/projects" } as unknown as Request, captured.res, (error?: unknown) => (error ? reject(error) : resolve()));
        setTimeout(resolve, 20);
    });
    assert.equal(lookup.mock.calls.length, 0);
    assert.equal(captured.status(), 429);
    lookup.mockRestore();
});

test("a socket can keep up with typing, and a flood that stays over the budget is closed", () => {
    for (let second = 0; second < 10; second += 1) {
        for (let message = 0; message < 10; message += 1) {
            assert.equal(takeRealtimeMessage("typing", second * 1000).ok, true);
        }
    }
    const { capacity, refillPerSecond, sustainedMs } = RATE_LIMITS.realtime;
    for (let message = 0; message < capacity; message += 1) assert.equal(takeRealtimeMessage("flood", 0).ok, true);
    let closed = false;
    for (let now = 0; now <= sustainedMs; now += 100) {
        for (let extra = 0; extra < Math.ceil(refillPerSecond / 10) + 1; extra += 1) closed ||= takeRealtimeMessage("flood", now).close;
    }
    assert.equal(closed, true);
});
