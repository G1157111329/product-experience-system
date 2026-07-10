# 平台统一交互与 Hermes 操作 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将平台核心工作流升级为直接编辑、问题点输出、证据直显和 Hermes 全平台操作，同时保持冻结报告/PDF 零改动。

**Architecture:** 在既有全局导航与业务 API 上增量改造。先建立结构化食材/步骤/问题来源契约，再以任务详情、五感、问题管理为完整纵向切片；网页 Hermes、ClawBot 与企微最终共用同一风险分级动作契约。

**Tech Stack:** Next.js 15 App Router、React 19、TypeScript、shadcn/ui、Tailwind、PostgreSQL、Drizzle、Supabase 兼容层、Playwright、Docker Compose。

---

## 冻结范围

- 不改 `src/app/(main)/reports/[id]/**` 的冻结详情呈现。
- 不改 `src/app/reports/print/**`、`src/app/reports/share/**` 和 PDF 输出模板。
- 所有改动先在本地和 Docker 验收；Docker 未通过不得部署云端。

## Task 1: 建立可验证的直接编辑与动作风险基础

**Files:**

- Create: `src/lib/task-editing-contract.ts`
- Create: `src/lib/task-editing-contract.test.ts`
- Modify: `src/lib/agent-action-policy.ts`
- Modify: `src/lib/agent-actions.ts`
- Modify: `scripts/check-v2.6-success-metrics.ts`

- [ ] 先写失败测试：常规 `update`、`material_bind`、`recipe_step_update` 为可直接执行；删除、权限、配置、冻结/发布为确认操作。
- [ ] 运行 `pnpm tsx src/lib/task-editing-contract.test.ts`，确认因契约模块不存在而失败。
- [ ] 实现 `classifyTaskEditAction()` 与 `requiresConfirmation()`；输出 `direct`、`confirm`、`blocked` 三种结果。
- [ ] 扩展 Agent 动作规范，保证所有动作携带 `risk`、`idempotency_key` 和可显示的影响摘要。
- [ ] 重跑契约测试、`pnpm ts-check`、`pnpm lint`。

**Acceptance:** 常规更新无需额外编辑模式；敏感动作不能绕过确认；现有删除拒绝策略保持安全默认。

## Task 2: 结构化食材、步骤参数与问题来源数据契约

**Files:**

- Create: `src/storage/database/migrations/000x_task_context_and_recipe_parameters.sql`
- Modify: `src/storage/database/shared/schema.ts`
- Modify: `src/app/api/recipes/route.ts`
- Modify: `src/app/api/recipes/[id]/route.ts`
- Modify: `src/app/api/recipe-steps/route.ts`
- Modify: `src/app/api/recipe-steps/[id]/route.ts`
- Modify: `src/app/api/records/route.ts`
- Modify: `src/app/api/records/[id]/route.ts`
- Modify: `src/app/api/issues/route.ts`
- Modify: `src/app/api/issues/[id]/route.ts`

- [ ] 先写 API/contract 测试：食材项为 `{name, quantity, unit, note?}`；步骤参数为 JSON；五感记录和问题都能持有可空的食谱/步骤来源。
- [ ] 运行失败测试，确认旧路由不返回新字段。
- [ ] 添加可空、向后兼容字段：`recipes.ingredient_items`、`recipe_steps.parameters`、`check_records.recipe_id/recipe_step_id`、`issues.recipe_id/recipe_step_id/source_record_id`；旧文本字段继续读取。
- [ ] 让各 CRUD 路由校验任务归属并读写新字段；问题输出写入/更新问题时不得覆盖整改状态、责任人和复评信息。
- [ ] 运行迁移到 Docker 本地数据库，执行路由契约测试、`pnpm ts-check` 和 `pnpm lint`。

**Acceptance:** 结构化输入可读写；旧任务不迁移也可正常打开；问题、五感、食谱、步骤和素材可被同一任务上下文追溯。

## Task 3: 原位直接编辑组件与素材窗口读取

**Files:**

