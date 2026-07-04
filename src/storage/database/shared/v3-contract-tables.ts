import { pgTable, varchar, integer, boolean, jsonb, timestamp, text, index, unique, foreignKey, date } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

/**
 * V3.1 §16.2 — Five contract tables + §16.3 process tables.
 *
 * The contract layer separates "what a report says" (semantic content) from
 * "how a report is rendered" (display strategy). Reports stop storing giant
 * ad-hoc JSONB blobs; instead each report row references a `report_view_config`
 * that pins its scope_type and render_profile, and the actual content lives in
 * normalized `report_outline_sections` + `report_action_items` rows.
 *
 * Migration discipline (V3.1 §14.4 / §24):
 *   - Existing `reports.content` JSONB is preserved as-is.
 *   - A backfill job (Wave 1 P0) parses the JSONB into the new tables.
 *   - Dual-read: UI falls back to JSONB when contract rows are missing.
 *   - Once all reports are backfilled, JSONB column is frozen (read-only) and
 *     new writes go exclusively through contract tables.
 */

const idCol = varchar({ length: 36 }).default(sql`gen_random_uuid()`).primaryKey().notNull();
const createdAt = timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull();
const updatedAt = timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow();

// ─────────────────────────────────────────────────────────────────────────────
// Contract table 1/5: report_view_configs
// Pins (report_id, scope_type, render_profile, version) for a report.
// One row per report — describes what the report IS, semantically.
// ─────────────────────────────────────────────────────────────────────────────
export const reportViewConfigs = pgTable(
  "report_view_configs",
  {
    id: idCol,
    reportId: varchar("report_id", { length: 36 }).notNull(),
    reportScopeType: varchar("report_scope_type", { length: 40 }).notNull(),
    // 6 render_profile values per V3.1 §16.2:
    //   single_narrative | comparison_matrix | metric_emphasis |
    //   mixed_comparison | stage_timeline | synthesis
    renderProfile: varchar("render_profile", { length: 40 }).notNull(),
    version: integer("version").default(1).notNull(),
    titleOverride: varchar("title_override", { length: 200 }),
    summaryOverride: text("summary_override"),
    isArchived: boolean("is_archived").default(false).notNull(),
    configJson: jsonb("config_json").default({}),
    createdAt,
    updatedAt,
  },
  (table) => [
    unique("report_view_configs_report_uniq").on(table.reportId, table.version),
    index("report_view_configs_scope_idx").using("btree", table.reportScopeType.asc().nullsLast().op("text_ops")),
    index("report_view_configs_profile_idx").using("btree", table.renderProfile.asc().nullsLast().op("text_ops")),
  ],
);

// ─────────────────────────────────────────────────────────────────────────────
// Contract table 2/5: report_outline_sections
// Ordered outline nodes that make up a report (e.g. "功能效果", "问题点列表",
// "阶段汇总"). Each section has a type and a structured payload.
// ─────────────────────────────────────────────────────────────────────────────
export const reportOutlineSections = pgTable(
  "report_outline_sections",
  {
    id: idCol,
    reportId: varchar("report_id", { length: 36 }).notNull(),
    viewConfigId: varchar("view_config_id", { length: 36 }).notNull(),
    sectionType: varchar("section_type", { length: 60 }).notNull(),
    sectionKey: varchar("section_key", { length: 80 }).notNull(),
    title: varchar("title", { length: 200 }).notNull(),
    sortOrder: integer("sort_order").default(0).notNull(),
    isCollapsible: boolean("is_collapsible").default(true).notNull(),
    defaultCollapsed: boolean("default_collapsed").default(false).notNull(),
    payload: jsonb("payload").default({}),
    createdAt,
    updatedAt,
  },
  (table) => [
    unique("report_outline_sections_key_uniq").on(table.reportId, table.sectionKey),
    index("report_outline_sections_report_idx").using("btree", table.reportId.asc().nullsLast().op("text_ops"), table.sortOrder.asc().nullsLast().op("int4_ops")),
    index("report_outline_sections_view_idx").using("btree", table.viewConfigId.asc().nullsLast().op("text_ops")),
    foreignKey({
      name: "report_outline_sections_view_config_fkey",
      columns: [table.viewConfigId],
      foreignColumns: [reportViewConfigs.id],
    }).onDelete("cascade"),
  ],
);

