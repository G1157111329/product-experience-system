# 2026-06-24 快速预设节点验收

## 节点范围

- 单独验收任务详情页 `AI体验方案` 中的两个 `快速预设` 交互。
- 因服务器到 AI 服务网络超时，本次用浏览器拦截模拟 AI 生成建议，随后点击页面真实 `快速预设` 按钮，让 PUT `/api/tasks/[id]/agent-presets` 写入服务器数据库。

## 服务器验收结果

- 五感快速预设: 模拟建议 `QP-SENSE-569915` 出现后，五感区域 `快速预设` 按钮由禁用变为可点击；点击后 PUT 返回 `code=0`，写入 `check_records`。
- 食谱快速预设: 模拟建议 `QP-RECIPE-569915` 出现后，食谱区域 `快速预设` 按钮由禁用变为可点击；点击后 PUT 返回 `code=0`，写入 `recipes` 和 2 条 `recipe_steps`。
- 页面状态: 五感页可见 `QP-SENSE-569915`；功能效果页可见 `QP-RECIPE-569915`，并展示步骤 `Add water and start blender`、`Observe noise vibration and output consistency`。
- 数据状态: `check_records` 写入 `QP-SENSE-569915 / 待定 / 非标准`；`recipes` 写入 `QP-RECIPE-569915 / Function`；`recipe_steps` 写入 2 条步骤。
- 控制台状态: 快速预设模拟验收过程中未捕获前端 console error。

## 注意

- 本节点验证的是“AI建议已存在后，快速预设是否能正常落入任务内容”的产品交互与写入链路。
- 真实 AI 建议生成仍受 `ds.bears.com.cn:8000` 网络超时影响，已在 AI体验方案节点单独记录。