- Modify: `src/components/inline-editable.tsx`
- Create: `src/components/app/autosave-status.tsx`
- Modify: `src/components/material-picker.tsx`
- Modify: `src/app/api/materials/route.ts`
- Modify: `src/app/(main)/tasks/[id]/components/material-evidence-rail.tsx`
- Test: `scripts/check-material-naming.ts`

- [ ] 先写失败测试：`Enter`/失焦触发保存，`Esc` 恢复初始值；保存失败保留编辑值并提供重试；媒体 API 接受分页和目标筛选。
- [ ] 运行测试确认失败。
- [ ] 统一 `InlineEditable` 的自动保存、状态反馈和错误回退；删除/批量操作继续使用确认框。
- [ ] 为素材列表增加 `cursor`/`limit`/目标过滤，缩略图和视频封面惰性加载；保持旧查询参数兼容。
- [ ] 运行单元契约、`pnpm ts-check`、`pnpm lint`。

**Acceptance:** 普通文本、数值和步骤不再需要“编辑—保存”两次操作；大量素材不会一次取回全部原始文件。

## Task 4: 体验计划与单一食谱功能纵向切片

**Files:**

- Modify: `src/app/(main)/tasks/[id]/page.tsx`
- Modify: `src/app/(main)/tasks/[id]/components/functions-tab.tsx`
- Modify: `src/app/(main)/tasks/[id]/components/functions-input-workspace.tsx`
- Modify: `src/app/(main)/tasks/[id]/components/report-input-panel.tsx`
- Modify: `src/app/(main)/tasks/[id]/components/material-evidence-rail.tsx`
- Create: `src/app/(main)/tasks/[id]/components/issue-output-panel.tsx`

- [ ] 先写 Playwright 场景：选择食谱后食材参数直显；编辑食材/步骤自动保存；功能效果评价展示关联媒体；步骤区在超长列表下局部滚动。
- [ ] 运行场景并确认旧界面不满足断言。
- [ ] 将任务详情拆为“全局任务状态 + 食谱/功能目录 + 当前工作区 + 常驻素材证据区”；复用现有全局导航，禁止复制平台导航。
- [ ] 功能评价增加问题点输出组件：每条输出显示来源步骤、媒体和问题状态；写入问题管理的来源关联。
- [ ] 把现有总结/报告生成行为移动到统一顶部操作与报告信息状态卡；不修改冻结报告路由或组件。
- [ ] 运行 Playwright、`pnpm ts-check`、`pnpm lint`、`pnpm build`。

**Acceptance:** 工程师可在一个任务内完成食谱参数、步骤、效果、问题点和素材关联；报告入口仍使用当前报告链路。

## Task 5: 五感体验与问题管理纵向切片

**Files:**

- Modify: `src/app/(main)/tasks/[id]/components/senses-input-workspace.tsx`
- Modify: `src/app/(main)/tasks/[id]/page.tsx`
- Modify: `src/app/(main)/issues/page.tsx`
- Modify: `src/app/(main)/issues/[id]/page.tsx`
- Modify: `src/components/issues/issue-rectification-dialog.tsx`

- [ ] 先写失败场景：五感记录带入当前食谱/步骤；五感问题点输出在问题管理内显示来源和证据；由任务进入问题管理自动带筛选。
- [ ] 运行场景确认失败。
- [ ] 实现五感独立工作区，不渲染食材参数或功能效果评价；复用问题点输出协议。
- [ ] 在问题列表与详情展示任务、食谱、步骤、五感来源、关联媒体和整改状态；保留既有分级、指派、复评和关闭。
- [ ] 运行 Playwright、`pnpm ts-check`、`pnpm lint`。

**Acceptance:** 问题管理承接编辑页正式输出的问题，而不是要求工程师二次录入；上下文和证据可回溯。

## Task 6: 全局页面统一与冻结报告回归保护

**Files:**

