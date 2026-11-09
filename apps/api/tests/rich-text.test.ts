import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "bun:test";
import { isMarkdownTable, markdownToTiptap, tiptapToMarkdown } from "@rinia/shared";
import { checkRichText, richTextProfiles, richTextSchema, urlLinkCut } from "@rinia/shared/src/rich-text-schema";

const fixtures = join(import.meta.dir, "fixtures/markdown");
const names = readdirSync(fixtures)
    .filter((file) => file.endsWith(".md"))
    .map((file) => file.slice(0, -3));

/**
 * Each fixture is Markdown as the converter writes it, next to the Tiptap JSON it stands for. Reading it must give that
 * JSON, and writing the JSON must give the same Markdown back, so `markdown → JSON → markdown` never drifts.
 */
for (const name of names) {
    test(`markdown fixture "${name}" reads and writes back unchanged`, () => {
        const markdown = readFileSync(join(fixtures, `${name}.md`), "utf8").trimEnd();
        const json = JSON.parse(readFileSync(join(fixtures, `${name}.json`), "utf8"));
        assert.deepEqual(markdownToTiptap(markdown), json);
        assert.equal(tiptapToMarkdown(json), markdown);
    });

    test(`markdown fixture "${name}" is valid content for pages and descriptions`, () => {
        const json = JSON.parse(readFileSync(join(fixtures, `${name}.json`), "utf8"));
        for (const profile of ["document", "description"] as const) assert.deepEqual(checkRichText(json, profile), { ok: true }, `${name} as ${profile}`);
    });
}

/** Markdown written some other way: it reads as the expected form and stays there. */
const variants: Array<[string, string, string]> = [
    ["deeper headings become level 3", "#### Four\n\n###### Six", "### Four\n\n### Six"],
    ["a soft line break is kept as a break", "one\ntwo", "one\\\ntwo"],
    ["two trailing spaces are a break", "one  \ntwo", "one\\\ntwo"],
    ["`*` and `+` bullets", "* a\n+ b", "- a\n\n* b"],
    ["`__bold__` and `_italic_`", "__bold__ and _italic_", "**bold** and *italic*"],
    ["quote lines join into one paragraph with breaks", "> a\n> b", "> a\\\n> b"],
    ["entities are decoded", "a &amp; b &lt;c&gt; &#39;d&#39;", "a & b \\<c> 'd'"],
    ["HTML is kept as text", "<div>hi</div>", "\\<div>hi\\</div>"],
    ["an image inside text splits the paragraph", "before ![x](https://example.com/x.png) after", "before\n\n![x](https://example.com/x.png)\n\nafter"],
    ["a mixed list keeps its checkboxes as text", "- [x] Checked\n- Plain item", "- \\[x\\] Checked\n- Plain item"],
    ["a link with spaces is wrapped in angle brackets", "[a](<https://example.com/a b>)", "[a](<https://example.com/a b>)"],
    ["table cells are trimmed and short rows padded", "|a|b|\n|-|-|\n|1|", "| a | b |\n| --- | --- |\n| 1 |  |"],
    ["a table without a leading pipe", "a | b\n--- | ---\n1 | 2", "| a | b |\n| --- | --- |\n| 1 | 2 |"],
    ["an empty document", "", ""],
    ["bold around code leaves plain code", "The plugin adds **every file in `dist/`** to the precache list.", "The plugin adds **every file in** `dist/` to the precache list."],
    ["italic and strike around code leave plain code", "*see `a`* and ~~old `b`~~", "*see* `a` and ~~old~~ `b`"],
    ["a code span alone inside bold, italic or strike is plain code", "**`a`** *`b`* ~~`c`~~", "`a` `b` `c`"],
    ["bold and italic around code leave plain code", "***bold italic `x`***", "***bold italic*** `x`"],
    ["a link whose label is code keeps the link", "[`code`](https://example.com) and [see `code` here](https://example.com)", "[code](https://example.com) and [see code here](https://example.com)"],
    ["bold around a link around code keeps the link and the bold", "**[`x`](https://example.com)**", "[**x**](https://example.com)"],
    ["a link around bold code reads the same as bold around a link around code", "[**`x`**](https://example.com)", "[**x**](https://example.com)"],
    ["a mark nested inside itself counts once", "**a *b **c** d***", "**a *b c d***"],
    ["code inside marks in a heading and a table cell", "# Head **`x`**\n\n| **`a`** |\n| --- |\n| ~~`b`~~ |", "# Head `x`\n\n| `a` |\n| --- |\n| `b` |"],
    ["code inside marks in list items", "- **`x` and y**\n- ~~`z`~~", "- `x` **and y**\n- `z`"],
];

