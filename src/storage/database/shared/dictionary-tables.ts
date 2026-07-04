import { pgTable, varchar, integer, boolean, jsonb, timestamp, index, unique } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

/**
 * V3.1.1 §27.2.6 / §16.3 — Server-side dictionaries.
 *
 * Six dictionary tables replace hardcoded constant sets (I-01 PHASE_ORDER,
 * I-04 ISSUE_STATUSES etc.). All share the same shape:
 *   (code, label, sort_order, is_active, scope_filter jsonb)
 *
 * `code` is the stable machine token (also used as foreign key on business tables).
 * `label` is the display string.
 * `scope_filter` carries optional filter context (e.g. task_type, product_category)
 * so the same dict can branch by scope without a separate table per scope.
 *
 * Backward-compat: existing string columns on experience_tasks/issues/reports
 * continue to store the human label (e.g. `待整改`). The `code` column on the dict
 * table is the authoritative value going forward; reads follow the M0–M5 rename
 * discipline defined in V3.1 §14.4 / V3.1.1 §27.2.
 */

const dictColumns = {
  id: varchar({ length: 36 }).default(sql`gen_random_uuid()`).primaryKey().notNull(),
  code: varchar({ length: 64 }).notNull(),
  label: varchar({ length: 120 }).notNull(),
  sortOrder: integer("sort_order").default(0).notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  scopeFilter: jsonb("scope_filter").default({}),
  description: varchar({ length: 400 }),
  createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow(),
};

export const projectPhaseDict = pgTable(
  "project_phase_dict",
  {
    ...dictColumns,
  },
  (table) => [
    unique("project_phase_dict_code_uniq").on(table.code),
    index("project_phase_dict_sort_idx").using("btree", table.sortOrder.asc().nullsLast().op("int4_ops")),
    index("project_phase_dict_active_idx").using("btree", table.isActive.asc().nullsLast().op("bool_ops")),
  ],
);

export const issueStatusDict = pgTable(
  "issue_status_dict",
  {
    ...dictColumns,
  },
  (table) => [
    unique("issue_status_dict_code_uniq").on(table.code),
    index("issue_status_dict_sort_idx").using("btree", table.sortOrder.asc().nullsLast().op("int4_ops")),
    index("issue_status_dict_active_idx").using("btree", table.isActive.asc().nullsLast().op("bool_ops")),
  ],
);

export const taskStatusDict = pgTable(
  "task_status_dict",
  {
    ...dictColumns,
  },
  (table) => [
    unique("task_status_dict_code_uniq").on(table.code),
    index("task_status_dict_sort_idx").using("btree", table.sortOrder.asc().nullsLast().op("int4_ops")),
    index("task_status_dict_active_idx").using("btree", table.isActive.asc().nullsLast().op("bool_ops")),
  ],
);

export const reportStatusDict = pgTable(
  "report_status_dict",
  {
    ...dictColumns,
  },
  (table) => [
    unique("report_status_dict_code_uniq").on(table.code),
    index("report_status_dict_sort_idx").using("btree", table.sortOrder.asc().nullsLast().op("int4_ops")),
    index("report_status_dict_active_idx").using("btree", table.isActive.asc().nullsLast().op("bool_ops")),
  ],
);

export const issueSeverityDict = pgTable(
  "issue_severity_dict",
  {
    ...dictColumns,
  },
  (table) => [
    unique("issue_severity_dict_code_uniq").on(table.code),
    index("issue_severity_dict_sort_idx").using("btree", table.sortOrder.asc().nullsLast().op("int4_ops")),
    index("issue_severity_dict_active_idx").using("btree", table.isActive.asc().nullsLast().op("bool_ops")),
  ],
);

export const slaPolicyDict = pgTable(
  "sla_policy_dict",
  {
    ...dictColumns,
  },
  (table) => [
    unique("sla_policy_dict_code_uniq").on(table.code),
    index("sla_policy_dict_sort_idx").using("btree", table.sortOrder.asc().nullsLast().op("int4_ops")),
    index("sla_policy_dict_active_idx").using("btree", table.isActive.asc().nullsLast().op("bool_ops")),
  ],
);

export const dictionaryTables = {
  project_phase_dict: projectPhaseDict,
  issue_status_dict: issueStatusDict,
  task_status_dict: taskStatusDict,
  report_status_dict: reportStatusDict,
  issue_severity_dict: issueSeverityDict,
  sla_policy_dict: slaPolicyDict,
};

export type DictType = keyof typeof dictionaryTables;

export const DICT_TYPES: DictType[] = [
  'project_phase_dict',
  'issue_status_dict',
  'task_status_dict',
  'report_status_dict',
  'issue_severity_dict',
  'sla_policy_dict',
];