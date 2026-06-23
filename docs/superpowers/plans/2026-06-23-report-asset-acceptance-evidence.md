# 报告资产验收闭环证据记录

## 2026-06-23 当前进展

本轮目标是把 PRD 收口方向落成可执行闸门，并修正脚本与当前内联矩阵实现之间的漂移。结论：静态合同、Golden 合同、V2.6 成功指标、TypeScript、lint 和生产 build 已通过；浏览器/PDF 全链路仍需下一轮补齐。

## 已完成变更

- 新增 `docs/superpowers/plans/2026-06-23-report-asset-acceptance-gate.md`，明确报告资产验收闭环的范围、排除项、Gate A-F、验证命令和交付物。
- 修正 `scripts/check-v2.3-contract.ts`，不再检查旧版弹窗式矩阵编辑、过期变量名、旧布局切换文案；改为检查当前单元格内联录入、素材绑定、评分、标签、保存、同源快照、分享和 PDF 路径。
- 更新 `package.json` build 脚本中的 tsup 入口为 `././src/server.ts`，规避 Windows/esbuild 对入口路径的包路径误判。

## 已验证命令

- `pnpm.cmd exec tsx scripts\check-v2.3-contract.ts`
  - 结果：通过，输出 `Comparison report asset contract check passed`。
- `pnpm.cmd ts-check`
  - 结果：通过，`tsc -p tsconfig.json` 退出码 0。
- `pnpm.cmd check:golden`
  - 结果：通过，输出 `Golden Test contract check passed`。
- `pnpm.cmd check:v2.6-success`
  - 结果：通过，输出 `V2.6 success metrics check passed`。
- `pnpm.cmd lint`
  - 结果：通过，`eslint` 退出码 0。
- `pnpm.cmd build`
  - 结果：通过。Next.js 54 个 app routes 完成构建，`dist/server.js` 由 tsup 成功输出。
  - 说明：受限 sandbox 内 build 的 tsup/esbuild 阶段会因读取 `../..` 被拦截；提权复跑通过，判断为 sandbox 文件访问限制，不是代码缺陷。

## 当前已覆盖的目标

- PRD 与 contract 的关键漂移已修正：脚本不再追旧版弹窗式矩阵编辑。
- 对比矩阵作者工作区的内联单元格契约已由脚本覆盖；不新增新建体验计划入口。
- Golden 数据与报告详情合同可重复跑通。
- V2.6 成功指标脚本可重复跑通。
- 生产构建可完成，包含 Next app routes 与自定义 server bundle。

## 当前已补齐的真实路径验收

- 浏览器真实路径：已用 `golden-task-comparison` 覆盖已有对比矩阵任务、对比 Tab、单元格内联文本录入、保存和 API 读回。
- 报告中心真实路径：`smoke:e2e` 覆盖报告中心合同，不再出现旧 `delivery-board-title`。
- 报告详情连续阅读：`smoke:e2e` 覆盖普通、对比、型号合并、自定义合并报告详情的 section block 渲染。
- 分享页只读路径：`smoke:e2e` 覆盖公开分享页隐藏编辑/审核动作，并验证 section block 渲染。
- PDF 路径：`smoke:e2e` 覆盖普通报告 PDF response、PDF profile header、metric PDF preflight；额外手工请求确认 `golden-report-comparison` 暴露 A3 landscape profile，并按缺证据/AI 未确认/未发布快照阻断正式 PDF。
- 移动端路径：`smoke:e2e` 覆盖移动视口下报告详情主路径。
- `pnpm.cmd smoke:e2e` 已在当前 Docker 本地验收环境通过，覆盖报告详情、分享只读、PDF preflight/PDF response、权限负测、移动端路径、报告中心合同和已有对比任务的单元格内联录入/保存读回。

## 后续不属于本阶段的边界

1. PDF Job 异步队列、失败重试和 Action Inbox 可见性，进入 P7。
2. Excel 历史迁移、权限矩阵扩展和安全审计总验收，进入 P8。
3. Row AI / Report AI 高级闭环继续延期，除非阻塞已定义报告资产验收。
## E2E 运行环境探测

- `pnpm.cmd smoke:e2e` against `http://127.0.0.1:5000`
  - 结果：2 通过、3 失败。
  - 判断：5000 上运行的服务不是当前构建；证据包括 `/api/reports/[id]/detail` 返回 404，报告中心仍出现旧 `delivery-board-title`。
- 当前构建在 `NODE_ENV=development PORT=5010 node dist/server.js` 下可启动，但 E2E 登录后服务掉线，后续请求为 `ECONNREFUSED`。
  - 判断：development 模式运行 dist server 不稳定，不作为有效验收环境。
- 当前构建在 `NODE_ENV=production PORT=5010 node -r dotenv/config dist/server.js` 下被生产安全校验拦截。
  - 结果：`DATABASE_URL points to a development database or default credential in production`。
  - 判断：这是正确的生产安全边界；浏览器/PDF 全链路需要 Docker 验收环境或真实生产环境变量后再跑。

## 边界修正

- 已撤销“新建体验计划弹窗增加普通体验 / 对比矩阵入口”的改动。该入口不属于本阶段目标；本阶段继续围绕既有对比矩阵作者工作区、报告快照、详情、分享和 PDF 验收闭环推进。

## Docker 验收环境复跑

- `docker compose -f docker-compose.local.yml up -d --build app`
  - 结果：通过。Docker app 使用当前工作区重建，Next.js 54 个 app routes 构建完成，`dist/server.js` 输出成功。
- `DATABASE_URL=postgresql://xp_user:xp_password_local_only@127.0.0.1:5433/xp_experience GOLDEN_TEST_ACCOUNT=dockeradmin pnpm.cmd seed:golden`
  - 结果：通过。写入 5 个 Golden 任务、5 份报告、5 个对比对象、8 个矩阵单元格。
- `E2E_BASE_URL=http://127.0.0.1:5000 DATABASE_URL=postgresql://xp_user:xp_password_local_only@127.0.0.1:5433/xp_experience pnpm.cmd smoke:e2e`
  - 首次结果：4 通过、1 失败。失败原因是 `Comparison matrix` locator 匹配两个合法区块，Playwright strict mode 报二义性。
  - 修正：将该断言收窄为 `.first()`，保留可见性硬断言。
  - 第一次复跑结果：5/5 通过，用时 10.5s。
## 新增作者工作区硬断言

- 在 `tests/e2e/platform-smoke.spec.ts` 增加 `comparison authoring saves inline cell text in an existing task`。
- 路径：登录后打开 `/tasks/golden-task-comparison?tab=comparison`，定位单元格内联 `textarea` 和保存按钮，写入 `effect_summary`，点击保存，再通过 `/api/comparison-matrix` 读回同一 cell 的文本。
- 复跑：`pnpm.cmd smoke:e2e` 6/6 通过，用时 10.9s。
