# Hybrid Report Authoring Design

## Goal

重构报告录入和编辑链路，让体验工程师可以更顺畅地完成“录入事实证据 -> 预览报告草稿 -> 生成报告 -> 润色结论 -> 评审发布”的完整流程。

核心原则是：**事实层回源编辑，表达层报告内编辑**。

## Current Problem

当前产品链路更像：

`任务详情分散录入 -> 点击生成报告 -> 报告中心只读评审`

主要问题：

- 工程师在任务详情页录入五感记录、功能步骤、效果评价、素材时，不清楚这些内容最终进入报告的哪个部分。
- 报告生成前缺少草稿预览和输入质量检查，容易生成后才发现缺素材、缺问题描述、AI 总结不完整。
- 报告中心只能查看和分享，不能直接润色报告结论。
- 报告生成后发现事实错误时，用户需要自己回到任务详情页寻找对应字段，回源链路不明确。
- 如果以后允许直接编辑整份报告，会出现报告内容与原始任务数据不一致的风险。

## Editing Boundary

### Source Data: Edit In Task Detail

这些内容属于事实层，必须回到任务详情页编辑：

- 任务基础信息：品类、产品、型号、项目类型、阶段、测试目标。
- 五感体验记录：检查项、检查结果、问题描述、问题等级、标准字段。
- 图片/视频素材及证据绑定。
- 食谱/功能：名称、参数、步骤、步骤问题点、步骤素材。
- 效果/出品评价：效果描述、效果素材、AI 评分、效果问题点。
- 自动创建问题的来源数据。

原因：这些内容是报告、问题管理、PDF、分享页的共同事实来源，不能在报告页形成第二套数据。

### Report Data: Edit In Report Detail

这些内容属于表达层，可以在报告详情页直接编辑：

- 报告标题。
- AI 总评/人工总评。
- 主要优势。
- 主要风险。
- 历史表现判断。
- 后续建议。
- 评审备注。
- 报告评审状态：待评审、已评审、已发布。

原因：这些内容是报告表达和评审意见，工程师/评审人需要直接润色，不应该为了改一句话回到任务详情页。

## New User Flow

### 1. Task Detail Becomes Report Authoring Workspace

任务详情页从普通四 Tab 页面升级为“报告录入工作区”。

桌面端布局：

- 左侧：报告大纲导航。
- 中间：源数据编辑区域。
- 右侧：报告草稿预览与输入质量检查。

报告大纲建议：

- 基础信息。
- 五感体验。
- 素材证据。
- 功能/食谱步骤。
- 效果/出品评价。
- AI 总结。
- 生成前检查。

右侧面板职责：

- 显示输入完整度。
- 显示关键缺口：缺问题描述、缺证据、缺效果评价、缺 AI 总结、疑似原始 JSON 问题点。
- 提供“跳到对应输入区”。
- 提供“预览报告草稿”。
- 提供“确认生成报告”。

### 2. Add Draft Preview Before Generation

点击“报告生成”不应直接生成最终报告，而是进入生成前确认流程：

1. 展示报告草稿预览。
2. 展示输入质量检查结果。
3. 如果有关键缺口，允许用户回源修复。
4. 用户确认后生成报告。

不做硬阻断，除非任务基础信息缺失到无法生成报告。

### 3. Report Detail Becomes Review Editor

报告详情页从只读详情页升级为“报告评审编辑器”。

桌面端布局：

- 中间：报告正文。
- 右侧：评审操作面板。

报告正文分为两类区域：

- 可编辑表达区：标题、总评、优势、风险、历史表现、建议、评审备注。
- 只读事实区：检查记录、食谱步骤、效果评价、素材证据、自动问题。

只读事实区提供“回源编辑”入口：

- 检查记录 -> 跳转任务详情五感体验，并定位记录。
- 食谱步骤 -> 跳转任务详情功能效果，并展开对应食谱。
- 效果评价 -> 跳转任务详情功能效果，并定位效果评价。

第一阶段可以先跳到对应 Tab，不要求精确滚动到字段；第二阶段再做锚点定位。

### 4. Regeneration Keeps Manual Edits

重新生成报告时，系统应刷新事实快照，但保留人工润色字段。

保留字段建议存放在 `report.content.review_overrides`：