- Modify: `src/app/(main)/dashboard/page.tsx`
- Modify: `src/app/(main)/tasks/page.tsx`
- Modify: `src/app/(main)/standards/page.tsx`
- Modify: `src/app/(main)/analysis/page.tsx`
- Modify: `src/app/(main)/agent/page.tsx`
- Modify: `src/app/(main)/reports/page.tsx`
- Test: `scripts/check-v2.5-report-center-contract.ts`
- Test: `scripts/check-golden-test-contract.ts`

- [ ] 先写失败 UI assertions：主页显示当前任务/待办行动；任务列表显示问题与报告进度；报告列表改造不触碰冻结详情/打印/分享路由。
- [ ] 运行断言确认失败。
- [ ] 复用 PageShell/PageHeader/FilterBar/MetricCard/StatusBadge 统一页面外壳、空状态、筛选和主操作层级。
- [ ] 保持报告详情、分享、打印与 PDF 文件不变；运行 golden/report contract 证明输出回归安全。
- [ ] 运行 `pnpm check:golden`、`pnpm ts-check`、`pnpm lint`、`pnpm build`。

**Acceptance:** 核心页面视觉和交互一致；冻结报告输出不变。

## Task 7: Hermes 全平台动作与 AI 食谱探索

**Files:**

- Modify: `src/app/api/tasks/[id]/agent-chat/route.ts`
- Modify: `src/app/api/tasks/[id]/agent-actions/route.ts`
- Modify: `src/lib/agent-actions.ts`
- Modify: `src/lib/agent-action-policy.ts`
- Modify: `src/components/agent/hermes-chat.tsx`
- Modify: `src/app/(main)/tasks/[id]/components/agent-assist-panel.tsx`
- Create: `src/app/(main)/tasks/[id]/components/recipe-ai-explorer-dialog.tsx`

- [ ] 先写失败契约测试：网页 Hermes 和聊天渠道产生相同的动作 envelope；非敏感动作直接执行；删除/权限/配置/冻结动作只能返回确认提案。
- [ ] 运行测试确认失败。
- [ ] 为食谱探索增加对话式提案、影响预览、确认执行和审计回执；页面不展示硬编码示例提示词。
- [ ] 统一上下文传递：当前用户、角色、页面、任务、食谱、步骤、选中素材；失败保留原输入。
- [ ] 运行 Agent policy/access/binding 现有检查、契约测试、`pnpm ts-check`、`pnpm lint`。

**Acceptance:** Hermes 可以在授权范围内操作全平台业务对象；消息入口和网页入口不分叉；敏感动作不可绕过确认。

## Task 8: 本地、Docker 与云端发布门禁

**Files:**

- Modify: `docker-compose.local.yml`（仅在迁移/验证需要时）
- Modify: `docs/operations/` 下新增发布检查记录
- Modify: Playwright 用例和 Docker 验收脚本

- [ ] 在本地运行迁移、`pnpm ts-check`、`pnpm lint`、`pnpm check:golden`、相关契约检查和 `pnpm build`。
- [ ] 执行 `docker compose -f docker-compose.local.yml up --build`，确认容器健康、登录、工作台、任务编辑、五感、问题管理、报告列表和冻结报告/PDF 回归路径。
- [ ] Docker 验收失败时停止，修复后重新从本地门禁开始；不得部署云端。
- [ ] Docker 验收通过后备份云端当前运行版本、执行幂等迁移、部署运行产物、重启 PM2，并检查 `127.0.0.1:5001` 登录、字典、报告和外网入口。
- [ ] 记录回滚提交、迁移状态、Docker 与云端验证结果；云端异常立即恢复上一已验证版本。

**Acceptance:** 本地和 Docker 真实前端链路通过后才覆盖云端；冻结报告、数据和 Agent 对话历史不被部署包覆盖。

## Verification Checkpoints

- 每完成一个任务：运行该任务测试、`pnpm ts-check` 和 `pnpm lint`；通过后再提交。
- Task 4、5、6 后：运行 `pnpm build` 与对应 Playwright 场景。
- Task 8 前：重新运行全部相关契约、golden、build 与 Docker 验收。
- 云端发布后：按 AGENTS.md 的 PM2、`/login`、字典和报告路径进行真实 HTTP 验证。
