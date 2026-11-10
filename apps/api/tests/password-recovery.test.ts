import assert from "node:assert/strict";
import { afterEach, mock, spyOn, test } from "bun:test";
import { db } from "../src/db";
import { passwordChangedEmail, passwordResetEmail } from "../src/features/auth/auth.emails";
import { changePassword, hashResetToken, requestPasswordReset, resetPassword, RESET_LIFETIME_MS } from "../src/features/auth/password.service";
import { HttpError } from "../src/lib/http-error";
import { hashPassword } from "../src/lib/password";

// Stub the database boundary: these tests never connect to or mutate a development database.
afterEach(() => mock.restore());

const ana = { id: "5d1e2f3a-0000-4000-8000-000000000001", name: "Ana <Souza>", username: "ana", email: "ana@rinia.local", locale: "pt-BR", suspendedAt: null };
const isHttp = (status: number) => (error: unknown) => error instanceof HttpError && error.statusCode === status;

/** Records what `db.insert(...).values(...)` was given. */
function captureInserts() {
    const inserted: Array<Record<string, unknown>> = [];
    spyOn(db, "insert").mockImplementation((() => ({ values: async (values: Record<string, unknown>) => void inserted.push(values) })) as never);
    return inserted;
}

test("a reset link is stored only as a hash and expires in an hour", async () => {
    spyOn(db.query.users, "findFirst").mockImplementation((async () => ana) as never);
    spyOn(db.query.passwordResetTokens, "findFirst").mockImplementation((async () => undefined) as never);
    const inserted = captureInserts();
    const before = Date.now();
    await requestPasswordReset("ana", "https://rinia.example");
    assert.equal(inserted.length, 1);
    assert.match(String(inserted[0].tokenHash), /^[0-9a-f]{64}$/);
    const expiresIn = (inserted[0].expiresAt as Date).getTime() - before;
    assert.ok(expiresIn >= RESET_LIFETIME_MS - 1000 && expiresIn <= RESET_LIFETIME_MS + 1000);
});

test("unknown, suspended and just-asked accounts get no link, and the caller cannot tell", async () => {
    const inserted = captureInserts();
    const findUser = spyOn(db.query.users, "findFirst").mockImplementation((async () => undefined) as never);
    await requestPasswordReset("nobody", "https://rinia.example");
    findUser.mockImplementation((async () => ({ ...ana, suspendedAt: new Date() })) as never);
    await requestPasswordReset("ana", "https://rinia.example");
    findUser.mockImplementation((async () => ana) as never);
    spyOn(db.query.passwordResetTokens, "findFirst").mockImplementation((async () => ({ id: "recent" })) as never);
    await requestPasswordReset("ana", "https://rinia.example");
    assert.equal(inserted.length, 0);
});

test("a used, expired or unknown link is refused before any password changes", async () => {
    spyOn(db, "update").mockImplementation((() => ({ set: () => ({ where: () => ({ returning: async () => [] }) }) })) as never);
    const findUser = spyOn(db.query.users, "findFirst");
    await assert.rejects(resetPassword("stale-token", "a-new-password"), isHttp(400));
    assert.equal(findUser.mock.calls.length, 0);
});

test("a working link saves a hashed password, ends every session and retires other links", async () => {
    const updates: Array<Record<string, unknown>> = [];
    spyOn(db, "update").mockImplementation((() => ({
        set: (values: Record<string, unknown>) => (updates.push(values), { where: () => Object.assign(Promise.resolve(), { returning: async () => [{ userId: ana.id, id: "session-1" }] }) }),
    })) as never);
    spyOn(db.query.users, "findFirst").mockImplementation((async () => ana) as never);
    const deleted = spyOn(db, "delete").mockImplementation((() => ({ where: async () => undefined })) as never);
    await resetPassword("good-token", "a-new-password");
    const saved = updates.find((values) => "passwordHash" in values)!;
    assert.notEqual(saved.passwordHash, "a-new-password");
    // Every session is revoked: no session is kept, unlike a change from the profile.
    assert.ok(updates.some((values) => values.revokedAt instanceof Date));
    assert.equal(deleted.mock.calls.length, 1);
    assert.equal(hashResetToken("good-token").length, 64);
});

test("changing the password from the profile needs the current one", async () => {
    spyOn(db.query.users, "findFirst").mockImplementation((async () => ({ ...ana, passwordHash: await hashPassword("the-old-one") })) as never);
    const update = spyOn(db, "update");
    await assert.rejects(changePassword(ana.id, "wrong", "a-new-password"), isHttp(400));
    assert.equal(update.mock.calls.length, 0);
});

test("emails escape names, put the link in the fragment, and speak the person's language", () => {
    const reset = passwordResetEmail(ana, "https://rinia.example/reset-password#abc", { hours: 1, byAdmin: false });
    assert.ok(reset.html.includes("Ana &lt;Souza&gt;"));
    assert.ok(!reset.html.includes("<Souza>"));
    assert.ok(reset.text.includes("https://rinia.example/reset-password#abc"));
    assert.equal(reset.subject, "Redefina sua senha do Rinia");
    assert.equal(passwordResetEmail({ ...ana, locale: "en" }, "x", { hours: 24, byAdmin: true }).subject, "Reset your Rinia password");
    assert.ok(passwordChangedEmail(ana, new Date(0)).text.includes("@ana"));
});
