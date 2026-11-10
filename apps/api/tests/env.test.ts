import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { test } from "bun:test";

const apiRoot = path.resolve(import.meta.dir, "..");

const startScript = `
    await import("./src/config/env.ts");
    console.log("started");
`;

const baseUrlScript = `
    const { appBaseUrl } = await import("./src/lib/app-url.ts");
    const req = { protocol: "http", get: (name) => (name === "host" ? "evil.example" : undefined) };
    console.log(appBaseUrl(req));
`;

/** A process that loads the API settings with only the variables under test. */
function loadEnv(overrides: Record<string, string | undefined>, script: string) {
    const env: NodeJS.ProcessEnv = {
        PATH: process.env.PATH,
        HOME: process.env.HOME,
        TMPDIR: process.env.TMPDIR,
        DATABASE_URL: "postgres://localhost/rinia",
        JWT_SECRET: "test-secret",
        SPECIAL_REGISTRATION_CODE: "test-code",
    };
    for (const [key, value] of Object.entries(overrides)) {
        if (value === undefined) delete env[key];
        else env[key] = value;
    }
    return spawnSync("bun", ["--no-env-file", "-e", script], { cwd: apiRoot, env, encoding: "utf8" });
}

test("production refuses to start without APP_URL", () => {
    const missing = loadEnv({ NODE_ENV: "production" }, startScript);
    assert.notEqual(missing.status, 0);
    assert.match(`${missing.stderr}`, /APP_URL is required in production/);
    assert.doesNotMatch(`${missing.stdout}`, /started/);

    const blank = loadEnv({ NODE_ENV: "production", APP_URL: "  " }, startScript);
    assert.notEqual(blank.status, 0);
    assert.match(`${blank.stderr}`, /APP_URL is required in production/);
});

test("production starts only with an absolute APP_URL", () => {
    const started = loadEnv({ NODE_ENV: "production", APP_URL: "https://rinia.example.com" }, startScript);
    assert.equal(started.status, 0, started.stderr);
    assert.match(started.stdout, /started/);

    const relative = loadEnv({ NODE_ENV: "production", APP_URL: "rinia.example.com" }, startScript);
    assert.notEqual(relative.status, 0);
    assert.match(`${relative.stderr}`, /APP_URL/);
});

test("development and test start without APP_URL and use the request host", () => {
    for (const NODE_ENV of ["development", "test"]) {
        const started = loadEnv({ NODE_ENV }, startScript);
        assert.equal(started.status, 0, started.stderr);

        const base = loadEnv({ NODE_ENV }, baseUrlScript);
        assert.equal(base.status, 0, base.stderr);
        assert.equal(base.stdout.trim(), "http://evil.example");
    }
});

test("OAuth and MCP links use APP_URL instead of the request host", () => {
    const base = loadEnv({ NODE_ENV: "production", APP_URL: "https://rinia.example.com" }, baseUrlScript);
    assert.equal(base.status, 0, base.stderr);
    assert.equal(base.stdout.trim(), "https://rinia.example.com");
});
