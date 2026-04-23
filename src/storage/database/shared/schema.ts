import { pgTable, serial, timestamp, varchar, text, boolean, integer, jsonb, index, date, unique } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"

// 系统表 - 必须保留
export const healthCheck = pgTable("health_check", {
  id: serial().notNull(),
  updated_at: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow(),
});

// 标准库
export const standards = pgTable(
  "standards",
  {
    id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
    standard_name: varchar("standard_name", { length: 200 }).notNull(),
    category: varchar("category", { length: 50 }).notNull(), // 通用标准/品类标准/感官评价标准/食谱功能标准
    product_category: varchar("product_category", { length: 50 }), // 关联品类（品类专用标准用）
    product: varchar("product", { length: 200 }), // 关联产品（品类专用标准用）
    version: varchar("version", { length: 20 }).default("V1.0"),
    is_active: boolean("is_active").default(true).notNull(),
    description: text("description"),
    sort_order: integer("sort_order").default(0),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    index("standards_category_idx").on(table.category),
    index("standards_product_category_idx").on(table.product_category),
  ]
);

// 标准检查项
export const standardItems = pgTable(
  "standard_items",
  {
    id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
    standard_id: varchar("standard_id", { length: 36 }).notNull().references(() => standards.id, { onDelete: "cascade" }),
    sort_order: integer("sort_order").default(0),
    sensory_dimension: varchar("sensory_dimension", { length: 20 }), // 感官维度：视觉/听觉/触觉/嗅觉/味觉
    test_phase: varchar("test_phase", { length: 50 }), // 产品使用阶段：开箱/首次安装/产品使用/清洁收纳
    experience_flow: varchar("experience_flow", { length: 100 }), // 体验流程（通用标准）
    touch_point: varchar("touch_point", { length: 200 }), // 触点（通用标准）
    check_dimension: varchar("check_dimension", { length: 50 }), // 检查维度（品类标准）
    sub_check_dimension: varchar("sub_check_dimension", { length: 100 }), // 细分检查维度（品类标准）
    check_item: varchar("check_item", { length: 200 }).notNull(), // 具体检查条目/触点
    check_requirement: text("check_requirement"), // 检验范围及具体要求/检查要求及区域
    experience_standard: text("experience_standard"), // 体验标准（通用标准）
    check_standard: text("check_standard"), // 检查标准（品类标准）
    measurement_position: varchar("measurement_position", { length: 200 }), // 测量位置
    check_tool: varchar("check_tool", { length: 100 }), // 测量工具/检查工具
    standard_a: varchar("standard_a", { length: 200 }),
    standard_b: varchar("standard_b", { length: 200 }),
    standard_c: varchar("standard_c", { length: 200 }),
    problem_level: varchar("problem_level", { length: 20 }), // 问题等级：一类/二类/三类
    evaluation_prep: text("evaluation_prep"), // 感官评价准备（感官评价标准）
    subjective_score: integer("subjective_score"), // 主观满意度分值（感官评价标准）
    subjective_rating: text("subjective_rating"), // 主观满意度描述（感官评价标准）
    reference_images: jsonb("reference_images"), // 参考图片（品类标准-检查要求及区域）
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("standard_items_standard_id_idx").on(table.standard_id),
    index("standard_items_sensory_idx").on(table.sensory_dimension),
  ]
);

// 体验任务
export const experienceTasks = pgTable(
  "experience_tasks",
  {
    id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
    task_name: varchar("task_name", { length: 200 }).notNull(),
    product_category: varchar("product_category", { length: 50 }).notNull(), // 品类
    product: varchar("product", { length: 200 }), // 产品
    product_model: varchar("product_model", { length: 50 }).notNull(),
    project_type: varchar("project_type", { length: 50 }), // 项目类型：ODM/OEM/竞品研究/自研/前期研究/改型降本优化/海外产品
    project_phase: varchar("project_phase", { length: 50 }), // 项目阶段（自研：手板研究/试制阶段/试产阶段/量产阶段）
    test_date: date("test_date"),
    organizer: varchar("organizer", { length: 50 }),
    created_by: varchar("created_by", { length: 36 }), // 创建者用户ID
    target_user: text("target_user"),
    test_purpose: text("test_purpose"),
    test_method: text("test_method"),
    status: varchar("status", { length: 20 }).default("待执行").notNull(), // 待执行/进行中/待审核/已完成/已驳回
    assigned_to: varchar("assigned_to", { length: 200 }), // 指派工程师，逗号分隔
    selected_standards: jsonb("selected_standards"), // 已选标准ID列表
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    index("experience_tasks_status_idx").on(table.status),
    index("experience_tasks_product_category_idx").on(table.product_category),
    index("experience_tasks_created_at_idx").on(table.created_at),
  ]
);

