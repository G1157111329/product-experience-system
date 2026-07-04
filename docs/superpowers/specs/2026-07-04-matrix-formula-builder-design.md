# 受限公式构建器设计（Wave 2-2）

日期：2026-07-04
状态：待评审
适用范围：在已建好的数据矩阵录入视图（Wave 1）+ 批量粘贴（Wave 2-1）之上，新增让 admin 在 UI 里点选组装计算列公式的受限构建器
权威依据：外部 PRD GV3.5.5 §29.4.4 / §29.7.1（Wave 2 受限公式构建器，仍语义化、需发布、禁止 A1 自由公式）；本仓库 Wave 1 DSL 引擎 + schema 发布端点
对齐基线：`src/lib/matrix/formula-engine.ts`（Tasks 1-2）、`POST /api/matrix-schema-versions/[id]/publish`（Task 13）

---

## 1. 目标

### 1.1 要解决的业务问题

Wave 1 的 DSL 引擎 + schema 发布端点已就绪，但加新计算列必须改代码（seed 脚本）或手写 SQL。本增强让 admin 在设置面板里点选组装公式 + 创建输出列 + 发布，无需开发介入。例：想加"出汁率"列，admin 在 UI 里点 SELF("juice_weight") → ÷ → SELF("ingredient_weight") → ROUND 包裹 → 填示例验证 0.4683 → 发布，新模式版本立即在任务矩阵可用。

### 1.2 本设计的定位

受限公式构建器是 **admin 配置工具**，不是终端录入功能、不是自由公式编辑器、不是 Excel 公式栏。

- **结构化点选表单**（不是文本框）：admin 不学 DSL 语法，靠"积木块"组装。
- **最小能力集**：SELF 引用 + 算术（+ - * / ^）+ ROUND + 数字字面量。覆盖 juicer 样本全部需求（出汁率/纯汁率/含渣率都是同行比率）。
- **语义化存储**：UI 生成的 DSL 仍是 `SELF("juice_weight")/SELF("ingredient_weight")`，不是 A1 坐标。发布时复用 Wave 1 的 compileFormula + 循环检测。
- **admin 直接发布**：无审批工作流（admin 已是最高权限）。
- **表单同时创输出列 + 绑公式**：一次表单完成 dimension_binding + formula_definition。

### 1.3 成功判定

| 指标 | 目标 |
|---|---|
| FB-01 端到端 | admin 在 UI 里组装 `ROUND(SELF("juice_weight")/SELF("ingredient_weight"),4)` → 填示例 558.7/1193.1 → 预览 0.4683 → 发布成功 → 新任务应用该模式版本后矩阵出现"出汁率"计算列并自动算值 |
| FB-02 编译保护 | 组装循环引用公式（A 依赖 B，B 依赖 A）→ 发布被拒 `MATRIX_FORMULA_CYCLE` |
| FB-03 语义保护 | UI 不允许输入 A1 坐标/INDIRECT/VBA——白名单闭口，构建器只能产出 SELF/算术/ROUND |
| FB-04 草稿持久化 | 草稿保存到 DB → 刷新页面 → 草稿仍在 → 继续编辑 → 发布 |

---

## 2. 不做范围（红线）

1. **不做文本框公式输入**。强制结构化点选——避免 admin 手写非法 DSL。
2. **不做 REF（跨行引用）/ GROUP_*（聚合）/ IF/COALESCE/MIN/MAX/ABS/SUM/AVG/UNIT/TO_SECONDS 的 UI**。DSL 引擎支持它们，但首版 UI 不暴露（最小集）。后续可扩展"高级函数"按钮区。
3. **不做审批工作流**。admin 直接发布。
4. **不做公式版本 diff/对比视图**。草稿可丢弃重建。
5. **不做从真实任务实例拉数据预填示例**。用手动填示例输入。
6. **不做 A1 坐标 / INDIRECT / OFFSET / VBA / 宏**（DSL 引擎白名单已拒绝，UI 也不可能产出）。
7. **不做非 admin 可见**。构建器入口仅 admin。

