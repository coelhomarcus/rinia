import assert from "node:assert/strict";
import { test } from "bun:test";
import { loginSchema } from "@rinia/shared";
import { secretsEqual } from "../src/lib/secrets";

test("secret comparison matches equal text and rejects the rest, including different lengths", () => {
    assert.equal(secretsEqual("open-sesame", "open-sesame"), true);
    assert.equal(secretsEqual("open-sesame", "open-sesami"), false);
    assert.equal(secretsEqual("short", "a-much-longer-secret"), false);
});

test("a login password is capped so a huge body cannot stall hashing", () => {
    assert.ok(loginSchema.safeParse({ identifier: "ana", password: "x".repeat(72) }).success);
    assert.ok(!loginSchema.safeParse({ identifier: "ana", password: "x".repeat(73) }).success);
});
