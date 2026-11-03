import assert from "node:assert/strict";
import { test } from "bun:test";
import { markdownToTiptap, repairLegacyMarkdownTables, type TiptapDocument } from "@rinia/shared";
import { checkRichText } from "@rinia/shared/src/rich-text-schema";

const text = (value: string, marks?: Array<{ type: string; attrs?: Record<string, unknown> }>) => (marks ? { type: "text", text: value, marks } : { type: "text", text: value });

/** What the first Markdown import saved for a table: one paragraph, newlines kept in the text, inline marks parsed. */
const legacyTable = {
    type: "paragraph",
    content: [
        text("| Produto | O que se encontrou |\n| --- | --- |\n| "),
        text("Linear", [{ type: "bold" }]),
        text(" | Criptografia em repouso. "),
        text("docs", [{ type: "link", attrs: { href: "https://linear.app/docs/security", target: "_blank", class: null } }]),
        text(" |\n| "),
        text("Plane", [{ type: "bold" }]),
        text(" | Usa "),
        text("AES_SECRET_KEY", [{ type: "code" }]),
        text(" para integrações. |"),
    ],
};

test("a table saved as a paragraph of pipes becomes a table", () => {
    const document = { type: "doc", content: [{ type: "heading", attrs: { level: 2 }, content: [text("Pesquisa")] }, legacyTable] } as TiptapDocument;
    const repaired = repairLegacyMarkdownTables(document, "description");
    assert.ok(repaired);
    const content = repaired.content as Array<{ type: string; content?: Array<{ content?: unknown[] }> }>;
    assert.deepEqual(content.map((node) => node.type), ["heading", "table"]);
    // Header plus two rows, two cells each, keeping bold, links and code.
    assert.equal(content[1].content?.length, 3);
    assert.deepEqual(repaired.content?.[1], markdownToTiptap("| Produto | O que se encontrou |\n| --- | --- |\n| **Linear** | Criptografia em repouso. [docs](https://linear.app/docs/security) |\n| **Plane** | Usa `AES_SECRET_KEY` para integrações. |", "description").content?.[0]);
    assert.deepEqual(checkRichText(repaired, "description"), { ok: true });
});

test("running the repair again changes nothing", () => {
    const repaired = repairLegacyMarkdownTables({ type: "doc", content: [legacyTable] } as TiptapDocument, "description");
    assert.ok(repaired);
    assert.equal(repairLegacyMarkdownTables(repaired, "description"), null);
});

test("paragraphs that are not tables are left alone", () => {
    const document = {
        type: "doc",
        content: [
            { type: "paragraph", content: [text("Escolha A | B\nou nenhum")] },
            { type: "paragraph", content: [text("Sem pipes, mas com\nduas linhas")] },
            { type: "paragraph", content: [text("| uma linha só |")] },
        ],
    } as TiptapDocument;
    assert.equal(repairLegacyMarkdownTables(document, "description"), null);
});
