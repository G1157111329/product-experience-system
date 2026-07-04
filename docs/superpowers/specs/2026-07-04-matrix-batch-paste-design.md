# 数据矩阵批量粘贴增强设计（Wave 2 子能力一）

日期：2026-07-04
状态：待评审
适用范围：在已建好的数据矩阵录入视图（Wave 1）之上，新增从 Excel 粘贴多行多列原始指标到矩阵的能力
权威依据：plan §7.2.2（batch-commands 端点契约）、plan §5.3（批量命令响应约定）、外部 PRD GV3.5.5 §29.4.1（批量粘贴仅支持与可见可编辑维度一一对应的纯值粘贴）
对齐基线：本仓库 Wave 1 已交付的 DSL 引擎、schema/instance/CRUD/recompute API、桌面 grid + 移动卡片

---

## 1. 目标

### 1.1 要解决的业务问题

录入人员在原汁机这类任务里需要逐格填 dozens 到上百个原始指标（耗时、食物重量、出汁重量、果渣重量等）。当前只能逐格 PATCH，效率低、易错。本增强允许从 Excel 一次粘贴一片「原始指标区」，把录入时间从分钟级降到秒级。

### 1.2 本设计的定位

批量粘贴是**录入提效组件**，不是 Excel 解析器、不是任意区域映射、不是原子导入。

- 仅支持**原始指标区**（`column_group='observed' && editable=true`）粘贴。
- 起点由用户**点选错点**决定（不识别表头）。
- 部分成功 + 逐项错误（不回滚已写入项，失败格前端高亮）。
- batch 末尾集中重算（一次返回所有权威计算结果）。
- 复用 Wave 1 的 `upsertMetricEvaluation` / `recomputeAffected`，**不引入新表**。

### 1.3 成功判定

| 指标 | 目标 |
|---|---|
| AT-19 端到端 | 3 行 × 2 列原始指标粘贴 → 全部成功，受影响计算列一次性刷新权威值（juice_yield 等） |
| AT-20 计算列只读保护 | 粘贴区含计算列 → 该列命令失败 `MATRIX_CALCULATED_VALUE_READONLY`，原始列正常写入 |
| AT-21 上限保护 | 501 单元格 → 429 `MATRIX_BATCH_LIMIT_EXCEEDED` |
| AT-22 并发冲突 | 粘贴期间他人改了某格导致 version 冲突 → 该格失败、其他成功、前端高亮失败格 |
| 性能 | 500 单元格 batch + 受影响 ≤50 行重算，P95 < 5s |
| 幂等 | 同一 `clientOperationId` 重复提交 → 返回首次结果，不重复写 |

---

## 2. 不做范围（红线）

1. **不做任意区域粘贴**。粘贴区只能落入 observed+editable 列；计算列、行标签、证据/问题列拒绝。
2. **不做列头自动匹配**。错点决定起点，按 schema sortOrder 推进；不识别"出汁重量"等表头文字。
3. **不做原子事务**。部分成功不回滚（沿用 Wave 1 的 pg-query 无事务限制）；失败格由前端按 `results` 显式高亮，让用户决定是否重试。
4. **不做撤销/重做栈**。失败用 results 高亮 + 用户手动改；不做 undo。
5. **不做跨组粘贴**。粘贴行推进遇到下一组的 section band → 截断到当前组最后一行 + warning。
6. **不做跨任务/跨实例粘贴**。仅限当前 assembly 内。
7. **不引入移动端大批量粘贴**。移动端仍只支持单格录入（Wave 1 既有路径）。
8. **不接受 Excel 公式/格式/合并单元格**。仅纯值；外部公式/格式被剥离或拒绝（沿用 DSL 红线）。

---

## 3. 设计哲学决策（已确认）

| 决策点 | 选择 | 理由 |
|---|---|---|
| 粘贴形状 | **仅原始指标区** | 安全可控，覆盖 90% 录入场景；避免解析复杂度 |
| 起点 | **点选错点** | 贴合 Excel 习惯；横向从错点列推进，纵向从错点行推进 |
| 端点形态 | **新 batch-commands 端点** | 一次请求、事务内逐项处理、集中重算；plan §7.2.2 原设计 |
| 计算触发 | **batch 末尾集中重算** | 按 row 去重，避免 500 次重算；一次返回权威值 |
| 上限与失败 | **500 上限 + 部分成功** | 类 Excel"能存多少存多少"；失败逐项返回 |
| 跨组 | **截断到当前组末** | 避免错位；返回 warning |

---

## 4. 与 Wave 1 代码的复用映射

