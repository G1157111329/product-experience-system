# 任务录入、矩阵与报告闭环实施计划

> 基于 2026-07-11 已确认增量设计执行；每个行为修复先写失败测试，再做最小实现。

## 阶段 1：任务详情布局与问题直写

- [ ] 为 `report-authoring-shell.tsx` 与 `task-authoring-header.tsx` 增加组件契约测试：不存在“录入目录”和“问题管理”卡。
- [ ] 移除重复目录，顶部状态卡改为五列响应式布局。
- [ ] 在 `functions-input-workspace.tsx` / `functions-tab.tsx` 移除独立 `recipe-issue-output-panel.tsx` 使用链路，验证食谱问题保存仍直接同步 `/api/issues`。
- [ ] 将食谱、步骤删除入口改为 ghost icon / 更多菜单，保留确认弹窗。

## 阶段 2：素材证据与图片编辑

- [ ] 为 `material-evidence-rail.tsx` 写紧凑入口和粘贴上传测试。
- [ ] 合并四个宽按钮为“添加素材”来源菜单，保留相机与相册能力。
- [ ] 修复 `material-picker.tsx` 剪贴板事件作用域与焦点判断。
- [ ] 为 `image-preview.tsx` 写编辑入口测试，并接入 `image-editor-dialog.tsx`；保存后刷新素材。

## 阶段 3：数据矩阵编辑契约

- [ ] 为列分区顺序写服务端契约测试：每种 `columnZone` 计算区域内插入顺序，并重排后续区域。
- [ ] 修改 `/api/v1/matrices/[id]/columns`，在事务内按区域重新编号 `displayOrder`。
- [ ] 为单元格写入写组件测试：输入时不请求，blur/Enter 请求一次，保存成功不整表刷新。
- [ ] 修复 `matrix-v3-grid.tsx` 的保存回调，使用局部投影更新或延迟静默刷新。
- [ ] 移除 `MatrixMaterialStagingRail` 渲染；补三级细项输入可见性回归测试。

## 阶段 4：报告矩阵与问题素材

- [ ] 为报告生成写回归测试：最新空矩阵 + 较早有效矩阵时，冻结有效矩阵投影。
- [ ] 抽取“最新有实质内容矩阵”选择器并用于 `src/app/api/reports/route.ts`。
- [ ] 为矩阵问题点到 `/api/reports/[id]/issues` 的聚合写契约测试，覆盖问题详情为空、单元格素材和整改素材。
- [ ] 调整 `issue-row.tsx` 为“问题点 / 可选问题详情 / 附录素材 / 整改”结构。
- [ ] 让 `reports/print/page.tsx` 复用报告问题聚合结果，并跳过 `data:` URL 网络转换。
- [ ] 增加公开分享匿名访问测试，确保 token 有效时不要求登录。

## 阶段 5：治理记录与整体验收

- [ ] 在 `AGENTS.md` 记录本轮任务录入、矩阵和报告跨页面回归规则，不记录测试对话或敏感数据。
- [ ] 运行相关单测/契约测试、`pnpm ts-check`、`pnpm lint`、`git diff --check`、`pnpm build`。
- [ ] 重建本地 Docker，使用 `http://127.0.0.1:5000` 从登录、任务录入、矩阵编辑、报告详情、匿名分享到打印页完整回放。
- [ ] 输出逐条 PASS/BLOCKED 证据；本阶段不推送云服务器，等待用户浏览器确认。
