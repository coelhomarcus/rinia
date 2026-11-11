-- Undoes migrations 0043 to 0050 of the GitHub integration, which reached some databases before it was taken out of
-- main. A database that never had them is left as it is. Remove this migration once every database has run it.

-- An account created with "Sign in with GitHub" has no password and could not sign in once this runs.
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM users WHERE password_hash IS NULL) THEN
        RAISE EXCEPTION 'Some accounts have no password (created with GitHub). Set one first: SELECT username FROM users WHERE password_hash IS NULL';
    END IF;
END $$;--> statement-breakpoint
DROP TABLE IF EXISTS pull_request_comments, issue_pull_requests, pull_requests, github_webhook_deliveries, project_repositories, github_accounts, github_installations, github_apps;--> statement-breakpoint
ALTER TABLE projects DROP COLUMN IF EXISTS github_settings;--> statement-breakpoint
ALTER TABLE users ALTER COLUMN password_hash SET NOT NULL;--> statement-breakpoint
-- PostgreSQL cannot drop an enum value, so a type that gained pull request values is rebuilt without them.
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_enum WHERE enumtypid = 'issue_activity_type'::regtype AND enumlabel IN ('pull_request_linked', 'pull_request_state_changed')) THEN
        DELETE FROM issue_activities WHERE type::text IN ('pull_request_linked', 'pull_request_state_changed');
        ALTER TYPE issue_activity_type RENAME TO issue_activity_type_old;
        CREATE TYPE issue_activity_type AS ENUM ('created', 'status_changed', 'priority_changed', 'assignee_changed', 'category_changed', 'cycle_changed', 'estimate_changed', 'due_date_changed', 'parent_changed', 'relation_added', 'relation_removed', 'label_added', 'label_removed');
        ALTER TABLE issue_activities ALTER COLUMN type TYPE issue_activity_type USING type::text::issue_activity_type;
        DROP TYPE issue_activity_type_old;
    END IF;
END $$;--> statement-breakpoint
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_enum WHERE enumtypid = 'notification_type'::regtype AND enumlabel IN ('review_requested', 'pull_request_reviewed', 'pull_request_merged')) THEN
        DELETE FROM notifications WHERE type::text IN ('review_requested', 'pull_request_reviewed', 'pull_request_merged');
        ALTER TYPE notification_type RENAME TO notification_type_old;
        CREATE TYPE notification_type AS ENUM ('assigned', 'mentioned', 'replied', 'commented', 'status_changed');
        ALTER TABLE notifications ALTER COLUMN type TYPE notification_type USING type::text::notification_type;
        DROP TYPE notification_type_old;
    END IF;
END $$;--> statement-breakpoint
-- The records of the removed migrations 0043 to 0050, by the times they were written.
DELETE FROM drizzle.__drizzle_migrations WHERE created_at > 1794350593318 AND created_at <= 1794379973188;
