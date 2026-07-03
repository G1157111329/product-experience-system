CREATE TABLE "ai_runs" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_id" varchar(40) NOT NULL,
	"trace_id" varchar(64),
	"provider" varchar(40) NOT NULL,
	"model" varchar(80) NOT NULL,
	"skill_key" varchar(80),
	"target_type" varchar(40) NOT NULL,
	"target_id" varchar(36),
	"prompt_digest" varchar(80),
	"result_digest" varchar(80),
	"result_json" jsonb DEFAULT '{}'::jsonb,
	"input_tokens" integer,
	"output_tokens" integer,
	"duration_ms" integer,
	"status" varchar(20) DEFAULT 'running' NOT NULL,
	"error_message" text,
	"review_status" varchar(20) DEFAULT 'pending' NOT NULL,
	"reviewed_by" varchar(36),
	"reviewed_at" timestamp with time zone,
	"review_note" text,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ai_runs_run_id_uniq" UNIQUE("run_id")
);
--> statement-breakpoint
CREATE TABLE "export_jobs" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_id" varchar(40) NOT NULL,
	"job_type" varchar(20) NOT NULL,
	"report_id" varchar(36),
	"view_config_id" varchar(36),
	"requested_by" varchar(36),
	"status" varchar(20) DEFAULT 'queued' NOT NULL,
	"priority" integer DEFAULT 0 NOT NULL,
	"params" jsonb DEFAULT '{}'::jsonb,
	"result_url" varchar(500),
	"result_size_bytes" integer,
	"error_message" text,
	"attempts" integer DEFAULT 0 NOT NULL,
	"max_attempts" integer DEFAULT 3 NOT NULL,
	"idempotency_key" varchar(100),
	"trace_id" varchar(64),
	"queued_at" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "export_jobs_job_id_uniq" UNIQUE("job_id")
);
--> statement-breakpoint
CREATE TABLE "issue_occurrences" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"issue_id" varchar(36) NOT NULL,
	"report_id" varchar(36),
	"task_id" varchar(36),
	"project_phase" varchar(40),
	"occurred_on" date,
	"occurrence_note" text,
	"evidence_refs" jsonb DEFAULT '[]'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar(36) NOT NULL,
	"notification_type" varchar(40) NOT NULL,
	"title" varchar(200) NOT NULL,
	"body" text,
	"source_type" varchar(40),
	"source_id" varchar(36),
	"source_url" varchar(500),
	"priority" varchar(20) DEFAULT 'normal',
	"is_read" boolean DEFAULT false NOT NULL,
	"read_at" timestamp with time zone,
	"outbox_event_id" varchar(40),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "outbox_events" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" varchar(40) NOT NULL,
	"aggregate_type" varchar(40) NOT NULL,
	"aggregate_id" varchar(36) NOT NULL,
	"event_type" varchar(60) NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"trace_id" varchar(64),
	"idempotency_key" varchar(100),
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"max_attempts" integer DEFAULT 5 NOT NULL,
	"last_error" text,
	"delivered_at" timestamp with time zone,
	"scheduled_for" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "outbox_events_event_id_uniq" UNIQUE("event_id"),
	CONSTRAINT "outbox_events_idem_uniq" UNIQUE("idempotency_key")
);
--> statement-breakpoint
CREATE TABLE "rectification_actions" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"issue_id" varchar(36) NOT NULL,
	"action_plan" text NOT NULL,
	"responsible_person" varchar(80),
	"responsible_dept" varchar(80),
	"plan_complete_date" date,
	"actual_complete_date" date,
	"status" varchar(20) DEFAULT 'planned' NOT NULL,
	"note" text,
	"created_by" varchar(36),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "render_profiles" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"profile_key" varchar(40) NOT NULL,
	"display_name" varchar(120) NOT NULL,
	"description" text,
	"font_family" varchar(80),
	"font_scale" varchar(20) DEFAULT 'medium',
	"color_theme" varchar(40) DEFAULT 'default',
	"cell_layout" varchar(40) DEFAULT 'default',
	"default_collapsed_sections" jsonb DEFAULT '[]'::jsonb,
	"config_json" jsonb DEFAULT '{}'::jsonb,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "render_profiles_key_uniq" UNIQUE("profile_key")
);
--> statement-breakpoint
CREATE TABLE "report_action_items" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"report_id" varchar(36) NOT NULL,
	"view_config_id" varchar(36) NOT NULL,
	"section_id" varchar(36),
	"action_type" varchar(40) NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"source_type" varchar(40),
	"source_id" varchar(36),
	"title" varchar(200),
	"summary" text,
	"payload" jsonb DEFAULT '{}'::jsonb,
	"click_action" varchar(40),
	"click_target_url" varchar(500),
	"is_resolved" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "report_outline_sections" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"report_id" varchar(36) NOT NULL,
	"view_config_id" varchar(36) NOT NULL,
	"section_type" varchar(60) NOT NULL,
	"section_key" varchar(80) NOT NULL,
	"title" varchar(200) NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_collapsible" boolean DEFAULT true NOT NULL,
	"default_collapsed" boolean DEFAULT false NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "report_outline_sections_key_uniq" UNIQUE("report_id","section_key")
);
--> statement-breakpoint
CREATE TABLE "report_print_blocks" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"report_id" varchar(36) NOT NULL,
	"view_config_id" varchar(36) NOT NULL,
	"export_job_id" varchar(36),
	"block_type" varchar(40) NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"page_start" integer,
	"page_end" integer,
	"content_html" text,
	"payload" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "report_summaries" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"report_id" varchar(36) NOT NULL,
	"view_config_id" varchar(36) NOT NULL,
	"summary_text" text NOT NULL,
	"is_ai_draft" boolean DEFAULT false NOT NULL,
	"is_published" boolean DEFAULT false NOT NULL,
	"authored_by" varchar(36),
	"published_by" varchar(36),
	"published_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "report_view_configs" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"report_id" varchar(36) NOT NULL,
	"report_scope_type" varchar(40) NOT NULL,
	"render_profile" varchar(40) NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"title_override" varchar(200),
	"summary_override" text,
	"is_archived" boolean DEFAULT false NOT NULL,
	"config_json" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "report_view_configs_report_uniq" UNIQUE("report_id","version")
);
--> statement-breakpoint
CREATE TABLE "verifications" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"rectification_action_id" varchar(36) NOT NULL,
	"issue_id" varchar(36) NOT NULL,
	"result" varchar(20) NOT NULL,
	"note" text,
	"verified_by" varchar(36),
	"verified_at" timestamp with time zone DEFAULT now() NOT NULL,
	"evidence_refs" jsonb DEFAULT '[]'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "experience_tasks" ADD COLUMN "task_no" varchar(60);--> statement-breakpoint
