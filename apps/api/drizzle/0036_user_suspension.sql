ALTER TABLE "users" ADD COLUMN "suspended_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "sessions_revoked_at" timestamp with time zone;