for (const [name, input, expected] of variants) {
    test(`markdown variant: ${name}`, () => {
        const output = tiptapToMarkdown(markdownToTiptap(input));
        assert.equal(output, expected);
        assert.equal(tiptapToMarkdown(markdownToTiptap(output)), output);
    });
}

/** Markdown that nests marks around code, written the way agents write it. Every profile must take all of it. */
const markWrapped = [
    "The plugin adds **every file in `dist/`** to the precache list.",
    "*see `a`* and ~~old `b`~~ and ***both `c`***",
    "[`code`](https://example.com) and **[`code`](https://example.com)** and [**`code`**](https://example.com)",
    "**a *b `c` **d** e***",
    "# **`Title`**\n\n> *`quoted`*\n\n- [ ] ~~`task`~~\n\n1. **`step`**\n\n| **`a`** | [`b`](https://example.com) |\n| --- | --- |\n| *`1`* | ~~`2`~~ |",
];

test("no mark combination in Markdown produces a document the schema refuses", () => {
    for (const source of markWrapped)
        for (const profile of ["document", "description", "comment"] as const) {
            const json = markdownToTiptap(source, profile);
            assert.deepEqual(checkRichText(json, profile), { ok: true }, `${source} as ${profile}`);
            assert.deepEqual(checkRichText(markdownToTiptap(tiptapToMarkdown(json), profile), profile), { ok: true }, `${source} written back as ${profile}`);
        }
});

test("a code span keeps only its code mark, and a link label with code keeps only the link", () => {
    const json = markdownToTiptap("**a `b`** [`c`](https://example.com)");
    const marks = json.content[0].content.map((node: { marks?: Array<{ type: string }> }) => (node.marks ?? []).map((mark) => mark.type));
    assert.deepEqual(marks, [["bold"], ["code"], [], ["link"]]);
});

test("a document with code beside other marks goes to Markdown and back unchanged", () => {
    const text = (value: string, ...marks: string[]) => ({ type: "text", text: value, ...(marks.length && { marks: marks.map((type) => ({ type })) }) });
    const document = {
        type: "doc",
        content: [{ type: "paragraph", content: [text("Run "), text("bun test", "code"), text(" "), text("now", "bold"), text(" "), text("--watch", "code"), text(" "), text("later", "bold", "italic"), text(" "), text("x", "code")] }],
    };
    assert.deepEqual(checkRichText(document, "description"), { ok: true });
    assert.deepEqual(markdownToTiptap(tiptapToMarkdown(document)), document);
});

test("an image in a comment becomes a link to it", () => {
    const json = markdownToTiptap("See ![the chart](https://example.com/chart.png)", "comment");
    assert.deepEqual(json.content, [
        { type: "paragraph", content: [{ type: "text", text: "See " }, { type: "text", text: "the chart", marks: [{ type: "link", attrs: { href: "https://example.com/chart.png" } }] }] },
    ]);
    assert.deepEqual(checkRichText(json, "comment"), { ok: true });
});

test("mentions keep their id both ways", () => {
    const json = markdownToTiptap('Hi [@ id="u-1" label="Ana &quot;A&quot; Souza"]');
    assert.deepEqual(json.content[0], { type: "paragraph", content: [{ type: "text", text: "Hi " }, { type: "mention", attrs: { id: "u-1", label: 'Ana "A" Souza' } }] });
    assert.equal(tiptapToMarkdown(json), 'Hi [@ id="u-1" label="Ana &quot;A&quot; Souza"]');
});

test("a cell with several blocks is written on one line and read back as breaks", () => {
    const cell = (type: string, blocks: unknown[]) => ({ type, content: blocks });
    const text = (value: string) => ({ type: "paragraph", content: [{ type: "text", text: value }] });
    const table = { type: "doc", content: [{ type: "table", content: [{ type: "tableRow", content: [cell("tableHeader", [text("a")])] }, { type: "tableRow", content: [cell("tableCell", [text("one"), text("two")])] }] }] };
    const markdown = tiptapToMarkdown(table);
    assert.equal(markdown, "| a |\n| --- |\n| one<br>two |");
    assert.deepEqual(markdownToTiptap(markdown).content[0].content, [
        { type: "tableRow", content: [cell("tableHeader", [text("a")])] },
        { type: "tableRow", content: [cell("tableCell", [{ type: "paragraph", content: [{ type: "text", text: "one" }, { type: "hardBreak" }, { type: "text", text: "two" }] }])] },
    ]);
});

