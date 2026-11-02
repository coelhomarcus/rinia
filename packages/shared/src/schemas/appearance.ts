import { z } from "zod";
import { projectGradientKeys } from "../project-banners";

/** A remote image accepted by the application. Files are rendered by the browser; the API never fetches them. */
export const remoteImageUrlSchema = z
    .string()
    .trim()
    .max(4096, "Image URL is too long")
    .url("Invalid URL")
    .refine((value) => /^https?:\/\/(?![^/]*@)/i.test(value), "Images require an HTTP or HTTPS URL without credentials");

const emojiValueSchema = z
    .string()
    .trim()
    .min(1, "Choose an emoji")
    .max(64, "Emoji is too long")
    // Covers pictographs and flags while preserving complete ZWJ/skin-tone sequences as entered.
    .refine((value) => /[\p{Extended_Pictographic}\p{Regional_Indicator}]/u.test(value), "Choose an emoji");

export const iconColorSchema = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Color must be a hex value");

export const catalogIconSchema = z.object({
    type: z.literal("icon"),
    key: z.string().trim().min(1).max(100),
    color: iconColorSchema.optional(),
});
export const emojiIconSchema = z.object({ type: z.literal("emoji"), value: emojiValueSchema });
export const imageIconSchema = z.object({ type: z.literal("image"), url: remoteImageUrlSchema });
export const entityIconSchema = z.discriminatedUnion("type", [catalogIconSchema, emojiIconSchema, imageIconSchema]);

/** `gradient` is the historical type name; the key picks any banner in `projectBanners`, gradient or not. */
export const projectCoverSchema = z.object({
    type: z.literal("gradient"),
    key: z.enum(projectGradientKeys),
});

export type EntityIcon = z.infer<typeof entityIconSchema>;
export type ProjectCover = z.infer<typeof projectCoverSchema>;

export function parseProjectCover(value: unknown): ProjectCover | null {
    const parsed = projectCoverSchema.safeParse(value);
    return parsed.success ? parsed.data : null;
}
