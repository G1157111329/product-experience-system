# 2026-06-24 AI体验方案节点验收

## 节点范围

- 将任务详情页 `AI体验方案` 下的 `AI五感体验` 和 `食谱功能AI探索` 作为一个合并节点验收。
- 验收对象为服务器任务 `ef6811c9-cfb4-46c9-b83f-38ae3a80813e`。

## 服务器验收结果

- 五感入口: `AI五感体验` 按钮可点击，请求 POST `/api/tasks/[id]/agent-presets`，请求参数命中 `senses_standard_preset`。
- 食谱入口: `食谱功能AI探索` 按钮可点击，请求 POST `/api/tasks/[id]/agent-presets`，请求参数命中 `recipe_scene_preset`。
- 失败态展示: 两个入口在 AI 服务连接失败时，页面显示 `AI体验方案生成请求失败，请检查网络或稍后重试`，页面未崩溃，快速预设按钮保持禁用，避免空建议写入。
- 数据状态: 失败后未写入 `check_records` 或 `recipes`，任务状态仍为 `待执行`。

## 网络因素

- 当前启用 AI 配置存在: `Bear / Bear-Model-VL / http://ds.bears.com.cn:8000/v1/`，且已配置加密 key。
- 服务器连通性探测: DNS 可解析到 `58.251.252.77`，但 TCP 连接 `ds.bears.com.cn:8000` 超时，`curl` 也超时。
- 按验收约定忽略网络因素导致的失败，本节点只确认产品交互链路、错误反馈和失败后数据安全；真实 AI 建议内容生成需网络恢复后复验。
