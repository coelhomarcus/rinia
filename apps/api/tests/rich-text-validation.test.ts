import assert from "node:assert/strict";
import { afterEach, mock, spyOn, test } from "bun:test";
import { markdownToTiptap } from "@rinia/shared";
import { db } from "../src/db";
import { createDocument } from "../src/features/documents/documents.service";
import { createIssueComment, updateIssue, updateIssueComment } from "../src/features/issues/issues.service";
import { HttpError } from "../src/lib/http-error";
import { assertRichText } from "../src/lib/rich-text";

// Content is checked before anything is read or written, so any database call here is a failure.
afterEach(() => mock.restore());

const userId = "6c4a2e10-0000-4000-8000-000000000001";
const projectId = "6c4a2e10-0000-4000-8000-0000000000aa";

function forbidDatabase() {
    for (const method of ["select", "insert", "update", "delete", "transaction"] as const)
        spyOn(db, method).mockImplementation((() => {
            throw new Error(`db.${method} reached with invalid content`);
        }) as never);
    spyOn(db.query.issues, "findFirst").mockImplementation((() => {
        throw new Error("db.query reached with invalid content");
    }) as never);
}

const unsupported = (message: string) => (error: unknown) => error instanceof HttpError && error.statusCode === 400 && error.code === "errors.unsupportedContent" && error.message === message;
const callout = { type: "doc" as const, content: [{ type: "callout", content: [{ type: "text", text: "Heads up" }] }] };
const image = { type: "doc" as const, content: [{ type: "image", attrs: { src: "https://example.com/a.png" } }] };

test("a description with an unknown block is refused with a clear message", async () => {
    forbidDatabase();
    await assert.rejects(updateIssue("RIN-1", { descriptionJson: callout }, userId), unsupported('"callout" is not supported in an issue description.'));
});

test("a comment with an image is refused, since comments have no images", async () => {
    forbidDatabase();
    await assert.rejects(createIssueComment("RIN-1", { contentJson: image }, userId), unsupported('"image" is not supported in a comment.'));
    await assert.rejects(updateIssueComment("6c4a2e10-0000-4000-8000-0000000000c1", { contentJson: image }, userId), unsupported('"image" is not supported in a comment.'));
});

test("a page with an unknown block is refused", async () => {
    forbidDatabase();
    await assert.rejects(createDocument(projectId, userId, { contentJson: callout }), unsupported('"callout" is not supported in a page.'));
});

test("a table written in Markdown passes the description and comment checks", () => {
    const table = "| a | b |\n| --- | --- |\n| 1 | 2 |";
    assert.doesNotThrow(() => assertRichText(markdownToTiptap(table, "description"), "description"));
    assert.doesNotThrow(() => assertRichText(markdownToTiptap(table, "comment"), "comment"));
});
