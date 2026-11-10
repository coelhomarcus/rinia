import assert from "node:assert/strict";
import { afterEach, mock, spyOn, test } from "bun:test";
import { db } from "../src/db";
import { confirmEmailChangeEmail, emailChangedEmail } from "../src/features/auth/auth.emails";
import { confirmEmailChange, requestEmailChange } from "../src/features/users/email-change.service";
import { env } from "../src/config/env";
import { HttpError } from "../src/lib/http-error";
import { hashPassword } from "../src/lib/password";

// Stub the database boundary: these tests never connect to or mutate a development database.
afterEach(() => mock.restore());

const ana = { id: "6e1e2f3a-0000-4000-8000-000000000001", name: "Ana", username: "ana", email: "ana@rinia.local", locale: "pt-BR", suspendedAt: null };
const isHttp = (status: number) => (error: unknown) => error instanceof HttpError && error.statusCode === status;
const passwordHash = await hashPassword("the-password");

/** Email links are on, as they are with Resend set up; sending only logs, since no key is set in tests. */
function emailOn() {
    const previous = env.emailLinksEnabled;
    env.emailLinksEnabled = true;
    return () => void (env.emailLinksEnabled = previous);
}

test("a new email is not saved until confirmed, and only the new address gets the link", async () => {
    const restore = emailOn();
    try {
        const findUser = spyOn(db.query.users, "findFirst").mockImplementation((async () => ({ ...ana, passwordHash })) as never);
        const inserted: Array<Record<string, unknown>> = [];
        spyOn(db, "delete").mockImplementation((() => ({ where: async () => undefined })) as never);
        spyOn(db, "insert").mockImplementation((() => ({ values: async (values: Record<string, unknown>) => void inserted.push(values) })) as never);
        const update = spyOn(db, "update");
        // The second lookup asks whether the address is taken.
        findUser.mockImplementationOnce((async () => ({ ...ana, passwordHash })) as never).mockImplementationOnce((async () => undefined) as never);
        const pending = await requestEmailChange(ana.id, { newEmail: "ana@new.example", currentPassword: "the-password" }, "https://rinia.example");
        assert.equal(pending.email, "ana@new.example");
        assert.equal(inserted[0].newEmail, "ana@new.example");
        assert.match(String(inserted[0].tokenHash), /^[0-9a-f]{64}$/);
        assert.equal(update.mock.calls.length, 0);
    } finally {
        restore();
    }
});

test("asking for an email change needs the password, a different address, and one nobody uses", async () => {
    const restore = emailOn();
    try {
        const findUser = spyOn(db.query.users, "findFirst").mockImplementation((async () => ({ ...ana, passwordHash })) as never);
        await assert.rejects(requestEmailChange(ana.id, { newEmail: "x@new.example", currentPassword: "wrong" }, "https://rinia.example"), isHttp(400));
        await assert.rejects(requestEmailChange(ana.id, { newEmail: ana.email, currentPassword: "the-password" }, "https://rinia.example"), isHttp(400));
        findUser.mockImplementationOnce((async () => ({ ...ana, passwordHash })) as never).mockImplementationOnce((async () => ({ id: "someone-else" })) as never);
        await assert.rejects(requestEmailChange(ana.id, { newEmail: "taken@new.example", currentPassword: "the-password" }, "https://rinia.example"), isHttp(409));
    } finally {
        restore();
    }
});

test("without email set up, an email change is refused", async () => {
    const previous = env.emailLinksEnabled;
    env.emailLinksEnabled = false;
    try {
        await assert.rejects(requestEmailChange(ana.id, { newEmail: "x@new.example", currentPassword: "the-password" }, "https://rinia.example"), isHttp(503));
    } finally {
        env.emailLinksEnabled = previous;
    }
});

test("a used or expired confirmation link changes nothing", async () => {
    spyOn(db, "update").mockImplementation((() => ({ set: () => ({ where: () => ({ returning: async () => [] }) }) })) as never);
    const findUser = spyOn(db.query.users, "findFirst");
    await assert.rejects(confirmEmailChange("stale"), isHttp(400));
    assert.equal(findUser.mock.calls.length, 0);
});

test("confirmation emails go to the new address and the notice to the old one", () => {
    const confirm = confirmEmailChangeEmail(ana, "ana@new.example", "https://rinia.example/confirm-email#abc");
    assert.equal(confirm.to, "ana@new.example");
    assert.ok(confirm.text.includes("https://rinia.example/confirm-email#abc"));
    const notice = emailChangedEmail(ana, ana.email, "ana@new.example");
    assert.equal(notice.to, ana.email);
    assert.ok(notice.text.includes("ana@new.example"));
});
