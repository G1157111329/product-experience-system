# 2026-06-24 报告中心：报告呈现、分享/下载节点

## 验收范围

- 角色：普通用户 `accept_user`
- 服务器：`118.25.178.78`，本机通过 `127.0.0.1:15000` 隧道验收
- 报告：`58cb91ec-859b-410e-bedf-8b620dfd21b5`
- 任务：`ef6811c9-cfb4-46c9-b83f-38ae3a80813e`

## 覆盖路径

1. 登录后进入 `/reports`，确认报告列表可见。
2. 进入报告详情 `/reports/58cb91ec-859b-410e-bedf-8b620dfd21b5`，确认问题点、功能食谱和任务完成状态可见。
3. 点击详情页分享按钮，生成 30 天分享链接。
4. 在未登录浏览器上下文打开公开分享页，确认不跳转登录，且报告标题、问题点、功能食谱可读。
5. 在公开分享页点击“导出PDF”，确认打开带 `share_token` 的 `/reports/print` 打印预览，且标题、问题点、完成状态可读。
6. 移动端视口打开公开分享页，确认标题和问题点可读。
7. 撤销分享链接，确认公开 API 返回 `404 / 分享链接无效`。

## 发现并修复

- 报告生成后，任务 API 和报告状态为“已完成”，但报告 `content.task.status` 仍保留生成前的“进行中”。已改为后端生成报告时同步完成任务状态，并在报告快照中写入“已完成”。
- 公开分享页“导出PDF”对单报告打开未带登录态的打印页，公开用户实际不可用；同时直接 PDF API 在 preflight 阻断时返回 JSON。已改为分享页打开 `/reports/print?id=...&mode=fast&share_token=...`，打印页在分享上下文使用公开分享 API 装载报告、详情模型、问题和素材签名。
- 报告详情/列表分享侧栏缺少 Radix description，打开时控制台有可访问性警告。已补充 `SheetDescription` / `DialogDescription`。

## 最终验收结果

- `/reports` 列表包含 `Server Acceptance Task 0624 Detail 093228报告`。
- 详情页包含 `QP-SENSE-569915`、`QP-RECIPE-569915` 和“已完成”状态。
- 公开分享页包含报告标题、问题点、功能食谱，且 `publicRedirectedToLogin=false`。
- 公开页导出打开 `/reports/print?...&share_token=...`，打印预览包含报告标题、`QP-SENSE-569915` 和“已完成”。
- 移动端公开分享页包含报告标题和问题点。
- 撤销接口返回 `200 / 分享链接已撤销`，撤销后公开分享 API 返回 `404 / 分享链接无效`。
- API 状态确认：`taskStatus=已完成`、`reportStatus=已完成`、`contentTaskStatus=已完成`。

## 部署与验证

- 本地验证：`pnpm ts-check`
- 服务器验证：`corepack pnpm next build`
- PM2：`product-experience-system` online，最新 pid `4165823`
