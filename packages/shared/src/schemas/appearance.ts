import { z } from "zod";

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
const UUID = "[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}";

/** A file this app stored for a project. The browser loads it with the session cookie. */
export const storedFileUrlSchema = z.string().regex(new RegExp(`^/api/files/${UUID}$`), "Invalid file");

/** A profile photo stored for one user. `v` changes when the photo changes. */
export const storedAvatarUrlSchema = z.string().regex(new RegExp(`^/api/users/${UUID}/avatar\\?v=\\d+$`), "Invalid avatar");

export function storedAvatarOwner(value: string) {
    return new RegExp(`^/api/users/(${UUID})/avatar\\?v=\\d+$`).exec(value)?.[1] ?? null;
}

export const emojiIconSchema = z.object({ type: z.literal("emoji"), value: emojiValueSchema });
export const imageIconSchema = z.object({ type: z.literal("image"), url: z.union([remoteImageUrlSchema, storedFileUrlSchema]) });
export const entityIconSchema = z.discriminatedUnion("type", [catalogIconSchema, emojiIconSchema, imageIconSchema]);

export type EntityIcon = z.infer<typeof entityIconSchema>;
