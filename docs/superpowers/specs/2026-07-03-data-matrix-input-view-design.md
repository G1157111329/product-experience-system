# 数据矩阵录入视图设计

日期：2026-07-03
状态：待评审
适用范围：体验任务工作台新增「数据矩阵」录入视图；强类型测量维度 + 语义化公式引擎 + 三槽位录入 + 报告矩阵投影
权威依据：PRD GV3.5.5 §29、技术设计说明书 GV3.5.5（外部参考文档）
对齐基线：V2.6/V3.1.1（仓库内 `product_experience_platform_prd_v2_6_report_detail_enhanced.md`、`product_experience_platform_prd_v3_1_全链路决策对齐版.md`）

---

## 1. 目标

### 1.1 要解决的业务问题

`数据矩阵.xlsx` 的「数据矩阵」Sheet 暴露了一个录入缺口：原汁机口径/食材这类任务需要在**同一工作面**稳定比较「对象/规格 × 食材/功能 × 原始测量 × 计算指标 × 效果结论 × 证据 × 问题」。当前任务工作台只有食谱/功能卡和指标表，无法承载这种横向对比密集型录入；现有 `comparison-workspace.tsx` 虽是行列矩阵，但列语义是「对比对象」而非「强类型测量维度」，且无公式引擎。

### 1.2 本设计的定位

数据矩阵是**任务工作台内的录入组件**，不是报告模板，不是独立 View Mode，不是 Excel 画布复刻。

- 录入端：在任务详情页新增「数据矩阵」Tab（无实例时不显示，不展示空 Excel）。
- 复用既有真相：矩阵行一对一绑定 `check_records`（RecordItem）；原始/计算值落 `metric_records`；图片落 `materials`；问题落 `issues`。
- 报告端：报告 Aggregator 读取矩阵投影，按数据特征推荐 `comparison_matrix` / `metric_emphasis` / `mixed_comparison` 渲染。

### 1.3 成功判定

| 指标 | 目标 |
|---|---|
| 原汁机样本端到端 | 食材分组下 160mm/120mm 两行录入耗时/重量 → 出汁率/纯汁率/含渣率按公式自动计算并只读显示；异常可创建问题 |
| 三槽位与证据 | 每行可填效果结论/过程记录/关联问题；图片作为 material 绑定，不出现独立评分/标签框 |
| 公式安全 | 坐标式/外部链接/循环公式被拒绝；缺输入/除零/单位不兼容有准确错误；计算结果不可手改 |
| 并发 | 两人编辑不同指标不冲突；同一指标冲突返回最新值与差异（精确到行/维度） |
| 快照一致性 | 发布后修改任务矩阵，已发布报告/PDF 数值/顺序/公式版本不变 |
| 性能 | 50 分组 × 10 行 × 30 维度，常规网络首屏可交互 < 3s；批量粘贴上限 500 单元格 |

---

## 2. 不做范围（红线）

本设计严格遵循外部 PRD §29.2.2 硬约束与 §29.7.1 RESERVED 边界，以下首版**不做**：

1. **不做完整 Excel A1 公式**。`=G4/G9` 坐标公式、`=INDIRECT`、`=OFFSET`、宏、VBA、`WEBSERVICE`、自由函数全部拒绝。公式持久化为语义引用（`SELF("juice_weight")/SELF("ingredient_weight")`），UI 可类 Excel 但存储必须语义化。理由：坐标会随排序/隐藏列/移动端重排失真，破坏快照可复现性。
2. **不做单元格自由富文本**。颜色/字号/加粗/斜体不作为业务事实存储。强调只在「过程记录」槽位用受控 Markdown；矩阵高亮来自结果状态（pass/fail/异常）的语义化样式，不来自用户自由样式。
3. **不做任意 Excel 导入**。不解析任意 Sheet/合并单元格/图片公式；Wave 2/P1 才做 1-3 个冻结模板的受控导入。
4. **不新建第二套真相**。MatrixRow 不另存一套「效果/问题/指标/图片」真相；继续分别落 `check_records` / `metric_records` / `materials` / `issues`。
5. **不让矩阵实例直接决定 `render_profile`**。报告布局仍由 report_scope_type + 数据特征推断。
6. **不在新建任务时让用户选报告模板**。用户只继承/添加「矩阵记录结构」。
7. **不引入异步计算队列**（首版）。公式计算采用「前端乐观计算 + 服务端复核」策略（见 §7）。

---

## 3. 设计哲学决策（已确认）

经与需求方确认，本设计采用以下三项决策，**覆盖前一轮「完整 Excel 公式 / 单元格富文本首版」的初步倾向**：

| 决策点 | 选择 | 理由 |
|---|---|---|
| 公式与样式哲学 | **语义化** | 遵循 PRD §29 红线；可审计/可快照/可移动端/可跨报告追溯 |
| Wave 边界 | **P0 + 移动端优化** | 公式由管理员在模式预定义（用户不能改公式），移动端分组卡片提前到首版 |
| 计算位置 | **前端乐观计算 + 服务端复核** | 不引入异步队列；DSL 解释器前后端共享一份代码；服务端为权威 |

---

## 4. 与现有代码库的复用映射

