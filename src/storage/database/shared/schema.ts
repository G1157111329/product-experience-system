import { pgTable, serial, timestamp, varchar, jsonb, boolean, index, foreignKey, integer, text, unique, date } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"


export const healthCheck = pgTable("health_check", {
	id: serial().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow(),
});

export const reportTemplates = pgTable("report_templates", {
	id: varchar({ length: 36 }).default(sql`gen_random_uuid()`).primaryKey().notNull(),
	templateName: varchar("template_name", { length: 200 }).notNull(),
	templateType: varchar("template_type", { length: 50 }),
	content: jsonb(),
	isDefault: boolean("is_default").default(false),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow(),
}, () => [
]);

export const reports = pgTable("reports", {
	id: varchar({ length: 36 }).default(sql`gen_random_uuid()`).primaryKey().notNull(),
	taskId: varchar("task_id", { length: 36 }).notNull(),
	templateId: varchar("template_id", { length: 36 }),
	title: varchar({ length: 200 }),
	content: jsonb(),
	status: varchar({ length: 20 }).default('草稿').notNull(),
	version: integer().default(1),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow(),
	productModel: varchar("product_model", { length: 50 }),
}, (table) => [
	index("reports_created_at_idx").using("btree", table.createdAt.asc().nullsLast().op("timestamptz_ops")),
	index("reports_product_model_idx").using("btree", table.productModel.asc().nullsLast().op("text_ops")),
	index("reports_product_model_created_at_idx").using("btree", table.productModel.asc().nullsLast().op("text_ops"), table.createdAt.asc().nullsLast().op("timestamptz_ops")),
	index("reports_task_id_idx").using("btree", table.taskId.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.taskId],
			foreignColumns: [experienceTasks.id],
			name: "reports_task_id_experience_tasks_id_fk"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.templateId],
			foreignColumns: [reportTemplates.id],
			name: "reports_template_id_report_templates_id_fk"
		}),
]);

export const recipes = pgTable("recipes", {
	id: varchar({ length: 36 }).default(sql`gen_random_uuid()`).primaryKey().notNull(),
	taskId: varchar("task_id", { length: 36 }).notNull(),
	name: varchar({ length: 200 }).notNull(),
	ingredients: text(),
	recipeType: varchar("recipe_type", { length: 20 }).default('食谱'),
	problemCount: integer("problem_count").default(0),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow(),
	sortOrder: integer("sort_order").default(0),
	effectDescription: text("effect_description"),
	effectScore: varchar("effect_score", { length: 20 }),
	effectProblemPoint: text("effect_problem_point"),
	effectAiResult: jsonb("effect_ai_result"),
}, (table) => [
	index("recipes_task_id_idx").using("btree", table.taskId.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.taskId],
			foreignColumns: [experienceTasks.id],
			name: "recipes_task_id_fkey"
		}).onDelete("cascade"),
]);

export const recipeSteps = pgTable("recipe_steps", {
	id: varchar({ length: 36 }).default(sql`gen_random_uuid()`).primaryKey().notNull(),
	recipeId: varchar("recipe_id", { length: 36 }).notNull(),
	stepNumber: integer("step_number").default(1).notNull(),
	operation: text().notNull(),
	problemPoint: text("problem_point"),
	sortOrder: integer("sort_order").default(0),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow(),
	problemPoints: jsonb("problem_points").default([]),
}, (table) => [
	index("recipe_steps_recipe_id_idx").using("btree", table.recipeId.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.recipeId],
			foreignColumns: [recipes.id],
			name: "recipe_steps_recipe_id_fkey"
		}).onDelete("cascade"),
]);

