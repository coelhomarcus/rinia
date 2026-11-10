import assert from "node:assert/strict";
import { afterEach, mock, spyOn, test } from "bun:test";
import "./fixtures/sessions";
import { db } from "../src/db";
import { loginUser, registerUser } from "../src/features/auth/auth.service";
import { HttpError } from "../src/lib/http-error";
import { hashPassword, isLegacyBcryptHash, verifyPassword } from "../src/lib/password";

afterEach(() => mock.restore());

const isHttp = (status: number) => (error: unknown) => error instanceof HttpError && error.statusCode === status;
const ana = {
    id: "7a1e2f3a-0000-4000-8000-000000000001",
    name: "Ana",
    username: "ana",
    email: "ana@rinia.local",
    locale: "pt-BR",
    isAdmin: false,
    suspendedAt: null,
    avatarUrl: null,
    density: "comfortable",
    createdAt: new Date(0),
    updatedAt: new Date(0),
};

test("a missing user is the same 401 as a wrong password", async () => {
    spyOn(db.query.users, "findFirst").mockImplementation((async () => undefined) as never);
    await assert.rejects(loginUser({ identifier: "nobody", password: "s3cret-pass" }, {}), isHttp(401));
});

test("a bcrypt password is rewritten to argon2id after a successful login", async () => {
    const bcryptHash = await Bun.password.hash("s3cret-pass", { algorithm: "bcrypt", cost: 4 });
    assert.equal(isLegacyBcryptHash(bcryptHash), true);
    spyOn(db.query.users, "findFirst").mockImplementation((async () => ({ ...ana, passwordHash: bcryptHash })) as never);
    const updates: Array<Record<string, unknown>> = [];
    spyOn(db, "update").mockImplementation((() => ({
        set: (values: Record<string, unknown>) => (updates.push(values), { where: async () => undefined }),
    })) as never);
    spyOn(db, "insert").mockImplementation((() => ({ values: async () => undefined })) as never);
    const result = await loginUser({ identifier: "ana", password: "s3cret-pass" }, {});
    assert.equal(result.user.username, "ana");
    assert.match(String(updates[0]?.passwordHash), /^\$argon2id\$/);
    assert.equal(await verifyPassword("s3cret-pass", String(updates[0].passwordHash)), true);
});

test("an argon2id password is left as it is", async () => {
    const hash = await hashPassword("s3cret-pass");
    spyOn(db.query.users, "findFirst").mockImplementation((async () => ({ ...ana, passwordHash: hash })) as never);
    const update = spyOn(db, "update");
    spyOn(db, "insert").mockImplementation((() => ({ values: async () => undefined })) as never);
    await loginUser({ identifier: "ana", password: "s3cret-pass" }, {});
    assert.equal(update.mock.calls.length, 0);
});

test("a wrong registration code is rejected", async () => {
    await assert.rejects(
        registerUser({ name: "Ana", username: "ana", email: "ana@rinia.local", password: "s3cret-pass", specialCode: "wrong-code", locale: "pt-BR" }, {}),
        isHttp(403),
    );
});