我已探查 `comparison-workspace.tsx`、`comparison_*` 表族、`metric_*` 表族。本设计**最大化复用**已有底座，新增集中在「模式版本 + 公式引擎 + 维度类型化」。

| 外部 PRD 新对象 | 本仓库对应/复用 | 改动量 |
|---|---|---|
| `MatrixSchema` / `MatrixSchemaVersion` | **新增** `matrix_schemas` + `matrix_schema_versions` 表（模式主档 + 不可变版本） | 中 |
| `MatrixGroup` / `MatrixRow` | 复用 `comparison_assemblies` + `comparison_item_nodes`（已是 section/item 树） | 小，扩展 |
| `MatrixRow ↔ RecordItem 1:1` | 复用 `check_records`（仓库的 RecordItem） | 小 |
| `MatrixDimensionBinding` | 复用 `comparison_objects`（列）+ 新增维度元数据 `matrix_dimension_bindings` | 中 |
| `MatrixFormulaDefinition`（DSL+AST） | **新增**：DSL parser + AST + 依赖图；前后端共享同一段 TS 代码 | 大（核心新能力） |
| 原始/计算指标 | **直接复用** `metric_definitions` / `metric_formula_versions` / `metric_threshold_rules` / `metric_evaluations`（schema.ts L800-905 已存在！）。注意：仓库**没有** `metric_records` 表，原始/计算值统一落 `metric_evaluations`（cell × metric_key），需扩展其 typed-value 字段 | 中 |
| 证据 | 复用 `materials`（已支持 `comparison_cell_id` + `comparison_assembly_id`） | 小 |
| 问题 | 复用 `issues`；`issue_occurrences` 当前是 JSON 内联，首版不拆主档/出现，按既有 issues 表存 | 小 |
| `MatrixCalculationRun` 审计 | **简化**：首版不引入异步 worker，但保留 `matrix_calculation_runs` 表记录每次复核的输入 hash + 公式版本 + 结果，用于审计与快照 | 小 |
| `ReportSnapshot` 矩阵投影 | 扩展 `report_snapshots.snapshot_json` 增加 `matrix_projection` 块 | 中 |

**关键发现**：`metric_definitions / metric_formula_versions / metric_threshold_rules / metric_evaluations` 这套「指标 + 公式 + 阈值 + 评估」表**已在 schema.ts 存在**（L800-905），这是平台已有的语义化公式地基。本设计的 DSL 引擎应直接对接这套表，而非另起炉灶。

**重要修正**：仓库**没有** `metric_records` 表（外部技术设计说明书假设的）。原始/计算值统一落 `metric_evaluations`（key: cell_id × metric_key），其现有字段 `raw_value`（jsonb）/ `calculated_value` / `display_value` / `formula_version_id` / `pass_fail_status` 基本够用；首版只需扩展 `value_kind` / `numeric_value` / `text_value` / `duration_ms` / `unit_code` / `input_state` / `error_code` 等强类型字段（见 §5.1.5）。

---

## 5. 数据模型

### 5.1 新增表

#### 5.1.1 模式与版本

```sql
-- 逻辑模式主档
CREATE TABLE matrix_schemas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  schema_key text NOT NULL UNIQUE,           -- 稳定业务键，如 juicer_aperture_comparison
  name text NOT NULL,
  product_category text,                     -- 适用品类
  experience_type_allowlist jsonb DEFAULT '[]',
  status text NOT NULL DEFAULT 'draft',      -- draft | active | deprecated
  latest_published_version_id uuid,
  owner_id uuid REFERENCES platform_users(id),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- 不可变版本（发布后不可原地修改）
CREATE TABLE matrix_schema_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  schema_id uuid NOT NULL REFERENCES matrix_schemas(id),
  version_no int NOT NULL,
  status text NOT NULL DEFAULT 'draft',      -- draft | published | deprecated
  schema_json jsonb NOT NULL,                -- 轴定义 + 维度绑定 + 公式定义（见 §5.2）
  checksum text,                             -- 发布时计算的完整性校验
  published_at timestamptz,
  published_by uuid REFERENCES platform_users(id),
  effective_from timestamptz,
  effective_to timestamptz,
  created_at timestamptz DEFAULT now(),
  UNIQUE (schema_id, version_no)
);
```

#### 5.1.2 维度绑定与公式定义