ALTER TABLE "experience_tasks" ADD COLUMN "source_task_ids" jsonb DEFAULT '[]'::jsonb;--> statement-breakpoint
ALTER TABLE "experience_tasks" ADD COLUMN "source_report_ids" jsonb DEFAULT '[]'::jsonb;--> statement-breakpoint
ALTER TABLE "experience_tasks" ADD COLUMN "reviewer_id" varchar(36);--> statement-breakpoint
ALTER TABLE "experience_tasks" ADD COLUMN "owner_id" varchar(36);--> statement-breakpoint
ALTER TABLE "experience_tasks" ADD COLUMN "version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "issues" ADD COLUMN "severity_code" varchar(40);--> statement-breakpoint
ALTER TABLE "issues" ADD COLUMN "module_code" varchar(80);--> statement-breakpoint
ALTER TABLE "issues" ADD COLUMN "due_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "issues" ADD COLUMN "first_seen_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "issues" ADD COLUMN "last_seen_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "issues" ADD COLUMN "version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "reports" ADD COLUMN "report_no" varchar(60);--> statement-breakpoint
ALTER TABLE "reports" ADD COLUMN "report_scope_type" varchar(40);--> statement-breakpoint
ALTER TABLE "reports" ADD COLUMN "owner_id" varchar(36);--> statement-breakpoint
ALTER TABLE "reports" ADD COLUMN "reviewer_id" varchar(36);--> statement-breakpoint
ALTER TABLE "reports" ADD COLUMN "published_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "recipes" ADD COLUMN "effect_status" varchar(20);--> statement-breakpoint
ALTER TABLE "report_action_items" ADD CONSTRAINT "report_action_items_view_config_fkey" FOREIGN KEY ("view_config_id") REFERENCES "public"."report_view_configs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_action_items" ADD CONSTRAINT "report_action_items_section_fkey" FOREIGN KEY ("section_id") REFERENCES "public"."report_outline_sections"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_outline_sections" ADD CONSTRAINT "report_outline_sections_view_config_fkey" FOREIGN KEY ("view_config_id") REFERENCES "public"."report_view_configs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_print_blocks" ADD CONSTRAINT "report_print_blocks_view_config_fkey" FOREIGN KEY ("view_config_id") REFERENCES "public"."report_view_configs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_summaries" ADD CONSTRAINT "report_summaries_view_config_fkey" FOREIGN KEY ("view_config_id") REFERENCES "public"."report_view_configs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "verifications" ADD CONSTRAINT "verifications_action_fkey" FOREIGN KEY ("rectification_action_id") REFERENCES "public"."rectification_actions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ai_runs_target_idx" ON "ai_runs" USING btree ("target_type" text_ops,"target_id" text_ops);--> statement-breakpoint
CREATE INDEX "ai_runs_trace_idx" ON "ai_runs" USING btree ("trace_id" text_ops);--> statement-breakpoint
CREATE INDEX "ai_runs_review_idx" ON "ai_runs" USING btree ("review_status" text_ops,"created_at" timestamptz_ops);--> statement-breakpoint
CREATE INDEX "export_jobs_status_idx" ON "export_jobs" USING btree ("status" text_ops,"priority" int4_ops,"queued_at" timestamptz_ops);--> statement-breakpoint
CREATE INDEX "export_jobs_report_idx" ON "export_jobs" USING btree ("report_id" text_ops);--> statement-breakpoint
CREATE INDEX "export_jobs_idem_idx" ON "export_jobs" USING btree ("idempotency_key" text_ops);--> statement-breakpoint
CREATE INDEX "issue_occurrences_issue_idx" ON "issue_occurrences" USING btree ("issue_id" text_ops,"created_at" timestamptz_ops);--> statement-breakpoint
CREATE INDEX "issue_occurrences_report_idx" ON "issue_occurrences" USING btree ("report_id" text_ops);--> statement-breakpoint
CREATE INDEX "issue_occurrences_phase_idx" ON "issue_occurrences" USING btree ("project_phase" text_ops);--> statement-breakpoint
CREATE INDEX "notifications_user_idx" ON "notifications" USING btree ("user_id" text_ops,"is_read" bool_ops,"created_at" timestamptz_ops);--> statement-breakpoint
CREATE INDEX "notifications_outbox_idx" ON "notifications" USING btree ("outbox_event_id" text_ops);--> statement-breakpoint
CREATE INDEX "outbox_events_status_idx" ON "outbox_events" USING btree ("status" text_ops,"scheduled_for" timestamptz_ops);--> statement-breakpoint
CREATE INDEX "outbox_events_aggregate_idx" ON "outbox_events" USING btree ("aggregate_type" text_ops,"aggregate_id" text_ops);--> statement-breakpoint
CREATE INDEX "rectification_actions_issue_idx" ON "rectification_actions" USING btree ("issue_id" text_ops,"created_at" timestamptz_ops);--> statement-breakpoint
CREATE INDEX "rectification_actions_status_idx" ON "rectification_actions" USING btree ("status" text_ops);--> statement-breakpoint
CREATE INDEX "render_profiles_active_idx" ON "render_profiles" USING btree ("is_active" bool_ops);--> statement-breakpoint
CREATE INDEX "report_action_items_report_idx" ON "report_action_items" USING btree ("report_id" text_ops,"sort_order" int4_ops);--> statement-breakpoint
CREATE INDEX "report_action_items_source_idx" ON "report_action_items" USING btree ("source_type" text_ops,"source_id" text_ops);--> statement-breakpoint
CREATE INDEX "report_action_items_section_idx" ON "report_action_items" USING btree ("section_id" text_ops);--> statement-breakpoint
CREATE INDEX "report_outline_sections_report_idx" ON "report_outline_sections" USING btree ("report_id" text_ops,"sort_order" int4_ops);--> statement-breakpoint
CREATE INDEX "report_outline_sections_view_idx" ON "report_outline_sections" USING btree ("view_config_id" text_ops);--> statement-breakpoint
CREATE INDEX "report_print_blocks_report_idx" ON "report_print_blocks" USING btree ("report_id" text_ops,"sort_order" int4_ops);--> statement-breakpoint
CREATE INDEX "report_print_blocks_export_idx" ON "report_print_blocks" USING btree ("export_job_id" text_ops);--> statement-breakpoint
CREATE INDEX "report_summaries_view_idx" ON "report_summaries" USING btree ("view_config_id" text_ops,"version" int4_ops);--> statement-breakpoint
CREATE INDEX "report_summaries_published_idx" ON "report_summaries" USING btree ("is_published" bool_ops);--> statement-breakpoint
CREATE INDEX "report_view_configs_scope_idx" ON "report_view_configs" USING btree ("report_scope_type" text_ops);--> statement-breakpoint
CREATE INDEX "report_view_configs_profile_idx" ON "report_view_configs" USING btree ("render_profile" text_ops);--> statement-breakpoint
CREATE INDEX "verifications_action_idx" ON "verifications" USING btree ("rectification_action_id" text_ops,"verified_at" timestamptz_ops);--> statement-breakpoint
CREATE INDEX "verifications_issue_idx" ON "verifications" USING btree ("issue_id" text_ops);--> statement-breakpoint
CREATE INDEX "experience_tasks_task_no_idx" ON "experience_tasks" USING btree ("task_no" text_ops);--> statement-breakpoint
CREATE INDEX "issues_severity_code_idx" ON "issues" USING btree ("severity_code" text_ops);--> statement-breakpoint
CREATE INDEX "issues_due_at_idx" ON "issues" USING btree ("due_at" timestamptz_ops);