```json
{
  "title": "人工修改后的标题",
  "ai_summary": {
    "tag": "人工修改后的标签",
    "satisfaction_score": 8,
    "summary": "人工润色后的总评",
    "strengths": ["优势1"],
    "risks": ["风险1"],
    "historical_position": "历史表现判断",
    "suggestions": ["建议1"]
  },
  "review_note": "评审备注",
  "review_status": "reviewed",
  "updated_at": "2026-05-23T00:00:00.000Z"
}
```

显示报告时：

- 如果存在 `review_overrides.ai_summary`，优先显示人工润色版本。
- 否则显示生成时写入的 `content.ai_summary`。

重新生成时：

- 读取旧报告的 `review_overrides`。
- 重新生成事实内容。
- 将旧 `review_overrides` 写回新报告。
- 默认不覆盖人工润色。
- 如果用户选择“重新生成并覆盖人工润色”，才清空 `review_overrides`。

## Component Design

### ReportAuthoringShell

位置：`src/app/(main)/tasks/[id]/components/report-authoring-shell.tsx`

职责：

- 管理桌面三栏布局。
- 渲染报告大纲。
- 渲染当前编辑区。
- 渲染草稿预览和生成前检查。

### ReportReadiness

位置：`src/lib/report-readiness.ts`

职责：

- 输入任务、记录、食谱、AI 总结。
- 输出完成度、缺口列表、素材统计、生成风险。

当前已建立初版，可以作为正式链路的底层逻辑继续使用。

### ReportDraftPreview

位置：`src/app/(main)/tasks/[id]/components/report-draft-preview.tsx`

职责：

- 在任务详情页展示报告将如何生成。
- 只展示摘要级预览，不复制完整报告详情页。
- 支持跳转到输入源。

### ReportReviewEditor

位置：`src/app/(main)/reports/[id]/components/report-review-editor.tsx`

职责：

- 编辑报告表达层字段。
- 保存到 `content.review_overrides`。
- 显示保存状态。
- 保留事实区只读。

### ReportSourceLink

位置：`src/app/(main)/reports/[id]/components/report-source-link.tsx`

职责：

- 根据来源类型生成回源按钮。
- 第一阶段只跳到任务详情对应 Tab。
- 第二阶段支持精确定位记录、食谱、步骤或效果评价。

## API Changes

### Update Report

复用现有 `PUT /api/reports/[id]`，但前端只提交局部合并后的 `content`，避免覆盖事实内容。

第一阶段不新增数据库字段。

### Generate Report

修改 `POST /api/reports`：

- 删除旧报告前，读取旧报告的 `content.review_overrides`。
- 生成新 `reportContent` 后，将旧 overrides 合并回去。
- 支持请求参数 `preserve_review_overrides`，默认 `true`。

## Print And Share Behavior

打印页和分享页也需要读取最终展示版本：

- 优先使用 `content.review_overrides.ai_summary`。
- 标题优先使用 `content.review_overrides.title`。
- 评审备注在打印和分享页可展示，但第一阶段可以只在详情页展示。

## Implementation Phases

### Phase 1: Formalize Hybrid Data Model

- 增加 review override helper。
- 修改报告生成保留人工润色。
- 修改报告详情、打印、分享读取最终展示内容。
- 增加测试覆盖。

### Phase 2: Task Detail Authoring Workspace

- 将当前临时检查侧栏升级为正式报告录入工作区。
- 增加报告大纲。
- 增加草稿预览。
- 生成按钮进入确认流程。

### Phase 3: Report Review Editor

- 报告详情页增加可编辑表达区。
- 增加保存/取消/恢复 AI 原文。
- 事实区增加回源编辑入口。

### Phase 4: Review Workflow Polish

- 增加评审状态。
- 报告中心按待评审、已评审、已发布筛选。
- 支持重新生成时覆盖/保留人工润色二选一。

## Success Criteria

- 工程师能在任务详情页明确知道报告还缺什么、每段输入会进入报告哪里。
- 工程师生成报告前能预览草稿，而不是生成后再发现问题。
- 评审人能在报告详情页直接润色结论，不需要为一句总结回源编辑。
- 报告事实内容和任务源数据保持一致。
- 重新生成报告不会默认覆盖人工润色内容。
- 打印页和分享页展示与报告详情页一致的最终文本。

## Out Of Scope

- 不做完整富文本编辑器。
- 不允许在报告页直接修改检查记录、素材、食谱步骤等事实数据。
- 不重做数据库结构，第一阶段使用 `content.review_overrides`。
- 不改变问题自动创建的事实来源。