```sql
-- 维度列定义（原始列 + 计算列）
CREATE TABLE matrix_dimension_bindings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  schema_version_id uuid NOT NULL REFERENCES matrix_schema_versions(id) ON DELETE CASCADE,
  dimension_key text NOT NULL,               -- 稳定键，如 juice_weight / juice_yield
  display_name text NOT NULL,
  column_group text NOT NULL,                -- observed | calculated
  value_kind text NOT NULL,                  -- number | duration | text | enum | boolean | date
  unit_code text,                            -- g | ml | s | % | ...
  metric_definition_id uuid REFERENCES metric_definitions(id),  -- 复用既有指标定义
  required boolean DEFAULT false,
  editable boolean DEFAULT true,             -- 计算列 false
  sort_order int NOT NULL DEFAULT 0,
  display_format_json jsonb DEFAULT '{}',    -- 小数位、千分位、时长展示格式
  validation_rule_json jsonb DEFAULT '{}',   -- 范围、正则、枚举值
  UNIQUE (schema_version_id, dimension_key)
);

-- 公式定义（受限 DSL + 编译 AST）
CREATE TABLE matrix_formula_definitions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  schema_version_id uuid NOT NULL REFERENCES matrix_schema_versions(id) ON DELETE CASCADE,
  output_dimension_key text NOT NULL,        -- 输出到哪个计算列
  formula_dsl text NOT NULL,                 -- SELF("juice_weight")/SELF("ingredient_weight")
  compiled_ast jsonb,                        -- 发布时编译的 AST
  dependency_json jsonb,                     -- 依赖的 dimension_key 列表
  scope text NOT NULL DEFAULT 'row',         -- row | group
  formula_version text NOT NULL,             -- 对齐 metric_formula_versions
  status text NOT NULL DEFAULT 'draft',      -- draft | published
  UNIQUE (schema_version_id, output_dimension_key)
);
```

#### 5.1.3 任务实例与行

复用既有 `comparison_assemblies`（作为 MatrixInstance）+ `comparison_item_nodes`（作为 MatrixGroup/MatrixRow），通过新增字段区分：

```sql
-- 扩展 comparison_assemblies：标记为数据矩阵实例
ALTER TABLE comparison_assemblies
  ADD COLUMN matrix_schema_version_id uuid REFERENCES matrix_schema_versions(id),
  ADD COLUMN matrix_role text DEFAULT 'comparison',  -- comparison | data_matrix
  ADD COLUMN comparability_status text DEFAULT 'unknown';  -- unknown | confirmed | limited | not_applicable

-- comparison_item_nodes 已有 node_type: section|item|condition|process_node|metric|issue_group|summary
-- 数据矩阵复用：section=MatrixGroup, item/condition=MatrixRow, summary=小结行
-- 复用既有 check_records 关联（item_nodes 已可关联 record）
```

> 注：comparison_item_nodes 已具备 section/item/summary 树结构、depth、sort_order、parent_id、shared_recipe/config，足以承载 MatrixGroup→MatrixRow→小结。无需新增表。

#### 5.1.4 计算审计（首版简化）

```sql
-- 首版不引入异步 worker，但记录每次服务端复核的审计
CREATE TABLE matrix_calculation_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  matrix_instance_id uuid NOT NULL REFERENCES comparison_assemblies(id),
  trigger_type text NOT NULL,                -- api_save | api_recalculate | snapshot_build
  input_version_hash text NOT NULL,          -- 受影响原始指标的版本 hash
  formula_version_hash text NOT NULL,
  status text NOT NULL,                      -- succeeded | failed | partial
  error_code text,
  error_detail_sanitized text,
  computed_at timestamptz DEFAULT now(),
  trace_id text
);
```

#### 5.1.5 既有 `metric_evaluations` 扩展（typed value）

仓库无 `metric_records` 表，原始/计算值统一落既有 `metric_evaluations`。扩展字段：

```sql
ALTER TABLE metric_evaluations
  ADD COLUMN value_kind varchar(20),         -- number | duration | text | enum | boolean
  ADD COLUMN numeric_value numeric(18,6),
  ADD COLUMN text_value text,
  ADD COLUMN duration_ms bigint,
  ADD COLUMN unit_code varchar(40),
  ADD COLUMN input_state varchar(20) DEFAULT 'valid',  -- valid | missing | not_applicable
  ADD COLUMN calculation_mode varchar(20),   -- manual | calculated
  ADD COLUMN formula_definition_id varchar(36),
  ADD COLUMN source_run_id varchar(36) REFERENCES matrix_calculation_runs(id),
  ADD COLUMN error_code varchar(60),
  ADD COLUMN version integer DEFAULT 1;
```

> 注：`metric_evaluations` 现有 `raw_value`(jsonb)/`calculated_value`/`display_value`/`formula_version_id`/`threshold_rule_id`/`pass_fail_status` 字段保留。新增 typed 字段是为了公式引擎的强类型计算（数字/时长/单位），jsonb `raw_value` 继续作为兼容回退。

### 5.2 模式 schema_json 结构

```json
{
  "schemaKey": "juicer_aperture_comparison",
  "version": 1,
  "title": "原汁机口径 × 食材性能对比",
  "axes": [
    {"axisCode": "scenario", "axisRole": "group", "levels": [{"levelNo": 1, "label": "食材/功能"}]},
    {"axisCode": "subject", "axisRole": "row", "levels": [
      {"levelNo": 1, "label": "产品"},
      {"levelNo": 2, "label": "口径规则"},
      {"levelNo": 3, "label": "可选细项", "required": false}
    ]}
  ],
  "dimensions": [
    {"key": "duration", "kind": "duration", "group": "observed", "required": true},
    {"key": "ingredient_weight", "kind": "number", "unit": "g", "group": "observed", "required": true},
    {"key": "juice_weight", "kind": "number", "unit": "g", "group": "observed", "required": true},
    {"key": "juice_yield", "kind": "number", "unit": "%", "group": "calculated", "editable": false}
  ]
}
```