test("a code fence is longer than any fence inside the code", () => {
    const json = { type: "doc", content: [{ type: "codeBlock", attrs: { language: "md" }, content: [{ type: "text", text: "```\ninner\n```" }] }] };
    assert.equal(tiptapToMarkdown(json), "````md\n```\ninner\n```\n````");
    assert.deepEqual(markdownToTiptap(tiptapToMarkdown(json)), json);
});

test("Markdown tables are recognised in pasted text", () => {
    assert.equal(isMarkdownTable("| a | b |\n| --- | --- |\n| 1 | 2 |"), true);
    assert.equal(isMarkdownTable("a | b\n:-- | --:"), true);
    assert.equal(isMarkdownTable("just | some pipes\nand text"), false);
    assert.equal(isMarkdownTable("one line | only"), false);
});

test("every profile builds the same schema on the server as in the editors", () => {
    const document = richTextSchema("document");
    const description = richTextSchema("description");
    const comment = richTextSchema("comment");
    const nodes = (schema: typeof document) => Object.keys(schema.nodes).sort();
    assert.deepEqual(nodes(description), nodes(document));
    assert.deepEqual(
        nodes(comment),
        nodes(document).filter((name) => name !== "image"),
    );
    for (const name of ["table", "tableRow", "tableHeader", "tableCell", "taskList", "mention", "hardBreak"]) assert.ok(comment.nodes[name], name);
    assert.deepEqual(Object.keys(comment.marks).sort(), Object.keys(document.marks).sort());
});

test("unknown nodes and marks are reported by name", () => {
    const content = { type: "doc", content: [{ type: "callout", content: [{ type: "text", text: "x", marks: [{ type: "highlight" }] }] }] };
    const result = checkRichText(content, "description");
    assert.equal(result.ok, false);
    assert.ok(!result.ok && result.message.includes('"callout"') && result.message.includes('"highlight"'));
});

test("images are reported in comments only", () => {
    const content = { type: "doc", content: [{ type: "image", attrs: { src: "https://example.com/x.png" } }] };
    assert.deepEqual(checkRichText(content, "description"), { ok: true });
    const result = checkRichText(content, "comment");
    assert.ok(!result.ok && result.message === '"image" is not supported in a comment.');
});

test("content that breaks the schema's structure is reported", () => {
    const tableInParagraph = { type: "doc", content: [{ type: "paragraph", content: [{ type: "table", content: [] }] }] };
    for (const profile of richTextProfiles) assert.equal(checkRichText(tableInParagraph, profile).ok, false);
    assert.deepEqual(checkRichText({ type: "doc", content: [] }, "comment"), { ok: true });
});

test("a space ends a link whose text is the URL, and a phrase stays linked", () => {
    assert.equal(urlLinkCut("https://example.com hello", "https://example.com"), "https://example.com".length);
    assert.equal(urlLinkCut("example.com hello", "https://example.com/"), "example.com".length);
    assert.equal(urlLinkCut("https://example.com/docs hello", "https://example.com/docs"), "https://example.com/docs".length);
    assert.equal(urlLinkCut("ver a documentação", "https://example.com"), null);
    assert.equal(urlLinkCut("https://example.com", "https://example.com"), null);
    assert.equal(urlLinkCut("https://example.com/docs hello", "https://example.com"), null);
    assert.equal(richTextSchema("description").marks.link.spec.inclusive, false);
    assert.equal(richTextSchema("document").marks.link.spec.inclusive, false);
    assert.equal(richTextSchema("comment").marks.link.spec.inclusive, false);
});

test("a description with a table is valid and keeps the table", () => {
    const content = markdownToTiptap("| a | b |\n| --- | --- |\n| 1 | 2 |", "description");
    assert.deepEqual(checkRichText(content, "description"), { ok: true });
    const node = richTextSchema("description").nodeFromJSON(content);
    assert.equal(node.firstChild?.type.name, "table");
    assert.equal(node.textContent, "ab12");
});