---

## 3. 设计哲学决策（已确认）

| 决策点 | 选择 | 理由 |
|---|---|---|
| UI 形态 | **结构化点选表单** | admin 不学 DSL；积木块组装 + 实时 DSL 预览 |
| 权限 | **admin 直接构建+发布** | 最简，admin 已是最高权限 |
| 能力范围 | **SELF + 算术 + ROUND + 数字字面量** | 覆盖 juicer 全部需求；最小可交付 |
| 入口 | **设置面板新模块**（Dialog） | 与现有 admin 设置一致（ai-agent-settings 模式） |
| 预览 | **手动填示例输入** | 重现场景直观，不依赖任务实例存在 |
| 输出列 | **表单同时创输出列 + 绑公式** | 一次提交，原子事务 |

---

## 4. 与 Wave 1 代码的复用映射

| 本设计需要的能力 | Wave 1 已有的复用点 | 改动量 |
|---|---|---|
| 公式编译/求值/依赖图 | `compileFormula` / `evaluate` / `buildDependencyGraph`（formula-engine.ts） | 零改动（前端预览 + 后端 publish 都用） |
| schema 列表/创建/版本 | `GET/POST /api/matrix-schemas`、`POST /api/matrix-schemas/[id]/versions`（Task 13） | 零改动 |
| 发布编译校验 | `POST /api/matrix-schema-versions/[id]/publish`（Task 13，含 compileFormula + 循环检测 + 原子写） | 零改动 |
| DSL 白名单 | formula-engine.ts 的 `WHITELIST_FUNCTIONS` | 零改动（构建器只暴露 SELF/算术/ROUND 子集） |
| 设置 Dialog 布局 | `src/components/settings/ai-agent-settings.tsx`（Dialog + ScrollArea + 两栏） | 参考样式 |
| **草稿保存端点** | ❌ 没有 | **新增 `PUT /api/matrix-schema-versions/[id]/draft`** |
| **前端构建器 UI** | ❌ 没有 | **新增 `matrix-schema-settings.tsx` + `formula-builder.tsx`** |
| 导航入口 | `src/components/navigation.tsx` 个人菜单 | 加一个 admin 可见入口 |

**关键约束**：publish 端点从 DB 读 draft bindings + formulas（不是从请求 body），所以草稿必须先写入 DB 的 `matrix_dimension_bindings` + `matrix_formula_definitions` 表，才能 publish。这强制需要一个草稿保存端点。

---

## 5. API：`PUT /api/matrix-schema-versions/[id]/draft`

### 5.1 请求体

```json
{
  "dimensions": [
    {
      "dimensionKey": "juice_yield",
      "displayName": "出汁率",
      "columnGroup": "calculated",
      "valueKind": "number",
      "unitCode": "%",
      "editable": false,
      "sortOrder": 6,
      "displayFormat": { "decimals": 4 },
      "required": false
    }
  ],
  "formulas": [
    {
      "outputDimensionKey": "juice_yield",
      "formulaDsl": "ROUND(SELF(\"juice_weight\") / SELF(\"ingredient_weight\"), 4)",
      "scope": "row",
      "formulaVersion": "v1"
    }
  ]
}
```

字段说明：
- `dimensions[]`：本次草稿要写入的 `matrix_dimension_bindings` 记录（通常是新增的计算列；observed 列一般已存在于父版本，不需要重发，但允许重发以覆盖排序/显示格式）。
- `formulas[]`：本次草稿要写入的 `matrix_formula_definitions` 记录。
- **不传 schema_json**——草稿期间 schema_json 保持创建版本时的快照，只在 publish 时由后端重新计算 checksum。

### 5.2 响应

成功（200）：
```json
{ "code": 0, "message": "草稿已保存", "data": { "versionId": "...", "dimensions": 1, "formulas": 1 } }
```

