# PRD V3.1.2.4 高层架构路线图（母文档）

| 项 | 内容 |
|---|---|
| 文档名称 | PRD V3.1.2.4 高层架构路线图 |
| 适用 PRD | `docs/产品体验管理平台_PRD_V3.1.2.4_录入体验动态数据矩阵视图素材与内嵌HermesAgent补充PRD.md` |
| 文档定位 | **母文档/纲领**。覆盖 7 模块 × 6 Wave 的整体架构、表清单、API 清单、依赖图、风险登记册。后续每个 Wave 走独立的 spec → plan → 实现循环，本文件作为各子项目的索引与约束源。 |
| 决策日期 | 2026-07-08 |
| 实施路径 | 路径 A：基础设施优先（PRD §18 原始 Wave 0→6 顺序） |
| 状态 | 待用户审阅 |

---

## 1. 架构决策记录（ADR）

本节固化 brainstorming 阶段确认的 6 项根本决策。这些决策是所有后续 Wave spec 的上位约束，**子项目 spec 不得违背**。

### ADR-01 矩阵数据模型：新建 V3

**决策**：按 PRD §8 新建 9 张 V3 表（matrix_view_definitions / matrix_hierarchy_nodes / matrix_leaf_rows / matrix_column_definitions / matrix_cell_values / matrix_cell_styles / matrix_formula_definitions / matrix_formula_runs / matrix_narrative_blocks）。

**理由**：
- V2 表族（matrix_design_versions / matrix_sections / matrix_field_definitions / matrix_groups / matrix_rows / matrix_field_values / matrix_narratives）是 group→row 两级关系型网格，与 PRD §7-§8 要求的「A/B/C 三级层级 + 合并行头 + 列区（column_zone）+ 单元格样式」语义不同构。
- 强行在 V2 上加 parent_id/column_zone/cell_style 会持续在扭曲的映射上打补丁（V2 的 section/field_kind 与 PRD 的 column_zone/data_type 不同构）。

**影响**：
- V2 表族冷置保留（不删表，避免历史数据丢失），运行时不再写入。
- 需要存量 V2 矩阵数据迁移脚本（Wave 6 灰度发布前执行）。
- 迁移文件从 `0004_` 起编号（现有到 `0003_task_matrix_model.sql`）。

**不选 V2 扩展的原因**：V2 的 `matrix_field_definitions.field_kind`（manual_value/formula/evidence_slot/issue_slot）与 PRD 的 `column_zone`（hierarchy/primary_media/comparison_category/detail_dimension/calculation_dimension/effect_media/evaluation/issue_point）是正交分类体系，强行映射会丢失语义。

### ADR-02 公式引擎：全面改为 A1 坐标引用

**决策**：废弃现有 SELF/REF/GROUP_* 语义引用 DSL，引擎全面改造为 A1 坐标引用（`=G4/H5`），支持相对引用下推。

**理由**：
- PRD §7.9 明确要求用户点选单元格生成 `=G4/H5`，并支持相对下推（§7.9.5）。
- 现有 `formula-engine.ts` 在 tokenizer 层显式拒绝前导 `=` 和 A1 坐标（line 226-239, 307-310），EvalContext 接口（self/refSameGroup/groupAggregate）无 (row,col) 概念。
- 双语法并存会带来长期的语义漂移和维护负担；PRD S-04 明确"旧版禁止跨行公式描述废止"。

**影响**：
- 重写 `src/lib/matrix/formula-engine.ts`：tokenizer 接受 `=` 前缀 + `[A-Z]+[0-9]+` 坐标 token；parser 产出带 CellRef 节点的 AST；新增 `(rowIndex, colIndex) → (leafRowId, columnId)` 坐标解析器。
- 重写 `src/lib/matrix/recompute.ts`：EvalContext 改为基于可见行序的二维值矩阵。
- 重写设计器预设公式输入（`matrix-designer.tsx` Step 4）从 SELF DSL 改为 A1。
- 受限函数白名单（IF/COALESCE/ROUND/MIN/MAX/ABS/SUM/AVG）按 PRD §7.9.4 **P0 不开放**，只保留 `+ - * / ()`。
- 契约测试 `pnpm check:matrix-formula` 需重写断言。

**风险**：现有 V2 矩阵若已有 SELF 公式数据，迁移期需保留 legacy-eval 兼容路径（仅读不写）。经探查 V2 当前生产数据量极小（Wave 1 刚上线），风险可控。

### ADR-03 Hermes Agent：完整版