// ─────────────────────────────────────────────────────────────────────────────
// Contract table 3/5: report_action_items
// Clickable items inside a report (problem points, function-effect rows,
// rectification prompts). Each item links back to its source entity so clicks
// can deep-link into the issues module.
// ─────────────────────────────────────────────────────────────────────────────
export const reportActionItems = pgTable(
  "report_action_items",
  {
    id: idCol,
    reportId: varchar("report_id", { length: 36 }).notNull(),
    viewConfigId: varchar("view_config_id", { length: 36 }).notNull(),
    sectionId: varchar("section_id", { length: 36 }),
    // action_type: problem_point | function_effect | rectification_prompt |
    //               stage_marker | synthesis_note
    actionType: varchar("action_type", { length: 40 }).notNull(),
    sortOrder: integer("sort_order").default(0).notNull(),
    // Polymorphic link to source entity
    sourceType: varchar("source_type", { length: 40 }),
    sourceId: varchar("source_id", { length: 36 }),
    // Display fields
    title: varchar("title", { length: 200 }),
    summary: text("summary"),
    payload: jsonb("payload").default({}),
    // Whether clicking should pop the rectification dialog vs. navigate
    clickAction: varchar("click_action", { length: 40 }),
    clickTargetUrl: varchar("click_target_url", { length: 500 }),
    isResolved: boolean("is_resolved").default(false).notNull(),
    createdAt,
    updatedAt,
  },
  (table) => [
    index("report_action_items_report_idx").using("btree", table.reportId.asc().nullsLast().op("text_ops"), table.sortOrder.asc().nullsLast().op("int4_ops")),
    index("report_action_items_source_idx").using("btree", table.sourceType.asc().nullsLast().op("text_ops"), table.sourceId.asc().nullsLast().op("text_ops")),
    index("report_action_items_section_idx").using("btree", table.sectionId.asc().nullsLast().op("text_ops")),
    foreignKey({
      name: "report_action_items_view_config_fkey",
      columns: [table.viewConfigId],
      foreignColumns: [reportViewConfigs.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "report_action_items_section_fkey",
      columns: [table.sectionId],
      foreignColumns: [reportOutlineSections.id],
    }).onDelete("set null"),
  ],
);

// ─────────────────────────────────────────────────────────────────────────────
// Contract table 4/5: export_jobs (PDF / Excel generation queue)
// Per V3.1 §16.2, replaces the older pdf_generation_jobs + excel_import_jobs
// dual-purpose pattern with a unified export queue. The legacy tables remain
// for backward compat; new writes go to export_jobs.
// ─────────────────────────────────────────────────────────────────────────────
export const exportJobs = pgTable(
  "export_jobs",
  {
    id: idCol,
    jobId: varchar("job_id", { length: 40 }).notNull(),
    jobType: varchar("job_type", { length: 20 }).notNull(), // pdf | excel
    reportId: varchar("report_id", { length: 36 }),
    viewConfigId: varchar("view_config_id", { length: 36 }),
    requestedBy: varchar("requested_by", { length: 36 }),
    status: varchar("status", { length: 20 }).default("queued").notNull(), // queued | running | succeeded | failed | cancelled
    priority: integer("priority").default(0).notNull(),
    params: jsonb("params").default({}),
    resultUrl: varchar("result_url", { length: 500 }),
    resultSizeBytes: integer("result_size_bytes"),
    errorMessage: text("error_message"),
    attempts: integer("attempts").default(0).notNull(),
    maxAttempts: integer("max_attempts").default(3).notNull(),
    idempotencyKey: varchar("idempotency_key", { length: 100 }),
    traceId: varchar("trace_id", { length: 64 }),
    queuedAt: timestamp("queued_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
    startedAt: timestamp("started_at", { withTimezone: true, mode: 'string' }),
    finishedAt: timestamp("finished_at", { withTimezone: true, mode: 'string' }),
    createdAt,
    updatedAt,
  },
  (table) => [
    unique("export_jobs_job_id_uniq").on(table.jobId),
    index("export_jobs_status_idx").using("btree", table.status.asc().nullsLast().op("text_ops"), table.priority.desc().op("int4_ops"), table.queuedAt.asc().nullsLast().op("timestamptz_ops")),
    index("export_jobs_report_idx").using("btree", table.reportId.asc().nullsLast().op("text_ops")),
    index("export_jobs_idem_idx").using("btree", table.idempotencyKey.asc().nullsLast().op("text_ops")),
  ],
);

// ─────────────────────────────────────────────────────────────────────────────
// Contract table 5/5: render_profiles (named display strategies)
// A library of reusable render strategies (font scale, section collapse defaults,
// color theme, comparison matrix cell layout) that can be referenced by name
// from report_view_configs.
// ─────────────────────────────────────────────────────────────────────────────
export const renderProfiles = pgTable(
  "render_profiles",
  {
    id: idCol,
    profileKey: varchar("profile_key", { length: 40 }).notNull(),
    displayName: varchar("display_name", { length: 120 }).notNull(),
    description: text("description"),
    fontFamily: varchar("font_family", { length: 80 }),
    fontScale: varchar("font_scale", { length: 20 }).default("medium"),
    colorTheme: varchar("color_theme", { length: 40 }).default("default"),
    cellLayout: varchar("cell_layout", { length: 40 }).default("default"),
    defaultCollapsedSections: jsonb("default_collapsed_sections").default([]),
    configJson: jsonb("config_json").default({}),
    isActive: boolean("is_active").default(true).notNull(),
    createdAt,
    updatedAt,
  },
  (table) => [
    unique("render_profiles_key_uniq").on(table.profileKey),
    index("render_profiles_active_idx").using("btree", table.isActive.asc().nullsLast().op("bool_ops")),
  ],
);

// ─────────────────────────────────────────────────────────────────────────────
// Process table: report_print_blocks
// Per V3.1 §16.2: when a report is rendered for PDF/print, its sections are
// materialized into ordered print_blocks. This decouples screen layout from
// page-break-aware print layout.
// ─────────────────────────────────────────────────────────────────────────────
export const reportPrintBlocks = pgTable(
  "report_print_blocks",
  {
    id: idCol,
    reportId: varchar("report_id", { length: 36 }).notNull(),
    viewConfigId: varchar("view_config_id", { length: 36 }).notNull(),
    exportJobId: varchar("export_job_id", { length: 36 }),
    blockType: varchar("block_type", { length: 40 }).notNull(), // cover | toc | section | action_list | page_break | footer
    sortOrder: integer("sort_order").default(0).notNull(),
    pageStart: integer("page_start"),
    pageEnd: integer("page_end"),
    contentHtml: text("content_html"),
    payload: jsonb("payload").default({}),
    createdAt,
  },
  (table) => [
    index("report_print_blocks_report_idx").using("btree", table.reportId.asc().nullsLast().op("text_ops"), table.sortOrder.asc().nullsLast().op("int4_ops")),
    index("report_print_blocks_export_idx").using("btree", table.exportJobId.asc().nullsLast().op("text_ops")),
    foreignKey({
      name: "report_print_blocks_view_config_fkey",
      columns: [table.viewConfigId],
      foreignColumns: [reportViewConfigs.id],
    }).onDelete("cascade"),
  ],
);

// ─────────────────────────────────────────────────────────────────────────────
// Process table: issue_occurrences
// Per V3.1 §16.3: a problem point (issue主档) can appear in multiple reports /
// stages. The main `issues` row stays stable; each appearance is an occurrence
// row with its own context (phase, date, report_id).
// ─────────────────────────────────────────────────────────────────────────────
export const issueOccurrences = pgTable(
  "issue_occurrences",
  {
    id: idCol,
    issueId: varchar("issue_id", { length: 36 }).notNull(),
    reportId: varchar("report_id", { length: 36 }),
    taskId: varchar("task_id", { length: 36 }),
    projectPhase: varchar("project_phase", { length: 40 }),
    occurredOn: date("occurred_on"),
    occurrenceNote: text("occurrence_note"),
    evidenceRefs: jsonb("evidence_refs").default([]),
    createdAt,
  },
  (table) => [
    index("issue_occurrences_issue_idx").using("btree", table.issueId.asc().nullsLast().op("text_ops"), table.createdAt.desc().op("timestamptz_ops")),
    index("issue_occurrences_report_idx").using("btree", table.reportId.asc().nullsLast().op("text_ops")),
    index("issue_occurrences_phase_idx").using("btree", table.projectPhase.asc().nullsLast().op("text_ops")),
  ],
);

// ─────────────────────────────────────────────────────────────────────────────
// Process table: rectification_actions
// Per V3.1 §16.3: tracks the lifecycle of a fix for an issue. One issue may
// have multiple rectification attempts over time.
// ─────────────────────────────────────────────────────────────────────────────
export const rectificationActions = pgTable(
  "rectification_actions",
  {
    id: idCol,
    issueId: varchar("issue_id", { length: 36 }).notNull(),
    actionPlan: text("action_plan").notNull(),
    responsiblePerson: varchar("responsible_person", { length: 80 }),
    responsibleDept: varchar("responsible_dept", { length: 80 }),
    planCompleteDate: date("plan_complete_date"),
    actualCompleteDate: date("actual_complete_date"),
    status: varchar("status", { length: 20 }).default("planned").notNull(), // planned | in_progress | completed | abandoned
    note: text("note"),
    createdBy: varchar("created_by", { length: 36 }),
    createdAt,
    updatedAt,
  },
  (table) => [
    index("rectification_actions_issue_idx").using("btree", table.issueId.asc().nullsLast().op("text_ops"), table.createdAt.desc().op("timestamptz_ops")),
    index("rectification_actions_status_idx").using("btree", table.status.asc().nullsLast().op("text_ops")),
  ],
);

// ─────────────────────────────────────────────────────────────────────────────
// Process table: verifications
// Per V3.1 §16.3: re-test records tied to a rectification_action. An action is
// only "verified" once a verification row confirms the fix held.
// ─────────────────────────────────────────────────────────────────────────────
export const verifications = pgTable(
  "verifications",
  {
    id: idCol,
    rectificationActionId: varchar("rectification_action_id", { length: 36 }).notNull(),
    issueId: varchar("issue_id", { length: 36 }).notNull(),
    result: varchar("result", { length: 20 }).notNull(), // passed | failed | partial
    note: text("note"),
    verifiedBy: varchar("verified_by", { length: 36 }),
    verifiedAt: timestamp("verified_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
    evidenceRefs: jsonb("evidence_refs").default([]),
    createdAt,
  },
  (table) => [
    index("verifications_action_idx").using("btree", table.rectificationActionId.asc().nullsLast().op("text_ops"), table.verifiedAt.desc().op("timestamptz_ops")),
    index("verifications_issue_idx").using("btree", table.issueId.asc().nullsLast().op("text_ops")),
    foreignKey({
      name: "verifications_action_fkey",
      columns: [table.rectificationActionId],
      foreignColumns: [rectificationActions.id],
    }).onDelete("cascade"),
  ],
);

// ─────────────────────────────────────────────────────────────────────────────
// Process table: report_summaries
// Per V3.1 §16.3: AI-drafted summary that the user can edit. The summary is
// scoped to a report_view_config so different render profiles can have
// different summaries. `is_ai_draft` must be false before publication
// (V3.1 §14.3 — AI cannot self-publish).
// ─────────────────────────────────────────────────────────────────────────────
export const reportSummaries = pgTable(
  "report_summaries",
  {
    id: idCol,
    reportId: varchar("report_id", { length: 36 }).notNull(),
    viewConfigId: varchar("view_config_id", { length: 36 }).notNull(),
    summaryText: text("summary_text").notNull(),
    isAiDraft: boolean("is_ai_draft").default(false).notNull(),
    isPublished: boolean("is_published").default(false).notNull(),
    authoredBy: varchar("authored_by", { length: 36 }),
    publishedBy: varchar("published_by", { length: 36 }),
    publishedAt: timestamp("published_at", { withTimezone: true, mode: 'string' }),
    version: integer("version").default(1).notNull(),
    createdAt,
    updatedAt,
  },
  (table) => [
    index("report_summaries_view_idx").using("btree", table.viewConfigId.asc().nullsLast().op("text_ops"), table.version.desc().op("int4_ops")),
    index("report_summaries_published_idx").using("btree", table.isPublished.asc().nullsLast().op("bool_ops")),
    foreignKey({
      name: "report_summaries_view_config_fkey",
      columns: [table.viewConfigId],
      foreignColumns: [reportViewConfigs.id],
    }).onDelete("cascade"),
  ],
);

// ─────────────────────────────────────────────────────────────────────────────
// Process table: ai_runs
// Per V3.1 §14.3 / §16.3: every AI invocation is audited here. Holds the
// provider, model, prompt digest, result digest, trace_id, and the human
// review decision. Required for the "AI cannot self-publish" gate.
// ─────────────────────────────────────────────────────────────────────────────
export const aiRuns = pgTable(
  "ai_runs",
  {
    id: idCol,
    runId: varchar("run_id", { length: 40 }).notNull(),
    traceId: varchar("trace_id", { length: 64 }),
    provider: varchar("provider", { length: 40 }).notNull(), // bear-model-vl | coze-legacy | openai-compat
    model: varchar("model", { length: 80 }).notNull(),
    skillKey: varchar("skill_key", { length: 80 }),
    // target_type: report | issue | comparison | function_effect | rectification
    targetType: varchar("target_type", { length: 40 }).notNull(),
    targetId: varchar("target_id", { length: 36 }),
    promptDigest: varchar("prompt_digest", { length: 80 }),
    resultDigest: varchar("result_digest", { length: 80 }),
    resultJson: jsonb("result_json").default({}),
    inputTokens: integer("input_tokens"),
    outputTokens: integer("output_tokens"),
    durationMs: integer("duration_ms"),
    status: varchar("status", { length: 20 }).default("running").notNull(), // running | succeeded | failed | cancelled
    errorMessage: text("error_message"),
    // Human review: pending | approved | rejected | overridden
    reviewStatus: varchar("review_status", { length: 20 }).default("pending").notNull(),
    reviewedBy: varchar("reviewed_by", { length: 36 }),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true, mode: 'string' }),
    reviewNote: text("review_note"),
    startedAt: timestamp("started_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
    finishedAt: timestamp("finished_at", { withTimezone: true, mode: 'string' }),
    createdAt,
  },
  (table) => [
    unique("ai_runs_run_id_uniq").on(table.runId),
    index("ai_runs_target_idx").using("btree", table.targetType.asc().nullsLast().op("text_ops"), table.targetId.asc().nullsLast().op("text_ops")),
    index("ai_runs_trace_idx").using("btree", table.traceId.asc().nullsLast().op("text_ops")),
    index("ai_runs_review_idx").using("btree", table.reviewStatus.asc().nullsLast().op("text_ops"), table.createdAt.desc().op("timestamptz_ops")),
  ],
);

// ─────────────────────────────────────────────────────────────────────────────
// Process table: outbox_events
// Per V3.1 §18.3: transactional outbox for reliable event delivery. Producers
// write to this table in the same DB transaction as the business write; a
// relay worker drains it to downstream consumers (notifications, webhooks, AI
// re-run, audit). Idempotency keys prevent double-fanout on retry.
// ─────────────────────────────────────────────────────────────────────────────
export const outboxEvents = pgTable(
  "outbox_events",
  {
    id: idCol,
    eventId: varchar("event_id", { length: 40 }).notNull(),
    aggregateType: varchar("aggregate_type", { length: 40 }).notNull(), // report | issue | task | rectification
    aggregateId: varchar("aggregate_id", { length: 36 }).notNull(),
    eventType: varchar("event_type", { length: 60 }).notNull(), // e.g. report.published, issue.rectified
    payload: jsonb("payload").default({}).notNull(),
    traceId: varchar("trace_id", { length: 64 }),
    idempotencyKey: varchar("idempotency_key", { length: 100 }),
    status: varchar("status", { length: 20 }).default("pending").notNull(), // pending | delivered | failed | dead_letter
    attempts: integer("attempts").default(0).notNull(),
    maxAttempts: integer("max_attempts").default(5).notNull(),
    lastError: text("last_error"),
    deliveredAt: timestamp("delivered_at", { withTimezone: true, mode: 'string' }),
    scheduledFor: timestamp("scheduled_for", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
    createdAt,
  },
  (table) => [
    unique("outbox_events_event_id_uniq").on(table.eventId),
    unique("outbox_events_idem_uniq").on(table.idempotencyKey),
    index("outbox_events_status_idx").using("btree", table.status.asc().nullsLast().op("text_ops"), table.scheduledFor.asc().nullsLast().op("timestamptz_ops")),
    index("outbox_events_aggregate_idx").using("btree", table.aggregateType.asc().nullsLast().op("text_ops"), table.aggregateId.asc().nullsLast().op("text_ops")),
  ],
);

// ─────────────────────────────────────────────────────────────────────────────
// Process table: notifications
// Per V3.1 §16.3: user-facing notifications (mentions, review requests,
// rectification due dates). Sourced from outbox events.
// ─────────────────────────────────────────────────────────────────────────────
export const notifications = pgTable(
  "notifications",
  {
    id: idCol,
    userId: varchar("user_id", { length: 36 }).notNull(),
    notificationType: varchar("notification_type", { length: 40 }).notNull(),
    title: varchar("title", { length: 200 }).notNull(),
    body: text("body"),
    // Polymorphic link to source entity for deep-linking
    sourceType: varchar("source_type", { length: 40 }),
    sourceId: varchar("source_id", { length: 36 }),
    sourceUrl: varchar("source_url", { length: 500 }),
    priority: varchar("priority", { length: 20 }).default("normal"),
    isRead: boolean("is_read").default(false).notNull(),
    readAt: timestamp("read_at", { withTimezone: true, mode: 'string' }),
    outboxEventId: varchar("outbox_event_id", { length: 40 }),
    createdAt,
  },
  (table) => [
    index("notifications_user_idx").using("btree", table.userId.asc().nullsLast().op("text_ops"), table.isRead.asc().nullsLast().op("bool_ops"), table.createdAt.desc().op("timestamptz_ops")),
    index("notifications_outbox_idx").using("btree", table.outboxEventId.asc().nullsLast().op("text_ops")),
  ],
);

export const v3ContractTables = {
  report_view_configs: reportViewConfigs,
  report_outline_sections: reportOutlineSections,
  report_action_items: reportActionItems,
  export_jobs: exportJobs,
  render_profiles: renderProfiles,
  report_print_blocks: reportPrintBlocks,
  issue_occurrences: issueOccurrences,
  rectification_actions: rectificationActions,
  verifications: verifications,
  report_summaries: reportSummaries,
  ai_runs: aiRuns,
  outbox_events: outboxEvents,
  notifications: notifications,
};