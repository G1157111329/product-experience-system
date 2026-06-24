# 2026-06-24 创建体验任务节点验收

## 节点范围

- 将创建体验任务的填写、提交、跳转和数据落库作为一个完整验收节点。
- 入口为普通用户 `accept_user` 访问 `/tasks?create=1` 后打开的创建体验任务弹窗。

## 发现与修复

- 发现问题: `/api/tasks` 创建接口已返回新任务 id，但前端成功后只关闭弹窗并刷新列表，没有按弹窗说明进入任务详情，阻断后续“新建任务到报告生成”的链路。
- 修复方式: `src/app/(main)/tasks/page.tsx` 在创建成功后读取返回的 `data.id`，存在时跳转到 `/tasks/[id]`；如果后端未返回 id，则保留刷新列表兜底。

## 服务器验收结果

- 部署状态: 本地 `pnpm build` 通过后已部署到服务器，并重启 PM2 生产进程。
- 交互状态: 创建表单填写完成后，“创建任务”按钮为可用状态。
- 接口状态: POST `/api/tasks` 返回 `code=0`，并返回任务 id `ef6811c9-cfb4-46c9-b83f-38ae3a80813e`。
- 页面状态: 提交后浏览器进入 `/tasks/ef6811c9-cfb4-46c9-b83f-38ae3a80813e`，详情页展示任务名称、型号、项目单号，并出现“录入目录 / AI辅助 / AI体验方案 / 对比矩阵 / 五感体验 / 功能效果 / AI总结/报告”等后续功能入口。
- 数据状态: `experience_tasks` 记录为 `Server Acceptance Task 0624 Detail 093228 / 电动 / 破壁机 / PBJ-Accept-Detail-093228 / ACC-DETAIL-093228 / ODM/OEM / 待执行 / task_mode=single`，归属 approved 普通用户 `accept_user`。
