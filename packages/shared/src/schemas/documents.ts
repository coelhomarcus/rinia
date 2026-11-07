import { z } from "zod";
import { isStoredFilePath } from "../file-urls";
import { entityIconSchema } from "./appearance";
import { tiptapDocumentSchema } from "./issues";

/** A page image is a file stored here, or an HTTP(S) URL. An empty source is a block still being filled in. */
export function isAllowedImageSource(src: unknown): boolean {
  if (src === undefined || src === null || src === "") return true;
  const value = String(src).trim();
  if (isStoredFilePath(value)) return true;
  const url = z.string().url().safeParse(value);
  return url.success && /^https?:\/\//i.test(url.data);
}

const documentTitle = z
    .string()
    .trim()
    .max(200);
// Preserve arbitrary existing Tiptap nodes; only enforce the URL-only image contract.
const documentContentSchema = tiptapDocumentSchema.superRefine(
  (document, context) => {
    const pending: unknown[] = [...document.content];
    while (pending.length) {
      const value = pending.pop();
      if (!value || typeof value !== "object") continue;
      const node = value as Record<string, unknown>;
      if (Array.isArray(node.content)) pending.push(...node.content);
      if (node.type !== "image") continue;
      const attrs = node.attrs as Record<string, unknown> | undefined;
      if (!isAllowedImageSource(attrs?.src)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Images require an HTTP or HTTPS URL.",
        });
        return;
      }
    }
  },
);
export const createDocumentSchema = z.object({
  title: documentTitle.optional(),
  contentJson: documentContentSchema.default({ type: "doc", content: [] }),
  iconAppearance: entityIconSchema.nullable().optional(),
});
/** The title and icon. The content is edited through the realtime socket, together with whoever else has the page open. */
export const updateDocumentSchema = z.object({
  title: documentTitle,
  iconAppearance: entityIconSchema.nullable().optional(),
});
export const documentParamsSchema = z.object({
  projectId: z.string().uuid(),
  documentId: z.string().uuid(),
});
export type CreateDocumentInput = z.infer<typeof createDocumentSchema>;
export type UpdateDocumentInput = z.infer<typeof updateDocumentSchema>;
