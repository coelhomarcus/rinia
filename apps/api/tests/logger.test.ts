import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { afterEach, test } from "bun:test";
import { createLogger, logSettings, scrubText, serializeError, type CreateLoggerOptions } from "../src/lib/logger";

/** A logger writing to memory, as JSON unless said otherwise. */
function memoryLogger(options: CreateLoggerOptions = {}) {
    const lines: string[] = [];
    const log = createLogger({ level: "trace", format: "json", ...options, destination: { write: (line: string) => void lines.push(line) } });
    return { log, lines, entries: () => lines.map((line) => JSON.parse(line) as Record<string, unknown>) };
}

const JWT = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0In0.c2lnbmF0dXJlLXZhbHVl";
const API_TOKEN = "rinia_Q2hhcmFjdGVyc1RoYXRMb29rUmFuZG9tMTIzNDU2";
const registrationCode = process.env.SPECIAL_REGISTRATION_CODE;
afterEach(() => {
    process.env.SPECIAL_REGISTRATION_CODE = registrationCode;
});

test("passwords, tokens, JWTs, cookies and the registration code never reach a log line", () => {
    process.env.SPECIAL_REGISTRATION_CODE = "open-sesame-42";
    const { log, lines } = memoryLogger();
    log.info(
        {
            password: "hunter2-password",
            passwordHash: "$2a$10$hashhashhash",
            user: { token: "plain-token-value", secret: "shh-secret" },
            headers: { authorization: `Bearer ${API_TOKEN}`, cookie: `rinia_session=${JWT}`, "set-cookie": [`rinia_session=${JWT}; HttpOnly`] },
            specialCode: "open-sesame-42",
            note: `copied ${API_TOKEN} and ${JWT} and the code open-sesame-42 into a comment`,
            description: "what someone wrote in an issue",
            contentJson: { type: "doc", content: [{ type: "text", text: "page text" }] },
        },
        `message with ${API_TOKEN}`,
    );
    log.warn(`Authorization: Bearer opaque-bearer-value`);

    const output = lines.join("");
    for (const secret of ["hunter2-password", "$2a$10$hashhashhash", "plain-token-value", "shh-secret", API_TOKEN, JWT, "open-sesame-42", "what someone wrote", "page text", "opaque-bearer-value"]) {
        assert.equal(output.includes(secret), false, `${secret} leaked: ${output}`);
    }
    assert.match(output, /\[Redacted\]/);
});

test("errors keep their name, stack, cause and Postgres code, without the values Postgres and Drizzle put in them", () => {
    const pgError = Object.assign(new Error("duplicate key value violates unique constraint"), {
        code: "23505",
        constraint: "users_email_unique",
        table: "users",
        detail: "Key (email)=(ana@example.com) already exists.",
    });
    const error = new Error("Failed query: insert into \"users\" (\"email\") values ($1)\nparams: ana@example.com", { cause: pgError });

    const serialized = serializeError(error);
    assert.equal(serialized.name, "Error");
    assert.match(String(serialized.stack), /logger\.test\.ts/);
    assert.equal(String(serialized.message).includes("ana@example.com"), false);
    assert.equal(String(serialized.stack).includes("ana@example.com"), false);
    const cause = serialized.cause as Record<string, unknown>;
    assert.equal(cause.code, "23505");
    assert.equal(cause.constraint, "users_email_unique");
    assert.equal(cause.table, "users");
    assert.equal("detail" in cause, false);

    const { log, entries } = memoryLogger();
    log.error({ err: error }, "insert failed");
    log.error(new Error("thrown directly"));
    const [first, second] = entries();
    assert.equal((first.err as { cause: { code: string } }).cause.code, "23505");
    assert.equal(second.msg, "thrown directly");
    assert.equal((second.err as { name: string }).name, "Error");
});

test("scrubText keeps query frames after the params it removes", () => {
    const scrubbed = scrubText("Error: Failed query: select 1\nparams: secret-value\n    at run (file.ts:1:1)");
    assert.equal(scrubbed, "Error: Failed query: select 1\nparams: [Redacted]\n    at run (file.ts:1:1)");
});

test("each JSON line has its time, level name, message, service and environment", () => {
    const { log, entries } = memoryLogger({ nodeEnv: "production" });
    log.info({ projectId: "p1" }, "something happened");
    const [entry] = entries();
    assert.equal(entry.level, "info");
    assert.equal(entry.msg, "something happened");
    assert.equal(entry.service, "rinia-api");
    assert.equal(entry.env, "production");
    assert.equal(entry.projectId, "p1");
    assert.ok(!Number.isNaN(Date.parse(String(entry.time))));
});

test("LOG_LEVEL and LOG_FORMAT choose the level and format, with defaults by NODE_ENV", () => {
    assert.deepEqual(logSettings({ NODE_ENV: "production" }), { level: "info", format: "json" });
    assert.deepEqual(logSettings({ NODE_ENV: "development" }), { level: "debug", format: "pretty" });
    assert.deepEqual(logSettings({ NODE_ENV: "test" }), { level: "silent", format: "json" });
    assert.deepEqual(logSettings({ NODE_ENV: "production", LOG_LEVEL: "WARN", LOG_FORMAT: "pretty" }), { level: "warn", format: "pretty" });
    assert.deepEqual(logSettings({ NODE_ENV: "production", LOG_LEVEL: "loud" }), { level: "info", format: "json" });

    const warnOnly = memoryLogger({ level: "warn" });
    warnOnly.log.info("hidden");
    warnOnly.log.warn("shown");
    assert.deepEqual(
        warnOnly.entries().map((entry) => entry.msg),
        ["shown"],
    );

    const silent = memoryLogger({ level: "silent" });
    silent.log.fatal("nothing");
    assert.equal(silent.lines.length, 0);

    const pretty = memoryLogger({ format: "pretty", colorize: false });
    pretty.log.info({ issueId: "i1" }, "readable line");
    const [line] = pretty.lines;
    assert.throws(() => JSON.parse(line));
    assert.match(line, /INFO.*readable line/);
    assert.match(line, /issueId: "i1"/);
});

/** Files allowed to print with console: settings validation runs before logging is configured, and the dev-only db scripts. */
const CONSOLE_ALLOWED = new Set(["config/env.ts", "db/seed.ts", "db/reset.ts"]);

test("the API logs through the logger, not console", () => {
    const root = path.resolve(import.meta.dir, "../src");
    const files = (function walk(dir: string): string[] {
        return readdirSync(dir).flatMap((name) => {
            const file = path.join(dir, name);
            return statSync(file).isDirectory() ? walk(file) : /\.ts$/.test(name) ? [file] : [];
        });
    })(root);
    const offenders = files
        .map((file) => path.relative(root, file).split(path.sep).join("/"))
        .filter((file) => !CONSOLE_ALLOWED.has(file))
        .filter((file) => /\bconsole\.(log|info|warn|error|debug|trace)\s*\(/.test(readFileSync(path.join(root, file), "utf8")));
    assert.deepEqual(offenders, [], "use logger or logFor() from lib/request-context instead of console");
});
