import type { TiptapDocument } from "@rinia/shared";

/** Whether the document holds anything a person wrote: text, an image, a mention, a divider or a line break. */
export function hasMeaningfulTiptapContent(document: TiptapDocument) {
    const visit = (nodes: unknown[]): boolean => nodes.some((candidate) => {
        if (!candidate || typeof candidate !== "object") return false;
        const node = candidate as { type?: unknown; text?: unknown; content?: unknown[] };
        if (node.type === "text" && typeof node.text === "string" && node.text.trim().length > 0) return true;
        if (["image", "horizontalRule", "hardBreak", "mention"].includes(String(node.type))) return true;
        return Array.isArray(node.content) && visit(node.content);
    });
    return visit(document.content ?? []);
}