**决策**：完整实现 PRD §11（agent_instances 状态机 + 记忆命名空间 + 建议块状态机 + SSE 流式对话 + 矩阵小结 skill）+ §12 企微入口。

**理由**：用户明确选择完整版。复用现有 `ai_model_configs` + `resolveAIConfig()`（§11.2 强制要求，禁止新增 hermes_* 配置）。

**影响**：
- 新增 ~10 张表（见 §3 表清单 D 组）。
- 新增 SSE 端点 `/api/v1/agent/conversations/{id}/stream`，实现 15s 心跳 + Last-Event-ID 恢复 + 8 种事件类型。
- 企微需配置企业账号（corpid/secret/agentid），由管理员后台配置，不写入仓库。

### ADR-04 素材归属：新增 material_links + status 状态机

**决策**：新增 `material_links` 多态关联表 + 在 `materials` 表加 `status` 字段状态机。存量 record_id/recipe_step_id 等 FK 列保留为遗留兼容（读取时 fallback）。

**理由**：PRD §9.3 要求点击绑定/拖拽吸附/多目标绑定（一个素材可绑多个目标），扁平多 FK 列无法表达多对多。

**影响**：
- `materials` 表加 `status` ENUM（uploaded/scanning/scan_failed/processing/process_failed/unassigned/suggested/library_ready/bound/archived）+ `project_id`（可空）。
- 新增 `material_links` 表（material_id/target_type/target_id/binding_method/bound_by/bound_at）。
- 存量数据回填：`status='bound'`（有任意 FK 非空）或 `status='unassigned'`（FK 全空）。
- 读取链路优先读 material_links，fallback 到 FK 列。

### ADR-05 Inline 范围：全平台改造，离线队列延后

**决策**：五感体验/功能效果/总结/既有对比矩阵/动态数据矩阵全部改为 click-to-edit + 自动保存。离线队列（IndexedDB + Service Worker）延后到后续版本。

**理由**：
- PRD §5.1 明确要求全平台统一 InlineEditable。
- 离线队列是最大不确定项（当前零基础），现场测试人员多数在有网环境，离线是边缘场景。
- 矩阵 cell 已有 800ms 防抖 + 409 冲突处理的参考实现，可提取为共享组件。

**影响**：
- 提取 `src/components/inline-editable.tsx` + `src/hooks/use-debounced-save.ts` 共享原语。
- 为 records/recipes/recipe-steps/comparison-cells/comparison-item-nodes 新增 PATCH 单字段接口。
- 冲突 UI（§5.5）全做：桌面 inline 冲突面板 + 移动端全屏冲突页。
- `offline_queued` 状态在状态机中保留位但本期不实现（显示为 error + "网络异常"）。

### ADR-06 报告投影：迁移到 V3

**决策**：V3 动态矩阵报告投影上线后，report-detail.ts 改读 V3 快照；V2 矩阵 Tab 报告逻辑下线（存量已生成报告的 V2 快照保留可读）。

**理由**：避免双轨维护；PRD §88 要求冻结快照写入 `report_snapshots.snapshot_json.matrix_projection`。

**影响**：
- `src/lib/server/report-detail.ts` 矩阵数据读取改走 V3 projection。
- 存量 V2 报告快照保留只读兼容路径。

---

## 2. 架构总览

### 2.1 模块依赖图

```
                    ┌──────────────────────────────────────────┐
                    │           Wave 0 基础设施层               │
                    │  Feature Flag 体系 + Inline Save Service │
                    │  + 全部新表 DDL（V3/素材/Agent/企微）     │
                    └──────────────────┬───────────────────────┘
                                       │
            ┌──────────────────────────┼──────────────────────────┐
            ▼                          ▼                          ▼
   ┌─────────────────┐        ┌─────────────────┐        ┌─────────────────┐
   │  Wave 1         │        │  Wave 2         │        │  Wave 4         │
   │  InlineEditable │        │  V3 矩阵视图    │        │  素材归属       │
   │  全平台改造     │        │  A~Q 区 + 层级  │        │  material_links │
   │  (五感/功能/总结)│        │  + 详细对比维度 │        │  + D/O 列       │
   └────────┬────────┘        └────────┬────────┘        └────────┬────────┘
            │                          │                          │
            │                          ▼                          │
            │                 ┌─────────────────┐                  │
            │                 │  Wave 3         │                  │
            │                 │  A1 公式引擎    │                  │
            │                 │  + 跨行下推     │                  │
            │                 └────────┬────────┘                  │
            │                          │                           │
            └──────────────┬───────────┘                           │
                           ▼                                       ▼
                  ┌─────────────────┐                     ┌─────────────────┐
                  │  Wave 5         │                     │  Wave 5         │
                  │  Hermes Agent   │◄────────────────────│  企微入口       │
                  │  + 矩阵小结 icon │                     │  (素材归属依赖) │
                  │  + Web 对话 SSE │                     └─────────────────┘
                  └────────┬────────┘
                           ▼
                  ┌─────────────────┐
                  │  Wave 6         │
                  │  报告投影 V3    │
                  │  + 快照 + E2E   │
                  │  + 灰度发布     │
                  └─────────────────┘
```