错误：
- 403 `MATRIX_PERMISSION_DENIED`（非 admin）
- 404 版本不存在
- 409 `MATRIX_SCHEMA_VERSION_IMMUTABLE`（版本已 published，不能改草稿）
- 422 `MATRIX_FORMULA_PARSE_ERROR`（DSL 语法错——前端预览应已拦，这里是后端二次校验）
- 422 `MATRIX_FORMULA_DIMENSION_NOT_FOUND`（公式引用了不存在的 dimensionKey）

### 5.3 服务端流程

1. `requireAdmin` + 加载版本行。
2. 若版本 `status='published'` → 409 `MATRIX_SCHEMA_VERSION_IMMUTABLE`。
3. 对每个 formula：`compileFormula(formula.formulaDsl)`（前端预览已校验，后端二次校验防绕过）。编译失败 → 422。
4. 校验每个 formula 的 `dependencies`（compileFormula 返回）里的每个 key 都在 `dimensions` 数组 + 该版本既有的 observed dimensions 里。未知 key → 422。
5. **写入采用"replace 策略"**：先删除该版本下所有既有的 `matrix_formula_definitions`（草稿阶段的记录），再插入新的；`matrix_dimension_bindings` 同理。这样草稿保存是幂等的（重复保存不累积）。**注意**：只删草稿版本自己的记录，不碰其他版本。
6. 审计 `matrix_schema_draft.saved`。
7. 返回 `{ dimensions: N, formulas: M }`。

### 5.4 幂等

同一草稿重复保存：步骤 5 的 replace 策略保证幂等。前端可频繁自动保存（防抖 1-2 秒）。

---

## 6. 前端：设置面板入口 + 模式管理 Dialog

### 6.1 入口

在 `src/components/navigation.tsx` 个人菜单（admin 可见区）加一项"数据矩阵模式管理"，点击打开 `<MatrixSchemaSettings open onOpenChange />` Dialog。

### 6.2 `MatrixSchemaSettings` Dialog（`src/components/settings/matrix-schema-settings.tsx`）

布局参考 `ai-agent-settings.tsx`（Dialog + ScrollArea + 左右两栏）：

```
┌─ 数据矩阵模式管理 ─────────────────────────────────┐
│ [左栏 schema 列表]      │ [右栏 草稿编辑区]            │
│ ┌────────────────────┐ │ ┌─────────────────────────┐ │
│ │ juicer_aperture     │ │ │ 版本: v2 (draft)         │ │
│ │   └ v1 (published)  │ │ │ ─────                    │ │
│ │   └ v2 (draft) ←选中│ │ │ 维度列表:                 │ │
│ │ [+ 新建 schema]     │ │ │  • 耗时 (observed)        │ │
│ │                     │ │ │  • 食物重量 (observed)    │ │
│ │ weight_price (test) │ │ │  • 出汁率 (calculated) ✏ │ │
│ │   └ v1 (published)  │ │ │ [+ 添加计算列]            │ │
│ └────────────────────┘ │ │                           │ │
│                        │ │ [添加计算列] 展开后:       │ │
│                        │ │  <FormulaBuilder />       │ │
│                        │ │  [保存草稿] [发布]         │ │
│                        │ └─────────────────────────┘ │
└──────────────────────────────────────────────────────┘
```

- 左栏：`GET /api/matrix-schemas` 拉 schema 列表，每个 schema 展开其版本（draft/published 状态）。
- 选 draft 版本 → 右栏显示草稿编辑区。
- 选 published 版本 → 右栏只读展示 + "派生新版本"按钮（`POST /api/matrix-schemas/[id]/versions`，body 用 published 版本的 schema_json 作为起点）。
- "添加计算列"按钮 → 展开 `<FormulaBuilder />`。

### 6.3 草稿编辑区状态

- 加载草稿版本时，`GET` 该版本的 dimension_bindings + formula_definitions（**需要新增一个读取端点**，或复用 `GET /api/matrix-schema-versions/[id]`——见 §10 开放项 F-01）。
- admin 编辑后点"保存草稿" → `PUT /api/matrix-schema-versions/[id]/draft`。
- admin 点"发布" → `POST /api/matrix-schema-versions/[id]/publish`。发布成功后刷新左栏状态（draft → published）。

