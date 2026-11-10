CREATE TABLE "api_token_projects" (
	"token_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	CONSTRAINT "api_token_projects_token_id_project_id_pk" PRIMARY KEY("token_id","project_id")
);
--> statement-breakpoint
ALTER TABLE "api_tokens" ADD COLUMN "expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "api_tokens" ADD COLUMN "project_scoped" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "api_token_projects" ADD CONSTRAINT "api_token_projects_token_id_api_tokens_id_fk" FOREIGN KEY ("token_id") REFERENCES "public"."api_tokens"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "api_token_projects" ADD CONSTRAINT "api_token_projects_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "api_token_projects_project_id_idx" ON "api_token_projects" USING btree ("project_id");