### 2.2 与现有系统的边界

| 现有系统 | 处置 |
|---|---|
| V2 矩阵表族（8 张） | 冷置保留，运行时不写入；Wave 6 迁移存量后可考虑 DROP（待产品确认） |
| V1 schema 注册表（5 张） | 不动，继续预留给 Wave 2「可复用设计库」 |
| `formula-engine.ts` SELF/REF DSL | ADR-02 废弃，重写为 A1 |
| `materials` 扁平 FK 列 | ADR-04 保留兼容，新增 material_links |
| `agent_skill_templates/versions` | 保留，作为 Hermes skill 定义载体（§11.6 矩阵小结 skill 复用） |
| `agent-presets/route.ts` + `agent-chat/route.ts` | 保留 agent-presets；agent-chat 升级为 SSE 流式 |
| `ai_model_configs` + `resolveAIConfig()` | 原样复用，Hermes 唯一配置源 |
| local+S3 双路径存储 | 原样复用，素材物理层不变 |
| `comparison-workspace.tsx` 三槽位 | ADR-05 改为 click-to-edit；不迁移为动态矩阵（PRD §10） |

---

## 3. 新增表清单（按 Wave 分组）

迁移文件从 `0004_` 起编号。每组迁移独立、幂等（`CREATE TABLE IF NOT EXISTS`）。

### A 组 — Wave 0：V3 动态矩阵核心表（9 张）

迁移：`0004_dynamic_matrix_v3_tables.sql`

| 表 | 来源 | 关键字段 |
|---|---|---|
| `matrix_view_definitions` | PRD §8.3 | matrix_id, version_no, max_hierarchy_level(=3), left_frozen_column_count(=5), formula_mode, style_mode, status, design_hash |
| `matrix_hierarchy_nodes` | PRD §8.4 | matrix_id, parent_id(nullable), level(1/2/3), node_label, node_type, sort_order, rowspan_cache, archived_at；UNIQUE(matrix_id,parent_id,level,node_label) WHERE archived_at IS NULL |
| `matrix_leaf_rows` | PRD §8.5 | matrix_id, level_1/2/3_node_id, visible_row_index, group_row_index, status(active/archived), archived_at |
| `matrix_column_definitions` | PRD §8.6 | matrix_id, column_zone(8 值), column_label, data_type(11 值), unit_text, display_order, desktop_width_px, is_pinned, is_required, show_in_report, max_media_count, archived_at |
| `matrix_cell_values` | PRD §8.7 | matrix_id, leaf_row_id, column_id, value_text, value_number, value_duration_seconds, value_percentage, display_text, value_state(6 值), version(乐观锁)；UNIQUE(matrix_id,leaf_row_id,column_id) |
| `matrix_cell_styles` | PRD §8.8 | matrix_id, target_type(column_header/cell/narrative_block), target_id, font_color_token, font_size_token(xs~xl), bold, italic |
| `matrix_formula_definitions` | PRD §8.9 | matrix_id, column_id, expression_display, expression_ast(jsonb), reference_mode(relative_by_visible_row), apply_scope(matrix/level_1_group), result_format, decimal_places, status |
| `matrix_formula_runs` | PRD §8.10 | formula_id, matrix_id, leaf_row_id, status(success/pending/failed), result_value, error_code, dependency_snapshot(jsonb) |
| `matrix_narrative_blocks` | PRD §8.11 | matrix_id, block_type(summary/note/formula_note/method_note/limitation_note), scope(matrix/level_1_group), scope_node_id, content, ai_suggestion_id, show_in_report, sort_order |

**注**：`task_matrices` 表（V2 已有）复用，加 `current_view_definition_id` 列指向 V3 视图定义。V2 的 `current_design_version_id` 保留不删。

### B 组 — Wave 0：素材归属表（2 张 + 1 改列）

迁移：`0005_material_asset_state.sql`

