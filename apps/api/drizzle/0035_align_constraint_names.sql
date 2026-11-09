-- Drizzle cannot describe a NULLS NOT DISTINCT index, so the schema states it as a unique constraint. Promoting the
-- index from 0033 keeps the same rule and reuses the index, without building it again.
ALTER TABLE "files" ADD CONSTRAINT "files_name_per_issue_unique" UNIQUE USING INDEX "files_name_per_issue_idx";--> statement-breakpoint
-- The issues table was once cards, and its primary key kept the old name. Renaming it renames its index too.
ALTER TABLE "issues" RENAME CONSTRAINT "cards_pkey" TO "issues_pkey";
