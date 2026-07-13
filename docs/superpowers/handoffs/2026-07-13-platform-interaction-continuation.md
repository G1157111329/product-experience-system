# 产品体验平台交互收口任务交接

更新时间：2026-07-13

工作区：`C:\Users\G1157\.vscode\product-experience-system`
分支：`main`
执行方式：用户授权直接提交到 `main`，希望使用子任务执行、主线程复核。协作接口没有子任务模型选择参数，因此不能强制指定 Luna。

## 目标

完成以下已确认工作：

- 体验计划默认功能/食谱，移除任务内 AI 助手入口。
- 恢复食谱/功能摘要、自动同步的问题管理输出。
- 数据矩阵保留桌面 Excel 全局录入，改善当前实例直达、分区导航、冻结层级和移动逐行录入。
- 对比矩阵改为桌面紧凑概览加当前细项聚焦编辑，移动端按当前细项纵向比较 A/B/C。
- 冻结普通报告显示“数据矩阵”，对比报告显示“对比矩阵”，仅有实质内容才出现。
- 冻结详情与匿名分享内容结构一致；打印/PDF纸张版式独立但共享冻结内容和显示门禁。
- 冻结报告素材按主素材、过程证据、问题附录、矩阵摘要分级呈现。
- 后续统一全平台异步状态、状态词、语义 Tab/筛选、保存反馈与移动端交互。

## 先读这些规格和计划

1. `docs/superpowers/specs/2026-07-11-platform-interaction-convergence-design.md`
2. `docs/superpowers/specs/2026-07-13-matrix-interaction-and-report-media-design.md`
3. `docs/superpowers/plans/2026-07-13-frozen-report-and-media-implementation.md`
4. `docs/superpowers/plans/2026-07-13-task-authoring-and-matrix-interaction-implementation.md`
5. `docs/superpowers/plans/2026-07-13-platform-interaction-convergence-implementation.md`

设计与计划提交：`1d991b0`、`c8eb995`、`bb78a6a`。

## 已完成并通过规格与代码质量双审查

### 报告快照锚定，报告计划 Task 1

主要提交链：`34bf78e` 至 `19641ab`。

已完成：

- 所有报告读取面优先按 `reports.snapshot_id` 精确读取快照。
- 仅旧报告没有 `snapshot_id` 时允许 latest fallback；锚点损坏强失败。
- 普通有实质数据矩阵和对比报告快照写入 fail-closed。
- 自建 PostgreSQL 与 Supabase service-role 分别使用同库原子写路径。
- 已覆盖报告级锁、幂等键、内容指纹、重放 409、稳定 DTO、稳定集合排序。

新增迁移，已登记 Drizzle journal 且同步主 schema：

- `0013_atomic_report_snapshot_rpc.sql`
- `0014_idempotent_report_snapshot_rpc.sql`
- `0015_validate_snapshot_idempotency_replays.sql`

本地 Docker DB 已应用 0014 和 0015。新环境和云部署必须执行全部新迁移后再启动匹配版本代码。

关键测试：

```powershell
pnpm exec tsx src/lib/server/report-snapshots.test.ts
pnpm exec tsx src/lib/server/report-snapshot-atomicity.test.ts
pnpm exec tsx src/lib/server/report-snapshot-persistence.test.ts
pnpm ts-check
pnpm lint
```

## 已实现，尚未完成最终质量复核

### 显式冻结矩阵 Tab，报告计划 Task 2

提交：

- `ebb378f feat: distinguish frozen report matrix tabs`
- `302605e fix: harden frozen report tab state`

规格复核已通过。最后一次代码质量复核因会话中断，必须重新执行后才能标记 Task 2 完成。

已实现：

- `ReportFrozenTabKey` 与 `buildReportFrozenTabs`。
- 普通报告使用 `data_matrix`，标签“数据矩阵”。
- 对比报告使用 `comparison_matrix`，标签“对比矩阵”。
- 对比 Tab 需要 objects、item_nodes 和有意义的文本或媒体。
- 空结构不显示矩阵 Tab。
- 切换报告 ID 时重置旧状态、取消旧请求、忽略迟到响应；无效 active Tab 回退总结。
- 无锚点 legacy 报告快照查询失败时降级显示非矩阵内容；有锚点时继续强失败。

下一窗口的第一步：

1. 派只读代码质量审查子任务复查 `ebb378f..302605e`。
2. 重点检查 AbortController cleanup、跨报告状态污染、legacy fallback、comparison gate、测试质量和无关改动。
3. 审查通过后，才开始报告计划 Task 3。

相关检查：

```powershell
pnpm exec tsx src/lib/report-frozen-tabs.test.ts
pnpm exec tsx src/lib/matrix/meaningful-content.test.ts
pnpm exec playwright test tests/e2e/v3124-closure.spec.ts --grep "matrix" --workers=1
pnpm ts-check
pnpm lint
```

## 后续实施顺序

每个实现子任务都必须经过：实现者自检、规格审查、代码质量审查。任何审查未通过都回到同一实现者修复并复审。

### 报告计划

1. Task 3：`FrozenReportViewModel`，让详情与分享同源。
2. Task 4：`FrozenReportReader`，让详情与匿名分享同结构。
3. Task 5：V2/V3 数据矩阵冻结阅读卡片，无横向滚动。
4. Task 6：`ReportMediaGrid`，按素材语义尺寸和数量限制呈现。
5. Task 7：浏览器打印和服务端 PDF 从同一冻结模型投影，保持独立纸张版式并补数据矩阵。
6. Task 8：Docker、浏览器、分享、打印/PDF 全链路验收。

### 任务录入与矩阵计划

1. 移除任务内 Agent，默认功能/食谱。
2. 食谱/功能摘要标签和食材浮层关闭前 flush 保存。
3. 自动同步问题的只读输出区。
4. 数据矩阵当前实例直达与紧凑选择器。
5. V3 桌面分区导航、冻结层级、行聚焦和 Enter 保存。
6. V3 移动端当前行和分区卡片。
7. 对比矩阵紧凑概览、聚焦编辑和移动纵向对象。

### 全平台收口计划

1. 共享 async/save/semantic-tab/filter 基础组件。
2. Tab、筛选和模块状态语义。
3. 搜索竞态、加载、错误和空态。
4. 问题、报告、分析的状态真实性。
5. 问题列表、详情和整改保存闭环。
6. 分析和全局 AI 移动布局。
7. 全平台 Docker 验收。

## 当前环境

- 本地 Docker 健康：`http://127.0.0.1:5000`
- Compose：`docker-compose.local.yml`
- 继续改代码后运行：`docker compose -f docker-compose.local.yml up -d --build`
- 浏览器验收优先使用 `127.0.0.1`，不要依赖 `localhost`。
- 涉及报告的改动必须同时检查详情、匿名分享、浏览器打印和 PDF；不得仅检查一个页面。

## 工作树保护边界

以下是用户已有未提交改动，禁止暂存、覆盖或回滚：

- `src/app/api/v1/admin/wecom-bindings/[id]/route.ts`
- `src/app/api/v1/admin/wecom-bindings/route.ts`
- `src/app/api/v1/matrix-columns/[id]/route.ts`
- `src/components/navigation.tsx`
- `src/components/wecom-bindings-settings.tsx`

以下是本会话过程文件，不要混入产品提交：

- `task_plan.md`
- `findings.md`
- `progress.md`

每次提交必须 allowlist 暂存，并运行：

```powershell
git diff --cached --check
pnpm ts-check
pnpm lint
```

全部本地 Docker 验收完成前，不推送云服务器；需等待用户在本地确认后再单独获得云部署授权。
