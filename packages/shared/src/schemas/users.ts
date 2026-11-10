import { z } from "zod";
import { localeSchema } from "../locales";
import { remoteImageUrlSchema, storedAvatarUrlSchema } from "./appearance";

export const updateProfileSchema = z
    .object({
        name: z.string().trim().min(2).max(80).optional(),
        // Accepts "" (a cleared UI field) as equivalent to "remove the photo". Without this, a user
        // without an avatarUrl who only wants to edit their name would hit .url() on an empty field.
        avatarUrl: z
            .union([remoteImageUrlSchema, storedAvatarUrlSchema, z.literal("")])
            .nullable()
            .optional()
            .transform((value) => (value === "" ? null : value)),
        locale: localeSchema.optional(),
    })
    .strict();
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;

export const updateLocaleSchema = z.object({ locale: localeSchema }).strict();
export type UpdateLocaleInput = z.infer<typeof updateLocaleSchema>;

export const densityValues = ["comfortable", "compact"] as const;
export const densitySchema = z.enum(densityValues);
export type Density = z.infer<typeof densitySchema>;
export const updateDensitySchema = z.object({ density: densitySchema }).strict();
export type UpdateDensityInput = z.infer<typeof updateDensitySchema>;
