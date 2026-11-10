import assert from "node:assert/strict";
import type { Server } from "node:http";
import { afterAll, beforeAll, test } from "bun:test";

process.env.JWT_SECRET ??= "test-secret";
process.env.DATABASE_URL ??= "postgres://localhost/unused";
process.env.SPECIAL_REGISTRATION_CODE ??= "test-code";

const { app } = await import("../src/app");

let server: Server;
let base = "";

beforeAll(async () => {
    server = app.listen(0);
    await new Promise((resolve) => server.once("listening", resolve));
    const address = server.address();
    base = `http://127.0.0.1:${typeof address === "object" && address ? address.port : 0}`;
});

afterAll(() => server?.close());

function policy(header: string | null) {
    assert.ok(header);
    const directives = new Map(header.split(";").map((part) => {
        const [name, ...rest] = part.trim().split(/\s+/);
        return [name, rest.join(" ")] as const;
    }));
    return directives;
}

test("the API and the SPA send a policy that blocks injected scripts", async () => {
    const health = policy((await fetch(`${base}/api/health`)).headers.get("content-security-policy"));
    const page = await fetch(`${base}/`);
    const document = policy(page.headers.get("content-security-policy"));
    for (const directives of [health, document]) {
        assert.equal(directives.get("default-src"), "'self'");
        assert.equal(directives.get("script-src"), "'self'");
        assert.equal(directives.get("object-src"), "'none'");
        assert.equal(directives.get("frame-ancestors"), "'none'");
        assert.equal(directives.get("style-src"), "'self' 'unsafe-inline'");
        assert.ok(directives.get("connect-src")?.includes("wss:"));
        assert.equal(directives.get("script-src")?.includes("unsafe-inline"), false);
    }
});
