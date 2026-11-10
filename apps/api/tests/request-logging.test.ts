import assert from "node:assert/strict";
import type { Server } from "node:http";
import { afterAll, afterEach, beforeAll, beforeEach, mock, test } from "bun:test";
import express, { Router } from "express";
import { z } from "zod";

// The app reads its settings on import; give it what it needs without a local .env.
process.env.JWT_SECRET ??= "test-secret";
process.env.DATABASE_URL ??= "postgres://localhost/unused";
process.env.SPECIAL_REGISTRATION_CODE ??= "test-code";
const { app } = await import("../src/app");
const { logger, setLogDestination } = await import("../src/lib/logger");
const { HttpError } = await import("../src/lib/http-error");
const { assignRequestId, logFor, requestContext } = await import("../src/lib/request-context");
const { accessLog, accessLogLevel } = await import("../src/middleware/access-log.middleware");
const { asyncHandler } = await import("../src/middleware/async-handler");
const { errorHandler } = await import("../src/middleware/error-handler.middleware");
const { sessionToken, stubSessionAccounts } = await import("./fixtures/sessions");

type Entry = Record<string, unknown> & { level: string; msg: string };
let lines: string[] = [];
const entries = () => lines.map((line) => JSON.parse(line) as Entry);
const event = (name: string) => entries().filter((entry) => entry.event === name);
const previousLevel = logger.level;

beforeEach(() => {
    lines = [];
    logger.level = "trace";
    setLogDestination({ write: (line: string) => void lines.push(line) });
});
afterEach(() => {
    mock.restore();
    logger.level = previousLevel;
    setLogDestination();
});

/** The middleware the app uses, in its order, around routes that misbehave on purpose. */
const testApp = express();
testApp.use(assignRequestId);
testApp.use(accessLog({ slowRequestMs: 25 }));
testApp.use(express.json());
testApp.use(requestContext);
testApp.get("/api/health", (_req, res) => void res.json({ status: "ok" }));
testApp.get(
    "/api/work",
    asyncHandler(async (_req, res) => {
        await Promise.resolve();
        logFor("things").info({ step: "inside" }, "service at work");
        res.json({ ok: true });
    }),
);
testApp.get("/api/crash", () => {
    throw new Error("the database fell over", { cause: Object.assign(new Error("connection reset"), { code: "ECONNRESET" }) });
});
testApp.get("/api/forbidden", () => {
    throw new HttpError(403, "You are not a member of this project");
});
testApp.get("/api/missing", () => {
    throw new HttpError(404, "Issue not found");
});
testApp.post("/api/validate", (req) => {
    z.object({ email: z.string().email(), age: z.number() }).parse(req.body);
});
testApp.get(
    "/api/slow",
    asyncHandler(async (_req, res) => {
        await Bun.sleep(40);
        res.status(204).end();
    }),
);
const items = Router();
items.get("/:itemId", (_req, res) => void res.json({ ok: true }));
items.delete("/:itemId", () => {
    throw new HttpError(409, "Item is in use");
});
const projects = Router();
projects.use("/:projectId/items", items);
testApp.use("/api/projects", projects);
testApp.use(errorHandler);

let server: Server;
let base: string;
let appServer: Server;
let appBase: string;

async function listen(handler: express.Express) {
    const listening = handler.listen(0);
    await new Promise((resolve) => listening.once("listening", resolve));
    const address = listening.address();
    return { server: listening, base: `http://127.0.0.1:${typeof address === "object" && address ? address.port : 0}` };
}

beforeAll(async () => {
    ({ server, base } = await listen(testApp));
    ({ server: appServer, base: appBase } = await listen(app));
});
afterAll(() => {
    server.close();
    appServer.close();
});

/** The access log is written when the response finishes, which can be just after the client has it. */
async function settle() {
    await Bun.sleep(5);
}

test("each request gets an id, returned in X-Request-Id and carried by what services log during it", async () => {
    const response = await fetch(`${base}/api/work`);
    await settle();
    const requestId = response.headers.get("x-request-id");
    assert.match(requestId ?? "", /^[0-9a-f-]{36}$/);

    const [serviceLine] = entries().filter((entry) => entry.msg === "service at work");
    assert.equal(serviceLine.requestId, requestId);
    assert.equal(serviceLine.module, "things");
    const [access] = event("http.request");
    assert.equal(access.requestId, requestId);

    logFor("things").info("outside any request");
    const outside = entries().find((entry) => entry.msg === "outside any request");
    assert.equal(outside?.requestId, undefined);
});

test("a plain X-Request-Id from a proxy is kept, and anything else is replaced", async () => {
    const kept = await fetch(`${base}/api/work`, { headers: { "X-Request-Id": "edge-1234abcd" } });
    assert.equal(kept.headers.get("x-request-id"), "edge-1234abcd");
    const replaced = await fetch(`${base}/api/work`, { headers: { "X-Request-Id": "bad id\twith spaces" } });
    assert.notEqual(replaced.headers.get("x-request-id"), "bad id\twith spaces");
    assert.match(replaced.headers.get("x-request-id") ?? "", /^[0-9a-f-]{36}$/);
});