export const standardItems = pgTable("standard_items", {
	id: varchar({ length: 36 }).default(sql`gen_random_uuid()`).primaryKey().notNull(),
	standardId: varchar("standard_id", { length: 36 }).notNull(),
	sortOrder: integer("sort_order").default(0),
	sensoryDimension: varchar("sensory_dimension", { length: 20 }),
	testPhase: varchar("test_phase", { length: 50 }),
	checkDimension: varchar("check_dimension", { length: 50 }),
	checkItem: varchar("check_item", { length: 200 }).notNull(),
	checkRequirement: text("check_requirement"),
	measurementPosition: varchar("measurement_position", { length: 200 }),
	checkTool: varchar("check_tool", { length: 100 }),
	standardA: varchar("standard_a", { length: 200 }),
	standardB: varchar("standard_b", { length: 200 }),
	standardC: varchar("standard_c", { length: 200 }),
	problemLevel: varchar("problem_level", { length: 20 }),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	experienceFlow: varchar("experience_flow", { length: 100 }),
	touchPoint: varchar("touch_point", { length: 200 }),
	experienceStandard: text("experience_standard"),
	subCheckDimension: varchar("sub_check_dimension", { length: 100 }),
	checkStandard: text("check_standard"),
	evaluationPrep: text("evaluation_prep"),
	subjectiveScore: integer("subjective_score"),
	subjectiveRating: text("subjective_rating"),
	referenceImages: jsonb("reference_images"),
}, (table) => [
	index("standard_items_sensory_idx").using("btree", table.sensoryDimension.asc().nullsLast().op("text_ops")),
	index("standard_items_standard_id_idx").using("btree", table.standardId.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.standardId],
			foreignColumns: [standards.id],
			name: "standard_items_standard_id_standards_id_fk"
		}).onDelete("cascade"),
]);

export const checkRecords = pgTable("check_records", {
	id: varchar({ length: 36 }).default(sql`gen_random_uuid()`).primaryKey().notNull(),
	taskId: varchar("task_id", { length: 36 }).notNull(),
	standardItemId: varchar("standard_item_id", { length: 36 }),
	sensoryDimension: varchar("sensory_dimension", { length: 20 }),
	testPhase: varchar("test_phase", { length: 50 }),
	checkDimension: varchar("check_dimension", { length: 50 }),
	checkItem: varchar("check_item", { length: 200 }).notNull(),
	checkRequirement: text("check_requirement"),
	evaluationResult: varchar("evaluation_result", { length: 20 }),
	problemDescription: text("problem_description"),
	measurementValue: varchar("measurement_value", { length: 100 }),
	tester: varchar({ length: 50 }),
	sortOrder: integer("sort_order").default(0),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow(),
	measurementPosition: varchar("measurement_position", { length: 200 }),
	standardCategory: varchar("standard_category", { length: 50 }),
	experienceFlow: varchar("experience_flow", { length: 100 }),
	touchPoint: varchar("touch_point", { length: 200 }),
	experienceStandard: text("experience_standard"),
	checkStandard: text("check_standard"),
	subCheckDimension: varchar("sub_check_dimension", { length: 100 }),
	checkTool: text("check_tool"),
	problemLevel: text("problem_level"),
}, (table) => [
	index("check_records_standard_item_id_idx").using("btree", table.standardItemId.asc().nullsLast().op("text_ops")),
	index("check_records_task_id_idx").using("btree", table.taskId.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.taskId],
			foreignColumns: [experienceTasks.id],
			name: "check_records_task_id_experience_tasks_id_fk"
		}).onDelete("cascade"),
]);

export const issues = pgTable("issues", {
	id: varchar({ length: 36 }).default(sql`gen_random_uuid()`).primaryKey().notNull(),
	taskId: varchar("task_id", { length: 36 }).notNull(),
	recordId: varchar("record_id", { length: 36 }),
	title: varchar({ length: 200 }).notNull(),
	productModel: varchar("product_model", { length: 50 }),
	category: varchar({ length: 50 }),
	subCategory: varchar("sub_category", { length: 50 }),
	severity: varchar({ length: 20 }),
	priority: varchar({ length: 20 }),
	description: text(),
	isImprove: boolean("is_improve"),
	noImproveReason: text("no_improve_reason"),
	improvePlan: text("improve_plan"),
	responsibleDept: varchar("responsible_dept", { length: 50 }),
	responsiblePerson: varchar("responsible_person", { length: 50 }),
	planCompleteDate: date("plan_complete_date"),
	actualCompleteDate: date("actual_complete_date"),
	isClosed: boolean("is_closed").default(false),
	status: varchar({ length: 20 }).default('待整改').notNull(),
	verificationNote: text("verification_note"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow(),
	level: varchar({ length: 20 }),
	source: varchar({ length: 50 }),
	sourceReportId: varchar("source_report_id", { length: 36 }),
	sourceType: varchar("source_type", { length: 20 }),
}, (table) => [
	index("issues_created_at_idx").using("btree", table.createdAt.asc().nullsLast().op("timestamptz_ops")),
	index("issues_severity_idx").using("btree", table.severity.asc().nullsLast().op("text_ops")),
	index("issues_status_idx").using("btree", table.status.asc().nullsLast().op("text_ops")),
	index("issues_task_id_idx").using("btree", table.taskId.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.taskId],
			foreignColumns: [experienceTasks.id],
			name: "issues_task_id_experience_tasks_id_fk"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.recordId],
			foreignColumns: [checkRecords.id],
			name: "issues_record_id_check_records_id_fk"
		}).onDelete("set null"),
	unique("issues_unique_per_task").on(table.taskId, table.title, table.sourceType),
]);

