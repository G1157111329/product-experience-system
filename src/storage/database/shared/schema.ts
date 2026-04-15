import { pgTable, serial, timestamp, varchar, text, boolean, integer, jsonb, index, date } from "drizzle-orm/pg-core"
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
    category: varchar("category", { length: 50 }).notNull(), // 通用标准/品类专用标准/感官评价标准
    product_category: varchar("product_category", { length: 50 }), // 关联品类（品类专用标准用）
    version: varchar("version", { length: 20 }).default("V1.0"),
    is_active: boolean("is_active").default(true).notNull(),
    description: text("description"),
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
    test_phase: varchar("test_phase", { length: 50 }), // 体验阶段：开箱/使用/清洁等
    check_dimension: varchar("check_dimension", { length: 50 }), // 检查维度：间隙/段差/表面质量等
    check_item: varchar("check_item", { length: 200 }).notNull(), // 具体检查条目
    check_requirement: text("check_requirement"), // 检查要求
    measurement_position: varchar("measurement_position", { length: 200 }), // 测量位置
    check_tool: varchar("check_tool", { length: 100 }), // 检查工具
    standard_a: varchar("standard_a", { length: 200 }), // A面标准
    standard_b: varchar("standard_b", { length: 200 }), // B面标准
    standard_c: varchar("standard_c", { length: 200 }), // C面标准
    problem_level: varchar("problem_level", { length: 20 }), // 问题等级
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
    product_category: varchar("product_category", { length: 50 }).notNull(),
    product_model: varchar("product_model", { length: 50 }).notNull(),
    project_phase: varchar("project_phase", { length: 50 }), // 新品开发/竞品对比/问题验证
    test_date: date("test_date"),
    organizer: varchar("organizer", { length: 50 }),
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
    task_id: varchar("task_id", { length: 36 }).notNull().references(() => experienceTasks.id, { onDelete: "cascade" }),
    standard_item_id: varchar("standard_item_id", { length: 36 }), // 关联标准检查项
    sensory_dimension: varchar("sensory_dimension", { length: 20 }),
    test_phase: varchar("test_phase", { length: 50 }),
    check_dimension: varchar("check_dimension", { length: 50 }),
    check_item: varchar("check_item", { length: 200 }).notNull(),
    check_requirement: text("check_requirement"),
    evaluation_result: varchar("evaluation_result", { length: 20 }), // 合格/不合格/待定
    problem_description: text("problem_description"),
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
    record_id: varchar("record_id", { length: 36 }).notNull().references(() => checkRecords.id, { onDelete: "cascade" }),
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
    severity: varchar("severity", { length: 20 }), // 严重等级：致命/严重/一般/轻微
    priority: varchar("priority", { length: 20 }), // 优先级：P0/P1/P2/P3
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
    status: varchar("status", { length: 20 }).default("草稿").notNull(), // 草稿/待审核/已审核
    version: integer("version").default(1),
    created_at: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updated_at: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    index("reports_task_id_idx").on(table.task_id),
  ]
);
