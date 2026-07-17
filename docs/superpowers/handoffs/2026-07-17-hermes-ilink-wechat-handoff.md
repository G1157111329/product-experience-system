# Hermes / AI助手：开发交接（2026-07-17，进度更新至当日 23:17）

## 交接目标（当前）

把 **Hermes（对外称「AI助手」）** 夯成平台业务 Agent 底座：微信/企微/平台浮窗共用同一套个人助手与会话；能新建体验计划、绑定任务、整理素材、按板块上下文录入；禁止删除、配置变更、用户管理等高风险动作。

**产品立场（已确认）**

- Hermes 是业务操作底座，不是纯聊天窗。
- **写入类操作**必须走「结构化计划 → 用户确认 → 平台执行」。
- **观点/方法问答**允许正常回答，不要强行改成绑任务。
- 运维/录入引导不得劝用户「去平台手动点」；假写入成功文案必须被 contract 清洗。

## 本轮已闭环（相对原 P0 handoff）

### 1. 微信入站无回复 P0（已修且已上生产）

原根因：`agent_runs.trigger` CHECK 缺少 `ilink_ingest`，Run 插入失败被网关吞掉 → 微信无回复。

已完成：

- 迁移 `0028_ilink_agent_run_trigger.sql`（幂等放宽 CHECK，含 `ilink_ingest`）
- 出站失败写 `ilink_bot_accounts.last_error` + 安全审计；`sendmessage` 校验 `ret/errcode`，要求 `context_token`
- 生产已应用 0028 并部署；文字链路可回复

### 2. 共享 Turn 路由（已上生产）

`dispatchHermesTurn` 是平台浮窗与微信/企微文字的统一入口：

| 入口 | 文件 |
|---|---|
| 个人微信 / 企微文字入站 | `src/lib/server/hermes/wecom-text-ingest.ts` |
| 平台会话发消息 | `src/app/api/v1/agent/conversations/[conversationId]/messages/route.ts` |
| 共享路由器 | `src/lib/server/hermes/hermes-turn.ts` |

确定性技能（不经通用「无法查询」胡说）：

- 进行中体验计划列表
- 新建 / 绑定任务
- 「确认 / 确认创建」执行待确认计划

相关：

- `workspace-skills.ts` / `workspace-plan.ts`
- `external-chat-commands.ts`
- `hermes-platform-contract.ts`（注入 `runtime.ts`：操作类锁死、观点放行、清洗假写入）

### 3. 执行器与自定义 Server 隔离（已上生产，勿回归）

曾把 Next `agent-actions/route.ts` 直接 import 进 `dist/server.js`，触发 `AsyncLocalStorage` / Next 运行时崩溃。

**正确形态**：业务执行在 `src/lib/server/hermes/task-action-executor.ts`；Next route 只做薄 HTTP 壳。
`dist/server.js` 不得再出现 `require('next/...')` / `AsyncLocalStorage` 来自 Next。
`security-audit.ts` 对 request 使用 duck-type，禁止 value-import `next/server`。

### 4. 双模会话向导（已接线 `dispatchHermesTurn` 并部署）

用户确认的会话合同：

1. **默认向导 + 数字快捷码**
   - 打开/未绑定时列出进行中体验计划：`1. 名称`…
   - 回序号绑定；回「不绑定」→ 无绑定记录模式
   - 绑定后板块：`1` 五感 / `2` 食谱功能 / `3` 对比 / `4` 数据矩阵
   - 细码：`21` 食谱1、`311` 对比对象1细项1、`411` 矩阵大类1细项1…
   - **注意**：未绑定且 `awaiting_task_pick` 时，`1`–`4` 优先当作**任务序号**，不是板块码
2. **2 小时空闲** → 自动解绑会话任务，并标记 `unboundByIdleTimeout`
3. **仅超时解绑后（或从未绑定）发媒体才强制列表重选**；绑定中发图不反复弹列表
4. 绑定中媒体 → 任务素材库 + `material_organize`（`naming_mode: context`）待确认计划
5. 无绑定模式：对话历史保留；媒体进 `pendingMediaIds`，绑定后再归位
6. 新建任务：只用真实 `experience_tasks` 字段 → 预览 → 确认 → 真实 insert

实现文件：

| 职责 | 文件 |
|---|---|
| 会话状态、空闲解绑、导航码解析、提示文案 | `hermes-session.ts` |
| 会话持久化（`tool_name=hermes_session` 的 tool 消息） | `hermes-session-store.ts` |
| 食谱/对比/数据矩阵列表 + claim 素材到任务 | `hermes-target-lists.ts` |
| 路由集成（空闲同步、向导、板块码、媒体策略） | `hermes-turn.ts` |
| 解绑会话任务 | `workspace-skills.ts` → `skillUnbindConversationTask` |

## 当前生产状态（2026-07-17 23:17 再部署）

| 项 | 值 |
|---|---|
| 主机 | `118.25.178.78` |
| 目录 | `/home/ubuntu/product-experience-system` |
| PM2 | `product-experience-system` → `dist/server.js` |
| 内层端口 | `5001` |
| 公网入口 | `http://118.25.178.78:5000` |
| BUILD_ID | `TdYUDYQ2YYBzsuICy-WES` |
| 冒烟 | LOGIN / DICT / REPORTS = 200（本机 5001 + 公网 5000） |
| `dist/server.js` 标记 | 含 `hermes_session`、`dispatchHermesTurn`、`不绑定` |