export const issueReEvaluations = pgTable("issue_re_evaluations", {
	id: varchar({ length: 36 }).default(sql`gen_random_uuid()`).primaryKey().notNull(),
	issueId: varchar("issue_id", { length: 36 }).notNull(),
	description: text(),
	aiResult: jsonb("ai_result"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	createdBy: varchar("created_by", { length: 36 }),
}, (table) => [
	index("issue_re_evaluations_issue_id_idx").using("btree", table.issueId.asc().nullsLast().op("text_ops")),
	index("issue_re_evaluations_created_at_idx").using("btree", table.createdAt.asc().nullsLast().op("timestamptz_ops")),
	foreignKey({
			columns: [table.issueId],
			foreignColumns: [issues.id],
			name: "issue_re_evaluations_issue_id_issues_id_fk"
		}).onDelete("cascade"),
]);

export const experienceTasks = pgTable("experience_tasks", {
	id: varchar({ length: 36 }).default(sql`gen_random_uuid()`).primaryKey().notNull(),
	taskName: varchar("task_name", { length: 200 }).notNull(),
	productCategory: varchar("product_category", { length: 50 }).notNull(),
	productModel: varchar("product_model", { length: 50 }).notNull(),
	projectNumber: varchar("project_number", { length: 100 }),
	projectPhase: varchar("project_phase", { length: 50 }),
	testDate: date("test_date"),
	organizer: varchar({ length: 50 }),
	targetUser: text("target_user"),
	testPurpose: text("test_purpose"),
	testMethod: text("test_method"),
	status: varchar({ length: 20 }).default('待执行').notNull(),
	assignedTo: varchar("assigned_to", { length: 200 }),
	selectedStandards: jsonb("selected_standards"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow(),
	projectType: varchar("project_type", { length: 50 }),
	createdBy: varchar("created_by", { length: 36 }),
	product: varchar({ length: 200 }),
}, (table) => [
	index("experience_tasks_created_at_idx").using("btree", table.createdAt.asc().nullsLast().op("timestamptz_ops")),
	index("experience_tasks_product_category_idx").using("btree", table.productCategory.asc().nullsLast().op("text_ops")),
	index("experience_tasks_status_idx").using("btree", table.status.asc().nullsLast().op("text_ops")),
]);

export const platformUsers = pgTable("platform_users", {
	id: varchar({ length: 36 }).default(sql`gen_random_uuid()`).primaryKey().notNull(),
	account: varchar({ length: 50 }).notNull(),
	passwordHash: varchar("password_hash", { length: 200 }).notNull(),
	name: varchar({ length: 50 }),
	role: varchar({ length: 20 }).default('user').notNull(),
	status: varchar({ length: 20 }).default('pending').notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow(),
}, (table) => [
	unique("platform_users_account_key").on(table.account),
]);

export const reportShares = pgTable("report_shares", {
	id: varchar({ length: 36 }).default(sql`gen_random_uuid()`).primaryKey().notNull(),
	reportId: varchar("report_id", { length: 36 }).notNull(),
	shareToken: varchar("share_token", { length: 64 }).notNull(),
	expiresAt: timestamp("expires_at", { withTimezone: true, mode: 'string' }),
	createdBy: varchar("created_by", { length: 36 }),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("report_shares_report_id_idx").using("btree", table.reportId.asc().nullsLast().op("text_ops")),
	index("report_shares_share_token_idx").using("btree", table.shareToken.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.reportId],
			foreignColumns: [reports.id],
			name: "report_shares_report_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.createdBy],
			foreignColumns: [platformUsers.id],
			name: "report_shares_created_by_fkey"
		}),
	unique("report_shares_share_token_key").on(table.shareToken),
]);

export const platformCategories = pgTable("platform_categories", {
	id: varchar({ length: 36 }).default((sql`gen_random_uuid()`)).primaryKey().notNull(),
	name: varchar({ length: 100 }).notNull(),
	sortOrder: integer("sort_order").default(0),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
}, (table) => [
	unique("platform_categories_name_key").on(table.name),
]);