行层级最多三级：一级大类（分组）、二级对象/规格、三级可选细项。具体语义由模式配置，不能由用户临时改层级。

---

## 6. 公式引擎（受限 DSL）

### 6.1 设计原则

1. **显示可类 Excel，存储必须语义化**。UI 可让用户点选同行单元格，但服务端保存 `SELF("juice_weight")/SELF("ingredient_weight")`，不存 `=H3/G3`。
2. **无任意代码执行**。DSL 解析为 AST，不使用 `eval` / `Function` / 第三方不受控解释器。
3. **前后端共享一份 TS 代码**（`src/lib/matrix/formula-engine.ts`），前端乐观计算与服务端复核用同一实现，避免漂移。
4. **计算结果只读**。用户修正原始输入，不直接覆盖结果。
5. **失败可解释**。每个失败定位到公式 + 依赖维度 + 行 + 错误码。

### 6.2 DSL 语法（首版白名单）

```
number literal:       0 | 0.25 | 100
self metric:          SELF("juice_weight")
same group ref:       REF(subject_key="aperture_120", metric="juice_weight")
operators:            + - * / ^   > >= < <= == !=
functions:            IF, COALESCE, ROUND, MIN, MAX, ABS, SUM, AVG
unit conversion:      UNIT(value, "g") / TO_SECONDS(duration)
scope aggregate:      GROUP_AVG(metric="juice_yield")
```

原汁机样本的默认公式：

```
juice_yield       = ROUND(SELF("juice_weight") / SELF("ingredient_weight"), 4)
pure_juice_yield  = ROUND(SELF("filtered_juice_weight") / SELF("juice_weight"), 4)
pulp_ratio        = ROUND(SELF("pulp_in_juice_weight") / SELF("juice_weight"), 4)
```

### 6.3 明确拒绝

```
=H3/G3                       -- A1 坐标持久化
=INDIRECT("H" & ROW())       -- 动态坐标
=OFFSET(...)                 -- 非确定性范围
=WEBSERVICE(...)             -- 外部访问
=VBA()/MACRO()               -- 宏
```

### 6.4 编译校验（模式发布时）

| 校验 | 失败码 | 处理 |
|---|---|---|
| DSL 语法 | `MATRIX_FORMULA_PARSE_ERROR` | 不允许发布 |
| 未定义维度 | `MATRIX_FORMULA_DIMENSION_NOT_FOUND` | 不允许发布 |
| 输出维度可编辑 | `MATRIX_FORMULA_OUTPUT_EDITABLE` | 不允许发布 |
| 单位不兼容 | `MATRIX_FORMULA_UNIT_MISMATCH` | 不允许发布 |
| 循环引用 | `MATRIX_FORMULA_CYCLE` | 不允许发布 |
| 运行时缺输入 | `MATRIX_CALC_INPUT_MISSING` | 保存原始值；计算失败阻断提交 |
| 除零 | `MATRIX_CALC_DIVIDE_BY_ZERO` | 同上 |

---

## 7. 计算策略：前端乐观 + 服务端复核

### 7.1 流程

```
用户编辑原始指标
  -> 前端 DSL 引擎即时计算（乐观显示计算列，标 "乐观" 角标）
  -> 800ms 防抖 PATCH /api/matrix-rows/[id]/metrics/[dimensionKey]
     body: { value, unitCode, inputState, optimisticCalculations: {juice_yield: 0.4683} }
  -> 服务端：事务内写 metric_evaluations（calculation_mode='manual'）+ 用同一 DSL 引擎复核计算
     + 写 metric_evaluations（calculation_mode='calculated'）+ 写 matrix_calculation_runs（input_hash + formula_version + 结果）
  -> 返回权威计算结果 + version
  -> 前端用权威结果覆盖乐观值，清除角标
```

### 7.2 失败处理

| 场景 | 原始数据 | 计算结果 | 用户可见 | 恢复 |
|---|---|---|---|---|
| 单指标保存失败 | 不保存 | 不触发 | 单元格失败状态 | 重试 |
| 原始值保存成功但计算失败 | 保存 | 标记 failed，不覆盖旧成功值 | 指标显示"无法计算"+错误码 | 修复输入/重试 |
| 公式服务不可用 | 保存 | pending | 顶部计算状态 + 提交阻断 | 自动重试/人工重试 |
| 前后端 DSL 结果不一致 | 以服务端为准 | 服务端结果 | 静默采用服务端 + 写 audit | 监控告警 |

### 7.3 一致性保证

- DSL 引擎代码必须在前后端共享同一文件，CI 校验 `git diff` 后两侧 import 自同一路径。
- 服务端复核是权威；前端乐观值仅用于体验顺滑，不写入任何持久化。
- 服务端复核失败时，原始值已保存（不丢数据），但计算列显示错误状态，提交审核被阻断。

---

## 8. 录入视图信息架构

### 8.1 视图结构（桌面）