| 表/改列 | 说明 |
|---|---|
| `material_links`（新） | material_id, target_type(12 值，见 PRD §13.7), target_id, binding_method(click_select/drag_attach/upload_at_slot/wecom_ingest/agent_suggested), bound_by, bound_at, version(乐观锁) |
| `materials` 加列 | status ENUM(11 值状态机), project_id(UUID nullable), last_bind_suggestion(jsonb, Agent 建议暂存) |
| 存量回填 | UPDATE materials SET status='bound' WHERE record_id IS NOT NULL OR recipe_step_id IS NOT NULL OR ...；其余 status='unassigned' |

### C 组 — Wave 0：矩阵问题点关联（1 张）

迁移：`0005_material_asset_state.sql`（与 B 组同文件）

| 表 | 说明 |
|---|---|
| `matrix_issue_points`（新） | matrix_id, leaf_row_id, column_id, issue_text, linked_issue_id(nullable→issues.id), status(text/converted), created_by |

### D 组 — Wave 0：Hermes Agent 表（~10 张）

迁移：`0006_hermes_agent_tables.sql`

| 表 | 来源 | 关键字段 |
|---|---|---|
| `agent_instances` | PRD §11.3 | tenant_id, name, status(draft/active/paused/maintenance/frozen/archived), model_config_id(→ai_model_configs), bound_user_id, created_by |
| `agent_run_snapshot_configs` | PRD §11.2 | agent_instance_id, base_url_snapshot, model_name_snapshot, api_key_ref(不存明文，引用 ai_model_configs.id), captured_at |
| `conversations` | PRD §11.4 | tenant_id, agent_instance_id, platform_user_id, wecom_user_id(nullable), project_id(nullable), task_id(nullable), memory_namespace, status(active/closed), created_at |
| `conversation_messages` | PRD §11.7 | conversation_id, role(user/assistant/tool/system), content, tool_call_id(nullable), event_id(SSE 顺序), created_at |
| `agent_memory_namespaces` | PRD §11.4 | namespace_key(唯一), tenant_id, agent_instance_id, binding_id, scope_config(jsonb) |
| `agent_runs` | PRD §11.5/§11.8 | agent_instance_id, conversation_id, trigger(manual/matrix_summary/report_draft/wecom_ingest), status(running/succeeded/failed), model_config_snapshot(jsonb), error_code, trace_id, started_at, completed_at |
| `agent_suggestion_blocks` | PRD §11.5 | agent_run_id, block_type(matrix_summary/report_draft/material_bind_suggestion/...), payload(jsonb), status(pending/accepted/edited_then_accepted/rejected/expired), target_entity_type, target_entity_id, decided_by, decided_at |
| `wecom_bindings` | PRD §12.1 | platform_user_id, wecom_user_id, wecom_corp_id, agent_instance_id, project_scope(jsonb), status(active/frozen/unbound), bound_by |
| `wecom_media_ingest_jobs` | PRD §12.2/§12.3 | wecom_msg_id, wecom_media_id, media_type, expires_at, download_status(pending/downloading/downloaded/failed/dead_letter), retry_count, material_asset_id(nullable), last_retry_at |
| `agent_skill_bindings` | PRD §11.6 | agent_instance_id, skill_template_id(→agent_skill_templates), is_enabled, overridden_system_prompt(text nullable) |

### E 组 — Wave 0：Feature Flag 种子

迁移：`0007_feature_flags_seed.sql`

更新 `platform_settings.feature_flag_*`，新增 PRD §14 的 10 个 Flag（key 命名对齐 PRD）：

```json
{
  "matrix_tab_state_enabled": true,
  "task_matrix_enabled": false,
  "dynamic_matrix_excel_like_view_enabled": false,
  "dynamic_matrix_formula_enabled": false,
  "dynamic_matrix_cell_style_enabled": false,
  "inline_edit_enabled": false,
  "autosave_enabled": false,
  "material_staging_enabled": false,
  "hermes_agent_gateway_enabled": false,
  "wecom_material_ingest_enabled": false
}
```

**规则**（PRD §14）：Flag 缺失不得导致空白页；`matrix_tab_state_enabled=true` 且 `task_matrix_enabled=false` 时 Tab 显示"功能未启用"。

---

## 4. API 清单（按 Wave 分组）

所有新 API 走 `/api/v1/*` 契约加固版（`If-Match`/ETag、幂等信封、`trace_id` 错误信封、`force-dynamic`）。

### Wave 0 — Inline Save Service

| 方法 | 路径 | 说明 |
|---|---|---|
| PATCH | `/api/v1/inline-values/{entity_type}/{entity_id}/{field_id}` | PRD §13.7 统一 Inline Save。entity_type 支持 14 种（见 PRD）。带 If-Match 乐观锁，返回 ETag。 |

