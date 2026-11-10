import { describe, expect, test } from "bun:test";
import type { TiptapDocument } from "@rinia/shared";
import { hasMeaningfulTiptapContent } from "../src/features/issues/lib/tiptap-content";

const doc = (content: unknown[]) => ({ type: "doc", content }) as TiptapDocument;

describe("hasMeaningfulTiptapContent", () => {
    test("an empty document, or one of blank paragraphs, has nothing", () => {
        expect(hasMeaningfulTiptapContent(doc([]))).toBe(false);
        expect(hasMeaningfulTiptapContent(doc([{ type: "paragraph" }, { type: "paragraph", content: [{ type: "text", text: "   " }] }]))).toBe(false);
    });

    test("text, mentions, images, dividers and line breaks count, however deep", () => {
        expect(hasMeaningfulTiptapContent(doc([{ type: "paragraph", content: [{ type: "text", text: "hi" }] }]))).toBe(true);
        expect(hasMeaningfulTiptapContent(doc([{ type: "paragraph", content: [{ type: "mention", attrs: { id: "1" } }] }]))).toBe(true);
        expect(hasMeaningfulTiptapContent(doc([{ type: "image" }]))).toBe(true);
        expect(hasMeaningfulTiptapContent(doc([{ type: "bulletList", content: [{ type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "x" }] }] }] }]))).toBe(true);
    });
});