| 本设计需要的能力 | Wave 1 已有的复用点 | 改动量 |
|---|---|---|
| 写入 manual metric | `upsertMetricEvaluation`（`src/lib/matrix/recompute.ts`，已含 version 守卫） | 零改动 |
| 重算计算列 | `recomputeAffected`（`src/lib/matrix/recompute.ts`） | 零改动 |
| schema 维度查询 | `matrix_dimension_bindings`（按 schema_version_id 查 observed+editable 列） | 零改动 |
| 行/分组结构 | `comparison_item_nodes`（section/item 树） | 零改动 |
| 审计 | `writeSecurityAudit` | 零改动 |
| 前端 grid | `MatrixVirtualGrid` + `MatrixCell` | 加 `onPaste` 处理 + 失败高亮 state |
| 前端 DSL 引擎 | `compileFormula` / `evaluate`（`formula-engine.ts`，前后端共享） | 零改动（乐观计算复用） |
| **新端点** | `POST /api/task-matrices/[id]/batch-commands` | **新增**（核心交付） |
| **新 lib** | `src/lib/matrix/batch-paste.ts`（命令解析 + 集中重算编排） | **新增** |

**关键发现**：核心写入/重算逻辑 Wave 1 已建好且测试覆盖。本增强只是在它们之上加一层"批量编排 + 错点对齐 + 集中重算"。

---

## 5. 数据模型

**不新增表**。复用：
- `metric_evaluations`（cell_id × metric_key，每条命令写一行 manual）
- `matrix_calculation_runs`（trigger_type 增加 `'batch_paste'` 值；本设计为每个受影响行写一条 run，复用既有 recomputeAffected 的 run 写入逻辑）
- `comparison_item_nodes`（行/分组结构）

---

## 6. API：`POST /api/task-matrices/[id]/batch-commands`

### 6.1 请求体

```json
{
  "clientOperationId": "op_20260704_001",
  "baseVersion": 12,
  "anchor": {
    "rowId": "row_carrot_160",
    "dimensionKey": "ingredient_weight"
  },
  "commands": [
    { "type": "setMetric", "rowId": "row_carrot_160", "dimensionKey": "ingredient_weight", "value": 1193.1, "unitCode": "g" },
    { "type": "setMetric", "rowId": "row_carrot_160", "dimensionKey": "juice_weight", "value": 558.7, "unitCode": "g" },
    { "type": "setMetric", "rowId": "row_carrot_120", "dimensionKey": "ingredient_weight", "value": 1182.3, "unitCode": "g" }
  ]
}
```

字段说明：
- `clientOperationId`（必填）：客户端生成的幂等键，服务端查重用。
- `baseVersion`（必填）：提交时前端持有的 `projection.version`，用于乐观检测；不匹配 → 409 提示前端 refetch。
- `anchor`（必填）：用户点选的错点。服务端用它二次校验 commands 与错点的几何关系（commands 的 (rowId, dimensionKey) 必须落在从 anchor 开始、按 schema observed sortOrder + 行序推进的矩形区内）。
- `commands`（必填，≤500）：每条是 `setMetric`。`value` 按 `valueKind` 解析（number/duration/text）；`unitCode` 可选（缺省用 dimension 绑定的 unit）。

### 6.2 响应体

成功（HTTP 200）：
```json
{
  "code": 0,
  "message": "success",
  "data": {
    "operationId": "op_20260704_001",
    "status": "partially_succeeded",
    "results": [
      { "index": 0, "status": "succeeded", "rowId": "row_carrot_160", "dimensionKey": "ingredient_weight", "newVersion": 4 },
      { "index": 1, "status": "succeeded", "rowId": "row_carrot_160", "dimensionKey": "juice_weight", "newVersion": 5 },
      {
        "index": 2,
        "status": "conflict",
        "rowId": "row_carrot_120",
        "dimensionKey": "ingredient_weight",
        "error": { "code": "MATRIX_METRIC_VERSION_CONFLICT", "latestVersion": 9, "latestValue": 1180.0 }
      }
    ],
    "authoritativeCalculations": [
      { "rowId": "row_carrot_160", "metricKey": "juice_yield", "value": 0.4683, "unit": "%", "formulaVersion": "v1", "status": "valid" }
    ],
    "calculationRunIds": ["mcr_01"],
    "warnings": []
  }
}
```