### Wave 1 — Inline 改造配套 PATCH

| 方法 | 路径 | 说明 |
|---|---|---|
| PATCH | `/api/v1/records/{id}/field` | 单字段更新 check_records，同步 issue 状态（复用现有 PUT 逻辑） |
| PATCH | `/api/v1/recipes/{id}/field` | 单字段更新 recipes |
| PATCH | `/api/v1/recipe-steps/{id}/field` | 单字段更新 recipe_steps |
| PATCH | `/api/v1/comparison-cells/{id}/field` | 单字段更新 comparison_cells 三槽位 |
| PATCH | `/api/v1/tasks/{id}/field` | 单字段更新 experience_tasks（基本信息/总结） |

### Wave 2 — V3 动态矩阵 CRUD

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/v1/tasks/{taskId}/matrix-tab-state` | PRD §13.1 Tab 状态页 |
| POST | `/api/v1/tasks/{taskId}/matrices` | PRD §13.2 创建矩阵（V3） |
| GET | `/api/v1/matrices/{id}` | 读取 V3 投影（hierarchy/columns/cells/styles/narratives/issues） |
| POST | `/api/v1/matrices/{id}/hierarchy-nodes` | PRD §13.3/§13.4 新增层级节点（level 1/2/3） |
| PATCH/DELETE | `/api/v1/matrix-hierarchy-nodes/{id}` | 编辑/归档层级节点 |
| POST | `/api/v1/matrices/{id}/columns` | PRD §13.5/§13.6 新增列（详细对比维度/计算列） |
| PATCH/DELETE | `/api/v1/matrix-columns/{id}` | 编辑/归档列 |
| PATCH | `/api/v1/inline-values/dynamic_matrix_cell_value/{cellId}/{fieldId}` | 单元格值写入（复用 Wave 0 inline-values） |
| PATCH | `/api/v1/matrix-cell-styles/{targetType}/{targetId}` | PRD §13.8 单元格样式 |
| POST | `/api/v1/matrices/{id}/narrative-blocks` | 新增小结/备注块 |
| PATCH | `/api/v1/matrix-narrative-blocks/{id}` | 编辑小结/备注 |

### Wave 3 — A1 公式

| 方法 | 路径 | 说明 |
|---|---|---|
| PUT | `/api/v1/matrix-formulas/{formulaId}` | PRD §13.6 保存公式（expression_display + AST + 下推规则） |
| POST | `/api/v1/matrix-formulas/{formulaId}/recompute` | 触发重算（手动/调试用） |
| GET | `/api/v1/matrix-formulas/{formulaId}/references` | 返回公式引用的单元格坐标（用于 UI 高亮） |

### Wave 4 — 素材归属

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/v1/projects/{projectId}/material-library` | 项目素材库视图（status=library_ready/bound） |
| GET | `/api/v1/tasks/{taskId}/material-staging` | 素材暂存池（status=uploaded/scanning/processing/unassigned/suggested） |
| GET | `/api/v1/materials/unassigned` | 待归属池（跨任务） |
| POST | `/api/v1/material-links` | PRD §13.9 绑定素材 |
| DELETE | `/api/v1/material-links/{id}` | 解绑/改绑 |
| POST | `/api/v1/matrices/{id}/cells/{cellId}/media` | D/O 列槽位上传（含 max_count 校验） |

