import assert from "node:assert/strict";
import { test } from "bun:test";
import { ACTION_CLIENT_MAX_LENGTH, cleanClientName } from "@rinia/shared";

test("a client name is kept lowercase with only plain characters", () => {
    assert.equal(cleanClientName("claude-code"), "claude-code");
    assert.equal(cleanClientName("  Claude Code  "), "claude code");
    assert.equal(cleanClientName("Cursor<script>"), "cursorscript");
});

test("a client name that is empty or not text is dropped", () => {
    assert.equal(cleanClientName(""), null);
    assert.equal(cleanClientName("<>"), null);
    assert.equal(cleanClientName(undefined), null);
    assert.equal(cleanClientName({ name: "x" }), null);
});

test("a long client name is cut", () => {
    assert.equal(cleanClientName("a".repeat(500))?.length, ACTION_CLIENT_MAX_LENGTH);
});
