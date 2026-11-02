ALTER TABLE "issue_activities" ADD COLUMN IF NOT EXISTS "source" jsonb;
--> statement-breakpoint
ALTER TABLE "issue_comments" ADD COLUMN IF NOT EXISTS "source" jsonb;
--> statement-breakpoint
ALTER TABLE "issue_description_revisions" ADD COLUMN IF NOT EXISTS "source" jsonb;