// 检查记录（走查）
export const checkRecords = pgTable(
  "check_records",
  {
    id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
    task_id: varchar("task_id", { length: 36 }).references(() => experienceTasks.id, { onDelete: "cascade" }),
    recipe_library_step_id: varchar("recipe_library_step_id", { length: 36 }),
    standard_item_id: varchar("standard_item_id", { length: 36 }), // 关联标准检查项
    standard_category: varchar("standard_category", { length: 50 }), // 标准类型：通用标准/品类标准/感官评价标准
    sensory_dimension: varchar("sensory_dimension", { length: 20 }),
    test_phase: varchar("test_phase", { length: 50 }),
    experience_flow: varchar("experience_flow", { length: 100 }), // 体验流程（通用标准）
    touch_point: varchar("touch_point", { length: 200 }), // 触点（通用标准）
    check_dimension: varchar("check_dimension", { length: 50 }),
    sub_check_dimension: varchar("sub_check_dimension", { length: 100 }), // 细分检查维度（品类标准）
    check_item: varchar("check_item", { length: 200 }).notNull(),
    check_requirement: text("check_requirement"),
    check_standard: text("check_standard"), // 检查标准（品类标准）
    experience_standard: text("experience_standard"), // 体验标准（通用标准）
    check_tool: text("check_tool"), // 测量工具（通用标准）
    problem_level: text("problem_level"), // 问题等级：一类/二类/三类
    evaluation_result: varchar("evaluation_result", { length: 20 }), // 合格/不合格/待定
    problem_description: text("problem_description"),
    measurement_position: varchar("measurement_position", { length: 200 }), // 测量位置（从标准引用）
    measurement_value: varchar("measurement_value", { length: 100 }),
    tester: varchar("tester", { length: 50 }),
    sort_order: integer("sort_order").default(0),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    index("check_records_task_id_idx").on(table.task_id),
    index("check_records_standard_item_id_idx").on(table.standard_item_id),
  ]
);

// 素材（图片/视频）
export const materials = pgTable(
  "materials",
  {
    id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
    record_id: varchar("record_id", { length: 36 }).references(() => checkRecords.id, { onDelete: "cascade" }),
    recipe_step_id: varchar("recipe_step_id", { length: 36 }).references(() => recipeSteps.id, { onDelete: "set null" }),
    task_id: varchar("task_id", { length: 36 }).notNull().references(() => experienceTasks.id, { onDelete: "cascade" }),
    material_type: varchar("material_type", { length: 10 }).notNull(), // image/video
    file_name: varchar("file_name", { length: 200 }),
    file_path: varchar("file_path", { length: 500 }),
    file_size: integer("file_size"), // bytes
    file_url: text("file_url"), // 访问URL
    duration_sec: integer("duration_sec"), // 视频时长（秒）
    thumbnail_url: text("thumbnail_url"), // 缩略图URL
    ai_analysis_status: varchar("ai_analysis_status", { length: 20 }).default("pending"), // pending/done
    ai_result: jsonb("ai_result"), // AI识别结果预留
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("materials_record_id_idx").on(table.record_id),
    index("materials_task_id_idx").on(table.task_id),
    index("materials_type_idx").on(table.material_type),
    index("materials_recipe_step_id_idx").on(table.recipe_step_id),
  ]
);