test("a 500 is logged as an error with its stack and cause, and its body names the request", async () => {
    const response = await fetch(`${base}/api/crash`);
    const body = (await response.json()) as { requestId?: string; code: string };
    await settle();
    assert.equal(response.status, 500);
    assert.equal(body.code, "errors.internal");
    assert.equal(body.requestId, response.headers.get("x-request-id"));

    const [failure] = event("http.error");
    assert.equal(failure.level, "error");
    assert.equal(failure.requestId, body.requestId);
    const err = failure.err as { message: string; stack: string; cause: { code: string } };
    assert.equal(err.message, "the database fell over");
    assert.match(err.stack, /request-logging\.test\.ts/);
    assert.equal(err.cause.code, "ECONNRESET");
    assert.equal(event("http.request")[0].level, "error");
});

test("HttpErrors are logged with their status and code, a refused permission as a warning", async () => {
    await fetch(`${base}/api/forbidden`);
    await fetch(`${base}/api/missing`);
    await settle();
    const [forbidden, missing] = event("http.error");
    assert.equal(forbidden.level, "warn");
    assert.equal(forbidden.status, 403);
    assert.equal(forbidden.msg, "You are not a member of this project");
    assert.equal(typeof forbidden.code, "string");
    assert.equal("err" in forbidden, false);
    assert.equal(missing.level, "info");
    assert.equal(missing.status, 404);
});

test("invalid data is logged with the fields that failed, never their values", async () => {
    const response = await fetch(`${base}/api/validate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "not-an-email-secret-value", age: "forty-two" }),
    });
    await settle();
    assert.equal(response.status, 400);
    const [invalid] = event("http.invalid_data");
    assert.equal(invalid.level, "info");
    assert.deepEqual(invalid.fields, ["email", "age"]);
    const output = lines.join("");
    assert.equal(output.includes("not-an-email-secret-value"), false);
    assert.equal(output.includes("forty-two"), false);
});

test("the access log level follows the status, and slow requests are warnings", async () => {
    assert.equal(accessLogLevel(200), "info");
    assert.equal(accessLogLevel(304), "info");
    assert.equal(accessLogLevel(400), "warn");
    assert.equal(accessLogLevel(401), "info");
    assert.equal(accessLogLevel(403), "warn");
    assert.equal(accessLogLevel(404), "info");
    assert.equal(accessLogLevel(429), "warn");
    assert.equal(accessLogLevel(500), "error");

    await fetch(`${base}/api/slow`);
    await settle();
    const [slow] = event("http.request");
    assert.equal(slow.level, "warn");
    assert.equal(slow.slow, true);
    assert.equal(slow.status, 204);
    assert.ok((slow.durationMs as number) >= 25);
});

test("the access log names the route pattern, not the URL, even through nested routers and errors", async () => {
    const projectId = "8b2d1f66-0000-4000-8000-0000000000aa";
    await fetch(`${base}/api/projects/${projectId}/items/item-42?search=private`, { headers: { "User-Agent": "rinia-test" } });
    await fetch(`${base}/api/projects/${projectId}/items/item-42`, { method: "DELETE" });
    await settle();
    const [read, remove] = event("http.request");
    assert.equal(read.route, "/api/projects/:projectId/items/:itemId");
    assert.equal(read.method, "GET");
    assert.equal(read.status, 200);
    assert.equal(read.userAgent, "rinia-test");
    assert.equal(typeof read.ip, "string");
    assert.equal(typeof read.contentLength, "number");
    assert.equal(JSON.stringify(read).includes(projectId), false);
    assert.equal(JSON.stringify(read).includes("private"), false);
    assert.equal(remove.route, "/api/projects/:projectId/items/:itemId");
    assert.equal(remove.status, 409);
    assert.equal(remove.level, "warn");
});

test("the app returns X-Request-Id, does not log health checks, and logs unknown API paths", async () => {
    const health = await fetch(`${appBase}/api/health`);
    assert.ok(health.headers.get("x-request-id"));
    await fetch(`${appBase}/api/does-not-exist`);
    await settle();
    const requests = event("http.request");
    assert.equal(requests.length, 1);
    assert.equal(requests[0].status, 404);
    assert.equal(requests[0].level, "info");
    assert.equal(requests[0].route, null);
    assert.equal(requests[0].path, "/api/does-not-exist");
});

test("a request with a session cookie is logged with its user and how they signed in", async () => {
        const { SESSION_COOKIE_NAME } = await import("../src/lib/cookies");
    const token = sessionToken("8b2d1f66-0000-4000-8000-000000000001");
    // Not an admin: refused once the account is checked, and logged as a refused permission.
    stubSessionAccounts();
    const response = await fetch(`${appBase}/api/admin/projects`, { headers: { Cookie: `${SESSION_COOKIE_NAME}=${token}` } });
    await settle();
    assert.equal(response.status, 403);
    const [denied] = event("permission.denied");
    assert.equal(denied.module, "audit");
    assert.equal(denied.userId, "8b2d1f66-0000-4000-8000-000000000001");
    assert.equal(denied.authMethod, "session");
    const [access] = event("http.request");
    assert.equal(access.userId, "8b2d1f66-0000-4000-8000-000000000001");
    assert.equal(access.route, null);
    assert.equal(lines.join("").includes(token), false);
});