- `status`：`succeeded`（全成功） / `partially_succeeded`（部分失败） / `failed`（全失败或 baseVersion 冲突）。
- `results[]`：每条命令一项，按 commands 原顺序。`status ∈ {succeeded, conflict, validation_failed, row_not_found}`。
- `authoritativeCalculations`：所有受影响行的所有计算列结果（batch 末尾集中重算产物）。
- `calculationRunIds`：本次重算的 run id 列表。
- `warnings`：非阻断提示，如跨组截断。

### 6.3 错误响应

| HTTP | code | 触发 | 前端行为 |
|---:|---|---|---|
| 400 | `MATRIX_BATCH_INVALID_SHAPE` | commands 为空 / anchor 缺失 / 命令格式错 | 表单定位 |
| 403 | `MATRIX_PERMISSION_DENIED` | 无 assembly 权限 | 不泄露数据 |
| 409 | `MATRIX_VERSION_CONFLICT` | baseVersion 与服务端 projection.version 不匹配 | 提示 refetch 后重试 |
| 422 | `MATRIX_BATCH_ANCHOR_INVALID` | anchor 的 rowId/dimensionKey 不存在或非 observed+editable | 提示重新选错点 |
| 422 | `MATRIX_BATCH_COMMAND_OUT_OF_RANGE` | 某 command 落在 anchor 矩形区外（如跨组、跳列） | 高亮越界命令 |
| 422 | `MATRIX_UNIT_INVALID` / `MATRIX_VALUE_INVALID` | 单位/值不合法（该命令失败，不阻断其他） | 该格失败高亮 |
| 429 | `MATRIX_BATCH_LIMIT_EXCEEDED` | commands > 500 | 提示拆分 |
| 500 | `MATRIX_BATCH_INTERNAL_ERROR` | 未预期错误（已写入项不回滚） | 显示错误 + 建议刷新 |

### 6.4 幂等

以 `(matrix_instance_id, clientOperationId)` 查 `matrix_calculation_runs.trace_id`（约定 batch 粘贴把 clientOperationId 写入 trace_id 字段）或新增轻量幂等表。**首版采用前者**：batch 末尾写 run 时 `trace_id = clientOperationId`，重复提交先查 run 是否已存在该 trace_id + matrix_instance_id，命中则重放 results。

---

## 7. 服务端流程（`src/lib/matrix/batch-paste.ts`）

```text
1. Auth + canAccessAssembly
2. baseVersion 乐观检测：GET projection.version；不匹配 → 409 MATRIX_VERSION_CONFLICT
3. 幂等查重：trace_id=clientOperationId 命中既有 run → 重放 results（不重复写）
4. 上限校验：commands.length > 500 → 429 MATRIX_BATCH_LIMIT_EXCEEDED
5. 加载 schema_version 的 matrix_dimension_bindings，构建 observedSortOrder: dimensionKey[]
6. anchor 校验：
   - anchor.rowId 存在且 node_type ∈ ('item','condition')
   - anchor.dimensionKey 在 observedSortOrder 内
   否则 → 422 MATRIX_BATCH_ANCHOR_INVALID
7. 命令几何校验（逐条）：
   - rowId 与 anchor.rowId 同组（parent_id 一致）且 sort_order ≥ anchor 行
   - dimensionKey 在 observedSortOrder 内且列序 ≥ anchor 列
   否则 → 该命令标记 failed(MATRIX_BATCH_COMMAND_OUT_OF_RANGE)，跳过写入
8. 逐命令写入（部分成功语义）：
   for cmd in commands (skip 已 failed):
     try:
       upsertMetricEvaluation(client, { cell_id: cmd.rowId, metric_key: cmd.dimensionKey,
         calculation_mode: 'manual', value_kind, numeric_value|duration_ms|text_value,
         unit_code, input_state: 'valid', version: prev+1 })
       → succeeded, newVersion
     catch MetricMetricConflictError → conflict, latestVersion, latestValue
     catch UnitInvalid/ValueInvalid → validation_failed
     catch RowNotFound → row_not_found
     其他失败 → validation_failed + 错误码
9. 集中重算：
   affectedRowIds = unique(succeeded.rowId)
   for rowId in affectedRowIds:
     result = recomputeAffected({ client, assemblyId, schemaVersionId,
       triggeredRowId: rowId, triggeredDimensionKey: '<batch>', traceId: clientOperationId,
       triggerType: 'batch_paste' })
     收集 result.updated → authoritativeCalculations
     收集 result.runId → calculationRunIds
10. 跨组截断检测（步骤 7 已在命令几何校验里做）：若任一命令因跨组失败，加 warning
11. 审计：writeSecurityAudit(action='matrix_batch.executed',
      metadata={ commandCount, succeeded, failed, conflict, affectedRows })
12. 返回 { operationId, status, results, authoritativeCalculations, calculationRunIds, warnings }
```