```
Task Header
RecordContextBar（单/双行，固定在 Header 下，非完整素材区）
─────────────────────────────────────────────────────────────────
[固定左侧操作栏]    [固定行层级/分组列]   [原始维度列]   [计算维度列]   [效果/证据列]
新增分组            食材/功能              耗时          出汁率         效果结论
新增记录行          对象/规格              重量          纯汁率         过程记录
筛选/折叠           第三级细项（可选）    原始值        含渣率         关联问题
─────────────────────────────────────────────────────────────────
分组小结 / 任务小结 / 备注与方法说明
```

遵循外部 PRD §27.3 UI 准则：
- **UI-02**：左侧「新增大类」固定，不进入横向滚动区。
- **UI-04**：RecordContextBar 是精简单/双行（如「测试对象：160mm 投料桶 ｜ 食材：胡萝卜 500g ｜ 条件：档位2/5分钟 ｜ 当前类目：出汁效果」），不是完整素材面板。
- **UI-06**：对象列名居中，类目列窄化超长省略悬浮。

### 8.2 三槽位单元格（每个 MatrixRow）

| 槽位 | 权威字段 | 录入规则 |
|---|---|---|
| 效果结论 | `check_records.result_status + summary` | 必填条件由模式配置；如「效果 OK」「苹果整投卡住」「不达标」。**不引入人工评分**。 |
| 过程记录 | `check_records.process_note`（新增字段）或既有 record 字段 | 可选；记录异常背景、操作变化。允许受控 Markdown，不允许颜色替代语义。 |
| 关联问题 | `issues`（关联 record/task） | 展示数量/严重度/状态；支持创建/关联既有问题。 |
| 指标与计算 | `metric_evaluations`（扩展 typed value）+ `matrix_calculation_runs` | 原始人工录入；计算只读由公式产出；异常可直接创建问题。 |
| 图片/视频 | `materials`（绑定 record/cell） | 每行默认 0-3 关键证据；产品图/效果图绑定该行。**不使用图片公式**。 |

### 8.3 移动端（首版交付）

移动端不强制横向 Excel 表格，采用「分组卡片 + 维度抽屉页」：

```
分组卡片列表（垂直滚动）
  └── 胡萝卜（分组）
        ├── 160mm口径（行）→ 卡片：效果结论/过程记录/关联问题置顶
        │     ├── 指标分段：原始 | 计算（可切换）
        │     ├── 拍照上传（原生相机 capture="environment"）
        │     └── 展开全部维度（抽屉页）
        └── 120mm口径（行）→ ...
```

- 与桌面共享同一 MatrixReadProjection DTO、同一写接口、同一版本控制、同一校验。
- 只允许单行编辑和拍照上传，不开放大批量粘贴。
- 复用既有 `media-capture-dialog.tsx`（移动端原生相机 + 桌面浏览器摄像头）。

### 8.4 动态增删改规则

| 操作 | 允许角色 | 规则 |
|---|---|---|
| 新增一级分组 | task_owner、executor、reviewer、admin | 模式 `allow_group_add=true` 时；必填分组名+至少一个比较上下文 |
| 新增对象/规格行 | 同上 | 必须选已有 TestObject 或填受控「临时变体」；生成新 check_record |
| 新增第三级细项 | 同上 | 仅当模式定义三级层级；不超模式最大层级 |
| 新增原始维度列 | admin | P0 禁止任务内改列结构；必须新建/发布模式版本 |
| 新增计算维度列 | admin | P0 仅用已发布公式维度；公式变更必须新模式版本 |
| 删除空行/分组 | 创建人、task_owner、admin | 无指标/证据/问题时物理删；有引用时归档+审计+深链 |
| 删除有问题/证据的行 | task_owner、reviewer、admin | 只能归档；填原因；报告重建后保留「已归档记录」追溯 |
| 拖拽排序 | 有编辑权用户 | 仅变更 sort_order；不改变公式引用语义（公式走语义键，与视觉行号无关） |

---

## 9. API 设计

复用既有 `[api.performance]` 慢请求日志与统一 `{ code, message, data }` 返回结构。

### 9.1 模式管理（admin）

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/matrix-schemas` | 可用模式库 |
| POST | `/api/matrix-schemas` | 新建模式草稿 |
| POST | `/api/matrix-schemas/[id]/versions` | 新建版本草稿 |
| POST | `/api/matrix-schema-versions/[id]/publish` | 编译 + 校验 + 发布（不可变） |

### 9.2 任务矩阵

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/api/tasks/[id]/matrices` | 应用模式创建实例（含初始分组/行 + check_records） |
| GET | `/api/tasks/[id]/matrices` | 任务矩阵清单 |
| GET | `/api/task-matrices/[id]` | 窗口化 MatrixReadProjection（含 viewport/cursor） |
| POST | `/api/task-matrices/[id]/groups` | 新增分组 |
| POST | `/api/task-matrices/[id]/rows` | 新增一行或批量行 |
| PATCH | `/api/matrix-rows/[id]` | 修改对象/层级/顺序 |
| PATCH | `/api/matrix-rows/[id]/slots` | 修改三槽位（效果结论/过程记录） |
| PATCH | `/api/matrix-rows/[id]/metrics/[dimensionKey]` | 写原始指标 + 服务端复核计算 |
| POST | `/api/task-matrices/[id]/batch-commands` | 受限批量粘贴（逐项返回成功/冲突/失败） |
| POST | `/api/task-matrices/[id]/recalculate` | 手动请求重新计算 |
| POST | `/api/matrix-rows/[id]/issues` | 从矩阵行创建/关联问题 |
| POST | `/api/task-matrices/[id]/validate` | 提交前校验 |
| POST | `/api/task-matrices/[id]/archive` | 归档实例 |