### Wave 5 — Hermes Agent + 企微

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/v1/agent/conversations/{conversationId}/stream` | PRD §11.7 SSE 流式对话 |
| POST | `/api/v1/agent/conversations` | 创建会话（含记忆命名空间） |
| POST | `/api/v1/agent/skills/matrix-evaluation-summary` | PRD §13.10 矩阵小结 skill |
| POST | `/api/v1/agent/suggestion-blocks/{id}/decide` | 接受/编辑后接受/拒绝建议块 |
| GET/POST/PATCH/DELETE | `/api/v1/admin/agent-instances` | Agent 实例 CRUD（管理员） |
| GET/POST/PATCH/DELETE | `/api/v1/admin/wecom-bindings` | 企微绑定 CRUD（管理员） |
| POST | `/api/v1/wecom/callback` | 企微回调入口（签名校验 + 素材入队） |
| POST | `/api/v1/wecom/media/retry/{jobId}` | 手动重试 dead_letter 素材 |

---

## 5. Wave 拆解详情

每个 Wave 是独立的子项目，后续各自走 spec → plan → 实现循环。本节给出每个 Wave 的范围、交付物、依赖、验收标准概要。

### Wave 0 — 基础设施层（1 Sprint）

**范围**：
- 迁移 0004-0007（全部新表 DDL + Feature Flag 种子）
- Inline Save Service：`/api/v1/inline-values/{entity_type}/{entity_id}/{field_id}` 统一接口骨架（14 种 entity_type 路由分发，实际字段写入逻辑各 Wave 填充）
- 共享原语提取：`src/components/inline-editable.tsx` + `src/hooks/use-debounced-save.ts`（从 matrix-cell.tsx 提取）
- Tab 状态页骨架：`matrix-tab.tsx` 改造为 5 状态（feature_disabled/api_error/forbidden/empty/ready）

**交付物**：
- 4 个迁移文件 + journal 更新
- schema.ts 同步全部新表 Drizzle 定义
- InlineEditable 组件 + useDebouncedSave hook
- Tab 状态页（空状态 + CTA）

**依赖**：无

**验收**：
- `pnpm ts-check` 通过
- 迁移在干净库执行成功 + `verify-security-schema.sql` 通过
- Feature Flag 全部就位，Tab 不再空白

### Wave 1 — InlineEditable 全平台改造（1-2 Sprint）

**范围**：
- 五感体验/功能效果/总结/既有对比矩阵/基本信息 全部改 click-to-edit + 自动保存
- 5 个 PATCH 单字段接口（records/recipes/recipe-steps/comparison-cells/tasks）
- 冲突 UI（桌面 inline 面板 + 移动端全屏页）
- 保存状态机 7 态（idle/dirty/saving/saved/error/conflict/offline_queued[占位]）

**交付物**：
- 5 个 PATCH 路由
- 4 个 Tab 组件改造（functions-tab / senses-input-workspace / basic-info-tab / comparison-workspace）
- 冲突解决组件

**依赖**：Wave 0（InlineEditable 原语 + inline-values 接口）

**验收**：
- 普通文本字段从点击到完成保存中位耗时 ≤ 3 秒（PRD §17）
- 自动保存无提示覆盖 = 0
- 409 冲突正确触发冲突面板

### Wave 2 — V3 动态矩阵视图（2-3 Sprint）

**范围**：
- V3 投影读取：`src/lib/matrix/projection-v3.ts`（hierarchy tree + columns + cells + styles + narratives）
- 桌面端 Excel 型网格视图：合并行头（rowspan）+ 冻结左 5 列 + 横向滚动 + 顶部冻结表头
- A~Q 区抽象：一级大类/二级/三级细项新增 + 一级对比类目（E 列）+ 详细对比维度列区 + D/O 素材列占位 + P 评价 + Q 问题点 + 小结/备注区
- 列配置浮层（PRD §7.8.2）
- 基础文字样式（字体颜色/加粗/斜体/字号 token）
- 移动端卡片式录入（PRD §7.15）

**交付物**：
- `projection-v3.ts` + 类型定义
- `matrix-v3-desktop-grid.tsx`（新，替代 matrix-desktop-grid）
- `matrix-v3-mobile.tsx`（新）
- 列配置浮层 + 样式工具条组件
- V3 CRUD API（层级/列/单元格值/样式/叙事块）

**依赖**：Wave 0（V3 表）

**验收**：
- E2E-01~04, 07, 08(占位), 12 通过
- 创建一级大类 + 二级细项 + 3 数据列 + 1 计算列占位 ≤ 10 分钟（PRD §17）

### Wave 3 — A1 公式引擎 + 跨行下推（1-2 Sprint）

**范围**：
- 重写 `formula-engine.ts`：A1 tokenizer + parser + AST + CellRef 节点
- 坐标解析器：`(rowIndex, colIndex) → (leafRowId, columnId)`
- 相对引用下推（PRD §7.9.5）
- 跨一级大类边界提示（PRD §7.9.6）
- 公式错误状态（MX-FORMULA-001~007）
- 点选公式编辑器 UI
- 重写 `recompute.ts` + `pnpm check:matrix-formula` 契约测试

**交付物**：
- 新 `formula-engine.ts`（A1）+ 旧引擎保留为 `formula-engine-legacy.ts`（仅 V2 只读兼容）
- 点选公式编辑器组件
- 重算服务 + 审计（matrix_formula_runs）

**依赖**：Wave 2（V3 视图 + 列定义）

**验收**：
- E2E-05, 06 通过
- 受控公式计算成功率 ≥ 99%（PRD §17）

### Wave 4 — 素材归属 + D/O 列 + 问题点转 Issue（1-2 Sprint）

**范围**：
- MaterialAsset 状态机视图（暂存池/待归属池/项目素材库）
- material_links 绑定/解绑/改绑 API
- 目标选择模式（非模态 + 搜索 + 过滤 + 高亮）
- 绑定确认条（桌面 inline + 移动端底部固定）
- D 列纯图片槽位（max 3）+ O 列图片/视频槽位（max 12，硬上限 30）
- 拖拽吸附
- Q 列问题点录入 + 转 IssueOccurrence

**交付物**：
- 素材归属 UI 组件套件
- D/O 列槽位组件（集成 MaterialPicker）
- material_links API
- matrix_issue_points API

**依赖**：Wave 0（material_links 表）+ Wave 2（V3 视图槽位渲染）

**验收**：
- E2E-08, 09, 10 通过
- 已绑定素材可追溯到业务对象比例 = 100%（PRD §17）

### Wave 5 — Hermes Agent + 矩阵小结 + Web 对话 + 企微（2 Sprint）

**范围**：
- Agent Runtime（内嵌，非独立服务）
- agent_instances CRUD + 状态机（管理员后台）
- 记忆命名空间隔离
- SSE 流式对话（15s 心跳 + Last-Event-ID + 8 事件类型）
- 矩阵小结 AI icon（调用 matrix-evaluation-summary skill）
- 建议块状态机（pending/accepted/edited_then_accepted/rejected/expired）
- Web 对话面板（替换现有 agent-assist-panel 的 fetch 为 EventSource）
- 企微回调入口 + 临时素材下载重试（12 次/24h 窗口）+ dead_letter 告警
- 企微绑定管理（管理员后台）

**交付物**：
- Agent Runtime 模块（`src/lib/server/hermes/`）
- SSE 端点 + 事件协议库
- 矩阵小结 icon + 建议块 UI
- Web 对话面板重构
- 企微回调路由 + 下载队列 + 重试调度

**依赖**：Wave 0（Agent 表）+ Wave 2（矩阵数据供小结 skill 输入）+ Wave 4（企微素材归属依赖 material_links）

**验收**：
- E2E-11, 13, 14 通过
- 未确认 Agent 建议进入正式报告次数 = 0（PRD §17）
- 企微素材错绑到其他用户 Agent 次数 = 0（PRD §17）

### Wave 6 — 报告投影 V3 + 快照 + E2E + 灰度（1 Sprint）

**范围**：
- `report-detail.ts` 矩阵数据读取改走 V3 projection
- 报告生成时冻结 V3 快照到 `report_snapshots.snapshot_json.matrix_projection`
- 报告中心矩阵 Tab / 报告详情 / 打印页 / 分享页 全部读取 V3 快照
- 存量 V2 矩阵数据迁移脚本（V2 → V3）
- V2 矩阵 Tab 报告逻辑下线（存量已生成报告的 V2 快照保留只读）
- E2E 回归套件全量
- 灰度发布（Feature Flag 逐个开启）

**交付物**：
- V3 报告投影适配器
- V2→V3 迁移脚本
- E2E 测试套件
- 灰度发布 runbook

**依赖**：Wave 2-5 全部完成

**验收**：
- E2E-12 通过
- 灰度发布无 P0 回滚

---

## 6. 风险登记册

| ID | 风险 | 等级 | 缓解 | 责任 Wave |
|---|---|---|---|---|
| R-01 | A1 公式引擎重写引入计算错误 | 高 | 重写契约测试 `pnpm check:matrix-formula`；保留 legacy 引擎只读兼容；Wave 3 设交叉验证期（新旧引擎并行跑，对比结果） | Wave 3 |
| R-02 | V2→V3 数据迁移丢失 | 高 | 迁移脚本 dry-run + SHA256 校验；保留 V2 表不 DROP；回滚 runbook | Wave 6 |
| R-03 | 全平台 Inline 改造破坏现有表单校验 | 中 | 每个模块改造保留原校验逻辑；PATCH 接口复用 PUT 的字段白名单 | Wave 1 |
| R-04 | SSE 长连接在生产 PM2 环境稳定性 | 中 | 心跳 15s + 客户端退避重连；PM2 实例数 ≥ 2；监控 SSE 连接数 | Wave 5 |
| R-05 | 企微临时素材 3 天过期导致丢失 | 中 | 30s 入队 + 5 分钟首下 + 12 次重试 + 24h 窗口 + 过期前 12h 告警（PRD §12.3） | Wave 5 |
| R-06 | 单元格样式 XSS | 高 | 禁止 CSS 输入；只允许 font_color_token/font_size_token/bold/italic 白名单（PRD §8.8） | Wave 2 |
| R-07 | Hermes 模型配置失效静默降级 | 中 | 不静默降级、不切换模型；用户明确提示"助手暂不可用"；后台 agent_run.failed（PRD §11.8） | Wave 5 |
| R-08 | Agent 记忆串用 | 高 | tenant/user/wecom/agent/project/task/conversation 多维命名空间入库，不拼字符串（PRD §11.4） | Wave 5 |
| R-09 | 生产机 1.9G RAM 构建时 OOM | 中 | 服务器构建前临时加 4G swap（AGENTS.md 既有流程） | 全 Wave |
| R-10 | 离线队列延后导致弱网场景数据丢失 | 中 | ADR-05 本期不做离线；弱网时显示 error + "网络异常请重试"，不静默丢数据；PATCH 接口支持客户端重试 | Wave 1 |

---

## 7. 子项目索引

本路线图是母文档。每个 Wave 后续各自产生独立的 spec + plan，文件命名规范：

```
docs/superpowers/specs/2026-MM-DD-prd-v3-1-2-4-waveN-{module}-design.md
docs/superpowers/plans/2026-MM-DD-prd-v3-1-2-4-waveN-{module}-implementation.md
```

| Wave | 模块 | spec 状态 | plan 状态 |
|---|---|---|---|
| 0 | 基础设施层 | 待编写 | 待编写 |
| 1 | InlineEditable 全平台改造 | 待编写 | 待编写 |
| 2 | V3 动态矩阵视图 | 待编写 | 待编写 |
| 3 | A1 公式引擎 | 待编写 | 待编写 |
| 4 | 素材归属 | 待编写 | 待编写 |
| 5 | Hermes Agent + 企微 | 待编写 | 待编写 |
| 6 | 报告投影 + 灰度 | 待编写 | 待编写 |

**下一步**：路线图审阅通过后，从 Wave 0 开始，进入 Wave 0 的独立 brainstorm → spec → plan 循环。

---

## 8. 与 PRD 的对齐校验

| PRD 要求 | 本路线图覆盖 | 决策/位置 |
|---|---|---|
| S-01 动态矩阵不是固定模板 | ✅ | ADR-01 V3 模型，column_zone 抽象，不预设业务字段 |
| S-02 接近 Excel 但非通用 Excel | ✅ | ADR-01/02，限制四则运算 + 白名单样式 |
| S-03 计算区用户定义 | ✅ | ADR-02 A1 公式，用户自定义计算列 |
| S-04 跨行公式支持 | ✅ | ADR-02 全面改 A1 + 相对下推 |
| S-05 基础文字样式 P0 | ✅ | Wave 2 样式 token 白名单 |
| S-06 Hermes 内嵌 | ✅ | ADR-03 复用 ai_model_configs，不新增 hermes_* 配置 |
| O-01 全平台点击即编辑 | ✅ | ADR-05 Wave 1 全平台改造 |
| O-02 Tab 永不空白 | ✅ | Wave 0 五状态页 |
| O-03~O-06 矩阵能力 | ✅ | Wave 2-3 |
| O-06 素材绑定升级 | ✅ | ADR-04 Wave 4 |
| O-07~O-09 Agent | ✅ | ADR-03 Wave 5 |
| §5 录入重构 | ✅ | Wave 1 |
| §6-§8 动态矩阵 | ✅ | Wave 2-3 + ADR-01 |
| §9 素材归属 | ✅ | Wave 4 + ADR-04 |
| §10 既有对比矩阵修正 | ✅ | Wave 1（click-to-edit） |
| §11 Hermes | ✅ | Wave 5 + ADR-03 |
| §12 企微 | ✅ | Wave 5 |
| §14 Feature Flag | ✅ | Wave 0 迁移 0007 |
| §15 错误码 | ✅ | 各 Wave API 实现时落地 |
| §16 E2E | ✅ | Wave 6 全量回归 + 各 Wave 关键 E2E |
| §18 Wave 规划 | ✅ | 路径 A 对齐 PRD §18 |

**未覆盖/延后项**：
- 离线队列（ADR-05 延后）
- P1 分组聚合公式（OI-01，P0 不做）
- 多问题点展开（OI-02，P0 一行一个）
- 矩阵视图模板复用（OI-03，P0 不做）
- Excel 导入生成矩阵草稿（OI-04，P0 不做）
- 手机端公式编辑（OI-05，P0 桌面端优先）
