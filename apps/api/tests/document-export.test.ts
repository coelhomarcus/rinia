import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { test } from "bun:test";
import { markdownToTiptap } from "@rinia/shared";
import { attachmentDisposition, documentMarkdown, markdownFilename, projectExportFilename, projectMarkdownZip } from "../src/features/documents/document-export";
import { crc32, zipStore } from "../src/lib/zip";

const fixtures = join(import.meta.dir, "fixtures/markdown");

function readZip(buffer: Buffer) {
    const entries: { name: string; data: Buffer }[] = [];
    let offset = 0;
    while (offset + 4 <= buffer.length) {
        const signature = buffer.readUInt32LE(offset);
        if (signature !== 0x04034b50) break;
        const method = buffer.readUInt16LE(offset + 8);
        const crc = buffer.readUInt32LE(offset + 14);
        const size = buffer.readUInt32LE(offset + 18);
        const nameLength = buffer.readUInt16LE(offset + 26);
        const extra = buffer.readUInt16LE(offset + 28);
        const name = buffer.subarray(offset + 30, offset + 30 + nameLength).toString("utf8");
        const start = offset + 30 + nameLength + extra;
        const data = Buffer.from(buffer.subarray(start, start + size));
        assert.equal(method, 0);
        assert.equal(crc32(data), crc);
        entries.push({ name, data });
        offset = start + size;
    }
    const end = buffer.readUInt32LE(buffer.length - 22);
    assert.equal(end, 0x06054b50);
    assert.equal(buffer.readUInt16LE(buffer.length - 14), entries.length);
    return entries;
}

test("exported markdown imports back to the same page", () => {
    const names = readdirSync(fixtures).filter((file) => file.endsWith(".json")).map((file) => file.slice(0, -5));
    for (const name of names) {
        const json = JSON.parse(readFileSync(join(fixtures, `${name}.json`), "utf8"));
        const exported = documentMarkdown(json);
        assert.deepEqual(markdownToTiptap(exported, "document"), json, name);
    }
});

test("a Rinia file link stays a stored path, so update_document restores the image", () => {
    const page = markdownToTiptap("Before\n\n![chart](/api/files/11111111-1111-4111-8111-111111111111)\n\nAfter", "document");
    const exported = documentMarkdown(page);
    assert.match(exported, /\]\(\/api\/files\/11111111-1111-4111-8111-111111111111\)/);
    assert.doesNotMatch(exported, /https?:\/\//);
    assert.deepEqual(markdownToTiptap(exported, "document"), page);
});

test("a project archive is one markdown file per page", () => {
    const first = markdownToTiptap("Alpha", "document");
    const second = markdownToTiptap("![chart](/api/files/22222222-2222-4222-8222-222222222222)", "document");
    const archive = projectMarkdownZip([
        { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", title: "Alpha", contentJson: first },
        { id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", title: "Chart", contentJson: second },
    ]);
    const entries = readZip(archive);
    assert.deepEqual(
        entries.map((entry) => entry.name),
        ["alpha-aaaaaaaaaaaa.md", "chart-bbbbbbbbbbbb.md"],
    );
    assert.deepEqual(markdownToTiptap(entries[0]!.data.toString("utf8"), "document"), first);
    assert.deepEqual(markdownToTiptap(entries[1]!.data.toString("utf8"), "document"), second);
});

test("export names stay inside the archive", () => {
    assert.equal(markdownFilename({ id: "22222222-2222-4222-8222-222222222222", title: "Overview notes" }), "overview-notes-222222222222.md");
    assert.equal(projectExportFilename("RIN"), "rin-pages.zip");
    assert.equal(projectExportFilename(""), "pages.zip");
    assert.equal(attachmentDisposition("notes.md"), `attachment; filename="notes.md"; filename*=UTF-8''notes.md`);
    assert.throws(() => zipStore([{ name: "../secret.md", data: Buffer.from("no") }]));
    assert.equal(readZip(zipStore([])).length, 0);
});