### 9.3 写请求约定

```http
PATCH /api/matrix-rows/row_carrot_160/metrics/juice_weight
If-Match: "metric-7"
Idempotency-Key: "a244f3a2-..."
Content-Type: application/json
```

```json
{
  "valueKind": "number",
  "value": 558.7,
  "unitCode": "g",
  "inputState": "valid",
  "optimisticCalculations": { "juice_yield": 0.4683 }
}
```

响应：

```json
{
  "code": 0,
  "data": {
    "metricEvaluationId": "me_01",
    "version": 8,
    "authoritativeCalculations": {
      "juice_yield": { "value": 0.4683, "status": "valid", "formulaVersion": "v1" }
    },
    "calculationRunId": "mcr_01"
  }
}
```

### 9.4 错误码

| HTTP | code | 前端行为 |
|---:|---|---|
| 400 | `MATRIX_SCHEMA_INVALID` | 表单定位 |
| 403 | `MATRIX_PERMISSION_DENIED` | 不泄露数据 |
| 404 | `MATRIX_NOT_FOUND` | 通用未找到 |
| 409 | `MATRIX_VERSION_CONFLICT` | 显示差异与保留/采用 |
| 409 | `MATRIX_CALCULATED_VALUE_READONLY` | 引导改原始指标 |
| 409 | `MATRIX_SCHEMA_VERSION_IMMUTABLE` | 引导复制新版本 |
| 422 | `MATRIX_UNIT_INVALID` | 显示可用单位 |
| 422 | `MATRIX_FORMULA_*` | 定位公式/依赖 |
| 429 | `MATRIX_BATCH_LIMIT_EXCEEDED` | 建议拆分 |

---

## 10. 前端组件树

```
TaskDetailPage（既有）
└── 新增 Tab: 'matrix'
    └── MatrixInputView（新组件，参考 comparison-workspace.tsx 模式）
        ├── RecordContextBar（单/双行固定）
        ├── MatrixToolbar
        │   ├── GroupAddButton (sticky left, UI-02)
        │   ├── FilterBar
        │   ├── CalculationStatusBadge
        │   └── ViewportColumnChooser
        ├── MatrixVirtualGrid
        │   ├── StickyActionRail
        │   ├── StickyHierarchyColumns（一级分组/二级规格/三级细项）
        │   ├── DimensionHeaderGroups（原始 | 计算）
        │   ├── GroupBand
        │   ├── MatrixRow
        │   │   ├── ResultSlotCell（效果结论）
        │   │   ├── ProcessSlotCell（过程记录，受控 Markdown）
        │   │   ├── IssueSlotCell（关联问题计数+状态色标）
        │   │   ├── ObservedMetricCell（原始指标，可编辑）
        │   │   ├── CalculatedMetricCell（计算指标，只读+乐观角标）
        │   │   └── EvidenceStrip（复用 MaterialPicker，0-3 关键证据）
        │   └── GroupSummaryRow
        ├── MatrixDetailPanel（行内展开或独立详情页，**非右侧抽屉**）
        ├── MatrixMobileCards（移动端分组卡片视图，首版交付）
        └── MatrixValidationSummary（提交前校验）
```

### 10.1 状态管理原则

- 服务端为事实源；React Query 缓存仅读取 + 乐观更新。
- 操作队列显式化：离线/失败操作存 IndexedDB，以 `clientOperationId` + `idempotencyKey` + 依赖关系隔离。
- 精细冲突：单元格冲突只回滚对应 metric_record 或槽位，不清空整行。
- 计算结果延迟一致：原始输入成功后显示「正在复核」；服务端返回后覆盖乐观值。
- 媒体不阻塞：复用既有 material 上传状态机；未处理媒体不阻塞指标编辑。

### 10.2 虚拟化与加载

| 资源 | 策略 |
|---|---|
| 行 | 按分组分页，组内行虚拟化；默认一次加载 10 分组 |
| 列 | 仅渲染可视列 + 左右 overscan；列选择器控制显隐 |
| 图片 | 首屏只取缩略图 metadata；滚动入视口再取签名预览 URL |
| 问题摘要 | 返回计数/严重度/状态；点击后再加载 issues 列表 |
| 公式结果 | DTO 返回当前结果与运行状态，前端不独立重算（用同一 DSL 引擎乐观算） |

---

## 11. 报告投影与快照

### 11.1 报告 Aggregator 读取

报告生成时对每个 TaskMatrixInstance 构建不可变输入 DTO：