// 问题整改
export const issues = pgTable(
  "issues",
  {
    id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
    task_id: varchar("task_id", { length: 36 }).notNull().references(() => experienceTasks.id, { onDelete: "cascade" }),
    record_id: varchar("record_id", { length: 36 }).references(() => checkRecords.id, { onDelete: "set null" }),
    title: varchar("title", { length: 200 }).notNull(),
    product_model: varchar("product_model", { length: 50 }),
    category: varchar("category", { length: 50 }), // 问题分类
    sub_category: varchar("sub_category", { length: 50 }), // 子分类
    severity: varchar("severity", { length: 20 }), // 严重等级（兼容旧数据）
    priority: varchar("priority", { length: 20 }), // 优先级（兼容旧数据）
    level: varchar("level", { length: 20 }), // 问题点等级：一类/二类/三类（替代severity+priority）
    source: varchar("source", { length: 50 }), // 来源描述
    source_report_id: varchar("source_report_id", { length: 36 }), // 来源报告ID
    source_type: varchar("source_type", { length: 20 }), // record_fail / recipe_problem
    description: text("description"),
    is_improve: boolean("is_improve"), // 是否整改
    no_improve_reason: text("no_improve_reason"), // 不整改原因
    improve_plan: text("improve_plan"), // 整改方案
    responsible_dept: varchar("responsible_dept", { length: 50 }), // 责任部门
    responsible_person: varchar("responsible_person", { length: 50 }), // 责任人
    plan_complete_date: date("plan_complete_date"), // 计划完成时间
    actual_complete_date: date("actual_complete_date"), // 实际完成时间
    is_closed: boolean("is_closed").default(false), // 是否关闭
    status: varchar("status", { length: 20 }).default("待整改").notNull(), // 待整改/整改中/已验证/不整改
    verification_note: text("verification_note"), // 验证说明
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    index("issues_task_id_idx").on(table.task_id),
    index("issues_status_idx").on(table.status),
    index("issues_severity_idx").on(table.severity),
    index("issues_created_at_idx").on(table.created_at),
    unique("issues_unique_per_task").on(table.title, table.source_type, table.task_id),
  ]
);

// 报告模板
export const reportTemplates = pgTable(
  "report_templates",
  {
    id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
    template_name: varchar("template_name", { length: 200 }).notNull(),
    template_type: varchar("template_type", { length: 50 }), // 体验报告/问题报告/对比报告
    content: jsonb("content"), // 模板内容（结构化JSON）
    is_default: boolean("is_default").default(false),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  }
);

// 报告
export const reports = pgTable(
  "reports",
  {
    id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
    task_id: varchar("task_id", { length: 36 }).notNull().references(() => experienceTasks.id, { onDelete: "cascade" }),
    template_id: varchar("template_id", { length: 36 }).references(() => reportTemplates.id),
    title: varchar("title", { length: 200 }),
    content: jsonb("content"), // 报告内容
    product_model: varchar("product_model", { length: 50 }), // 产品型号（用于同型号合并）
    status: varchar("status", { length: 20 }).default("草稿").notNull(), // 草稿/待审核/已审核
    version: integer("version").default(1),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    index("reports_task_id_idx").on(table.task_id),
  ]
);

// 食谱/功能
export const recipes = pgTable(
  "recipes",
  {
    id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
    task_id: varchar("task_id", { length: 36 }).notNull().references(() => experienceTasks.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 200 }).notNull(),
    ingredients: text("ingredients"),
    recipe_type: varchar("recipe_type", { length: 20 }).default("食谱"), // 食谱/功能
    problem_count: integer("problem_count").default(0),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    index("recipes_task_id_idx").on(table.task_id),
  ]
);

// 食谱步骤
export const recipeSteps = pgTable(
  "recipe_steps",
  {
    id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
    recipe_id: varchar("recipe_id", { length: 36 }).notNull().references(() => recipes.id, { onDelete: "cascade" }),
    step_number: integer("step_number").notNull().default(1),
    operation: text("operation").notNull(),
    problem_point: text("problem_point"),
    problem_points: jsonb("problem_points").default([]),
    sort_order: integer("sort_order").default(0),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    index("recipe_steps_recipe_id_idx").on(table.recipe_id),
  ]
);