export const platformProducts = pgTable("platform_products", {
	id: varchar({ length: 36 }).default((sql`gen_random_uuid()`)).primaryKey().notNull(),
	name: varchar({ length: 100 }).notNull(),
	categoryId: varchar("category_id", { length: 36 }).notNull(),
	sortOrder: integer("sort_order").default(0),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
}, (table) => [
	unique("platform_products_name_category_id_key").on(table.name, table.categoryId),
]);

export const standards = pgTable("standards", {
	id: varchar({ length: 36 }).default(sql`gen_random_uuid()`).primaryKey().notNull(),
	standardName: varchar("standard_name", { length: 200 }).notNull(),
	category: varchar({ length: 50 }).notNull(),
	productCategory: varchar("product_category", { length: 50 }),
	version: varchar({ length: 20 }).default('V1.0'),
	isActive: boolean("is_active").default(true).notNull(),
	description: text(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow(),
	product: varchar({ length: 200 }),
}, (table) => [
	index("standards_category_idx").using("btree", table.category.asc().nullsLast().op("text_ops")),
	index("standards_product_category_idx").using("btree", table.productCategory.asc().nullsLast().op("text_ops")),
]);

export const recipeLibrary = pgTable("recipe_library", {
	id: varchar({ length: 36 }).default(sql`gen_random_uuid()`).primaryKey().notNull(),
	productCategory: varchar("product_category", { length: 100 }),
	product: varchar({ length: 100 }),
	name: varchar({ length: 200 }).notNull(),
	ingredients: text(),
	recipeType: varchar("recipe_type", { length: 20 }).default('食谱'),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow(),
}, (table) => [
	index("recipe_library_product_idx").using("btree", table.productCategory.asc().nullsLast().op("text_ops"), table.product.asc().nullsLast().op("text_ops")),
	unique("recipe_library_name_key").on(table.name),
]);

export const recipeLibrarySteps = pgTable("recipe_library_steps", {
	id: varchar({ length: 36 }).default(sql`gen_random_uuid()`).primaryKey().notNull(),
	recipeLibraryId: varchar("recipe_library_id", { length: 36 }).notNull(),
	stepNumber: integer("step_number").default(1).notNull(),
	operation: text().notNull(),
	problemPoint: text("problem_point"),
	problemPoints: jsonb("problem_points").default([]),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow(),
}, (table) => [
	index("recipe_library_steps_recipe_id_idx").using("btree", table.recipeLibraryId.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.recipeLibraryId],
			foreignColumns: [recipeLibrary.id],
			name: "recipe_library_steps_recipe_library_id_fkey"
		}).onDelete("cascade"),
]);

export const materials = pgTable("materials", {
	id: varchar({ length: 36 }).default(sql`gen_random_uuid()`).primaryKey().notNull(),
	recordId: varchar("record_id", { length: 36 }),
	taskId: varchar("task_id", { length: 36 }),
	materialType: varchar("material_type", { length: 10 }).notNull(),
	fileName: varchar("file_name", { length: 200 }),
	filePath: varchar("file_path", { length: 500 }),
	fileSize: integer("file_size"),
	fileUrl: text("file_url"),
	durationSec: integer("duration_sec"),
	thumbnailUrl: text("thumbnail_url"),
	aiAnalysisStatus: varchar("ai_analysis_status", { length: 20 }).default('pending'),
	aiResult: jsonb("ai_result"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	recipeStepId: varchar("recipe_step_id", { length: 36 }),
	recipeLibraryStepId: varchar("recipe_library_step_id", { length: 36 }),
	recipeId: varchar("recipe_id", { length: 36 }),
	issueId: varchar("issue_id", { length: 36 }),
	reEvaluationId: varchar("re_evaluation_id", { length: 36 }),
}, (table) => [
	index("materials_recipe_step_id_idx").using("btree", table.recipeStepId.asc().nullsLast().op("text_ops")),
	index("materials_record_id_idx").using("btree", table.recordId.asc().nullsLast().op("text_ops")),
	index("materials_task_id_idx").using("btree", table.taskId.asc().nullsLast().op("text_ops")),
	index("materials_type_idx").using("btree", table.materialType.asc().nullsLast().op("text_ops")),
	index("materials_issue_id_idx").using("btree", table.issueId.asc().nullsLast().op("text_ops")),
		index("materials_re_evaluation_id_idx").using("btree", table.reEvaluationId.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.recordId],
			foreignColumns: [checkRecords.id],
			name: "materials_record_id_check_records_id_fk"
		}).onDelete("set null"),
	foreignKey({
			columns: [table.taskId],
			foreignColumns: [experienceTasks.id],
			name: "materials_task_id_experience_tasks_id_fk"
		}).onDelete("set null"),
	foreignKey({
			columns: [table.issueId],
			foreignColumns: [issues.id],
			name: "materials_issue_id_issues_id_fk"
		}).onDelete("set null"),
		foreignKey({
			columns: [table.reEvaluationId],
			foreignColumns: [issueReEvaluations.id],
			name: "materials_re_evaluation_id_issue_re_evaluations_id_fk"
		}).onDelete("set null"),
]);

