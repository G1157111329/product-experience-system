import { pgTable, serial, timestamp, varchar, jsonb, boolean, index, foreignKey, integer, text, unique, date, bigint, numeric, smallint } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"
import type { AnyPgColumn } from "drizzle-orm/pg-core"

// V3.1.1 §27.2.6 / §16.3 — server-side dictionaries.
export {
  projectPhaseDict,
  issueStatusDict,
  taskStatusDict,
  reportStatusDict,
  issueSeverityDict,
  slaPolicyDict,
  dictionaryTables,
  DICT_TYPES,
} from "./dictionary-tables";
import type { DictType } from "./dictionary-tables";
export type { DictType };

// V3.1 §16.2 / §16.3 — five contract tables + process tables.
export {
  reportViewConfigs,
  reportOutlineSections,
  reportActionItems,
  exportJobs,
  renderProfiles,
  reportPrintBlocks,
  issueOccurrences,
  rectificationActions,
  verifications,
  reportSummaries,
  aiRuns,
  outboxEvents,
  notifications,
  v3ContractTables,
} from "./v3-contract-tables";


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
	// V2.3 统一报告资产字段（向下兼容，旧报告默认 single_report）
	reportType: varchar("report_type", { length: 40 }).default('single_report').notNull(),
	sourceTaskIds: jsonb("source_task_ids").default([]),
	sourceReportIds: jsonb("source_report_ids").default([]),
	assemblyId: varchar("assembly_id", { length: 36 }),
	snapshotId: varchar("snapshot_id", { length: 36 }),
	layoutProfile: varchar("layout_profile", { length: 80 }),
	aiConfirmationStatus: varchar("ai_confirmation_status", { length: 20 }).default('pending'),
	// V3.1 §16.2 — report-level fields for the contract layer. Nullable for
	// backward compat with pre-V3 reports; backfill in Wave 1 sets these.
	reportNo: varchar("report_no", { length: 60 }),
	reportScopeType: varchar("report_scope_type", { length: 40 }), // task_report | comparison_report | model_dossier_report | synthesis_report
	ownerId: varchar("owner_id", { length: 36 }),
	reviewerId: varchar("reviewer_id", { length: 36 }),
	publishedAt: timestamp("published_at", { withTimezone: true, mode: 'string' }),
}, (table) => [
	index("reports_created_at_idx").using("btree", table.createdAt.asc().nullsLast().op("timestamptz_ops")),
	index("reports_product_model_idx").using("btree", table.productModel.asc().nullsLast().op("text_ops")),
	index("reports_product_model_created_at_idx").using("btree", table.productModel.asc().nullsLast().op("text_ops"), table.createdAt.asc().nullsLast().op("timestamptz_ops")),
	index("reports_status_created_at_idx").using("btree", table.status.asc().nullsLast().op("text_ops"), table.createdAt.asc().nullsLast().op("timestamptz_ops")),
	index("reports_task_id_idx").using("btree", table.taskId.asc().nullsLast().op("text_ops")),
	index("reports_report_type_idx").using("btree", table.reportType.asc().nullsLast().op("text_ops")),
	index("reports_assembly_id_idx").using("btree", table.assemblyId.asc().nullsLast().op("text_ops")),
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
	ingredientItems: jsonb("ingredient_items").default([]),
	recipeType: varchar("recipe_type", { length: 20 }).default('食谱'),
	problemCount: integer("problem_count").default(0),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow(),
	sortOrder: integer("sort_order").default(0),
	effectDescription: text("effect_description"),
	effectScore: varchar("effect_score", { length: 20 }),
	effectProblemPoint: text("effect_problem_point"),
	effectAiResult: jsonb("effect_ai_result"),
	effectStatus: varchar("effect_status", { length: 20 }),
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
	parameters: jsonb().default({}),
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
	recipeId: varchar("recipe_id", { length: 36 }),
	recipeStepId: varchar("recipe_step_id", { length: 36 }),
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
	recipeId: varchar("recipe_id", { length: 36 }),
	recipeStepId: varchar("recipe_step_id", { length: 36 }),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow(),
	level: varchar({ length: 20 }),
	source: varchar({ length: 50 }),
	sourceReportId: varchar("source_report_id", { length: 36 }),
	sourceType: varchar("source_type", { length: 20 }),
	// V3.1 §16.3 — issue main record fields for the contract + occurrence split.
	// Nullable for backward compat; backfill in Wave 1.
	severityCode: varchar("severity_code", { length: 40 }), // FK to issue_severity_dict.code
	moduleCode: varchar("module_code", { length: 80 }), // functional module tag, for filtering
	dueAt: timestamp("due_at", { withTimezone: true, mode: 'string' }),
	firstSeenAt: timestamp("first_seen_at", { withTimezone: true, mode: 'string' }),
	lastSeenAt: timestamp("last_seen_at", { withTimezone: true, mode: 'string' }),
	version: integer("version").default(1).notNull(),
	// 对比矩阵溯源字段：将矩阵单元格问题点关联回矩阵，便于整改回写
	sourceAssemblyId: varchar("source_assembly_id", { length: 36 }),
	sourceCellId: varchar("source_cell_id", { length: 36 }),
	sourceItemNodeId: varchar("source_item_node_id", { length: 36 }),
	sourceObjectId: varchar("source_object_id", { length: 36 }),
}, (table) => [
	index("issues_created_at_idx").using("btree", table.createdAt.asc().nullsLast().op("timestamptz_ops")),
	index("issues_severity_idx").using("btree", table.severity.asc().nullsLast().op("text_ops")),
	index("issues_source_type_idx").using("btree", table.sourceType.asc().nullsLast().op("text_ops")),
	index("issues_status_idx").using("btree", table.status.asc().nullsLast().op("text_ops")),
	index("issues_task_id_idx").using("btree", table.taskId.asc().nullsLast().op("text_ops")),
	index("issues_severity_code_idx").using("btree", table.severityCode.asc().nullsLast().op("text_ops")),
	index("issues_due_at_idx").using("btree", table.dueAt.asc().nullsLast().op("timestamptz_ops")),
	index("issues_source_assembly_id_idx").using("btree", table.sourceAssemblyId.asc().nullsLast().op("text_ops")),
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
	// V2.3 对比组装字段（向下兼容，旧任务默认 single）
	taskMode: varchar("task_mode", { length: 20 }).default('single').notNull(),
	comparisonIntent: text("comparison_intent"),
	comparisonLayoutType: varchar("comparison_layout_type", { length: 40 }),
	comparisonSource: varchar("comparison_source", { length: 40 }),
	// V3.1 §16.3 — task-level fields for the contract layer. Nullable for
	// backward compat; backfill in Wave 1.
	taskNo: varchar("task_no", { length: 60 }),
	sourceTaskIds: jsonb("source_task_ids").default([]),
	sourceReportIds: jsonb("source_report_ids").default([]),
	reviewerId: varchar("reviewer_id", { length: 36 }),
	ownerId: varchar("owner_id", { length: 36 }),
	version: integer("version").default(1).notNull(),
}, (table) => [
	index("experience_tasks_created_at_idx").using("btree", table.createdAt.asc().nullsLast().op("timestamptz_ops")),
	index("experience_tasks_product_category_idx").using("btree", table.productCategory.asc().nullsLast().op("text_ops")),
	index("experience_tasks_status_idx").using("btree", table.status.asc().nullsLast().op("text_ops")),
	index("experience_tasks_task_mode_idx").using("btree", table.taskMode.asc().nullsLast().op("text_ops")),
	index("experience_tasks_task_no_idx").using("btree", table.taskNo.asc().nullsLast().op("text_ops")),
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
	// V2.3 对比组装与媒体标准化字段（向下兼容）
	comparisonCellId: varchar("comparison_cell_id", { length: 36 }),
	comparisonAssemblyId: varchar("comparison_assembly_id", { length: 36 }),
	normalizedThumbPath: text("normalized_thumb_path"),
	videoCoverPath: text("video_cover_path"),
	mediaDisplayOrder: integer("media_display_order").default(0),
	mediaRole: varchar("media_role", { length: 40 }),
	// V3.1.2.4 §9 (ADR-04) — MaterialAsset state machine + project scoping.
	// Columns added at SQL level by migration 0005; declared here for typed access.
	status: varchar("status", { length: 30 }).default('uploaded').notNull(),
	projectId: varchar("project_id", { length: 36 }),
	lastBindSuggestion: jsonb("last_bind_suggestion"),
}, (table) => [
	index("materials_recipe_step_id_idx").using("btree", table.recipeStepId.asc().nullsLast().op("text_ops")),
	index("materials_record_id_idx").using("btree", table.recordId.asc().nullsLast().op("text_ops")),
	index("materials_task_id_idx").using("btree", table.taskId.asc().nullsLast().op("text_ops")),
	index("materials_type_idx").using("btree", table.materialType.asc().nullsLast().op("text_ops")),
	index("materials_issue_id_idx").using("btree", table.issueId.asc().nullsLast().op("text_ops")),
		index("materials_re_evaluation_id_idx").using("btree", table.reEvaluationId.asc().nullsLast().op("text_ops")),
	index("materials_comparison_cell_id_idx").using("btree", table.comparisonCellId.asc().nullsLast().op("text_ops")),
	index("materials_comparison_assembly_id_idx").using("btree", table.comparisonAssemblyId.asc().nullsLast().op("text_ops")),
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

// ============================================================
// V2.3 对比组装与统一报告体系
// 详见 docs/PRD-v2.3-dev-roadmap.md 与 docs/product_experience_platform_technical_plan_v2_3_fused_comparison_group.md
// ============================================================

// 对比组装：底层组装对象，承接多对象对比任务/事后聚合/型号自动归集/自定义合并
export const comparisonAssemblies = pgTable("comparison_assemblies", {
	id: varchar({ length: 36 }).default(sql`gen_random_uuid()`).primaryKey().notNull(),
	name: varchar("name", { length: 200 }).notNull(),
	assemblyType: varchar("assembly_type", { length: 40 }).notNull(), // task_comparison | post_report_assembly | model_auto_group | custom_merge
	sourceType: varchar("source_type", { length: 40 }).notNull(), // manual | excel_import | report_center_selection | model_auto_detection
	productCategory: varchar("product_category", { length: 100 }),
	product: varchar("product", { length: 100 }),
	comparisonIntent: text("comparison_intent"),
	layoutType: varchar("layout_type", { length: 40 }).default('image_matrix').notNull(), // image_matrix | metric_table | mixed
	status: varchar("status", { length: 30 }).default('draft').notNull(), // draft | ready | published | archived
	sourceTaskIds: jsonb("source_task_ids").default([]),
	sourceReportIds: jsonb("source_report_ids").default([]),
	createdBy: varchar("created_by", { length: 36 }).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	// Data Matrix Input View — marks assemblies that are typed-value matrix instances.
	matrixSchemaVersionId: varchar("matrix_schema_version_id", { length: 36 }),
	matrixRole: varchar("matrix_role", { length: 20 }).default('comparison').notNull(),
	comparabilityStatus: varchar("comparability_status", { length: 20 }).default('unknown'),
}, (table) => [
	index("comparison_assemblies_created_by_idx").using("btree", table.createdBy.asc().nullsLast().op("text_ops")),
	index("comparison_assemblies_assembly_type_idx").using("btree", table.assemblyType.asc().nullsLast().op("text_ops")),
	index("comparison_assemblies_status_idx").using("btree", table.status.asc().nullsLast().op("text_ops")),
	foreignKey({
		columns: [table.createdBy],
		foreignColumns: [platformUsers.id],
		name: "comparison_assemblies_created_by_fkey"
	}).onDelete("set null"),
	// Forward reference: matrixSchemaVersions is defined later in this file.
	// Drizzle defers the config callback, so the reference resolves at eval time.
	foreignKey({
		columns: [table.matrixSchemaVersionId],
		foreignColumns: [matrixSchemaVersions.id],
		name: "comparison_assemblies_matrix_schema_version_id_fkey"
	}).onDelete("set null"),
]);

// 对比对象：被比较的实体（型号/品牌/批次/阶段/部件/配置等），可绑定任务或报告，但不强制
export const comparisonObjects = pgTable("comparison_objects", {
	id: varchar({ length: 36 }).default(sql`gen_random_uuid()`).primaryKey().notNull(),
	assemblyId: varchar("assembly_id", { length: 36 }).notNull(),
	taskId: varchar("task_id", { length: 36 }),
	reportId: varchar("report_id", { length: 36 }),
	objectName: varchar("object_name", { length: 200 }).notNull(),
	objectType: varchar("object_type", { length: 60 }).notNull(),
	comparisonFactor: varchar("comparison_factor", { length: 100 }),
	brand: varchar("brand", { length: 100 }),
	model: varchar("model", { length: 100 }),
	specification: varchar("specification", { length: 200 }),
	materialStructure: varchar("material_structure", { length: 200 }),
	projectStage: varchar("project_stage", { length: 100 }),
	sampleBatch: varchar("sample_batch", { length: 100 }),
	objectSourceType: varchar("object_source_type", { length: 100 }),
	isCompetitor: boolean("is_competitor").default(false),
	parentProduct: varchar("parent_product", { length: 200 }),
	coverMaterialId: varchar("cover_material_id", { length: 36 }),
	customFields: jsonb("custom_fields").default({}),
	sortOrder: integer("sort_order").default(0).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("comparison_objects_assembly_id_idx").using("btree", table.assemblyId.asc().nullsLast().op("text_ops")),
	index("comparison_objects_sort_order_idx").using("btree", table.assemblyId.asc().nullsLast().op("text_ops"), table.sortOrder.asc().nullsLast().op("int4_ops")),
	foreignKey({
		columns: [table.assemblyId],
		foreignColumns: [comparisonAssemblies.id],
		name: "comparison_objects_assembly_id_fkey"
	}).onDelete("cascade"),
	foreignKey({
		columns: [table.taskId],
		foreignColumns: [experienceTasks.id],
		name: "comparison_objects_task_id_fkey"
	}).onDelete("set null"),
	foreignKey({
		columns: [table.reportId],
		foreignColumns: [reports.id],
		name: "comparison_objects_report_id_fkey"
	}).onDelete("set null"),
]);

// 对比项目树：可变层级结构（section/item/condition/process_node/metric/summary/issue_group）
// 自引用外键使用 .references() 字段级声明以避免 TypeScript 自身类型递归推导
export const comparisonItemNodes = pgTable("comparison_item_nodes", {
	id: varchar({ length: 36 }).default(sql`gen_random_uuid()`).primaryKey().notNull(),
	assemblyId: varchar("assembly_id", { length: 36 }).notNull(),
	parentId: varchar("parent_id", { length: 36 }).references((): AnyPgColumn => comparisonItemNodes.id, { onDelete: "cascade" }),
	nodeType: varchar("node_type", { length: 40 }).notNull(),
	nodeLabel: varchar("node_label", { length: 200 }).notNull(),
	sharedRecipe: jsonb("shared_recipe").default({}),
	config: jsonb("config").default({}),
	sortOrder: integer("sort_order").default(0).notNull(),
	depth: integer().default(0).notNull(),
	isCollapsed: boolean("is_collapsed").default(false),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("comparison_item_nodes_assembly_id_idx").using("btree", table.assemblyId.asc().nullsLast().op("text_ops")),
	index("comparison_item_nodes_parent_id_idx").using("btree", table.parentId.asc().nullsLast().op("text_ops")),
	index("comparison_item_nodes_assembly_sort_idx").using("btree", table.assemblyId.asc().nullsLast().op("text_ops"), table.sortOrder.asc().nullsLast().op("int4_ops")),
	foreignKey({
		columns: [table.assemblyId],
		foreignColumns: [comparisonAssemblies.id],
		name: "comparison_item_nodes_assembly_id_fkey"
	}).onDelete("cascade"),
]);

// 矩阵单元格：对比项目节点 × 对比对象的交叉数据单元
export const comparisonMatrixCells = pgTable("comparison_matrix_cells", {
	id: varchar({ length: 36 }).default(sql`gen_random_uuid()`).primaryKey().notNull(),
	assemblyId: varchar("assembly_id", { length: 36 }).notNull(),
	itemNodeId: varchar("item_node_id", { length: 36 }).notNull(),
	objectId: varchar("object_id", { length: 36 }).notNull(),
	params: jsonb("params").default({}),
	processNotes: jsonb("process_notes").default([]),
	effectSummary: text("effect_summary"),
	problemPoints: jsonb("problem_points").default([]),
	manualScore: varchar("manual_score", { length: 10 }),
	aiScore: varchar("ai_score", { length: 10 }),
	conclusionTag: varchar("conclusion_tag", { length: 40 }), // best | acceptable | average | risk | retest
	metricValues: jsonb("metric_values").default({}),
	mediaDisplayConfig: jsonb("media_display_config").default({}),
	aiStatus: varchar("ai_status", { length: 20 }).default('pending'), // pending | generated | confirmed | rejected | published
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("comparison_matrix_cells_assembly_id_idx").using("btree", table.assemblyId.asc().nullsLast().op("text_ops")),
	index("comparison_matrix_cells_item_node_id_idx").using("btree", table.itemNodeId.asc().nullsLast().op("text_ops")),
	index("comparison_matrix_cells_object_id_idx").using("btree", table.objectId.asc().nullsLast().op("text_ops")),
	unique("comparison_matrix_cells_item_object_key").on(table.itemNodeId, table.objectId),
	foreignKey({
		columns: [table.assemblyId],
		foreignColumns: [comparisonAssemblies.id],
		name: "comparison_matrix_cells_assembly_id_fkey"
	}).onDelete("cascade"),
	foreignKey({
		columns: [table.itemNodeId],
		foreignColumns: [comparisonItemNodes.id],
		name: "comparison_matrix_cells_item_node_id_fkey"
	}).onDelete("cascade"),
	foreignKey({
		columns: [table.objectId],
		foreignColumns: [comparisonObjects.id],
		name: "comparison_matrix_cells_object_id_fkey"
	}).onDelete("cascade"),
]);

// 指标定义库：管理员配置的可复用指标（如出汁率/纯汁率/含渣率）
export const metricDefinitions = pgTable("metric_definitions", {
	id: varchar({ length: 36 }).default(sql`gen_random_uuid()`).primaryKey().notNull(),
	productCategory: varchar("product_category", { length: 100 }),
	product: varchar("product", { length: 100 }),
	metricKey: varchar("metric_key", { length: 100 }).notNull(),
	metricName: varchar("metric_name", { length: 100 }).notNull(),
	metricType: varchar("metric_type", { length: 40 }).notNull(), // raw_value | calculated | text | duration | ratio | boolean
	unit: varchar("unit", { length: 40 }),
	defaultFormula: text("default_formula"),
	displayOrder: integer("display_order").default(0),
	isActive: boolean("is_active").default(true),
	createdBy: varchar("created_by", { length: 36 }),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("metric_definitions_key_idx").using("btree", table.metricKey.asc().nullsLast().op("text_ops")),
	index("metric_definitions_product_idx").using("btree", table.productCategory.asc().nullsLast().op("text_ops"), table.product.asc().nullsLast().op("text_ops")),
	unique("metric_definitions_key_product_key").on(table.metricKey, table.productCategory, table.product),
	foreignKey({
		columns: [table.createdBy],
		foreignColumns: [platformUsers.id],
		name: "metric_definitions_created_by_fkey"
	}).onDelete("set null"),
]);

// 指标公式版本：已发布报告固定使用发布时公式版本
export const metricFormulaVersions = pgTable("metric_formula_versions", {
	id: varchar({ length: 36 }).default(sql`gen_random_uuid()`).primaryKey().notNull(),
	metricDefinitionId: varchar("metric_definition_id", { length: 36 }).notNull(),
	formula: text().notNull(),
	formulaVersion: varchar("formula_version", { length: 40 }).notNull(),
	description: text(),
	createdBy: varchar("created_by", { length: 36 }),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	isActive: boolean("is_active").default(true),
}, (table) => [
	index("metric_formula_versions_definition_id_idx").using("btree", table.metricDefinitionId.asc().nullsLast().op("text_ops")),
	unique("metric_formula_versions_def_version_key").on(table.metricDefinitionId, table.formulaVersion),
	foreignKey({
		columns: [table.metricDefinitionId],
		foreignColumns: [metricDefinitions.id],
		name: "metric_formula_versions_definition_id_fkey"
	}).onDelete("cascade"),
]);

// 阈值规则：≥/≤/=/区间/文本判断，支持 assembly 或 item_node 级
export const metricThresholdRules = pgTable("metric_threshold_rules", {
	id: varchar({ length: 36 }).default(sql`gen_random_uuid()`).primaryKey().notNull(),
	assemblyId: varchar("assembly_id", { length: 36 }),
	itemNodeId: varchar("item_node_id", { length: 36 }),
	metricKey: varchar("metric_key", { length: 100 }).notNull(),
	operator: varchar("operator", { length: 20 }).notNull(), // >= | <= | = | between | text_match
	targetValue: varchar("target_value", { length: 100 }),
	targetText: text("target_text"),
	unit: varchar("unit", { length: 40 }),
	severity: varchar("severity", { length: 20 }).default('warning'), // pass | warning | fail | not_applicable
	sourceText: text("source_text"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("metric_threshold_rules_assembly_idx").using("btree", table.assemblyId.asc().nullsLast().op("text_ops")),
	index("metric_threshold_rules_item_node_idx").using("btree", table.itemNodeId.asc().nullsLast().op("text_ops")),
	foreignKey({
		columns: [table.assemblyId],
		foreignColumns: [comparisonAssemblies.id],
		name: "metric_threshold_rules_assembly_id_fkey"
	}).onDelete("cascade"),
	foreignKey({
		columns: [table.itemNodeId],
		foreignColumns: [comparisonItemNodes.id],
		name: "metric_threshold_rules_item_node_id_fkey"
	}).onDelete("cascade"),
]);

// 指标计算结果：单元格 × 指标键 的唯一计算结果
export const metricEvaluations = pgTable("metric_evaluations", {
	id: varchar({ length: 36 }).default(sql`gen_random_uuid()`).primaryKey().notNull(),
	cellId: varchar("cell_id", { length: 36 }).notNull(),
	metricKey: varchar("metric_key", { length: 100 }).notNull(),
	rawValue: jsonb("raw_value"),
	calculatedValue: varchar("calculated_value", { length: 100 }),
	displayValue: varchar("display_value", { length: 200 }),
	formulaVersionId: varchar("formula_version_id", { length: 36 }),
	thresholdRuleId: varchar("threshold_rule_id", { length: 36 }),
	passFailStatus: varchar("pass_fail_status", { length: 30 }), // pass | warning | fail | not_applicable
	evaluationNote: text("evaluation_note"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	// Data Matrix Input View — typed-value columns (raw + calculated) and provenance.
	valueKind: varchar("value_kind", { length: 20 }),
	numericValue: numeric("numeric_value", { precision: 18, scale: 6 }),
	textValue: text("text_value"),
	durationMs: bigint("duration_ms", { mode: "number" }),
	unitCode: varchar("unit_code", { length: 40 }),
	inputState: varchar("input_state", { length: 20 }).default('valid'),
	calculationMode: varchar("calculation_mode", { length: 20 }),
	formulaDefinitionId: varchar("formula_definition_id", { length: 36 }),
	sourceRunId: varchar("source_run_id", { length: 36 }),
	errorCode: varchar("error_code", { length: 60 }),
	version: integer("version").default(1),
}, (table) => [
	unique("metric_evaluations_cell_metric_key").on(table.cellId, table.metricKey),
	index("metric_evaluations_cell_id_idx").using("btree", table.cellId.asc().nullsLast().op("text_ops")),
	foreignKey({
		columns: [table.cellId],
		foreignColumns: [comparisonMatrixCells.id],
		name: "metric_evaluations_cell_id_fkey"
	}).onDelete("cascade"),
	foreignKey({
		columns: [table.formulaVersionId],
		foreignColumns: [metricFormulaVersions.id],
		name: "metric_evaluations_formula_version_id_fkey"
	}).onDelete("set null"),
	foreignKey({
		columns: [table.thresholdRuleId],
		foreignColumns: [metricThresholdRules.id],
		name: "metric_evaluations_threshold_rule_id_fkey"
	}).onDelete("set null"),
	// Forward reference: matrixCalculationRuns is defined later in this file.
	foreignKey({
		columns: [table.sourceRunId],
		foreignColumns: [matrixCalculationRuns.id],
		name: "metric_evaluations_source_run_id_fkey"
	}).onDelete("set null"),
]);

// 三层 AI 结果：cell/row/report 三层
export const comparisonAiResults = pgTable("comparison_ai_results", {
	id: varchar({ length: 36 }).default(sql`gen_random_uuid()`).primaryKey().notNull(),
	assemblyId: varchar("assembly_id", { length: 36 }).notNull(),
	level: varchar("level", { length: 20 }).notNull(), // cell | row | report
	targetId: varchar("target_id", { length: 36 }).notNull(), // cell_id | item_node_id | assembly_id
	skillKey: varchar("skill_key", { length: 100 }).notNull(),
	inputSnapshot: jsonb("input_snapshot").notNull(),
	output: jsonb("output").notNull(),
	status: varchar("status", { length: 20 }).default('generated').notNull(), // generated | confirmed | rejected | published
	confirmedBy: varchar("confirmed_by", { length: 36 }),
	confirmedAt: timestamp("confirmed_at", { withTimezone: true, mode: 'string' }),
	rejectedReason: text("rejected_reason"),
	modelConfigId: varchar("model_config_id", { length: 36 }),
	createdBy: varchar("created_by", { length: 36 }),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("comparison_ai_results_assembly_id_idx").using("btree", table.assemblyId.asc().nullsLast().op("text_ops")),
	index("comparison_ai_results_level_target_idx").using("btree", table.level.asc().nullsLast().op("text_ops"), table.targetId.asc().nullsLast().op("text_ops")),
	index("comparison_ai_results_status_idx").using("btree", table.status.asc().nullsLast().op("text_ops")),
	foreignKey({
		columns: [table.assemblyId],
		foreignColumns: [comparisonAssemblies.id],
		name: "comparison_ai_results_assembly_id_fkey"
	}).onDelete("cascade"),
	foreignKey({
			columns: [table.confirmedBy],
			foreignColumns: [platformUsers.id],
			name: "comparison_ai_results_confirmed_by_fkey"
		}).onDelete("set null"),
]);

// ============================================================
// Data Matrix Input View — schema registry / versioning / dimensions / formulas / calc runs
// ============================================================

// Matrix schema registry (admin-published, versioned)
export const matrixSchemas = pgTable("matrix_schemas", {
	id: varchar({ length: 36 }).default(sql`gen_random_uuid()`).primaryKey().notNull(),
	schemaKey: varchar("schema_key", { length: 100 }).notNull().unique(),
	name: varchar("name", { length: 200 }).notNull(),
	productCategory: varchar("product_category", { length: 100 }),
	experienceTypeAllowlist: jsonb("experience_type_allowlist").default([]),
	status: varchar("status", { length: 20 }).default('draft').notNull(),
	latestPublishedVersionId: varchar("latest_published_version_id", { length: 36 }),
	ownerId: varchar("owner_id", { length: 36 }),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	foreignKey({
			columns: [table.ownerId],
			foreignColumns: [platformUsers.id],
			name: "matrix_schemas_owner_id_fkey"
		}).onDelete("set null"),
]);

// Matrix schema versions (immutable once published)
export const matrixSchemaVersions = pgTable("matrix_schema_versions", {
	id: varchar({ length: 36 }).default(sql`gen_random_uuid()`).primaryKey().notNull(),
	schemaId: varchar("schema_id", { length: 36 }).notNull(),
	versionNo: integer("version_no").notNull(),
	status: varchar("status", { length: 20 }).default('draft').notNull(),
	schemaJson: jsonb("schema_json").notNull(),
	checksum: varchar("checksum", { length: 80 }),
	publishedAt: timestamp("published_at", { withTimezone: true, mode: 'string' }),
	publishedBy: varchar("published_by", { length: 36 }),
	effectiveFrom: timestamp("effective_from", { withTimezone: true, mode: 'string' }),
	effectiveTo: timestamp("effective_to", { withTimezone: true, mode: 'string' }),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	unique("matrix_schema_versions_schema_version_key").on(table.schemaId, table.versionNo),
	foreignKey({
			columns: [table.schemaId],
			foreignColumns: [matrixSchemas.id],
			name: "matrix_schema_versions_schema_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.publishedBy],
			foreignColumns: [platformUsers.id],
			name: "matrix_schema_versions_published_by_fkey"
		}).onDelete("set null"),
]);

// Matrix dimension bindings (columns/rows per schema version)
export const matrixDimensionBindings = pgTable("matrix_dimension_bindings", {
	id: varchar({ length: 36 }).default(sql`gen_random_uuid()`).primaryKey().notNull(),
	schemaVersionId: varchar("schema_version_id", { length: 36 }),
  fieldDefinitionId: varchar("field_definition_id", { length: 36 }),
	dimensionKey: varchar("dimension_key", { length: 100 }).notNull(),
	displayName: varchar("display_name", { length: 200 }).notNull(),
	columnGroup: varchar("column_group", { length: 20 }).notNull(),
	valueKind: varchar("value_kind", { length: 20 }).notNull(),
	unitCode: varchar("unit_code", { length: 40 }),
	metricDefinitionId: varchar("metric_definition_id", { length: 36 }),
	required: boolean("required").default(false),
	editable: boolean("editable").default(true),
	sortOrder: integer("sort_order").default(0).notNull(),
	displayFormatJson: jsonb("display_format_json").default({}),
	validationRuleJson: jsonb("validation_rule_json").default({}),
}, (table) => [
	unique("matrix_dimension_bindings_version_dimension_key").on(table.schemaVersionId, table.dimensionKey),
	foreignKey({
			columns: [table.schemaVersionId],
			foreignColumns: [matrixSchemaVersions.id],
			name: "matrix_dimension_bindings_schema_version_id_fkey"
		}).onDelete("cascade"),
	foreignKey({
			columns: [table.metricDefinitionId],
			foreignColumns: [metricDefinitions.id],
			name: "matrix_dimension_bindings_metric_definition_id_fkey"
		}).onDelete("set null"),
]);

// Matrix formula definitions (DSL-based calculated dimensions per schema version)
export const matrixFormulaDefinitions = pgTable("matrix_formula_definitions", {
	id: varchar({ length: 36 }).default(sql`gen_random_uuid()`).primaryKey().notNull(),
	schemaVersionId: varchar("schema_version_id", { length: 36 }),
  fieldDefinitionId: varchar("field_definition_id", { length: 36 }),
	outputDimensionKey: varchar("output_dimension_key", { length: 100 }).notNull(),
	formulaDsl: text("formula_dsl").notNull(),
	compiledAst: jsonb("compiled_ast"),
	dependencyJson: jsonb("dependency_json"),
	scope: varchar("scope", { length: 20 }).default('row').notNull(),
	formulaVersion: varchar("formula_version", { length: 40 }).notNull(),
	status: varchar("status", { length: 20 }).default('draft').notNull(),
}, (table) => [
	
	foreignKey({
			columns: [table.schemaVersionId],
			foreignColumns: [matrixSchemaVersions.id],
			name: "matrix_formula_definitions_schema_version_id_fkey"
		}).onDelete("cascade"),
]);

// Matrix calculation runs (audit trail of formula evaluations per matrix instance)
export const matrixCalculationRuns = pgTable("matrix_calculation_runs", {
	id: varchar({ length: 36 }).default(sql`gen_random_uuid()`).primaryKey().notNull(),
	matrixInstanceId: varchar("matrix_instance_id", { length: 36 }),
  taskMatrixId: varchar("task_matrix_id", { length: 36 }),
	triggerType: varchar("trigger_type", { length: 20 }).notNull(),
	inputVersionHash: varchar("input_version_hash", { length: 80 }).notNull(),
	formulaVersionHash: varchar("formula_version_hash", { length: 80 }).notNull(),
	status: varchar("status", { length: 20 }).notNull(),
	errorCode: varchar("error_code", { length: 60 }),
	errorDetailSanitized: text("error_detail_sanitized"),
	computedAt: timestamp("computed_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	traceId: varchar("trace_id", { length: 60 }),
}, (table) => [
	index("matrix_calculation_runs_instance_idx").using("btree", table.matrixInstanceId.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.matrixInstanceId],
			foreignColumns: [comparisonAssemblies.id],
			name: "matrix_calculation_runs_matrix_instance_id_fkey"
		}).onDelete("cascade"),
]);

// 报告快照：发布后内容冻结，分享页/PDF基于快照渲染
export const reportSnapshots = pgTable("report_snapshots", {
	id: varchar({ length: 36 }).default(sql`gen_random_uuid()`).primaryKey().notNull(),
	reportId: varchar("report_id", { length: 36 }).notNull(),
	reportType: varchar("report_type", { length: 40 }).notNull(),
	version: integer().notNull(),
	idempotencyKey: varchar("idempotency_key", { length: 100 }),
	idempotencyFingerprint: varchar("idempotency_fingerprint", { length: 64 }),
	snapshotJson: jsonb("snapshot_json").notNull(),
	layoutProfile: varchar("layout_profile", { length: 80 }).notNull(),
	createdBy: varchar("created_by", { length: 36 }),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	unique("report_snapshots_report_version_key").on(table.reportId, table.version),
	unique("report_snapshots_report_idempotency_key").on(table.reportId, table.idempotencyKey),
	index("report_snapshots_report_id_idx").using("btree", table.reportId.asc().nullsLast().op("text_ops")),
	foreignKey({
		columns: [table.reportId],
		foreignColumns: [reports.id],
		name: "report_snapshots_report_id_fkey"
	}).onDelete("cascade"),
]);

// PDF 生成任务：服务端 Playwright 渲染
export const pdfGenerationJobs = pgTable("pdf_generation_jobs", {
	id: varchar({ length: 36 }).default(sql`gen_random_uuid()`).primaryKey().notNull(),
	reportId: varchar("report_id", { length: 36 }).notNull(),
	snapshotId: varchar("snapshot_id", { length: 36 }).notNull(),
	layoutProfile: varchar("layout_profile", { length: 80 }).notNull(),
	status: varchar("status", { length: 30 }).default('queued').notNull(), // queued | rendering | completed | failed
	preflightResult: jsonb("preflight_result").default({}),
	filePath: text("file_path"),
	fileSize: integer("file_size"),
	errorMessage: text("error_message"),
	createdBy: varchar("created_by", { length: 36 }),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	startedAt: timestamp("started_at", { withTimezone: true, mode: 'string' }),
	finishedAt: timestamp("finished_at", { withTimezone: true, mode: 'string' }),
}, (table) => [
	index("pdf_generation_jobs_report_id_idx").using("btree", table.reportId.asc().nullsLast().op("text_ops")),
	index("pdf_generation_jobs_status_idx").using("btree", table.status.asc().nullsLast().op("text_ops")),
	foreignKey({
		columns: [table.reportId],
		foreignColumns: [reports.id],
		name: "pdf_generation_jobs_report_id_fkey"
	}).onDelete("cascade"),
	foreignKey({
		columns: [table.snapshotId],
		foreignColumns: [reportSnapshots.id],
		name: "pdf_generation_jobs_snapshot_id_fkey"
	}).onDelete("cascade"),
]);

// Excel 导入任务：异步解析，分阶段结果
export const excelImportJobs = pgTable("excel_import_jobs", {
	id: varchar({ length: 36 }).default(sql`gen_random_uuid()`).primaryKey().notNull(),
	fileName: varchar("file_name", { length: 300 }).notNull(),
	filePath: text("file_path").notNull(),
	parseStatus: varchar("parse_status", { length: 30 }).default('queued').notNull(), // queued | parsing | parsed | mapping_confirmed | draft_generated | failed
	detectedTemplateId: varchar("detected_template_id", { length: 36 }),
	detectedReportType: varchar("detected_report_type", { length: 60 }),
	parsedStructure: jsonb("parsed_structure").default({}),
	mappingResult: jsonb("mapping_result").default({}),
	createdBy: varchar("created_by", { length: 36 }),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	finishedAt: timestamp("finished_at", { withTimezone: true, mode: 'string' }),
	errorMessage: text("error_message"),
}, (table) => [
	index("excel_import_jobs_created_by_idx").using("btree", table.createdBy.asc().nullsLast().op("text_ops")),
	index("excel_import_jobs_parse_status_idx").using("btree", table.parseStatus.asc().nullsLast().op("text_ops")),
	foreignKey({
		columns: [table.createdBy],
		foreignColumns: [platformUsers.id],
		name: "excel_import_jobs_created_by_fkey"
	}).onDelete("set null"),
]);

// Excel 导入模板：推荐/品类/个人自定义
export const excelImportTemplates = pgTable("excel_import_templates", {
	id: varchar({ length: 36 }).default(sql`gen_random_uuid()`).primaryKey().notNull(),
	templateName: varchar("template_name", { length: 200 }).notNull(),
	templateType: varchar("template_type", { length: 40 }).notNull(), // platform_recommended | category | personal | one_time
	productCategory: varchar("product_category", { length: 100 }),
	structureRules: jsonb("structure_rules").notNull(),
	mappingRules: jsonb("mapping_rules").notNull(),
	isRecommended: boolean("is_recommended").default(false),
	createdBy: varchar("created_by", { length: 36 }),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("excel_import_templates_type_idx").using("btree", table.templateType.asc().nullsLast().op("text_ops")),
	index("excel_import_templates_recommended_idx").using("btree", table.isRecommended.asc().nullsLast().op("bool_ops")),
	foreignKey({
		columns: [table.createdBy],
		foreignColumns: [platformUsers.id],
		name: "excel_import_templates_created_by_fkey"
	}).onDelete("set null"),
]);

// ============================================================
// Data Matrix V2: task_matrices user-designed model (PRD V3.1 §3.4–3.8)
// Runtime task-matrix instances. Schema-registry tables (matrix_schemas etc.)
// remain for Wave 2 reusable-design-library.
// ============================================================

// Main matrix per task (PRD §3.4)
export const taskMatrices = pgTable("task_matrices", {
  id: varchar({ length: 36 }).default(sql`gen_random_uuid()`).primaryKey().notNull(),
  taskId: varchar("task_id", { length: 36 }).notNull(),
  name: varchar("name", { length: 100 }).notNull(),
  description: varchar("description", { length: 500 }),
  status: varchar("status", { length: 20 }).default('designing').notNull(),
  currentDesignVersionId: varchar("current_design_version_id", { length: 36 }),
  comparabilityStatus: varchar("comparability_status", { length: 20 }).default('not_applicable'),
  comparabilityStatement: text("comparability_statement"),
  createdBy: varchar("created_by", { length: 36 }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
  version: integer("version").default(1).notNull(),
  archivedAt: timestamp("archived_at", { withTimezone: true, mode: 'string' }),
  archivedReason: text("archived_reason"),
}, (table) => [
  unique("task_matrices_task_name_key").on(table.taskId, table.name),
  index("task_matrices_task_id_idx").using("btree", table.taskId.asc().nullsLast().op("text_ops")),
  index("task_matrices_created_by_idx").using("btree", table.createdBy.asc().nullsLast().op("text_ops")),
  index("task_matrices_status_idx").using("btree", table.status.asc().nullsLast().op("text_ops")),
  foreignKey({ columns: [table.taskId], foreignColumns: [experienceTasks.id], name: "task_matrices_task_id_fkey" }).onDelete("cascade"),
  foreignKey({ columns: [table.createdBy], foreignColumns: [platformUsers.id], name: "task_matrices_created_by_fkey" }).onDelete("set null"),
]);

// Design versions (PRD §3.5)
export const matrixDesignVersions = pgTable("matrix_design_versions", {
  id: varchar({ length: 36 }).default(sql`gen_random_uuid()`).primaryKey().notNull(),
  matrixId: varchar("matrix_id", { length: 36 }).notNull(),
  versionNo: integer("version_no").notNull(),
  status: varchar("status", { length: 20 }).default('draft').notNull(),
  designHash: varchar("design_hash", { length: 128 }),
  createdBy: varchar("created_by", { length: 36 }),
  confirmedBy: varchar("confirmed_by", { length: 36 }),
  confirmedAt: timestamp("confirmed_at", { withTimezone: true, mode: 'string' }),
  changeType: varchar("change_type", { length: 30 }).default('initial').notNull(),
  changeReason: text("change_reason"),
  createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
  unique("matrix_design_versions_matrix_version_key").on(table.matrixId, table.versionNo),
  index("matrix_design_versions_matrix_id_idx").using("btree", table.matrixId.asc().nullsLast().op("text_ops")),
  foreignKey({ columns: [table.matrixId], foreignColumns: [taskMatrices.id], name: "mdv_matrix_id_fkey" }).onDelete("cascade"),
  foreignKey({ columns: [table.createdBy], foreignColumns: [platformUsers.id], name: "mdv_created_by_fkey" }).onDelete("set null"),
  foreignKey({ columns: [table.confirmedBy], foreignColumns: [platformUsers.id], name: "mdv_confirmed_by_fkey" }).onDelete("set null"),
]);

// Field sections / partitions (PRD §3.6.1)
export const matrixSections = pgTable("matrix_sections", {
  id: varchar({ length: 36 }).default(sql`gen_random_uuid()`).primaryKey().notNull(),
  designVersionId: varchar("design_version_id", { length: 36 }).notNull(),
  name: varchar("name", { length: 100 }).notNull(),
  scope: varchar("scope", { length: 10 }).notNull(),
  description: text("description"),
  sortOrder: integer("sort_order").default(0).notNull(),
  isCollapsible: boolean("is_collapsible").default(true),
  defaultExpanded: boolean("default_expanded").default(true),
  createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
  unique("matrix_sections_dv_scope_name_key").on(table.designVersionId, table.scope, table.name),
  index("matrix_sections_dv_idx").using("btree", table.designVersionId.asc().nullsLast().op("text_ops")),
  foreignKey({ columns: [table.designVersionId], foreignColumns: [matrixDesignVersions.id], name: "ms_design_version_id_fkey" }).onDelete("cascade"),
]);

// Field definitions (PRD §3.7)
export const matrixFieldDefinitions = pgTable("matrix_field_definitions", {
  id: varchar({ length: 36 }).default(sql`gen_random_uuid()`).primaryKey().notNull(),
  designVersionId: varchar("design_version_id", { length: 36 }).notNull(),
  sectionId: varchar("section_id", { length: 36 }).notNull(),
  scope: varchar("scope", { length: 10 }).notNull(),
  label: varchar("label", { length: 100 }).notNull(),
  fieldKind: varchar("field_kind", { length: 20 }).notNull(),
  dataType: varchar("data_type", { length: 30 }).notNull(),
  requiredMode: varchar("required_mode", { length: 30 }).default('optional'),
  unitText: varchar("unit_text", { length: 30 }),
  displayFormat: varchar("display_format", { length: 20 }).default('plain_number'),
  decimalPlaces: smallint("decimal_places").default(1),
  minValue: numeric("min_value", { precision: 18, scale: 4 }),
  maxValue: numeric("max_value", { precision: 18, scale: 4 }),
  allowNotTested: boolean("allow_not_tested").default(true),
  allowNotApplicable: boolean("allow_not_applicable").default(true),
  showInDesktopGrid: boolean("show_in_desktop_grid").default(true),
  showInMobileCard: boolean("show_in_mobile_card").default(false),
  showInReport: boolean("show_in_report").default(true),
  reportPriority: varchar("report_priority", { length: 10 }).default('secondary'),
  enumOptions: jsonb("enum_options"),
  isResultStatusField: boolean("is_result_status_field").default(false),
  resultStatusMapping: jsonb("result_status_mapping"),
  requiredCondition: jsonb("required_condition"),
  maxMediaCount: smallint("max_media_count").default(10),
  allowedMediaTypes: jsonb("allowed_media_types").default('["image","video"]'),
  isCriticalEvidence: boolean("is_critical_evidence").default(false),
  uploadInstructions: text("upload_instructions"),
  sortOrder: integer("sort_order").default(0).notNull(),
  isArchived: boolean("is_archived").default(false),
  createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
  index("mfd_dv_idx").using("btree", table.designVersionId.asc().nullsLast().op("text_ops")),
  index("mfd_section_idx").using("btree", table.sectionId.asc().nullsLast().op("text_ops")),
  index("mfd_kind_idx").using("btree", table.fieldKind.asc().nullsLast().op("text_ops")),
  foreignKey({ columns: [table.designVersionId], foreignColumns: [matrixDesignVersions.id], name: "mfd_design_version_id_fkey" }).onDelete("cascade"),
  foreignKey({ columns: [table.sectionId], foreignColumns: [matrixSections.id], name: "mfd_section_id_fkey" }).onDelete("cascade"),
]);

// Groups within a matrix (PRD §3.3)
export const matrixGroups = pgTable("matrix_groups", {
  id: varchar({ length: 36 }).default(sql`gen_random_uuid()`).primaryKey().notNull(),
  matrixId: varchar("matrix_id", { length: 36 }).notNull(),
  groupLabel: varchar("group_label", { length: 200 }).notNull(),
  description: text("description"),
  sortOrder: integer("sort_order").default(0).notNull(),
  isArchived: boolean("is_archived").default(false),
  createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
  unique("matrix_groups_matrix_label_key").on(table.matrixId, table.groupLabel),
  index("matrix_groups_matrix_id_idx").using("btree", table.matrixId.asc().nullsLast().op("text_ops")),
  foreignKey({ columns: [table.matrixId], foreignColumns: [taskMatrices.id], name: "mg_matrix_id_fkey" }).onDelete("cascade"),
]);

// Rows within groups (PRD §3.3)
export const matrixRows = pgTable("matrix_rows", {
  id: varchar({ length: 36 }).default(sql`gen_random_uuid()`).primaryKey().notNull(),
  groupId: varchar("group_id", { length: 36 }).notNull(),
  matrixId: varchar("matrix_id", { length: 36 }).notNull(),
  rowLabel: varchar("row_label", { length: 200 }).notNull(),
  description: text("description"),
  sortOrder: integer("sort_order").default(0).notNull(),
  completionStatus: varchar("completion_status", { length: 20 }).default('pending'),
  testInvalidReason: text("test_invalid_reason"),
  isArchived: boolean("is_archived").default(false),
  version: integer("version").default(1).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
  unique("matrix_rows_group_label_key").on(table.groupId, table.rowLabel),
  index("matrix_rows_group_id_idx").using("btree", table.groupId.asc().nullsLast().op("text_ops")),
  index("matrix_rows_matrix_id_idx").using("btree", table.matrixId.asc().nullsLast().op("text_ops")),
  foreignKey({ columns: [table.groupId], foreignColumns: [matrixGroups.id], name: "mr_group_id_fkey" }).onDelete("cascade"),
  foreignKey({ columns: [table.matrixId], foreignColumns: [taskMatrices.id], name: "mr_matrix_id_fkey" }).onDelete("cascade"),
]);

// Field values per row (PRD §3.8)
export const matrixFieldValues = pgTable("matrix_field_values", {
  id: varchar({ length: 36 }).default(sql`gen_random_uuid()`).primaryKey().notNull(),
  rowId: varchar("row_id", { length: 36 }).notNull(),
  fieldDefinitionId: varchar("field_definition_id", { length: 36 }).notNull(),
  valueState: varchar("value_state", { length: 20 }).default('missing'),
  numericValue: numeric("numeric_value", { precision: 18, scale: 6 }),
  textValue: text("text_value"),
  durationMs: bigint("duration_ms", { mode: 'number' }),
  booleanValue: boolean("boolean_value"),
  dateTimeValue: timestamp("date_time_value", { withTimezone: true, mode: 'string' }),
  enumValue: varchar("enum_value", { length: 200 }),
  unitCode: varchar("unit_code", { length: 40 }),
  calculationMode: varchar("calculation_mode", { length: 20 }),
  formulaDefinitionId: varchar("formula_definition_id", { length: 36 }),
  formulaVersion: varchar("formula_version", { length: 40 }),
  sourceCalculationRunId: varchar("source_calculation_run_id", { length: 36 }),
  errorCode: varchar("error_code", { length: 60 }),
  version: integer("version").default(1).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
  unique("matrix_field_values_row_field_key").on(table.rowId, table.fieldDefinitionId),
  index("mfv_row_id_idx").using("btree", table.rowId.asc().nullsLast().op("text_ops")),
  index("mfv_fd_idx").using("btree", table.fieldDefinitionId.asc().nullsLast().op("text_ops")),
  foreignKey({ columns: [table.rowId], foreignColumns: [matrixRows.id], name: "mfv_row_id_fkey" }).onDelete("cascade"),
  foreignKey({ columns: [table.fieldDefinitionId], foreignColumns: [matrixFieldDefinitions.id], name: "mfv_fd_fkey" }).onDelete("cascade"),
]);

// Narratives: group-level and matrix-level (PRD §3.3)
export const matrixNarratives = pgTable("matrix_narratives", {
  id: varchar({ length: 36 }).default(sql`gen_random_uuid()`).primaryKey().notNull(),
  scope: varchar("scope", { length: 10 }).notNull(),
  matrixId: varchar("matrix_id", { length: 36 }),
  groupId: varchar("group_id", { length: 36 }),
  narrativeKey: varchar("narrative_key", { length: 50 }).default('summary').notNull(),
  content: text("content"),
  createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
  index("mn_matrix_id_idx").using("btree", table.matrixId.asc().nullsLast().op("text_ops")),
  index("mn_group_id_idx").using("btree", table.groupId.asc().nullsLast().op("text_ops")),
  foreignKey({ columns: [table.matrixId], foreignColumns: [taskMatrices.id], name: "mn_matrix_id_fkey" }).onDelete("cascade"),
  foreignKey({ columns: [table.groupId], foreignColumns: [matrixGroups.id], name: "mn_group_id_fkey" }).onDelete("cascade"),
]);

// ============================================================
// Data Matrix V3: dynamic Excel-like user-designed model (PRD V3.1.2.4 §8)
// 3-level hierarchy + merged row headers + column zones + cell styles +
// A1 cell-reference formulas + summary/note narrative blocks.
// V2 tables above are cold-retained for legacy read-only compatibility.
// ============================================================

// Extend task_matrices with current_view_definition_id
// (added via migration 0004; declared here for type access)
// Note: taskMatrices table already declared above; the column is added
// at SQL level. Drizzle type is augmented via a view table below for typed access.

export const matrixViewDefinitions = pgTable("matrix_view_definitions", {
  id: varchar({ length: 36 }).default(sql`gen_random_uuid()`).primaryKey().notNull(),
  matrixId: varchar("matrix_id", { length: 36 }).notNull(),
  versionNo: integer("version_no").notNull(),
  maxHierarchyLevel: integer("max_hierarchy_level").default(3).notNull(),
  leftFrozenColumnCount: integer("left_frozen_column_count").default(5).notNull(),
  formulaMode: varchar("formula_mode", { length: 40 }).default('relative_cell_reference').notNull(),
  styleMode: varchar("style_mode", { length: 40 }).default('basic_text_style').notNull(),
  status: varchar("status", { length: 20 }).default('draft').notNull(),
  designHash: varchar("design_hash", { length: 128 }),
  confirmedBy: varchar("confirmed_by", { length: 36 }),
  confirmedAt: timestamp("confirmed_at", { withTimezone: true, mode: 'string' }),
  createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
  unique("matrix_view_definitions_matrix_version_key").on(table.matrixId, table.versionNo),
  index("matrix_view_definitions_matrix_id_idx").using("btree", table.matrixId.asc().nullsLast().op("text_ops")),
  foreignKey({ columns: [table.matrixId], foreignColumns: [taskMatrices.id], name: "mvd_matrix_id_fkey" }).onDelete("cascade"),
  foreignKey({ columns: [table.confirmedBy], foreignColumns: [platformUsers.id], name: "mvd_confirmed_by_fkey" }).onDelete("set null"),
]);

export const matrixHierarchyNodes = pgTable("matrix_hierarchy_nodes", {
  id: varchar({ length: 36 }).default(sql`gen_random_uuid()`).primaryKey().notNull(),
  matrixId: varchar("matrix_id", { length: 36 }).notNull(),
  parentId: varchar("parent_id", { length: 36 }),
  level: integer("level").notNull(),
  nodeLabel: varchar("node_label", { length: 200 }).notNull(),
  nodeType: varchar("node_type", { length: 20 }).notNull(),
  sortOrder: integer("sort_order").default(0).notNull(),
  rowspanCache: integer("rowspan_cache"),
  createdBy: varchar("created_by", { length: 36 }),
  createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
  archivedAt: timestamp("archived_at", { withTimezone: true, mode: 'string' }),
}, (table) => [
  index("mhn_matrix_id_idx").using("btree", table.matrixId.asc().nullsLast().op("text_ops")),
  index("mhn_parent_id_idx").using("btree", table.parentId.asc().nullsLast().op("text_ops")),
  index("mhn_level_idx").using("btree", table.level.asc().nullsLast().op("text_ops")),
  foreignKey({ columns: [table.matrixId], foreignColumns: [taskMatrices.id], name: "mhn_matrix_id_fkey" }).onDelete("cascade"),
  // self-reference: parent_id -> matrix_hierarchy_nodes.id. Enforced at SQL layer
  // (migration 0004 section 2); declared here without typed foreignColumns to avoid
  // TS7022 self-referential initializer error.
]);

export const matrixLeafRows = pgTable("matrix_leaf_rows", {
  id: varchar({ length: 36 }).default(sql`gen_random_uuid()`).primaryKey().notNull(),
  matrixId: varchar("matrix_id", { length: 36 }).notNull(),
  level1NodeId: varchar("level_1_node_id", { length: 36 }).notNull(),
  level2NodeId: varchar("level_2_node_id", { length: 36 }),
  level3NodeId: varchar("level_3_node_id", { length: 36 }),
  visibleRowIndex: integer("visible_row_index").default(0).notNull(),
  groupRowIndex: integer("group_row_index").default(0).notNull(),
  status: varchar("status", { length: 20 }).default('active').notNull(),
  createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
  archivedAt: timestamp("archived_at", { withTimezone: true, mode: 'string' }),
}, (table) => [
  index("mlr_matrix_id_idx").using("btree", table.matrixId.asc().nullsLast().op("text_ops")),
  index("mlr_l1_idx").using("btree", table.level1NodeId.asc().nullsLast().op("text_ops")),
  index("mlr_l2_idx").using("btree", table.level2NodeId.asc().nullsLast().op("text_ops")),
  index("mlr_l3_idx").using("btree", table.level3NodeId.asc().nullsLast().op("text_ops")),
  index("mlr_visible_idx").using("btree", table.matrixId.asc().nullsLast().op("text_ops"), table.visibleRowIndex.asc().nullsLast().op("text_ops")),
  foreignKey({ columns: [table.matrixId], foreignColumns: [taskMatrices.id], name: "mlr_matrix_id_fkey" }).onDelete("cascade"),
  foreignKey({ columns: [table.level1NodeId], foreignColumns: [matrixHierarchyNodes.id], name: "mlr_l1_fkey" }).onDelete("cascade"),
  foreignKey({ columns: [table.level2NodeId], foreignColumns: [matrixHierarchyNodes.id], name: "mlr_l2_fkey" }).onDelete("set null"),
  foreignKey({ columns: [table.level3NodeId], foreignColumns: [matrixHierarchyNodes.id], name: "mlr_l3_fkey" }).onDelete("set null"),
]);

export const matrixColumnDefinitions = pgTable("matrix_column_definitions", {
  id: varchar({ length: 36 }).default(sql`gen_random_uuid()`).primaryKey().notNull(),
  matrixId: varchar("matrix_id", { length: 36 }).notNull(),
  columnZone: varchar("column_zone", { length: 40 }).notNull(),
  zoneRole: varchar("zone_role", { length: 20 }).default('A').notNull(),
  columnLabel: varchar("column_label", { length: 100 }).notNull(),
  dataType: varchar("data_type", { length: 30 }).notNull(),
  unitText: varchar("unit_text", { length: 30 }),
  displayOrder: integer("display_order").default(0).notNull(),
  desktopWidthPx: integer("desktop_width_px").default(140).notNull(),
  minWidthPx: integer("min_width_px").default(80),
  maxWidthPx: integer("max_width_px").default(480),
  isPinned: boolean("is_pinned").default(false).notNull(),
  isRequired: boolean("is_required").default(false).notNull(),
  showInReport: boolean("show_in_report").default(true).notNull(),
  maxMediaCount: integer("max_media_count"),
  resultFormat: varchar("result_format", { length: 20 }),
  decimalPlaces: integer("decimal_places").default(2),
  createdBy: varchar("created_by", { length: 36 }),
  createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
  archivedAt: timestamp("archived_at", { withTimezone: true, mode: 'string' }),
}, (table) => [
  index("mcd_matrix_id_idx").using("btree", table.matrixId.asc().nullsLast().op("text_ops")),
  index("mcd_zone_idx").using("btree", table.columnZone.asc().nullsLast().op("text_ops")),
  index("mcd_order_idx").using("btree", table.matrixId.asc().nullsLast().op("text_ops"), table.displayOrder.asc().nullsLast().op("text_ops")),
  foreignKey({ columns: [table.matrixId], foreignColumns: [taskMatrices.id], name: "mcd_matrix_id_fkey" }).onDelete("cascade"),
]);

export const matrixCellValues = pgTable("matrix_cell_values", {
  id: varchar({ length: 36 }).default(sql`gen_random_uuid()`).primaryKey().notNull(),
  matrixId: varchar("matrix_id", { length: 36 }).notNull(),
  leafRowId: varchar("leaf_row_id", { length: 36 }).notNull(),
  columnId: varchar("column_id", { length: 36 }).notNull(),
  valueText: text("value_text"),
  valueNumber: numeric("value_number", { precision: 18, scale: 6 }),
  valueDurationSeconds: integer("value_duration_seconds"),
  valuePercentage: numeric("value_percentage", { precision: 10, scale: 4 }),
  displayText: text("display_text"),
  valueState: varchar("value_state", { length: 30 }).default('empty').notNull(),
  errorCode: varchar("error_code", { length: 60 }),
  version: integer("version").default(1).notNull(),
  updatedBy: varchar("updated_by", { length: 36 }),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
  unique("matrix_cell_values_row_col_key").on(table.matrixId, table.leafRowId, table.columnId),
  index("mcv_matrix_row_idx").using("btree", table.matrixId.asc().nullsLast().op("text_ops"), table.leafRowId.asc().nullsLast().op("text_ops")),
  index("mcv_column_idx").using("btree", table.columnId.asc().nullsLast().op("text_ops")),
  index("mcv_state_idx").using("btree", table.valueState.asc().nullsLast().op("text_ops")),
  foreignKey({ columns: [table.matrixId], foreignColumns: [taskMatrices.id], name: "mcv_matrix_id_fkey" }).onDelete("cascade"),
  foreignKey({ columns: [table.leafRowId], foreignColumns: [matrixLeafRows.id], name: "mcv_leaf_row_fkey" }).onDelete("cascade"),
  foreignKey({ columns: [table.columnId], foreignColumns: [matrixColumnDefinitions.id], name: "mcv_column_fkey" }).onDelete("cascade"),
]);

export const matrixCellStyles = pgTable("matrix_cell_styles", {
  id: varchar({ length: 36 }).default(sql`gen_random_uuid()`).primaryKey().notNull(),
  matrixId: varchar("matrix_id", { length: 36 }).notNull(),
  targetType: varchar("target_type", { length: 30 }).notNull(),
  targetId: varchar("target_id", { length: 36 }).notNull(),
  fontColorToken: varchar("font_color_token", { length: 30 }),
  fontSizeToken: varchar("font_size_token", { length: 10 }),
  bold: boolean("bold").default(false).notNull(),
  italic: boolean("italic").default(false).notNull(),
  updatedBy: varchar("updated_by", { length: 36 }),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
  unique("matrix_cell_styles_target_key").on(table.matrixId, table.targetType, table.targetId),
  index("mcs_matrix_target_idx").using("btree", table.matrixId.asc().nullsLast().op("text_ops"), table.targetType.asc().nullsLast().op("text_ops"), table.targetId.asc().nullsLast().op("text_ops")),
  foreignKey({ columns: [table.matrixId], foreignColumns: [taskMatrices.id], name: "mcs_matrix_id_fkey" }).onDelete("cascade"),
]);

export const matrixFormulaDefinitionsV3 = pgTable("matrix_formula_definitions_v3", {
  id: varchar({ length: 36 }).default(sql`gen_random_uuid()`).primaryKey().notNull(),
  matrixId: varchar("matrix_id", { length: 36 }).notNull(),
  columnId: varchar("column_id", { length: 36 }).notNull(),
  expressionDisplay: text("expression_display").notNull(),
  expressionAst: jsonb("expression_ast").notNull(),
  referenceMode: varchar("reference_mode", { length: 40 }).default('relative_by_visible_row').notNull(),
  applyScope: varchar("apply_scope", { length: 20 }).default('matrix').notNull(),
  resultFormat: varchar("result_format", { length: 20 }).default('number').notNull(),
  decimalPlaces: integer("decimal_places").default(2).notNull(),
  status: varchar("status", { length: 20 }).default('active').notNull(),
  createdBy: varchar("created_by", { length: 36 }),
  createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
  index("mfd3_matrix_id_idx").using("btree", table.matrixId.asc().nullsLast().op("text_ops")),
  index("mfd3_column_id_idx").using("btree", table.columnId.asc().nullsLast().op("text_ops")),
  foreignKey({ columns: [table.matrixId], foreignColumns: [taskMatrices.id], name: "mfd3_matrix_id_fkey" }).onDelete("cascade"),
  foreignKey({ columns: [table.columnId], foreignColumns: [matrixColumnDefinitions.id], name: "mfd3_column_id_fkey" }).onDelete("cascade"),
]);

export const matrixFormulaRunsV3 = pgTable("matrix_formula_runs_v3", {
  id: varchar({ length: 36 }).default(sql`gen_random_uuid()`).primaryKey().notNull(),
  formulaId: varchar("formula_id", { length: 36 }).notNull(),
  matrixId: varchar("matrix_id", { length: 36 }).notNull(),
  leafRowId: varchar("leaf_row_id", { length: 36 }).notNull(),
  status: varchar("status", { length: 20 }).default('pending').notNull(),
  resultValue: numeric("result_value", { precision: 18, scale: 6 }),
  errorCode: varchar("error_code", { length: 60 }),
  dependencySnapshot: jsonb("dependency_snapshot"),
  createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
  index("mfr3_formula_id_idx").using("btree", table.formulaId.asc().nullsLast().op("text_ops")),
  index("mfr3_matrix_row_idx").using("btree", table.matrixId.asc().nullsLast().op("text_ops"), table.leafRowId.asc().nullsLast().op("text_ops")),
  foreignKey({ columns: [table.formulaId], foreignColumns: [matrixFormulaDefinitionsV3.id], name: "mfr3_formula_id_fkey" }).onDelete("cascade"),
]);

export const matrixNarrativeBlocks = pgTable("matrix_narrative_blocks", {
  id: varchar({ length: 36 }).default(sql`gen_random_uuid()`).primaryKey().notNull(),
  matrixId: varchar("matrix_id", { length: 36 }).notNull(),
  blockType: varchar("block_type", { length: 30 }).notNull(),
  scope: varchar("scope", { length: 20 }).default('matrix').notNull(),
  scopeNodeId: varchar("scope_node_id", { length: 36 }),
  content: text("content"),
  aiSuggestionId: varchar("ai_suggestion_id", { length: 36 }),
  showInReport: boolean("show_in_report").default(true).notNull(),
  sortOrder: integer("sort_order").default(0).notNull(),
  updatedBy: varchar("updated_by", { length: 36 }),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
  index("mnb_matrix_scope_idx").using("btree", table.matrixId.asc().nullsLast().op("text_ops"), table.scope.asc().nullsLast().op("text_ops")),
  index("mnb_node_idx").using("btree", table.scopeNodeId.asc().nullsLast().op("text_ops")),
  foreignKey({ columns: [table.matrixId], foreignColumns: [taskMatrices.id], name: "mnb_matrix_id_fkey" }).onDelete("cascade"),
  foreignKey({ columns: [table.scopeNodeId], foreignColumns: [matrixHierarchyNodes.id], name: "mnb_node_fkey" }).onDelete("cascade"),
]);

export const matrixIssuePoints = pgTable("matrix_issue_points", {
  id: varchar({ length: 36 }).default(sql`gen_random_uuid()`).primaryKey().notNull(),
  matrixId: varchar("matrix_id", { length: 36 }).notNull(),
  leafRowId: varchar("leaf_row_id", { length: 36 }).notNull(),
  columnId: varchar("column_id", { length: 36 }).notNull(),
  issueText: text("issue_text").notNull(),
  linkedIssueId: varchar("linked_issue_id", { length: 36 }),
  status: varchar("status", { length: 20 }).default('text').notNull(),
  createdBy: varchar("created_by", { length: 36 }),
  createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
  index("mip_matrix_id_idx").using("btree", table.matrixId.asc().nullsLast().op("text_ops")),
  index("mip_leaf_row_idx").using("btree", table.leafRowId.asc().nullsLast().op("text_ops")),
  index("mip_linked_issue_idx").using("btree", table.linkedIssueId.asc().nullsLast().op("text_ops")),
  foreignKey({ columns: [table.matrixId], foreignColumns: [taskMatrices.id], name: "mip_matrix_id_fkey" }).onDelete("cascade"),
  foreignKey({ columns: [table.leafRowId], foreignColumns: [matrixLeafRows.id], name: "mip_leaf_row_fkey" }).onDelete("cascade"),
  foreignKey({ columns: [table.columnId], foreignColumns: [matrixColumnDefinitions.id], name: "mip_column_fkey" }).onDelete("cascade"),
]);

// ============================================================
// MaterialAsset: material_links polymorphic binding + materials status
// PRD V3.1.2.4 §9 (ADR-04)
// ============================================================

export const materialLinks = pgTable("material_links", {
  id: varchar({ length: 36 }).default(sql`gen_random_uuid()`).primaryKey().notNull(),
  materialId: varchar("material_id", { length: 36 }).notNull(),
  targetType: varchar("target_type", { length: 40 }).notNull(),
  targetId: varchar("target_id", { length: 36 }).notNull(),
  bindingMethod: varchar("binding_method", { length: 30 }).default('click_select').notNull(),
  bindingOrder: integer("binding_order").default(0).notNull(),
  boundBy: varchar("bound_by", { length: 36 }),
  boundAt: timestamp("bound_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
  version: integer("version").default(1).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
  unique("material_links_material_target_key").on(table.materialId, table.targetType, table.targetId),
  index("ml_material_id_idx").using("btree", table.materialId.asc().nullsLast().op("text_ops")),
  index("ml_target_idx").using("btree", table.targetType.asc().nullsLast().op("text_ops"), table.targetId.asc().nullsLast().op("text_ops")),
  index("ml_bound_by_idx").using("btree", table.boundBy.asc().nullsLast().op("text_ops")),
  foreignKey({ columns: [table.materialId], foreignColumns: [materials.id], name: "ml_material_id_fkey" }).onDelete("cascade"),
]);

// ============================================================
// Hermes Agent Runtime + WeCom (PRD V3.1.2.4 §11, §12) — ADR-03
// Reuses ai_model_configs (no hermes_* config columns).
// ============================================================

export const agentInstances = pgTable("agent_instances", {
  id: varchar({ length: 36 }).default(sql`gen_random_uuid()`).primaryKey().notNull(),
  tenantId: varchar("tenant_id", { length: 36 }).default('default').notNull(),
  name: varchar("name", { length: 100 }).notNull(),
  status: varchar("status", { length: 20 }).default('draft').notNull(),
  modelConfigId: varchar("model_config_id", { length: 36 }),
  boundUserId: varchar("bound_user_id", { length: 36 }),
  description: text("description"),
  maxActiveConversations: integer("max_active_conversations").default(5),
  createdBy: varchar("created_by", { length: 36 }),
  createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
  index("ai_tenant_status_idx").using("btree", table.tenantId.asc().nullsLast().op("text_ops"), table.status.asc().nullsLast().op("text_ops")),
  index("ai_bound_user_idx").using("btree", table.boundUserId.asc().nullsLast().op("text_ops")),
]);

export const conversations = pgTable("conversations", {
  id: varchar({ length: 36 }).default(sql`gen_random_uuid()`).primaryKey().notNull(),
  tenantId: varchar("tenant_id", { length: 36 }).default('default').notNull(),
  agentInstanceId: varchar("agent_instance_id", { length: 36 }).notNull(),
  platformUserId: varchar("platform_user_id", { length: 36 }),
  wecomUserId: varchar("wecom_user_id", { length: 100 }),
  projectId: varchar("project_id", { length: 36 }),
  taskId: varchar("task_id", { length: 36 }),
  memoryNamespaceId: varchar("memory_namespace_id", { length: 36 }),
  title: varchar("title", { length: 200 }),
  status: varchar("status", { length: 20 }).default('active').notNull(),
  lastEventId: bigint("last_event_id", { mode: 'number' }).default(0).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
  index("conv_agent_idx").using("btree", table.agentInstanceId.asc().nullsLast().op("text_ops")),
  index("conv_user_idx").using("btree", table.platformUserId.asc().nullsLast().op("text_ops")),
  index("conv_task_idx").using("btree", table.taskId.asc().nullsLast().op("text_ops")),
  index("conv_status_idx").using("btree", table.status.asc().nullsLast().op("text_ops")),
  foreignKey({ columns: [table.agentInstanceId], foreignColumns: [agentInstances.id], name: "conv_agent_fkey" }).onDelete("cascade"),
]);

export const conversationMessages = pgTable("conversation_messages", {
  id: varchar({ length: 36 }).default(sql`gen_random_uuid()`).primaryKey().notNull(),
  conversationId: varchar("conversation_id", { length: 36 }).notNull(),
  role: varchar("role", { length: 20 }).notNull(),
  content: text("content"),
  toolCallId: varchar("tool_call_id", { length: 100 }),
  toolName: varchar("tool_name", { length: 100 }),
  eventSeq: bigint("event_seq", { mode: 'number' }).notNull(),
  modelName: varchar("model_name", { length: 200 }),
  tokensUsed: integer("tokens_used"),
  createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
  index("cm_conv_seq_idx").using("btree", table.conversationId.asc().nullsLast().op("text_ops"), table.eventSeq.asc().nullsLast().op("text_ops")),
  foreignKey({ columns: [table.conversationId], foreignColumns: [conversations.id], name: "cm_conv_fkey" }).onDelete("cascade"),
]);

export const agentRuns = pgTable("agent_runs", {
  id: varchar({ length: 36 }).default(sql`gen_random_uuid()`).primaryKey().notNull(),
  tenantId: varchar("tenant_id", { length: 36 }).default('default').notNull(),
  agentInstanceId: varchar("agent_instance_id", { length: 36 }).notNull(),
  conversationId: varchar("conversation_id", { length: 36 }),
  memoryNamespaceId: varchar("memory_namespace_id", { length: 36 }),
  trigger: varchar("trigger", { length: 40 }).default('manual').notNull(),
  status: varchar("status", { length: 20 }).default('running').notNull(),
  modelConfigSnapshot: jsonb("model_config_snapshot"),
  inputSummary: text("input_summary"),
  outputSummary: text("output_summary"),
  errorCode: varchar("error_code", { length: 60 }),
  traceId: varchar("trace_id", { length: 60 }).notNull(),
  startedAt: timestamp("started_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
  completedAt: timestamp("completed_at", { withTimezone: true, mode: 'string' }),
}, (table) => [
  unique("agent_runs_trace_id_key").on(table.traceId),
  index("ar_instance_idx").using("btree", table.agentInstanceId.asc().nullsLast().op("text_ops")),
  index("ar_conv_idx").using("btree", table.conversationId.asc().nullsLast().op("text_ops")),
  index("ar_status_idx").using("btree", table.status.asc().nullsLast().op("text_ops")),
  foreignKey({ columns: [table.agentInstanceId], foreignColumns: [agentInstances.id], name: "ar_instance_fkey" }).onDelete("cascade"),
  foreignKey({ columns: [table.conversationId], foreignColumns: [conversations.id], name: "ar_conv_fkey" }).onDelete("set null"),
]);

export const agentSuggestionBlocks = pgTable("agent_suggestion_blocks", {
  id: varchar({ length: 36 }).default(sql`gen_random_uuid()`).primaryKey().notNull(),
  agentRunId: varchar("agent_run_id", { length: 36 }).notNull(),
  blockType: varchar("block_type", { length: 40 }).notNull(),
  payload: jsonb("payload").notNull(),
  status: varchar("status", { length: 30 }).default('pending').notNull(),
  targetEntityType: varchar("target_entity_type", { length: 60 }),
  targetEntityId: varchar("target_entity_id", { length: 36 }),
  editedPayload: jsonb("edited_payload"),
  decidedBy: varchar("decided_by", { length: 36 }),
  decidedAt: timestamp("decided_at", { withTimezone: true, mode: 'string' }),
  expiresAt: timestamp("expires_at", { withTimezone: true, mode: 'string' }),
  createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
  index("asb_run_idx").using("btree", table.agentRunId.asc().nullsLast().op("text_ops")),
  index("asb_status_idx").using("btree", table.status.asc().nullsLast().op("text_ops")),
  foreignKey({ columns: [table.agentRunId], foreignColumns: [agentRuns.id], name: "asb_run_fkey" }).onDelete("cascade"),
]);

export const wecomBindings = pgTable("wecom_bindings", {
  id: varchar({ length: 36 }).default(sql`gen_random_uuid()`).primaryKey().notNull(),
  platformUserId: varchar("platform_user_id", { length: 36 }).notNull(),
  wecomUserId: varchar("wecom_user_id", { length: 100 }).notNull(),
  wecomCorpId: varchar("wecom_corp_id", { length: 100 }),
  provider: varchar("provider", { length: 20 }).default('wecom').notNull(),
  agentInstanceId: varchar("agent_instance_id", { length: 36 }),
  projectScope: jsonb("project_scope"),
  status: varchar("status", { length: 20 }).default('active').notNull(),
  boundBy: varchar("bound_by", { length: 36 }),
  createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
  unique("wecom_bindings_user_corp_key").on(table.wecomUserId, table.wecomCorpId),
  index("wb_platform_user_idx").using("btree", table.platformUserId.asc().nullsLast().op("text_ops")),
  foreignKey({ columns: [table.platformUserId], foreignColumns: [platformUsers.id], name: "wb_platform_user_fkey" }).onDelete("cascade"),
  foreignKey({ columns: [table.agentInstanceId], foreignColumns: [agentInstances.id], name: "wb_agent_fkey" }).onDelete("set null"),
]);

export const wecomMediaIngestJobs = pgTable("wecom_media_ingest_jobs", {
  id: varchar({ length: 36 }).default(sql`gen_random_uuid()`).primaryKey().notNull(),
  wecomMsgId: varchar("wecom_msg_id", { length: 100 }).notNull(),
  wecomMediaId: varchar("wecom_media_id", { length: 200 }).notNull(),
  mediaType: varchar("media_type", { length: 20 }).notNull(),
  wecomBindingId: varchar("wecom_binding_id", { length: 36 }),
  expiresAt: timestamp("expires_at", { withTimezone: true, mode: 'string' }).notNull(),
  downloadStatus: varchar("download_status", { length: 20 }).default('pending').notNull(),
  retryCount: integer("retry_count").default(0).notNull(),
  maxRetries: integer("max_retries").default(12).notNull(),
  lastError: text("last_error"),
  lastRetryAt: timestamp("last_retry_at", { withTimezone: true, mode: 'string' }),
  materialId: varchar("material_id", { length: 36 }),
  detectedProjectId: varchar("detected_project_id", { length: 36 }),
  detectedTaskId: varchar("detected_task_id", { length: 36 }),
  createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
  index("wmij_status_idx").using("btree", table.downloadStatus.asc().nullsLast().op("text_ops")),
  index("wmij_expires_idx").using("btree", table.expiresAt.asc().nullsLast().op("text_ops")),
  index("wmij_binding_idx").using("btree", table.wecomBindingId.asc().nullsLast().op("text_ops")),
]);

export const agentBindingSessions = pgTable("agent_binding_sessions", {
  id: varchar({ length: 36 }).default(sql`gen_random_uuid()`).primaryKey().notNull(),
  provider: varchar("provider", { length: 20 }).notNull(),
  platformUserId: varchar("platform_user_id", { length: 36 }).notNull(),
  agentInstanceId: varchar("agent_instance_id", { length: 36 }),
  status: varchar("status", { length: 20 }).default('pending').notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true, mode: 'string' }).notNull(),
  externalUserId: varchar("external_user_id", { length: 200 }),
  createdBy: varchar("created_by", { length: 36 }),
  createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
  consumedAt: timestamp("consumed_at", { withTimezone: true, mode: 'string' }),
}, (table) => [
  index("abs_status_expires_idx").using("btree", table.status.asc().nullsLast().op("text_ops"), table.expiresAt.asc().nullsLast().op("timestamptz_ops")),
  index("abs_platform_user_idx").using("btree", table.platformUserId.asc().nullsLast().op("text_ops")),
  foreignKey({ columns: [table.platformUserId], foreignColumns: [platformUsers.id], name: "abs_platform_user_fkey" }).onDelete("cascade"),
  foreignKey({ columns: [table.agentInstanceId], foreignColumns: [agentInstances.id], name: "abs_agent_fkey" }).onDelete("set null"),
]);