// 用户账号
export const platformUsers = pgTable(
  "platform_users",
  {
    id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
    account: varchar("account", { length: 50 }).notNull().unique(),
    password_hash: varchar("password_hash", { length: 200 }).notNull(),
    name: varchar("name", { length: 50 }),
    role: varchar("role", { length: 20 }).notNull().default("user"), // admin/user
    status: varchar("status", { length: 20 }).notNull().default("pending"), // pending/approved/rejected
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    index("platform_users_account_idx").on(table.account),
    index("platform_users_status_idx").on(table.status),
  ]
);

// 用户审核请求
export const platformAuditRequests = pgTable(
  "platform_audit_requests",
  {
    id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
    user_id: varchar("user_id", { length: 36 }).notNull().references(() => platformUsers.id, { onDelete: "cascade" }),
    request_type: varchar("request_type", { length: 30 }).notNull(), // register/password_reset/name_change/role_upgrade
    status: varchar("status", { length: 20 }).notNull().default("pending"), // pending/approved/rejected
    old_value: text("old_value"),
    new_value: text("new_value"),
    target_user_id: varchar("target_user_id", { length: 36 }),
    reviewed_by: varchar("reviewed_by", { length: 36 }).references(() => platformUsers.id),
    reviewed_at: timestamp("reviewed_at", { withTimezone: true }),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("platform_audit_requests_user_id_idx").on(table.user_id),
    index("platform_audit_requests_status_idx").on(table.status),
  ]
);

// 品类配置
export const platformCategories = pgTable(
  "platform_categories",
  {
    id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
    name: varchar("name", { length: 100 }).notNull().unique(),
    sort_order: integer("sort_order").default(0),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  }
);

// 报告分享
export const reportShares = pgTable(
  "report_shares",
  {
    id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
    report_id: varchar("report_id", { length: 36 }).notNull().references(() => reports.id, { onDelete: "cascade" }),
    share_token: varchar("share_token", { length: 64 }).notNull().unique(),
    expires_at: timestamp("expires_at", { withTimezone: true }),
    created_by: varchar("created_by", { length: 36 }).references(() => platformUsers.id),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("report_shares_share_token_idx").on(table.share_token),
    index("report_shares_report_id_idx").on(table.report_id),
  ]
);

// 产品配置
export const platformProducts = pgTable(
  "platform_products",
  {
    id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
    name: varchar("name", { length: 100 }).notNull(),
    category_id: varchar("category_id", { length: 36 }).notNull(),
    sort_order: integer("sort_order").default(0),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("platform_products_category_id_idx").on(table.category_id),
  ]
);

// 食谱库（按品类-产品分类的全局食谱标准）
export const recipeLibrary = pgTable(
  "recipe_library",
  {
    id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
    product_category: varchar("product_category", { length: 100 }),
    product: varchar("product", { length: 100 }),
    name: varchar("name", { length: 200 }).notNull(),
    ingredients: text("ingredients"),
    recipe_type: varchar("recipe_type", { length: 20 }).default("食谱"),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    index("recipe_library_product_idx").on(table.product_category, table.product),
  ]
);

// 食谱库步骤
export const recipeLibrarySteps = pgTable(
  "recipe_library_steps",
  {
    id: varchar("id", { length: 36 }).primaryKey().default(sql`gen_random_uuid()`),
    recipe_library_id: varchar("recipe_library_id", { length: 36 }).notNull().references(() => recipeLibrary.id, { onDelete: "cascade" }),
    step_number: integer("step_number").notNull().default(1),
    operation: text("operation").notNull(),
    problem_point: text("problem_point"),
    problem_points: jsonb("problem_points").default([]),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    index("recipe_library_steps_recipe_id_idx").on(table.recipe_library_id),
  ]
);

// 平台设置（管理员全局配置）
export const platformSettings = pgTable(
  "platform_settings",
  {
    key: varchar("key", { length: 100 }).primaryKey(),
    value: jsonb("value").notNull().default({}),
    updated_at: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  }
);