### 7.1 关键约束

- **recomputeAffected 复用**：本设计不新写重算逻辑，直接调用 Wave 1 的 `recomputeAffected`。它已自带幂等（input_version_hash + formula_version_hash），所以同一行被多次触发不会重复算。
- **trigger_type 扩展**：`recomputeAffected` 的 triggerType 参数增加 `'batch_paste'` 值（既有：`'api_save'|'api_recalculate'|'snapshot_build'`）。这是 schema 层的小调整（`matrix_calculation_runs.trigger_type` 是 varchar，无需 migration）。
- **跨组判定**：通过 `comparison_item_nodes.parent_id` 判定。anchor 行的 parent_id 是组 id；命令行的 parent_id 必须等于该组 id。
- **不引入 DB 事务**：沿用 Wave 1 限制。部分成功不回滚；前端按 results 高亮失败格。

---

## 8. 前端

### 8.1 错点选择 state

`MatrixVirtualGrid` 增加：
- `focusedCell: { rowId, dimensionKey } | null`（点击单元格时设置）。
- 粘贴处理器仅在 `focusedCell` 存在且属于 observed+editable 列时生效。

### 8.2 `onPaste` 处理（桌面 grid）

```text
1. 监听 grid 容器的 paste 事件（或选中格的 onKeyDown Cmd/Ctrl+V）
2. 解析剪贴板：
   text = e.clipboardData.getData('text/plain')
   rows = text.split(/\r?\n/).filter(non-empty)
   grid = rows.map(r => r.split(/\t/))  // 二维数组
3. 几何对齐：
   - 错点列 = focusedCell.dimensionKey 在 observedSortOrder 的索引
   - 错点行 = focusedCell.rowId 在所属组 rows 的索引
   - 目标列 = observedSortOrder[anchorColIdx + c] for c in grid[0]
   - 目标行 = groupRows[anchorRowIdx + r] for r in grid
4. 构建 commands：遍历 grid，每格按目标维度 valueKind 解析为 number/duration/text
5. 乐观计算：用 compileFormula + evaluate 即时算受影响计算列（标"乐观"角标）
6. POST /api/task-matrices/[id]/batch-commands
7. 收到响应：
   - succeeded 项 → 用 newVersion 更新本地 projection
   - authoritativeCalculations → 覆盖计算列（清除"乐观"角标）
   - failed/conflict 项 → 在对应格设 failedOverlay state（红色边框 + tooltip）
8. 失败格点击 → 显示错误码中文 + "重试该格"按钮（重试走单格 PATCH）
```

### 8.3 失败格高亮

- `MatrixCell` 增加 `failedError?: { code, message }` prop。
- 渲染时若有 failedError：红色边框 + `title` tooltip 显示中文错误。
- failedOverlay state 在用户重试成功或切换错点时清除。

### 8.4 移动端

不开放批量粘贴。移动端的 `MatrixMobileCards` 不监听 paste；保留单格录入（Wave 1 既有）。在桌面 grid 顶部加一个轻提示"支持 Cmd/Ctrl+V 粘贴原始指标区"。

### 8.5 baseVersion 检测

- 前端持有 `projection.version`（Wave 1 已有，目前硬编码为 1）。
- 粘贴提交时把当前 `projection.version` 作为 `baseVersion` 发送。
- 服务端 409 → 前端 refetch projection 后重试（或提示用户"数据已变化，请重新粘贴"）。

**注**：Wave 1 的 projection.version 目前硬编码为 1（`src/lib/matrix/projection.ts`），这意味着首版粘贴的 baseVersion 检测实际上不会触发 409。这是 Wave 1 的已知限制；本增强的端点契约仍按完整 version 语义设计，待 Wave 1 补齐 version 后自然生效。

---

## 9. 错误码中文映射（前端）

| code | 中文 |
|---|---|
| `MATRIX_BATCH_LIMIT_EXCEEDED` | 粘贴超出 500 单元格上限，请拆分 |
| `MATRIX_BATCH_ANCHOR_INVALID` | 错点无效，请重新选择原始指标单元格 |
| `MATRIX_BATCH_COMMAND_OUT_OF_RANGE` | 该单元格超出粘贴区（跨组或跳列），已跳过 |
| `MATRIX_CALCULATED_VALUE_READONLY` | 该列为计算指标，不可粘贴 |
| `MATRIX_METRIC_VERSION_CONFLICT` | 该单元格已被他人修改，请刷新后重试 |
| `MATRIX_UNIT_INVALID` | 单位不合法 |
| `MATRIX_VALUE_INVALID` | 值不合法 |
| `MATRIX_ROW_NOT_FOUND` | 该行已不存在 |
| `MATRIX_VERSION_CONFLICT` | 矩阵数据已变化，请刷新后重新粘贴 |
| `MATRIX_BATCH_INVALID_SHAPE` | 粘贴内容格式不正确 |

