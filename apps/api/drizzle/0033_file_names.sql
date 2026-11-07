CREATE UNIQUE INDEX IF NOT EXISTS "files_name_per_issue_idx" ON "files" ("project_id", "issue_id", "filename") NULLS NOT DISTINCT;