export const platformAuditRequests = pgTable("platform_audit_requests", {
	id: varchar({ length: 36 }).default(sql`gen_random_uuid()`).primaryKey().notNull(),
	userId: varchar("user_id", { length: 36 }).notNull(),
	requestType: varchar("request_type", { length: 30 }).notNull(),
	status: varchar({ length: 20 }).default('pending').notNull(),
	oldValue: text("old_value"),
	newValue: text("new_value"),
	targetUserId: varchar("target_user_id", { length: 36 }),
	reviewedBy: varchar("reviewed_by", { length: 36 }),
	reviewedAt: timestamp("reviewed_at", { withTimezone: true, mode: 'string' }),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("platform_audit_requests_status_idx").using("btree", table.status.asc().nullsLast().op("text_ops")),
	index("platform_audit_requests_user_id_idx").using("btree", table.userId.asc().nullsLast().op("text_ops")),
]);

export const platformSettings = pgTable("platform_settings", {
	key: varchar({ length: 100 }).primaryKey().notNull(),
	value: jsonb().default({}).notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow(),
});

export const securityAuditLogs = pgTable("security_audit_logs", {
	id: varchar({ length: 36 }).default(sql`gen_random_uuid()`).primaryKey().notNull(),
	action: varchar({ length: 80 }).notNull(),
	actorUserId: varchar("actor_user_id", { length: 36 }),
	actorAccount: varchar("actor_account", { length: 100 }),
	targetType: varchar("target_type", { length: 50 }),
	targetId: varchar("target_id", { length: 100 }),
	outcome: varchar({ length: 20 }).notNull(),
	ipAddress: varchar("ip_address", { length: 80 }),
	userAgent: text("user_agent"),
	requestPath: text("request_path"),
	requestMethod: varchar("request_method", { length: 10 }),
	metadata: jsonb().default({}).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("security_audit_logs_action_idx").using("btree", table.action.asc().nullsLast().op("text_ops")),
	index("security_audit_logs_actor_user_id_idx").using("btree", table.actorUserId.asc().nullsLast().op("text_ops")),
	index("security_audit_logs_target_idx").using("btree", table.targetType.asc().nullsLast().op("text_ops"), table.targetId.asc().nullsLast().op("text_ops")),
	index("security_audit_logs_created_at_idx").using("btree", table.createdAt.asc().nullsLast().op("timestamptz_ops")),
	foreignKey({
		columns: [table.actorUserId],
		foreignColumns: [platformUsers.id],
		name: "security_audit_logs_actor_user_id_fkey"
	}).onDelete("set null"),
]);

export const securityRateLimits = pgTable("security_rate_limits", {
	rateKey: varchar("rate_key", { length: 240 }).primaryKey().notNull(),
	count: integer().default(0).notNull(),
	resetAt: timestamp("reset_at", { withTimezone: true, mode: 'string' }).notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
});

export const aiModelConfigs = pgTable("ai_model_configs", {
	id: varchar({ length: 36 }).default(sql`gen_random_uuid()`).primaryKey().notNull(),
	name: varchar({ length: 100 }).notNull(),
	provider: varchar({ length: 20 }).default('custom').notNull(),
	model: varchar({ length: 100 }).notNull(),
	temperature: integer().default(5).notNull(),
	maxTokens: integer("max_tokens").default(2400).notNull(),
	supportsVision: boolean("supports_vision").default(false).notNull(),
	customApiUrl: text("custom_api_url"),
	customApiKeyEncrypted: text("custom_api_key_encrypted"),
	isActive: boolean("is_active").default(false).notNull(),
	createdBy: varchar("created_by", { length: 36 }),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow(),
}, (table) => [
	index("ai_model_configs_active_idx").using("btree", table.isActive.asc().nullsLast().op("bool_ops")),
	foreignKey({
		columns: [table.createdBy],
		foreignColumns: [platformUsers.id],
		name: "ai_model_configs_created_by_fkey"
	}).onDelete("set null"),
]);

