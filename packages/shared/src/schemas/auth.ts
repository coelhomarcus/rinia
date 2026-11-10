import { z } from "zod";
import { defaultLocale, localeSchema } from "../locales";

export const registerSchema = z.object({
    name: z.string().trim().min(2).max(80),
    username: z
        .string()
        .trim()
        .toLowerCase()
        .regex(/^[a-z0-9_]{3,32}$/, "Username must be 3-32 characters: lowercase letters, numbers, and _"),
    email: z.string().trim().toLowerCase().email(),
    password: z.string().min(8).max(72),
    specialCode: z.string().min(1),
    locale: localeSchema.default(defaultLocale),
});
export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
    identifier: z.string().trim().min(1),
    password: z.string().min(1),
});
export type LoginInput = z.infer<typeof loginSchema>;

/** The same 8 to 72 characters registration asks for; bcrypt reads no further than 72 bytes. */
const newPasswordSchema = z.string().min(8).max(72);

/** Asks for a link to choose a new password, sent to the account's email. A username works as well as the email. */
export const forgotPasswordSchema = z.object({
    identifier: z.string().trim().toLowerCase().min(1).max(320),
});
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;

export const resetPasswordSchema = z.object({
    token: z.string().trim().min(1).max(200),
    password: newPasswordSchema,
});
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;

export const changePasswordSchema = z.object({
    currentPassword: z.string().min(1),
    newPassword: newPasswordSchema,
});
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;

/** The forms ask for the new password twice; only the password itself is sent. */
const passwordsMatch = { path: ["confirm"], message: "validation.passwordsDoNotMatch" };

export const resetPasswordFormSchema = z.object({ password: newPasswordSchema, confirm: z.string() }).refine((value) => value.password === value.confirm, passwordsMatch);
export type ResetPasswordFormInput = z.infer<typeof resetPasswordFormSchema>;

export const changePasswordFormSchema = changePasswordSchema.extend({ confirm: z.string() }).refine((value) => value.newPassword === value.confirm, passwordsMatch);
export type ChangePasswordFormInput = z.infer<typeof changePasswordFormSchema>;