---

## 7. 前端：`FormulaBuilder` 结构化点选表单

### 7.1 组件结构（`src/app/(main)/settings/components/formula-builder.tsx` 或 `src/components/settings/formula-builder.tsx`）

```
┌─ 添加计算列 ─────────────────────────────────────┐
│ 输出列名: [出汁率           ]  单位: [%]   小数位:[4] │
│ ─────                                            │
│ 公式构建区:                                       │
│  [SELF("juice_weight")] [÷] [SELF("ingredient_weight")] │
│  ↑ 点击删除            ↑ 点击删除                  │
│  [+ SELF] [+ 数字] [+ 运算符] [+ ROUND 包装]      │
│ ─────                                            │
│ DSL 预览: ROUND(SELF("juice_weight") / SELF("ingredient_weight"), 4) │
│ ─────                                            │
│ 示例预览:                                         │
│  juice_weight = [558.7   ]                        │
│  ingredient_weight = [1193.1]                     │
│  → 结果: 0.4683 ✓                                 │
│ ─────                                            │
│ [取消] [添加到草稿]                               │
└──────────────────────────────────────────────────┘
```

### 7.2 公式 token 流（核心交互）

公式由 token 数组表示，每个 token 是：
```ts
type FormulaToken =
  | { kind: 'self'; dimensionKey: string }
  | { kind: 'number'; value: number }
  | { kind: 'op'; symbol: '+' | '-' | '*' | '/' | '^' }
  | { kind: 'round'; inner: FormulaToken[]; decimals: number };
```

操作：
- **+ SELF**：弹出维度下拉（从当前 schema 的 observed dimensions 选）→ 加 `{kind:'self', dimensionKey}` token。
- **+ 数字**：弹出小输入框 → 加 `{kind:'number', value}` token。
- **+ 运算符**：弹出 + - * / ^ 选择 → 加 `{kind:'op', symbol}` token。
- **+ ROUND 包装**：选中已有的连续 token 段 → 用 `{kind:'round', inner:[...], decimals}` 包裹。
- 每个token 可点击删除。

### 7.3 token → DSL 转换（纯函数 `tokensToDsl(tokens: FormulaToken[]): string`）

```ts
function tokensToDsl(tokens: FormulaToken[]): string {
  return tokens.map(t => {
    switch (t.kind) {
      case 'self': return `SELF("${t.dimensionKey}")`;
      case 'number': return String(t.value);
      case 'op': return t.symbol;
      case 'round': return `ROUND(${tokensToDsl(t.inner)}, ${t.decimals})`;
    }
  }).join(' ');  // 空格分隔；DSL parser 忽略空白
}
```

### 7.4 实时校验 + 预览

每次 token 变化：
1. `tokensToDsl(tokens)` → DSL 字符串。
2. `compileFormula(dsl)` → 若抛错，DSL 预览区显示红色错误（语法错）；成功则显示绿色 DSL。
3. `buildDependencyGraph(dsl)` → 收集引用的 dimensionKey，自动出示例输入框。
4. admin 填示例值后，`evaluate(compiled, { self: (k) => ... 示例值, refSameGroup: () => null, groupAggregate: () => null })` → 显示结果或错误（除零等）。

### 7.5 添加到草稿

admin 点"添加到草稿"：
- 输出列名/unit/decimals → 构造 dimension binding（columnGroup='calculated', editable=false, valueKind='number'）。
- token 流 → DSL → 构造 formula definition（outputDimensionKey=列名, formulaDsl, scope='row', formulaVersion='v1'）。
- 回调父组件，把这条 dimension+formula 加入草稿编辑区的列表。
- 父组件点"保存草稿"时统一 PUT。

---

## 8. 安全