回滚目录（勿随意删）：

- `/home/ubuntu/deploy-backups/20260717-hermes-session/`
- `/home/ubuntu/deploy-backups/20260717-hermes-session-redeploy/`
- 更早：`20260717-ilink-personal-bot`、`20260717-ilink-user-select`

部署纪律（不变）：

- **禁止在服务器 `next build`**（内存/磁盘不足；`/home` 约 93% 占用）
- 本地 `pnpm build` → 上传 source（必要时）+ `dist/server.js` + `.next`（**不含 cache**）
- Windows zip 路径含 `\`，远端解压必须把 `\` 规范成 `/`，否则 BUILD_ID 对不上
- 重启：`pm2 delete product-experience-system && pm2 start ecosystem.config.cjs && pm2 save`

## 关键文件总表

### iLink / 绑定（既有）

| 职责 | 文件 |
|---|---|
| 后台 UI | `src/components/wecom-bindings-settings.tsx` |
| 管理员 iLink API | `src/app/api/v1/admin/ilink-bots/*.ts` |
| 长轮询 / 出站 | `src/lib/server/ilink-personal-bot-gateway.ts` |
| 媒体入库 | `src/lib/server/ilink-personal-media-ingest.ts` |
| DDL | `0027_ilink_personal_bot_accounts.sql`、`0028_ilink_agent_run_trigger.sql` |

### Hermes 会话与闭环（本轮重点）

| 职责 | 文件 |
|---|---|
| 共享 turn | `src/lib/server/hermes/hermes-turn.ts` |
| 双模会话 | `hermes-session.ts` / `hermes-session-store.ts` / `hermes-target-lists.ts` |
| 平台合同 | `hermes-platform-contract.ts` |
| 入站 | `wecom-text-ingest.ts` |
| 执行器 | `task-action-executor.ts` |
| 计划 / 技能 | `workspace-plan.ts` / `workspace-skills.ts` / `task-action-plan.ts` |
| 运行时 | `runtime.ts` |

## 本地验证基线

最近一次相关单测（均通过）：

- `hermes-session.test.ts`
- `external-chat-commands.test.ts`
- `wecom-text-ingest.test.ts`（含「共享 turn 驱动平台与外部聊天」契约）

完整构建：`pnpm build`（Next + tsup `dist/server.js`）已成功并用于本次部署。

## 尚未完成 / 下一位优先

按优先级（不要重新发明绑定模型，不要覆盖 Agent 历史数据）：

1. **微信端真实验收双模会话**（生产冒烟，不靠猜）
   - 「你好」/「我的进行中任务列表」→ 序号列表
   - 回 `1` 绑定 → 板块向导
   - 绑定中发图 → 入库计划，**不**再弹列表
   - 「不绑定」→ 收件箱；再绑后 pending 归位
   - （可选）模拟/等待 2h 空闲后再发图 → 必须重选列表
2. **板块上下文自动命名增强**
   - 五感 / 食谱名 / `对比对象*大类*细项` / `数据矩阵一级_二级` 与现有 `material_rename` + `naming_mode:context` 对齐；会话 sticky 码要真正进入 organize/rename payload
3. **绑定后按板块写入目标**（不仅进任务库）
   - `21`/`311`/`411` 选中后，确认执行应落到对应食谱效果、对比单元格、矩阵行证据（计划 → 确认 → executor）
4. **创建任务向导字段补齐**
   - 真实字段收集（品类/产品/项目类型/阶段等）→ 预览 → 确认创建；避免半成品
5. **企微与个人微信体验对齐**
   - 同一 `dispatchHermesTurn` 已共用；核对企微媒体入站是否同样走超时重选与 pending 策略
6. **能力面继续扩大**（仍守安全底线）
   - 五感/食谱/矩阵/问题录入动作覆盖率；报告模块只读解释可做，冻结报告写入仍禁止

## 工作区注意

- 工作树仍有大量报告/矩阵/验收相关未提交改动；**只改本 handoff 与 Hermes 目标文件**；禁止 `git reset --hard` / 批量清 `tmp-*`。
- Hermes 相关代码多数尚未单独 commit；发布靠本地构建产物直传生产。
- 文档/日志禁止写 token、DB URL、密码、AI Key。

## 可直接交给下一位 agent 的提示词

```text
请继续 C:\Users\G1157\.vscode\product-experience-system 的 Hermes/AI助手工作。
先完整阅读 docs/superpowers/handoffs/2026-07-17-hermes-ilink-wechat-handoff.md 和 AGENTS.md。

现状：微信无回复 P0、共享 dispatchHermesTurn、平台合同、task-action-executor 隔离、双模会话（向导/数字码/2h解绑/超时才媒体重选）均已接线并部署到 118.25.178.78（BUILD_ID TdYUDYQ2YYBzsuICy-WES，LOGIN/DICT 200）。

下一步优先：
1) 用已绑定微信做双模会话端到端冒烟（列表→序号绑定→板块码→绑定中发图不重选→不绑定收件箱）；
2) 把 sticky section/细码真正带进 material_organize / 命名与目标绑定 payload；
3) 勿把 Next route import 进 dist/server.js（AsyncLocalStorage 回归）；勿在服务器 next build；勿覆盖 Agent/对话/绑定/素材生产数据。
```
