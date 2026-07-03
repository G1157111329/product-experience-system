CREATE TABLE "agent_skill_audit_logs" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"skill_key" varchar(50) NOT NULL,
	"template_id" varchar(36),
	"version_id" varchar(36),
	"action" varchar(50) NOT NULL,
	"actor_user_id" varchar(36),
	"task_id" varchar(36),
	"request_snapshot" jsonb DEFAULT '{}'::jsonb,
	"response_snapshot" jsonb DEFAULT '{}'::jsonb,
	"status" varchar(20) DEFAULT 'success' NOT NULL,
	"error_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_skill_templates" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"skill_key" varchar(50) NOT NULL,
	"name" varchar(100) NOT NULL,
	"description" text,
	"is_enabled" boolean DEFAULT true NOT NULL,
	"active_version_id" varchar(36),
	"model_config_id" varchar(36),
	"created_by" varchar(36),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "agent_skill_templates_skill_key_key" UNIQUE("skill_key")
);
--> statement-breakpoint
CREATE TABLE "agent_skill_versions" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"template_id" varchar(36) NOT NULL,
	"version" integer NOT NULL,
	"system_prompt" text NOT NULL,
	"user_prompt_template" text NOT NULL,
	"output_schema" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"notes" text,
	"created_by" varchar(36),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "agent_skill_versions_template_version_key" UNIQUE("template_id","version")
);
--> statement-breakpoint
CREATE TABLE "ai_model_configs" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(100) NOT NULL,
	"provider" varchar(20) DEFAULT 'custom' NOT NULL,
	"model" varchar(100) NOT NULL,
	"temperature" integer DEFAULT 5 NOT NULL,
	"max_tokens" integer DEFAULT 2400 NOT NULL,
	"supports_vision" boolean DEFAULT false NOT NULL,
	"custom_api_url" text,
	"custom_api_key_encrypted" text,
	"is_active" boolean DEFAULT false NOT NULL,
	"created_by" varchar(36),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "check_records" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"task_id" varchar(36) NOT NULL,
	"standard_item_id" varchar(36),
	"sensory_dimension" varchar(20),
	"test_phase" varchar(50),
	"check_dimension" varchar(50),
	"check_item" varchar(200) NOT NULL,
	"check_requirement" text,
	"evaluation_result" varchar(20),
	"problem_description" text,
	"measurement_value" varchar(100),
	"tester" varchar(50),
	"sort_order" integer DEFAULT 0,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now(),
	"measurement_position" varchar(200),
	"standard_category" varchar(50),
	"experience_flow" varchar(100),
	"touch_point" varchar(200),
	"experience_standard" text,
	"check_standard" text,
	"sub_check_dimension" varchar(100),
	"check_tool" text,
	"problem_level" text
);
--> statement-breakpoint
CREATE TABLE "comparison_ai_results" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"assembly_id" varchar(36) NOT NULL,
	"level" varchar(20) NOT NULL,
	"target_id" varchar(36) NOT NULL,
	"skill_key" varchar(100) NOT NULL,
	"input_snapshot" jsonb NOT NULL,
	"output" jsonb NOT NULL,
	"status" varchar(20) DEFAULT 'generated' NOT NULL,
	"confirmed_by" varchar(36),
	"confirmed_at" timestamp with time zone,
	"rejected_reason" text,
	"model_config_id" varchar(36),
	"created_by" varchar(36),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "comparison_assemblies" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(200) NOT NULL,
	"assembly_type" varchar(40) NOT NULL,
	"source_type" varchar(40) NOT NULL,
	"product_category" varchar(100),
	"product" varchar(100),
	"comparison_intent" text,
	"layout_type" varchar(40) DEFAULT 'image_matrix' NOT NULL,
	"status" varchar(30) DEFAULT 'draft' NOT NULL,
	"source_task_ids" jsonb DEFAULT '[]'::jsonb,
	"source_report_ids" jsonb DEFAULT '[]'::jsonb,
	"created_by" varchar(36) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "comparison_item_nodes" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"assembly_id" varchar(36) NOT NULL,
	"parent_id" varchar(36),
	"node_type" varchar(40) NOT NULL,
	"node_label" varchar(200) NOT NULL,
	"shared_recipe" jsonb DEFAULT '{}'::jsonb,
	"config" jsonb DEFAULT '{}'::jsonb,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"depth" integer DEFAULT 0 NOT NULL,
	"is_collapsed" boolean DEFAULT false,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "comparison_matrix_cells" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"assembly_id" varchar(36) NOT NULL,
	"item_node_id" varchar(36) NOT NULL,
	"object_id" varchar(36) NOT NULL,
	"params" jsonb DEFAULT '{}'::jsonb,
	"process_notes" jsonb DEFAULT '[]'::jsonb,
	"effect_summary" text,
	"problem_points" jsonb DEFAULT '[]'::jsonb,
	"manual_score" varchar(10),
	"ai_score" varchar(10),
	"conclusion_tag" varchar(40),
	"metric_values" jsonb DEFAULT '{}'::jsonb,
	"media_display_config" jsonb DEFAULT '{}'::jsonb,
	"ai_status" varchar(20) DEFAULT 'pending',
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "comparison_matrix_cells_item_object_key" UNIQUE("item_node_id","object_id")
);
--> statement-breakpoint
CREATE TABLE "comparison_objects" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"assembly_id" varchar(36) NOT NULL,
	"task_id" varchar(36),
	"report_id" varchar(36),
	"object_name" varchar(200) NOT NULL,
	"object_type" varchar(60) NOT NULL,
	"comparison_factor" varchar(100),
	"brand" varchar(100),
	"model" varchar(100),
	"specification" varchar(200),
	"material_structure" varchar(200),
	"project_stage" varchar(100),
	"sample_batch" varchar(100),
	"object_source_type" varchar(100),
	"is_competitor" boolean DEFAULT false,
	"parent_product" varchar(200),
	"cover_material_id" varchar(36),
	"custom_fields" jsonb DEFAULT '{}'::jsonb,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "excel_import_jobs" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"file_name" varchar(300) NOT NULL,
	"file_path" text NOT NULL,
	"parse_status" varchar(30) DEFAULT 'queued' NOT NULL,
	"detected_template_id" varchar(36),
	"detected_report_type" varchar(60),
	"parsed_structure" jsonb DEFAULT '{}'::jsonb,
	"mapping_result" jsonb DEFAULT '{}'::jsonb,
	"created_by" varchar(36),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"error_message" text
);
--> statement-breakpoint
CREATE TABLE "excel_import_templates" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"template_name" varchar(200) NOT NULL,
	"template_type" varchar(40) NOT NULL,
	"product_category" varchar(100),
	"structure_rules" jsonb NOT NULL,
	"mapping_rules" jsonb NOT NULL,
	"is_recommended" boolean DEFAULT false,
	"created_by" varchar(36),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "experience_tasks" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"task_name" varchar(200) NOT NULL,
	"product_category" varchar(50) NOT NULL,
	"product_model" varchar(50) NOT NULL,
	"project_number" varchar(100),
	"project_phase" varchar(50),
	"test_date" date,
	"organizer" varchar(50),
	"target_user" text,
	"test_purpose" text,
	"test_method" text,
	"status" varchar(20) DEFAULT '待执行' NOT NULL,
	"assigned_to" varchar(200),
	"selected_standards" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now(),
	"project_type" varchar(50),
	"created_by" varchar(36),
	"product" varchar(200),
	"task_mode" varchar(20) DEFAULT 'single' NOT NULL,
	"comparison_intent" text,
	"comparison_layout_type" varchar(40),
	"comparison_source" varchar(40)
);
--> statement-breakpoint
CREATE TABLE "health_check" (
	"id" serial NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "issue_re_evaluations" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"issue_id" varchar(36) NOT NULL,
	"description" text,
	"ai_result" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" varchar(36)
);
--> statement-breakpoint
CREATE TABLE "issue_severity_dict" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" varchar(64) NOT NULL,
	"label" varchar(120) NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"scope_filter" jsonb DEFAULT '{}'::jsonb,
	"description" varchar(400),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "issue_severity_dict_code_uniq" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "issue_status_dict" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" varchar(64) NOT NULL,
	"label" varchar(120) NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"scope_filter" jsonb DEFAULT '{}'::jsonb,
	"description" varchar(400),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "issue_status_dict_code_uniq" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "issues" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"task_id" varchar(36) NOT NULL,
	"record_id" varchar(36),
	"title" varchar(200) NOT NULL,
	"product_model" varchar(50),
	"category" varchar(50),
	"sub_category" varchar(50),
	"severity" varchar(20),
	"priority" varchar(20),
	"description" text,
	"is_improve" boolean,
	"no_improve_reason" text,
	"improve_plan" text,
	"responsible_dept" varchar(50),
	"responsible_person" varchar(50),
	"plan_complete_date" date,
	"actual_complete_date" date,
	"is_closed" boolean DEFAULT false,
	"status" varchar(20) DEFAULT '待整改' NOT NULL,
	"verification_note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now(),
	"level" varchar(20),
	"source" varchar(50),
	"source_report_id" varchar(36),
	"source_type" varchar(20),
	CONSTRAINT "issues_unique_per_task" UNIQUE("task_id","title","source_type")
);
--> statement-breakpoint
CREATE TABLE "materials" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"record_id" varchar(36),
	"task_id" varchar(36),
	"material_type" varchar(10) NOT NULL,
	"file_name" varchar(200),
	"file_path" varchar(500),
	"file_size" integer,
	"file_url" text,
	"duration_sec" integer,
	"thumbnail_url" text,
	"ai_analysis_status" varchar(20) DEFAULT 'pending',
	"ai_result" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"recipe_step_id" varchar(36),
	"recipe_library_step_id" varchar(36),
	"recipe_id" varchar(36),
	"issue_id" varchar(36),
	"re_evaluation_id" varchar(36),
	"comparison_cell_id" varchar(36),
	"comparison_assembly_id" varchar(36),
	"normalized_thumb_path" text,
	"video_cover_path" text,
	"media_display_order" integer DEFAULT 0,
	"media_role" varchar(40)
);
--> statement-breakpoint
CREATE TABLE "metric_definitions" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_category" varchar(100),
	"product" varchar(100),
	"metric_key" varchar(100) NOT NULL,
	"metric_name" varchar(100) NOT NULL,
	"metric_type" varchar(40) NOT NULL,
	"unit" varchar(40),
	"default_formula" text,
	"display_order" integer DEFAULT 0,
	"is_active" boolean DEFAULT true,
	"created_by" varchar(36),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "metric_definitions_key_product_key" UNIQUE("metric_key","product_category","product")
);
--> statement-breakpoint
CREATE TABLE "metric_evaluations" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cell_id" varchar(36) NOT NULL,
	"metric_key" varchar(100) NOT NULL,
	"raw_value" jsonb,
	"calculated_value" varchar(100),
	"display_value" varchar(200),
	"formula_version_id" varchar(36),
	"threshold_rule_id" varchar(36),
	"pass_fail_status" varchar(30),
	"evaluation_note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "metric_evaluations_cell_metric_key" UNIQUE("cell_id","metric_key")
);
--> statement-breakpoint
CREATE TABLE "metric_formula_versions" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"metric_definition_id" varchar(36) NOT NULL,
	"formula" text NOT NULL,
	"formula_version" varchar(40) NOT NULL,
	"description" text,
	"created_by" varchar(36),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"is_active" boolean DEFAULT true,
	CONSTRAINT "metric_formula_versions_def_version_key" UNIQUE("metric_definition_id","formula_version")
);
--> statement-breakpoint
CREATE TABLE "metric_threshold_rules" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"assembly_id" varchar(36),
	"item_node_id" varchar(36),
	"metric_key" varchar(100) NOT NULL,
	"operator" varchar(20) NOT NULL,
	"target_value" varchar(100),
	"target_text" text,
	"unit" varchar(40),
	"severity" varchar(20) DEFAULT 'warning',
	"source_text" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pdf_generation_jobs" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"report_id" varchar(36) NOT NULL,
	"snapshot_id" varchar(36) NOT NULL,
	"layout_profile" varchar(80) NOT NULL,
	"status" varchar(30) DEFAULT 'queued' NOT NULL,
	"preflight_result" jsonb DEFAULT '{}'::jsonb,
	"file_path" text,
	"file_size" integer,
	"error_message" text,
	"created_by" varchar(36),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "platform_audit_requests" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar(36) NOT NULL,
	"request_type" varchar(30) NOT NULL,
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"old_value" text,
	"new_value" text,
	"target_user_id" varchar(36),
	"reviewed_by" varchar(36),
	"reviewed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "platform_categories" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(100) NOT NULL,
	"sort_order" integer DEFAULT 0,
	"created_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "platform_categories_name_key" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "platform_products" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(100) NOT NULL,
	"category_id" varchar(36) NOT NULL,
	"sort_order" integer DEFAULT 0,
	"created_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "platform_products_name_category_id_key" UNIQUE("name","category_id")
);
--> statement-breakpoint
CREATE TABLE "platform_settings" (
	"key" varchar(100) PRIMARY KEY NOT NULL,
	"value" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "platform_users" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account" varchar(50) NOT NULL,
	"password_hash" varchar(200) NOT NULL,
	"name" varchar(50),
	"role" varchar(20) DEFAULT 'user' NOT NULL,
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "platform_users_account_key" UNIQUE("account")
);
--> statement-breakpoint
CREATE TABLE "project_phase_dict" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" varchar(64) NOT NULL,
	"label" varchar(120) NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"scope_filter" jsonb DEFAULT '{}'::jsonb,
	"description" varchar(400),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "project_phase_dict_code_uniq" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "recipe_library" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_category" varchar(100),
	"product" varchar(100),
	"name" varchar(200) NOT NULL,
	"ingredients" text,
	"recipe_type" varchar(20) DEFAULT '食谱',
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "recipe_library_name_key" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "recipe_library_steps" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"recipe_library_id" varchar(36) NOT NULL,
	"step_number" integer DEFAULT 1 NOT NULL,
	"operation" text NOT NULL,
	"problem_point" text,
	"problem_points" jsonb DEFAULT '[]'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "recipe_steps" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"recipe_id" varchar(36) NOT NULL,
	"step_number" integer DEFAULT 1 NOT NULL,
	"operation" text NOT NULL,
	"problem_point" text,
	"sort_order" integer DEFAULT 0,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now(),
	"problem_points" jsonb DEFAULT '[]'::jsonb
);
--> statement-breakpoint
CREATE TABLE "recipes" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"task_id" varchar(36) NOT NULL,
	"name" varchar(200) NOT NULL,
	"ingredients" text,
	"recipe_type" varchar(20) DEFAULT '食谱',
	"problem_count" integer DEFAULT 0,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now(),
	"sort_order" integer DEFAULT 0,
	"effect_description" text,
	"effect_score" varchar(20),
	"effect_problem_point" text,
	"effect_ai_result" jsonb
);
--> statement-breakpoint
CREATE TABLE "report_shares" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"report_id" varchar(36) NOT NULL,
	"share_token" varchar(64) NOT NULL,
	"expires_at" timestamp with time zone,
	"created_by" varchar(36),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "report_shares_share_token_key" UNIQUE("share_token")
);
--> statement-breakpoint
CREATE TABLE "report_snapshots" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"report_id" varchar(36) NOT NULL,
	"report_type" varchar(40) NOT NULL,
	"version" integer NOT NULL,
	"snapshot_json" jsonb NOT NULL,
	"layout_profile" varchar(80) NOT NULL,
	"created_by" varchar(36),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "report_snapshots_report_version_key" UNIQUE("report_id","version")
);
--> statement-breakpoint
CREATE TABLE "report_status_dict" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" varchar(64) NOT NULL,
	"label" varchar(120) NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"scope_filter" jsonb DEFAULT '{}'::jsonb,
	"description" varchar(400),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "report_status_dict_code_uniq" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "report_templates" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"template_name" varchar(200) NOT NULL,
	"template_type" varchar(50),
	"content" jsonb,
	"is_default" boolean DEFAULT false,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "reports" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"task_id" varchar(36) NOT NULL,
	"template_id" varchar(36),
	"title" varchar(200),
	"content" jsonb,
	"status" varchar(20) DEFAULT '草稿' NOT NULL,
	"version" integer DEFAULT 1,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now(),
	"product_model" varchar(50),
	"report_type" varchar(40) DEFAULT 'single_report' NOT NULL,
	"source_task_ids" jsonb DEFAULT '[]'::jsonb,
	"source_report_ids" jsonb DEFAULT '[]'::jsonb,
	"assembly_id" varchar(36),
	"snapshot_id" varchar(36),
	"layout_profile" varchar(80),
	"ai_confirmation_status" varchar(20) DEFAULT 'pending'
);
--> statement-breakpoint
CREATE TABLE "security_audit_logs" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"action" varchar(80) NOT NULL,
	"actor_user_id" varchar(36),
	"actor_account" varchar(100),
	"target_type" varchar(50),
	"target_id" varchar(100),
	"outcome" varchar(20) NOT NULL,
	"ip_address" varchar(80),
	"user_agent" text,
	"request_path" text,
	"request_method" varchar(10),
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "security_rate_limits" (
	"rate_key" varchar(240) PRIMARY KEY NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	"reset_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sla_policy_dict" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" varchar(64) NOT NULL,
	"label" varchar(120) NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"scope_filter" jsonb DEFAULT '{}'::jsonb,
	"description" varchar(400),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "sla_policy_dict_code_uniq" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "standard_items" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"standard_id" varchar(36) NOT NULL,
	"sort_order" integer DEFAULT 0,
	"sensory_dimension" varchar(20),
	"test_phase" varchar(50),
	"check_dimension" varchar(50),
	"check_item" varchar(200) NOT NULL,
	"check_requirement" text,
	"measurement_position" varchar(200),
	"check_tool" varchar(100),
	"standard_a" varchar(200),
	"standard_b" varchar(200),
	"standard_c" varchar(200),
	"problem_level" varchar(20),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"experience_flow" varchar(100),
	"touch_point" varchar(200),
	"experience_standard" text,
	"sub_check_dimension" varchar(100),
	"check_standard" text,
	"evaluation_prep" text,
	"subjective_score" integer,
	"subjective_rating" text,
	"reference_images" jsonb
);
--> statement-breakpoint
CREATE TABLE "standards" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"standard_name" varchar(200) NOT NULL,
	"category" varchar(50) NOT NULL,
	"product_category" varchar(50),
	"version" varchar(20) DEFAULT 'V1.0',
	"is_active" boolean DEFAULT true NOT NULL,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now(),
	"product" varchar(200)
);
--> statement-breakpoint
CREATE TABLE "task_status_dict" (
	"id" varchar(36) PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" varchar(64) NOT NULL,
	"label" varchar(120) NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"scope_filter" jsonb DEFAULT '{}'::jsonb,
	"description" varchar(400),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "task_status_dict_code_uniq" UNIQUE("code")
);
--> statement-breakpoint
ALTER TABLE "agent_skill_audit_logs" ADD CONSTRAINT "agent_skill_audit_logs_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "public"."agent_skill_templates"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_skill_audit_logs" ADD CONSTRAINT "agent_skill_audit_logs_version_id_fkey" FOREIGN KEY ("version_id") REFERENCES "public"."agent_skill_versions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_skill_audit_logs" ADD CONSTRAINT "agent_skill_audit_logs_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "public"."platform_users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_skill_audit_logs" ADD CONSTRAINT "agent_skill_audit_logs_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "public"."experience_tasks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_skill_templates" ADD CONSTRAINT "agent_skill_templates_model_config_id_fkey" FOREIGN KEY ("model_config_id") REFERENCES "public"."ai_model_configs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_skill_templates" ADD CONSTRAINT "agent_skill_templates_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."platform_users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_skill_versions" ADD CONSTRAINT "agent_skill_versions_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "public"."agent_skill_templates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_skill_versions" ADD CONSTRAINT "agent_skill_versions_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."platform_users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_model_configs" ADD CONSTRAINT "ai_model_configs_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."platform_users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "check_records" ADD CONSTRAINT "check_records_task_id_experience_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."experience_tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comparison_ai_results" ADD CONSTRAINT "comparison_ai_results_assembly_id_fkey" FOREIGN KEY ("assembly_id") REFERENCES "public"."comparison_assemblies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comparison_ai_results" ADD CONSTRAINT "comparison_ai_results_confirmed_by_fkey" FOREIGN KEY ("confirmed_by") REFERENCES "public"."platform_users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comparison_assemblies" ADD CONSTRAINT "comparison_assemblies_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."platform_users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comparison_item_nodes" ADD CONSTRAINT "comparison_item_nodes_parent_id_comparison_item_nodes_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."comparison_item_nodes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comparison_item_nodes" ADD CONSTRAINT "comparison_item_nodes_assembly_id_fkey" FOREIGN KEY ("assembly_id") REFERENCES "public"."comparison_assemblies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comparison_matrix_cells" ADD CONSTRAINT "comparison_matrix_cells_assembly_id_fkey" FOREIGN KEY ("assembly_id") REFERENCES "public"."comparison_assemblies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comparison_matrix_cells" ADD CONSTRAINT "comparison_matrix_cells_item_node_id_fkey" FOREIGN KEY ("item_node_id") REFERENCES "public"."comparison_item_nodes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comparison_matrix_cells" ADD CONSTRAINT "comparison_matrix_cells_object_id_fkey" FOREIGN KEY ("object_id") REFERENCES "public"."comparison_objects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comparison_objects" ADD CONSTRAINT "comparison_objects_assembly_id_fkey" FOREIGN KEY ("assembly_id") REFERENCES "public"."comparison_assemblies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comparison_objects" ADD CONSTRAINT "comparison_objects_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "public"."experience_tasks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comparison_objects" ADD CONSTRAINT "comparison_objects_report_id_fkey" FOREIGN KEY ("report_id") REFERENCES "public"."reports"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "excel_import_jobs" ADD CONSTRAINT "excel_import_jobs_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."platform_users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "excel_import_templates" ADD CONSTRAINT "excel_import_templates_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."platform_users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issue_re_evaluations" ADD CONSTRAINT "issue_re_evaluations_issue_id_issues_id_fk" FOREIGN KEY ("issue_id") REFERENCES "public"."issues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issues" ADD CONSTRAINT "issues_task_id_experience_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."experience_tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issues" ADD CONSTRAINT "issues_record_id_check_records_id_fk" FOREIGN KEY ("record_id") REFERENCES "public"."check_records"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "materials" ADD CONSTRAINT "materials_record_id_check_records_id_fk" FOREIGN KEY ("record_id") REFERENCES "public"."check_records"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "materials" ADD CONSTRAINT "materials_task_id_experience_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."experience_tasks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "materials" ADD CONSTRAINT "materials_issue_id_issues_id_fk" FOREIGN KEY ("issue_id") REFERENCES "public"."issues"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "materials" ADD CONSTRAINT "materials_re_evaluation_id_issue_re_evaluations_id_fk" FOREIGN KEY ("re_evaluation_id") REFERENCES "public"."issue_re_evaluations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "metric_definitions" ADD CONSTRAINT "metric_definitions_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."platform_users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "metric_evaluations" ADD CONSTRAINT "metric_evaluations_cell_id_fkey" FOREIGN KEY ("cell_id") REFERENCES "public"."comparison_matrix_cells"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "metric_evaluations" ADD CONSTRAINT "metric_evaluations_formula_version_id_fkey" FOREIGN KEY ("formula_version_id") REFERENCES "public"."metric_formula_versions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "metric_evaluations" ADD CONSTRAINT "metric_evaluations_threshold_rule_id_fkey" FOREIGN KEY ("threshold_rule_id") REFERENCES "public"."metric_threshold_rules"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "metric_formula_versions" ADD CONSTRAINT "metric_formula_versions_definition_id_fkey" FOREIGN KEY ("metric_definition_id") REFERENCES "public"."metric_definitions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "metric_threshold_rules" ADD CONSTRAINT "metric_threshold_rules_assembly_id_fkey" FOREIGN KEY ("assembly_id") REFERENCES "public"."comparison_assemblies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "metric_threshold_rules" ADD CONSTRAINT "metric_threshold_rules_item_node_id_fkey" FOREIGN KEY ("item_node_id") REFERENCES "public"."comparison_item_nodes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pdf_generation_jobs" ADD CONSTRAINT "pdf_generation_jobs_report_id_fkey" FOREIGN KEY ("report_id") REFERENCES "public"."reports"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pdf_generation_jobs" ADD CONSTRAINT "pdf_generation_jobs_snapshot_id_fkey" FOREIGN KEY ("snapshot_id") REFERENCES "public"."report_snapshots"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipe_library_steps" ADD CONSTRAINT "recipe_library_steps_recipe_library_id_fkey" FOREIGN KEY ("recipe_library_id") REFERENCES "public"."recipe_library"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipe_steps" ADD CONSTRAINT "recipe_steps_recipe_id_fkey" FOREIGN KEY ("recipe_id") REFERENCES "public"."recipes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipes" ADD CONSTRAINT "recipes_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "public"."experience_tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_shares" ADD CONSTRAINT "report_shares_report_id_fkey" FOREIGN KEY ("report_id") REFERENCES "public"."reports"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_shares" ADD CONSTRAINT "report_shares_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."platform_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_snapshots" ADD CONSTRAINT "report_snapshots_report_id_fkey" FOREIGN KEY ("report_id") REFERENCES "public"."reports"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_task_id_experience_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."experience_tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_template_id_report_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."report_templates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "security_audit_logs" ADD CONSTRAINT "security_audit_logs_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "public"."platform_users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "standard_items" ADD CONSTRAINT "standard_items_standard_id_standards_id_fk" FOREIGN KEY ("standard_id") REFERENCES "public"."standards"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "agent_skill_audit_logs_skill_key_idx" ON "agent_skill_audit_logs" USING btree ("skill_key" text_ops);--> statement-breakpoint
CREATE INDEX "agent_skill_audit_logs_task_id_idx" ON "agent_skill_audit_logs" USING btree ("task_id" text_ops);--> statement-breakpoint
CREATE INDEX "agent_skill_templates_key_idx" ON "agent_skill_templates" USING btree ("skill_key" text_ops);--> statement-breakpoint
CREATE INDEX "agent_skill_versions_template_id_idx" ON "agent_skill_versions" USING btree ("template_id" text_ops);--> statement-breakpoint
CREATE INDEX "ai_model_configs_active_idx" ON "ai_model_configs" USING btree ("is_active" bool_ops);--> statement-breakpoint
CREATE INDEX "check_records_standard_item_id_idx" ON "check_records" USING btree ("standard_item_id" text_ops);--> statement-breakpoint
CREATE INDEX "check_records_task_id_idx" ON "check_records" USING btree ("task_id" text_ops);--> statement-breakpoint
CREATE INDEX "comparison_ai_results_assembly_id_idx" ON "comparison_ai_results" USING btree ("assembly_id" text_ops);--> statement-breakpoint
CREATE INDEX "comparison_ai_results_level_target_idx" ON "comparison_ai_results" USING btree ("level" text_ops,"target_id" text_ops);--> statement-breakpoint
CREATE INDEX "comparison_ai_results_status_idx" ON "comparison_ai_results" USING btree ("status" text_ops);--> statement-breakpoint
CREATE INDEX "comparison_assemblies_created_by_idx" ON "comparison_assemblies" USING btree ("created_by" text_ops);--> statement-breakpoint
CREATE INDEX "comparison_assemblies_assembly_type_idx" ON "comparison_assemblies" USING btree ("assembly_type" text_ops);--> statement-breakpoint
CREATE INDEX "comparison_assemblies_status_idx" ON "comparison_assemblies" USING btree ("status" text_ops);--> statement-breakpoint
CREATE INDEX "comparison_item_nodes_assembly_id_idx" ON "comparison_item_nodes" USING btree ("assembly_id" text_ops);--> statement-breakpoint
CREATE INDEX "comparison_item_nodes_parent_id_idx" ON "comparison_item_nodes" USING btree ("parent_id" text_ops);--> statement-breakpoint
CREATE INDEX "comparison_item_nodes_assembly_sort_idx" ON "comparison_item_nodes" USING btree ("assembly_id" text_ops,"sort_order" int4_ops);--> statement-breakpoint
CREATE INDEX "comparison_matrix_cells_assembly_id_idx" ON "comparison_matrix_cells" USING btree ("assembly_id" text_ops);--> statement-breakpoint
CREATE INDEX "comparison_matrix_cells_item_node_id_idx" ON "comparison_matrix_cells" USING btree ("item_node_id" text_ops);--> statement-breakpoint
CREATE INDEX "comparison_matrix_cells_object_id_idx" ON "comparison_matrix_cells" USING btree ("object_id" text_ops);--> statement-breakpoint
CREATE INDEX "comparison_objects_assembly_id_idx" ON "comparison_objects" USING btree ("assembly_id" text_ops);--> statement-breakpoint
CREATE INDEX "comparison_objects_sort_order_idx" ON "comparison_objects" USING btree ("assembly_id" text_ops,"sort_order" int4_ops);--> statement-breakpoint
CREATE INDEX "excel_import_jobs_created_by_idx" ON "excel_import_jobs" USING btree ("created_by" text_ops);--> statement-breakpoint
CREATE INDEX "excel_import_jobs_parse_status_idx" ON "excel_import_jobs" USING btree ("parse_status" text_ops);--> statement-breakpoint
CREATE INDEX "excel_import_templates_type_idx" ON "excel_import_templates" USING btree ("template_type" text_ops);--> statement-breakpoint
CREATE INDEX "excel_import_templates_recommended_idx" ON "excel_import_templates" USING btree ("is_recommended" bool_ops);--> statement-breakpoint
CREATE INDEX "experience_tasks_created_at_idx" ON "experience_tasks" USING btree ("created_at" timestamptz_ops);--> statement-breakpoint
CREATE INDEX "experience_tasks_product_category_idx" ON "experience_tasks" USING btree ("product_category" text_ops);--> statement-breakpoint
CREATE INDEX "experience_tasks_status_idx" ON "experience_tasks" USING btree ("status" text_ops);--> statement-breakpoint
CREATE INDEX "experience_tasks_task_mode_idx" ON "experience_tasks" USING btree ("task_mode" text_ops);--> statement-breakpoint
CREATE INDEX "issue_re_evaluations_issue_id_idx" ON "issue_re_evaluations" USING btree ("issue_id" text_ops);--> statement-breakpoint
CREATE INDEX "issue_re_evaluations_created_at_idx" ON "issue_re_evaluations" USING btree ("created_at" timestamptz_ops);--> statement-breakpoint
CREATE INDEX "issue_severity_dict_sort_idx" ON "issue_severity_dict" USING btree ("sort_order" int4_ops);--> statement-breakpoint
CREATE INDEX "issue_severity_dict_active_idx" ON "issue_severity_dict" USING btree ("is_active" bool_ops);--> statement-breakpoint
CREATE INDEX "issue_status_dict_sort_idx" ON "issue_status_dict" USING btree ("sort_order" int4_ops);--> statement-breakpoint
CREATE INDEX "issue_status_dict_active_idx" ON "issue_status_dict" USING btree ("is_active" bool_ops);--> statement-breakpoint
CREATE INDEX "issues_created_at_idx" ON "issues" USING btree ("created_at" timestamptz_ops);--> statement-breakpoint
CREATE INDEX "issues_severity_idx" ON "issues" USING btree ("severity" text_ops);--> statement-breakpoint
CREATE INDEX "issues_source_type_idx" ON "issues" USING btree ("source_type" text_ops);--> statement-breakpoint
CREATE INDEX "issues_status_idx" ON "issues" USING btree ("status" text_ops);--> statement-breakpoint
CREATE INDEX "issues_task_id_idx" ON "issues" USING btree ("task_id" text_ops);--> statement-breakpoint
CREATE INDEX "materials_recipe_step_id_idx" ON "materials" USING btree ("recipe_step_id" text_ops);--> statement-breakpoint
CREATE INDEX "materials_record_id_idx" ON "materials" USING btree ("record_id" text_ops);--> statement-breakpoint
CREATE INDEX "materials_task_id_idx" ON "materials" USING btree ("task_id" text_ops);--> statement-breakpoint
CREATE INDEX "materials_type_idx" ON "materials" USING btree ("material_type" text_ops);--> statement-breakpoint
CREATE INDEX "materials_issue_id_idx" ON "materials" USING btree ("issue_id" text_ops);--> statement-breakpoint
CREATE INDEX "materials_re_evaluation_id_idx" ON "materials" USING btree ("re_evaluation_id" text_ops);--> statement-breakpoint
CREATE INDEX "materials_comparison_cell_id_idx" ON "materials" USING btree ("comparison_cell_id" text_ops);--> statement-breakpoint
CREATE INDEX "materials_comparison_assembly_id_idx" ON "materials" USING btree ("comparison_assembly_id" text_ops);--> statement-breakpoint
CREATE INDEX "metric_definitions_key_idx" ON "metric_definitions" USING btree ("metric_key" text_ops);--> statement-breakpoint
CREATE INDEX "metric_definitions_product_idx" ON "metric_definitions" USING btree ("product_category" text_ops,"product" text_ops);--> statement-breakpoint
CREATE INDEX "metric_evaluations_cell_id_idx" ON "metric_evaluations" USING btree ("cell_id" text_ops);--> statement-breakpoint
CREATE INDEX "metric_formula_versions_definition_id_idx" ON "metric_formula_versions" USING btree ("metric_definition_id" text_ops);--> statement-breakpoint
CREATE INDEX "metric_threshold_rules_assembly_idx" ON "metric_threshold_rules" USING btree ("assembly_id" text_ops);--> statement-breakpoint
CREATE INDEX "metric_threshold_rules_item_node_idx" ON "metric_threshold_rules" USING btree ("item_node_id" text_ops);--> statement-breakpoint
CREATE INDEX "pdf_generation_jobs_report_id_idx" ON "pdf_generation_jobs" USING btree ("report_id" text_ops);--> statement-breakpoint
CREATE INDEX "pdf_generation_jobs_status_idx" ON "pdf_generation_jobs" USING btree ("status" text_ops);--> statement-breakpoint
CREATE INDEX "platform_audit_requests_status_idx" ON "platform_audit_requests" USING btree ("status" text_ops);--> statement-breakpoint
CREATE INDEX "platform_audit_requests_user_id_idx" ON "platform_audit_requests" USING btree ("user_id" text_ops);--> statement-breakpoint
CREATE INDEX "project_phase_dict_sort_idx" ON "project_phase_dict" USING btree ("sort_order" int4_ops);--> statement-breakpoint
CREATE INDEX "project_phase_dict_active_idx" ON "project_phase_dict" USING btree ("is_active" bool_ops);--> statement-breakpoint
CREATE INDEX "recipe_library_product_idx" ON "recipe_library" USING btree ("product_category" text_ops,"product" text_ops);--> statement-breakpoint
CREATE INDEX "recipe_library_steps_recipe_id_idx" ON "recipe_library_steps" USING btree ("recipe_library_id" text_ops);--> statement-breakpoint
CREATE INDEX "recipe_steps_recipe_id_idx" ON "recipe_steps" USING btree ("recipe_id" text_ops);--> statement-breakpoint
CREATE INDEX "recipes_task_id_idx" ON "recipes" USING btree ("task_id" text_ops);--> statement-breakpoint
CREATE INDEX "report_shares_report_id_idx" ON "report_shares" USING btree ("report_id" text_ops);--> statement-breakpoint
CREATE INDEX "report_shares_share_token_idx" ON "report_shares" USING btree ("share_token" text_ops);--> statement-breakpoint
CREATE INDEX "report_snapshots_report_id_idx" ON "report_snapshots" USING btree ("report_id" text_ops);--> statement-breakpoint
CREATE INDEX "report_status_dict_sort_idx" ON "report_status_dict" USING btree ("sort_order" int4_ops);--> statement-breakpoint
CREATE INDEX "report_status_dict_active_idx" ON "report_status_dict" USING btree ("is_active" bool_ops);--> statement-breakpoint
CREATE INDEX "reports_created_at_idx" ON "reports" USING btree ("created_at" timestamptz_ops);--> statement-breakpoint
CREATE INDEX "reports_product_model_idx" ON "reports" USING btree ("product_model" text_ops);--> statement-breakpoint
CREATE INDEX "reports_product_model_created_at_idx" ON "reports" USING btree ("product_model" text_ops,"created_at" timestamptz_ops);--> statement-breakpoint
CREATE INDEX "reports_status_created_at_idx" ON "reports" USING btree ("status" text_ops,"created_at" timestamptz_ops);--> statement-breakpoint
CREATE INDEX "reports_task_id_idx" ON "reports" USING btree ("task_id" text_ops);--> statement-breakpoint
CREATE INDEX "reports_report_type_idx" ON "reports" USING btree ("report_type" text_ops);--> statement-breakpoint
CREATE INDEX "reports_assembly_id_idx" ON "reports" USING btree ("assembly_id" text_ops);--> statement-breakpoint
CREATE INDEX "security_audit_logs_action_idx" ON "security_audit_logs" USING btree ("action" text_ops);--> statement-breakpoint
CREATE INDEX "security_audit_logs_actor_user_id_idx" ON "security_audit_logs" USING btree ("actor_user_id" text_ops);--> statement-breakpoint
CREATE INDEX "security_audit_logs_target_idx" ON "security_audit_logs" USING btree ("target_type" text_ops,"target_id" text_ops);--> statement-breakpoint
CREATE INDEX "security_audit_logs_created_at_idx" ON "security_audit_logs" USING btree ("created_at" timestamptz_ops);--> statement-breakpoint
CREATE INDEX "sla_policy_dict_sort_idx" ON "sla_policy_dict" USING btree ("sort_order" int4_ops);--> statement-breakpoint
CREATE INDEX "sla_policy_dict_active_idx" ON "sla_policy_dict" USING btree ("is_active" bool_ops);--> statement-breakpoint
CREATE INDEX "standard_items_sensory_idx" ON "standard_items" USING btree ("sensory_dimension" text_ops);--> statement-breakpoint
CREATE INDEX "standard_items_standard_id_idx" ON "standard_items" USING btree ("standard_id" text_ops);--> statement-breakpoint
CREATE INDEX "standards_category_idx" ON "standards" USING btree ("category" text_ops);--> statement-breakpoint
CREATE INDEX "standards_product_category_idx" ON "standards" USING btree ("product_category" text_ops);--> statement-breakpoint
CREATE INDEX "task_status_dict_sort_idx" ON "task_status_dict" USING btree ("sort_order" int4_ops);--> statement-breakpoint
CREATE INDEX "task_status_dict_active_idx" ON "task_status_dict" USING btree ("is_active" bool_ops);