export const agentSkillTemplates = pgTable("agent_skill_templates", {
	id: varchar({ length: 36 }).default(sql`gen_random_uuid()`).primaryKey().notNull(),
	skillKey: varchar("skill_key", { length: 50 }).notNull(),
	name: varchar({ length: 100 }).notNull(),
	description: text(),
	isEnabled: boolean("is_enabled").default(true).notNull(),
	activeVersionId: varchar("active_version_id", { length: 36 }),
	modelConfigId: varchar("model_config_id", { length: 36 }),
	createdBy: varchar("created_by", { length: 36 }),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow(),
}, (table) => [
	index("agent_skill_templates_key_idx").using("btree", table.skillKey.asc().nullsLast().op("text_ops")),
	foreignKey({
		columns: [table.modelConfigId],
		foreignColumns: [aiModelConfigs.id],
		name: "agent_skill_templates_model_config_id_fkey"
	}).onDelete("set null"),
	foreignKey({
		columns: [table.createdBy],
		foreignColumns: [platformUsers.id],
		name: "agent_skill_templates_created_by_fkey"
	}).onDelete("set null"),
	unique("agent_skill_templates_skill_key_key").on(table.skillKey),
]);

export const agentSkillVersions = pgTable("agent_skill_versions", {
	id: varchar({ length: 36 }).default(sql`gen_random_uuid()`).primaryKey().notNull(),
	templateId: varchar("template_id", { length: 36 }).notNull(),
	version: integer().notNull(),
	systemPrompt: text("system_prompt").notNull(),
	userPromptTemplate: text("user_prompt_template").notNull(),
	outputSchema: jsonb("output_schema").default({}).notNull(),
	notes: text(),
	createdBy: varchar("created_by", { length: 36 }),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("agent_skill_versions_template_id_idx").using("btree", table.templateId.asc().nullsLast().op("text_ops")),
	foreignKey({
		columns: [table.templateId],
		foreignColumns: [agentSkillTemplates.id],
		name: "agent_skill_versions_template_id_fkey"
	}).onDelete("cascade"),
	foreignKey({
		columns: [table.createdBy],
		foreignColumns: [platformUsers.id],
		name: "agent_skill_versions_created_by_fkey"
	}).onDelete("set null"),
	unique("agent_skill_versions_template_version_key").on(table.templateId, table.version),
]);

export const agentSkillAuditLogs = pgTable("agent_skill_audit_logs", {
	id: varchar({ length: 36 }).default(sql`gen_random_uuid()`).primaryKey().notNull(),
	skillKey: varchar("skill_key", { length: 50 }).notNull(),
	templateId: varchar("template_id", { length: 36 }),
	versionId: varchar("version_id", { length: 36 }),
	action: varchar({ length: 50 }).notNull(),
	actorUserId: varchar("actor_user_id", { length: 36 }),
	taskId: varchar("task_id", { length: 36 }),
	requestSnapshot: jsonb("request_snapshot").default({}),
	responseSnapshot: jsonb("response_snapshot").default({}),
	status: varchar({ length: 20 }).default('success').notNull(),
	errorMessage: text("error_message"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("agent_skill_audit_logs_skill_key_idx").using("btree", table.skillKey.asc().nullsLast().op("text_ops")),
	index("agent_skill_audit_logs_task_id_idx").using("btree", table.taskId.asc().nullsLast().op("text_ops")),
	foreignKey({
		columns: [table.templateId],
		foreignColumns: [agentSkillTemplates.id],
		name: "agent_skill_audit_logs_template_id_fkey"
	}).onDelete("set null"),
	foreignKey({
		columns: [table.versionId],
		foreignColumns: [agentSkillVersions.id],
		name: "agent_skill_audit_logs_version_id_fkey"
	}).onDelete("set null"),
	foreignKey({
		columns: [table.actorUserId],
		foreignColumns: [platformUsers.id],
		name: "agent_skill_audit_logs_actor_user_id_fkey"
	}).onDelete("set null"),
	foreignKey({
		columns: [table.taskId],
		foreignColumns: [experienceTasks.id],
		name: "agent_skill_audit_logs_task_id_fkey"
	}).onDelete("set null"),
]);