```json
{
  "matrixProjectionVersion": "1.0",
  "matrixInstanceId": "tmx_01",
  "schema": {"key": "juicer_aperture_comparison", "version": 1},
  "comparability": {"status": "confirmed", "limitations": []},
  "groups": [
    {
      "groupId": "grp_carrot", "label": "胡萝卜",
      "rows": [
        {
          "rowId": "row_carrot_160", "subject": "160mm口径",
          "result": "效果 OK",
          "metrics": [{"key": "juice_yield", "value": 0.4683, "unit": "%", "formulaVersion": "v1"}],
          "issueSummary": {"open": 0, "high": 0},
          "primaryEvidenceRefs": ["mat_1"]
        }
      ]
    }
  ]
}
```

### 11.2 渲染策略推断（不改变事实数据）

| 推断条件 | 推荐 render_profile | 展示重点 |
|---|---|---|
| 多对象 + 记录项对齐 | `comparison_matrix` | 对象列×项目行、固定上下文、行级结论 |
| 多指标 + 阈值/公式重要 | `metric_emphasis` | 指标定义、异常解释、指标明细入口 |
| 图/指标/问题同等重要 | `mixed_comparison` | 关键图 + 核心指标 + 问题标签 |

### 11.3 快照固化

报告发布前必须固化到 `report_snapshots.snapshot_json.matrix_projection`：

```
schema_key / schema_version
matrix_instance_id
group/row identifiers + display labels + sort order
selected metrics + raw input snapshot + calculation output
formula definition id/version + dependency snapshot hash
result/process slots
issue refs + status_at_snapshot
evidence refs + media checksum/preview ref
comparability status + confirmation id
```

**不能只存 matrix_instance_id 实时查询**——历史报告会因后续录入/改名/公式升级而漂移。

---

## 12. 提交校验

### 12.1 阻断项

| 规则 | 行为 |
|---|---|
| 模式版本不可用或已停用 | 保留实例，要求迁移/归档后才能提交 |
| 必填分组/记录行缺失 | 定位到分组或行 |
| 必填原始指标缺失/单位不合法 | 定位单元格 + 显示期望单位 |
| 计算公式失败 | 显示错误码 + 依赖维度；禁止手写计算结果绕过 |
| 阈值异常未写异常说明 | 定位指标 + 过程记录 |
| 不达标效果无 issue 或批准豁免 | 复用既有 §9.4 规则 |
| 已归档记录仍被公式引用 | 要求更新模式/修复依赖/恢复记录 |

### 12.2 预警项

- 分组/对象条件不一致 → 进入可比性声明；若报告需排名则阻断
- 临时变体/未映射对象 → 允许提交；发布前要求确认对象名与对比边界

---

## 13. 权限、审计、安全

### 13.1 权限矩阵（继承既有 RBAC + Resource Scope）

| 操作 | executor | task_owner | reviewer | admin |
|---|:-:|:-:|:-:|:-:|
| 查看被授权任务矩阵 | ✓ | ✓ | ✓ | ✓ |
| 新增分组/行 | ✓(本人承接) | ✓ | ✓ | ✓ |
| 编辑原始指标/三槽位 | ✓(本人承接) | ✓ | ✓ | ✓ |
| 创建/关联问题 | ✓ | ✓ | ✓ | ✓ |
| 归档有引用行 | ✗ | ✓ | ✓ | ✓ |
| 编辑模式草稿 | ✗ | ✗ | ✗ | ✓ |
| 发布模式版本 | ✗ | ✗ | ✓(按组织授权) | ✓ |

### 13.2 公式安全

1. DSL parser 不接受任意函数名；白名单在服务端版本控制。
2. AST 执行器无文件/网络/DB/环境变量/反射/进程访问。
3. 公式引用由 `schema_version_id + dimension_key + scope` 解析；不接收任意记录 ID。
4. 编译与运行日志不记录敏感原始值全文；错误信息脱敏后返回前端。

### 13.3 审计事件

写入既有 `security_audit_logs`：

| action | object_type | 必记字段 |
|---|---|---|
| `matrix_schema_version.published` | `matrix_schema_version` | 前后 checksum、公式列表、发布人 |
| `task_matrix.applied` | `comparison_assembly` | 任务、模式版本、初始分组/行数 |
| `matrix_row.created/updated/archived` | `comparison_item_node` | 关联 record、对象路径、原因 |
| `matrix_metric.updated` | `metric_evaluation` | 前后值、单位、input_state、操作者 |
| `matrix_formula.calculated/failed` | `matrix_calculation_run` | 公式版本、input hash、trace_id、错误 |

---

## 14. 性能门禁

| 指标 | 目标 |
|---|---|
| `matrix_read_p95_ms` | < 800ms（不含媒体） |
| `matrix_write_p95_ms` | < 500ms（含服务端复核计算） |
| `matrix_calc_p95_ms` | 500 行 × 30 维度受影响范围 < 5s |
| `matrix_calc_failure_rate` | < 0.5%，超过 1% 告警 |
| `matrix_conflict_rate` | < 2% |
| `matrix_batch_partial_failure_rate` | < 1% |
| `matrix_snapshot_consistency_error` | 0（任意一次为 P0 事故） |
| `matrix_media_load_blocking_rate` | 0（媒体不得阻塞指标编辑） |

---

## 15. 实施分期

### Wave 0 / P0 技术地基

