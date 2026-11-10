import assert from "node:assert/strict";
import { test } from "bun:test";
import { hashPassword, isLegacyBcryptHash, verifyLoginPassword, verifyPassword } from "../src/lib/password";

test("new passwords are stored as argon2id", async () => {
    const hash = await hashPassword("s3cret-pass");
    assert.match(hash, /^\$argon2id\$/);
    assert.equal(await verifyPassword("s3cret-pass", hash), true);
    assert.equal(await verifyPassword("wrong-pass", hash), false);
});

test("legacy bcrypt hashes still verify", async () => {
    const hash = await Bun.password.hash("s3cret-pass", { algorithm: "bcrypt", cost: 10 });
    assert.match(hash, /^\$2[ab]\$/);
    assert.equal(isLegacyBcryptHash(hash), true);
    assert.equal(await verifyPassword("s3cret-pass", hash), true);
    assert.equal(await verifyPassword("wrong-pass", hash), false);
});

test("a missing stored hash still runs a password check", async () => {
    assert.equal(await verifyLoginPassword("s3cret-pass", undefined), false);
    const hash = await hashPassword("s3cret-pass");
    assert.equal(isLegacyBcryptHash(hash), false);
    assert.equal(await verifyLoginPassword("s3cret-pass", hash), true);
});
