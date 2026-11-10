import { z } from "zod";
import { LOG_FORMATS, LOG_LEVELS } from "../lib/logger";

const envSchema = z.object({
    DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
    JWT_SECRET: z.string().min(1, "JWT_SECRET is required"),
    JWT_EXPIRES_IN: z.string().min(1).default("7d"),
    SPECIAL_REGISTRATION_CODE: z.string().min(1, "SPECIAL_REGISTRATION_CODE is required"),
    ADMIN_USERNAMES: z.string().default(""),
    PORT: z.coerce.number().int().positive().default(3000),
    /** Where people open Rinia, for links the API hands out (email, MCP results) and the OAuth issuer. Required in production; otherwise the host each request came to. */
    APP_URL: z.preprocess(
        (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
        z.string().trim().url().optional(),
    ),
    /** Resend sends Rinia's email (password recovery). Without both, recovery by email is turned off. */
    RESEND_API_KEY: z.string().trim().optional().transform((value) => value || undefined),
    /** The sender, such as `Rinia <noreply@example.com>`, on a domain verified in Resend. */
    RESEND_FROM_EMAIL: z.string().trim().optional().transform((value) => value || undefined),
    /** Where uploaded files are written. In Dokploy set `/data/uploads` and bind-mount a host directory there. */
    UPLOAD_DIR: z.string().optional(),
    NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
    /** Read by the logger itself, which starts before this file; checked here so a typo stops the API instead of being ignored. */
    LOG_LEVEL: z.string().trim().toLowerCase().pipe(z.enum(LOG_LEVELS)).optional(),
    LOG_FORMAT: z.string().trim().toLowerCase().pipe(z.enum(LOG_FORMATS)).optional(),
    /** A request or a database query slower than this many milliseconds is logged as a warning. */
    SLOW_REQUEST_MS: z.coerce.number().int().positive().default(1000),
    SLOW_QUERY_MS: z.coerce.number().int().positive().default(500),
});

/** Every setting the API reads, so the startup log can say which are set without showing their values. */
export const CONFIG_KEYS = Object.keys(envSchema.shape) as (keyof typeof envSchema.shape)[];

// Bun loads apps/api/.env by itself (it reads .env from the cwd), so there is no dotenv import.
// In production the container passes the variables instead.
const parsed = envSchema
    .superRefine((data, ctx) => {
        if (data.NODE_ENV === "production" && !data.APP_URL) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                path: ["APP_URL"],
                message: "APP_URL is required in production",
            });
        }
    })
    .safeParse(process.env);

if (!parsed.success) {
    // Plain console on purpose: the settings that failed may be the logger's own, and this message must show whatever they are.
    console.error("Invalid environment variables:", parsed.error.flatten().fieldErrors);
    process.exit(1);
}

export const env = {
    ...parsed.data,
    emailEnabled: Boolean(parsed.data.RESEND_API_KEY && parsed.data.RESEND_FROM_EMAIL),
    /** Links by email (password recovery, email change) work with Resend set up, and in development, where the email is written to the log instead. */
    emailLinksEnabled: Boolean(parsed.data.RESEND_API_KEY && parsed.data.RESEND_FROM_EMAIL) || parsed.data.NODE_ENV === "development",
    adminUsernames: parsed.data.ADMIN_USERNAMES.split(",")
        .map((username) => username.trim().toLowerCase())
        .filter(Boolean),
};