- **admin 权限**：草稿端点 + 入口都 `requireAdmin` / admin 可见。
- **白名单闭口**：构建器只能产出 SELF/算术/ROUND——不可能生成 INDIRECT/VBA/A1（UI 不暴露这些入口）。
- **后端二次校验**：草稿保存端点对每个 formula 调 `compileFormula`，防前端绕过。
- **发布校验沿用 Wave 1**：publish 端点的循环检测 + 维度存在性 + 单位兼容性 + 输出列可编辑性检查全部生效。
- **审计**：草稿保存 + 发布都写 `security_audit_logs`。

---

## 9. 测试

### 9.1 单元测试（`src/lib/matrix/formula-builder.test.ts`）

- **tokensToDsl**：
  - `[SELF("a"), OP("/"), SELF("b")]` → `"SELF(\"a\") / SELF(\"b\")"`。
  - `[ROUND([SELF("a"), OP("/"), SELF("b")], 4)]` → `"ROUND(SELF(\"a\") / SELF(\"b\"), 4)"`。
- **token 流 → compileFormula**：生成的 DSL 能被 compileFormula 正确解析。
- **示例预览**：tokens + 示例输入 → evaluate → 期望值（juicer 黄金值 0.4683）。

### 9.2 端点测试（`src/app/api/matrix-schema-versions/[id]/draft.route.test.ts`）

- 草稿保存成功（dimensions + formulas 写入）。
- 重复保存幂等（不累积）。
- 已 published 版本 → 409 IMMUTABLE。
- 非法 DSL → 422 PARSE_ERROR。
- 未知 dimensionKey 引用 → 422 DIMENSION_NOT_FOUND。

### 9.3 端到端（`tests/e2e/matrix-formula-builder.spec.ts`，FB-01~04）

- FB-01：admin 组装出汁率公式 → 填示例 → 预览 0.4683 → 发布 → 新任务应用该模式 → 矩阵出现出汁率列 + 自动算值。
- FB-02：组装循环引用 → 发布被拒。
- FB-03：UI 不出现 A1/INDIRECT 入口（结构性保证，测试断言构建器只有 SELF/数字/运算符/ROUND 按钮）。
- FB-04：草稿保存 → 刷新 → 草稿仍在。

---

## 10. 待业务确认的开放项

| 编号 | 待确认项 | 默认建议 |
|---|---|---|
| F-01 | 草稿读取端点：新增 `GET /api/matrix-schema-versions/[id]/draft` 还是复用 publish 端点的内部加载逻辑暴露一个 GET | 新增 `GET /api/matrix-schema-versions/[id]` 返回版本 + dimensions + formulas（publish 端点已有内部加载，抽出来复用） |
| F-02 | 草稿自动保存频率 | 手动点"保存草稿"按钮（不做自动保存）；简单可控 |
| F-03 | 一个版本能否有多个计算列公式 | 是（publish 端点已支持多公式）；UI 允许多个 FormulaBuilder |
| F-04 | decimals 默认值 | 4（与 juicer 样本一致） |

---

## 11. 实施分期

本增强是单一 Wave（不再细分）。实施计划见 `docs/superpowers/plans/2026-07-04-matrix-formula-builder-implementation.md`（writing-plans 后产出）。

依赖：
- Wave 1 已交付的 DSL 引擎 + schema admin API（Task 13）。
- Wave 1 的 `compileFormula` / `evaluate` / `buildDependencyGraph`。

---

## 12. 与既有规格的关系

- 本设计**承接** Wave 1 的数据矩阵录入视图（`docs/superpowers/specs/2026-07-03-data-matrix-input-view-design.md` §15 Wave 2"受限公式构建器"）。
- 本设计**对齐**外部 PRD GV3.5.5 §29.4.4（受限公式构建器：UI 可类 Excel 点选，但持久化必须转换为语义引用，禁止 A1 坐标）。
- 本设计**不冲突**于任何 Wave 1/Wave 2-1 红线（语义化 DSL、无单元格自由富文本、无 A1 公式、admin 权限边界）。
- 批量粘贴（Wave 2-1）是独立 spec，不在本设计范围。