- 数据表迁移（matrix_schemas / matrix_schema_versions / matrix_dimension_bindings / matrix_formula_definitions / matrix_calculation_runs）
- DSL parser + AST + 依赖图 + 单元测试（前后端共享 `src/lib/matrix/formula-engine.ts`）
- 第一个模式（原汁机）黄金样本固定，包括正常/缺值/除零/异常阈值
- 特性开关 `matrix_input_enabled`（默认关闭）
- OpenAPI / RBAC / 审计 / 合约测试

### Wave 1 / P0 业务闭环（首版交付）

- 任务矩阵实例创建（复用 comparison_assemblies + comparison_item_nodes）
- 分组/记录行增删改（复用既有 comparison API）
- 三槽位录入
- 原始指标录入 + 服务端复核计算
- 已发布公式自动计算 + 阈值异常
- 问题/证据绑定（复用 issues + materials）
- 提交校验
- 报告矩阵投影（扩展 report_snapshots.snapshot_json）
- **移动端分组卡片视图**（首版交付，提前自 Wave 2）

### Wave 2 / P1（后续）

- 受限公式构建器（UI 类 Excel 点选 → 自动转 SELF/REF 语义引用）
- 模式草稿/审批工作流
- 批量粘贴增强
- 矩阵下载（CSV/Excel 导出，非导入）
- 对比视图深化

### RESERVED（不开发）

- 通用 Excel 解析与回写
- 任意 A1 公式 / 宏 / VBA
- 自由画布单元格格式（颜色/字号/加粗作为数据）
- 跨任务公式
- 复杂透视/分页

---

## 16. 验收用例

| 编号 | 场景 | 验收标准 |
|---|---|---|
| AT-11 | 原汁机口径 × 食材矩阵 | 食材分组下 160mm/120mm 两行；原始重量与耗时可录；出汁率/纯汁率/含渣率按已发布公式计算；异常可创建问题 |
| AT-12 | 三槽位与证据 | 每行可填效果结论/过程记录/关联问题；图片作为 material 绑定；无独立评分/标签框 |
| AT-13 | 公式安全与错误 | 坐标式/外部链接/循环公式被拒绝；缺输入/除零/单位不兼容有准确错误；计算结果不可手改 |
| AT-14 | 并发与离线 | 两人编辑不同指标不冲突；同指标冲突返回最新值+差异；断网不丢本地草稿 |
| AT-15 | 快照一致性 | 发布后修改任务矩阵，已发布报告/PDF 数值/顺序/公式版本/证据引用不变；新草稿可重建 |
| AT-16 | 权限与性能 | 无任务权限用户不能通过矩阵 URL 读取对象/指标；大矩阵按需加载；媒体不阻塞录入 |
| AT-17 | 移动端 | 分组卡片垂直浏览；单行编辑；原生相机拍照；与桌面同一 DTO/校验 |
| AT-18 | 前后端 DSL 一致 | 前端乐观值与服务端权威值在所有黄金样本上一致；不一致时静默采用服务端 + audit |

---

## 17. 待业务确认的开放项

| 编号 | 待确认项 | 默认建议 |
|---|---|---|
| M-01 | 首个模式是否就是原汁机口径对比 | 是；该样本最完整 |
| M-02 | 计算审计 `matrix_calculation_runs` 保留周期 | 建议 90 天 + 发布快照永久固化结果 |
| M-03 | 移动端「展开全部维度」抽屉页深度 | 首版只支持单行展开，不支持跨行对比 |
| M-04 | 模式发布权限 | 仅 admin；reviewer 可按组织授权（待定） |
| M-05 | 批量粘贴首版上限 | 500 单元格；超出建议拆分 |

---

## 18. 风险与控制

| 风险 | 控制措施 |
|---|---|
| 前后端 DSL 结果漂移 | CI 强制两侧 import 同一文件；黄金样本回归测试覆盖 |
| 复用 comparison_assemblies 引入耦合 | 通过 `matrix_role='data_matrix'` 字段区分；查询路径独立 |
| 模式版本被任务引用后无法升级 | 发布后不可变；升级必须复制新版本 + 显式迁移 |
| 移动端首版交付拖延整体 | 移动端复用既有 media-capture-dialog + MaterialPicker，增量在卡片布局 |
| 既有 metric_* 表语义偏差 | Wave 0 先做映射盘点，确认 metric_records 能承载 typed value（value_kind/numeric_value/duration_ms/unit_code） |
| 公式复核拖慢保存接口 | 服务端复核只算受影响维度（依赖图剪枝）；非全量重算 |

---

## 19. 与既有规格的关系

- 本设计**承接** `2026-06-23-report-authoring-and-presentation-v2-7-design.md` 的「多型号矩阵录入」方向，但聚焦于「强类型测量维度 + 公式引擎」，而该文档聚焦「对象列对比 + A3 PDF」。
- 本设计**不冲突**于 V2.6 报告详情优化：矩阵是录入端组件，报告详情仍按 V2.6 的 Universal Report Shell + render_profile 渲染。
- 本设计**对齐**外部 PRD GV3.5.5 §29 与技术设计说明书 GV3.5.5 的全部红线与数据契约；当本文件与外部文档不一致时，以外部文档为准。