---

## 10. 安全

- **Auth**：`requireUser` + `canAccessAssembly`。
- **审计**：每次 batch 写一条 `matrix_batch.executed`，含命令数/成功/失败/冲突汇总 + clientOperationId。
- **限流**：复用既有 API 限流；batch 端点的 500 上限本身是天然限流。
- **数据隔离**：commands 的 rowId 必须属于当前 assembly（几何校验 + canAccessAssembly 双重保证）；不能通过伪造 rowId 写其他 assembly 的数据。
- **无 Excel 公式注入**：粘贴只取纯值；Excel 公式（如 `=cmd|...`）作为文本值会被 valueKind=number 校验拒绝。

---

## 11. 性能门禁

| 指标 | 目标 |
|---|---|
| 500 单元格 batch + ≤50 行重算 P95 | < 5s |
| batch 端点 5xx 比率 | < 0.5% |
| 幂等查重命中率（重复提交） | 100% 返回缓存结果 |
| 前端粘贴 → 乐观显示延迟 | < 100ms |
| 前端权威值回写延迟 | < 服务端 P95 |

---

## 12. 测试

### 12.1 单元测试（`src/lib/matrix/batch-paste.test.ts`）

- **几何校验**：anchor + commands 矩形区内/外的判定（跨组、跳列、跨实例）。
- **部分成功**：3 命令含 1 个 version 冲突 → 2 succeeded + 1 conflict。
- **集中重算**：affectedRowIds 去重后调用 recomputeAffected 次数 = 不重复行数。
- **幂等**：同一 clientOperationId 重复提交 → 第二次返回首次 results，不写新 run。
- **上限**：501 命令 → 拒绝。
- **计算列只读**：command 的 dimensionKey 是 calculated → 该命令失败 `MATRIX_CALCULATED_VALUE_READONLY`。

### 12.2 端到端（`tests/e2e/matrix-batch-paste.spec.ts`，AT-19~22）

- AT-19：3 行 × 2 列粘贴 → 全成功，juice_yield 权威值刷新。
- AT-20：粘贴区含计算列 → 该列失败、原始列成功。
- AT-21：501 单元格 → 429。
- AT-22：粘贴期间他人改某格 → 该格 conflict、其他 succeeded、前端高亮。

---

## 13. 实施分期

本增强是单一 Wave（不再细分 Wave 0/1）。实施计划见 `docs/superpowers/plans/2026-07-04-matrix-batch-paste-implementation.md`（writing-plans 后产出）。

依赖：
- Wave 1 已交付的 `upsertMetricEvaluation` / `recomputeAffected` / `matrix_dimension_bindings` 查询。
- Wave 1 的 `recomputeAffected` 需接受 `triggerType: 'batch_paste'`（小调整）。

---

## 14. 待业务确认的开放项

| 编号 | 待确认项 | 默认建议 |
|---|---|---|
| BP-01 | 上限 500 是否合适 | 合适；超出建议拆分，提示等待 RESERVED 的 Excel 受控导入 |
| BP-02 | 跨组截断 vs 跨组禁止 | 截断到当前组末 + warning（不阻断已对齐部分） |
| BP-03 | 失败格的"重试该格"是走单格 PATCH 还是重发 batch | 单格 PATCH（更轻、复用 Wave 1 路径） |
| BP-04 | 幂等键查重是新建表还是复用 trace_id | 复用 `matrix_calculation_runs.trace_id`（约定 batch 粘贴把 clientOperationId 写入 trace_id） |

---

## 15. 与既有规格的关系

- 本设计**承接** Wave 1 的数据矩阵录入视图（`docs/superpowers/specs/2026-07-03-data-matrix-input-view-design.md`），是其 Wave 2 子能力一。
- 本设计**对齐**外部 PRD GV3.5.5 §29.4.1 的批量粘贴规则（仅可见可编辑维度纯值粘贴、禁止外部公式/格式/合并单元格）。
- 本设计**不冲突**于 Wave 1 的任何红线（语义化 DSL、无单元格自由富文本、无 A1 公式）。
- 公式构建器（Wave 2 子能力二）是独立 spec，不在本设计范围。
