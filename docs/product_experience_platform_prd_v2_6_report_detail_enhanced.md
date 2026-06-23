# 产品体验管理平台 PRD V2.6
## 报告详情多类型兼容视图与打印交付增强版

> 版本：V2.6 Report Detail View Enhanced PRD  
> 日期：2026-06-22  
> 基线文档：V2.5《统一报告体系、多对象对比体验工作台与报告中心秩序化视图》  
> 本版定位：在 V2.5 已确立的统一报告体系、四类报告资产、多对象对比、就地证据位、报告快照与 PDF Profile 基础上，进一步聚焦**用户点击具体报告后进入 Report Detail 的排版、视图、模块、字段、证据、功能链路、打印/PDF兼容与 QA 验收**。  
> 关键说明：本版不是继续优化报告中心首页/交付总览。报告中心首页沿用 V2.5；本版只优化 `ReportDetailPage / ReportRenderer / ReportSnapshot / PrintPreview`。

---

# 0. 修订摘要

## 0.1 本版解决的核心问题

业务反馈不是单纯“报告中心首页不清晰”，而是**点击某一份具体报告后，报告详情本身不如 Excel 有序、目标不够明确、不同报告类型没有差异化排版、图片/指标/问题/结论之间关系不够直观**。

| 痛点 | 当前表现 | V2.6 修正 |
|---|---|---|
| 报告详情像组件堆叠 | 报告进入后模块顺序不稳定，缺少主线 | 建立 Universal Report Shell + 类型化模板 |
| 多报告类型共用一套视图 | 普通报告、对比报告、型号合并、自定义合并看起来差不多 | 按 `report_type + layout_profile + report_goal` 分支渲染 |
| Excel 结构优势未被吸收 | Excel 的 Sheet、分组标题、冻结行列、公式列、图片就近呈现更清楚 | 转译为 Section Tabs、Outline、Sticky Header、Metric Panel、Inline Evidence |
| 图片与结论脱节 | 图片放在素材/附录，阅读时要跳转查找 | 强化业务对象就地证据位 |
| 指标缺少解释 | 只显示结果，不显示公式、阈值、版本和异常原因 | 新增 Metric Panel / Formula Popover / Anomaly Explanation |
| 自定义合并容易误导 | 弱可比历史报告被看成强对比 | 强制展示来源报告、字段对齐和可比性边界 |
| Web 与 PDF 冲突 | 网页横向滚动和打印分页互相影响 | Web 阅读模板与 Print Block 分离，同源不同形 |
| AI 结果位置不稳定 | 用户不知道 AI 是否确认、证据来自哪里 | AI 结论进入专用模块，未确认不得发布 |

## 0.2 与 V2.5 的关系

V2.5 已经明确：不新增一级“对比中心”；所有报告统一进入 `reports` 表；通过 `report_type` 区分普通、对比、型号合并、自定义合并四类报告；继续保留 Excel 导入、AI 确认、服务端 PDF、报告快照、就地证据位等能力。本版保持这些底层架构不变，只补强报告详情页。

## 0.3 本版新增对象

| 新增对象 | 用途 |
|---|---|
| Universal Report Shell | 所有报告详情共用壳层 |
| Type-specific Report Template | 不同报告类型的正文模板 |
| Report Section | 报告模块，如问题闭环、指标对比、阶段演进 |
| Report Block | 模块内的内容块，如问题表、图片矩阵、阶段轴 |
| Evidence Slot | 证据位，确保图片/视频跟随业务对象 |
| View Mode | 阅读、数据、证据、审核、打印预览五种模式 |
| Print Block | PDF/打印专用内容块 |
| Detail Quality Check | 详情页发布前校验 |


---

# 1. 背景与产品目标

## 1.1 为什么要优化报告详情，而不是继续优化报告中心首页

报告中心首页解决的是“找报告、看状态、处理待办”；报告详情解决的是“读懂这份报告、确认这份报告、追溯这份报告、交付这份报告”。用户真正反馈“不如 Excel 有序”时，往往发生在点击报告后的阅读环节，而不是只停留在报告列表。

因此，本版 PRD 聚焦：

```text
报告中心 / 任务详情 / 通知 / 分享链接
→ 点击具体报告
→ 进入 ReportDetailPage
→ 读结论、看证据、查指标、处理问题、确认 AI、发布/导出
```

## 1.2 Excel 值得吸收的秩序

| Excel 元素 | 业务价值 | 平台转译 |
|---|---|---|
| Sheet 标签 | 模块清楚 | Report Section Tabs / Navigation Rail |
| 顶部标题与小结 | 先理解目的和结论 | Report Header + Conclusion Bar |
| 合并单元格大标题 | 模块边界强 | Section Header + Section Summary |
| 冻结行列 | 横向对比不丢上下文 | Sticky Object Header + Sticky Item Column |
| 公式列 | 指标可信 | Metric Formula Panel |
| 图片就近摆放 | 证据容易理解 | Inline Evidence Slot |
| 颜色标记 | 状态可扫读 | Status Badge / Risk Chip / Severity Tag |
| 表格行列 | 关系稳定 | Issue Table / Metric Table / Comparison Matrix |

平台不复刻 Excel 的画布，而是把这些秩序转成结构化、可交互、可追溯、可打印的报告详情体系。

## 1.3 产品目标

1. 进入任一报告详情后，用户 5 秒内可判断报告目的、核心结论、关键风险、下一步动作。
2. 四类报告资产进入详情后，有不同的主阅读路径。
3. 图片/视频证据必须跟随问题、步骤、效果、指标异常、矩阵单元格、复评估等业务对象就地展示。
4. 指标结果必须能查看公式、阈值、原始值、公式版本和异常原因。
5. 对比报告必须展示对象、测试条件、可比性边界、关键差异和行级结论。
6. 型号合并报告必须围绕阶段演进，而不是强行排序。
7. 自定义合并报告必须先展示来源报告与字段对齐，再展示专题结论。
8. Web 阅读与 PDF/打印同源不同形，避免网页横滚和打印分页互相冲突。
9. AI 结论必须标明状态、来源证据和人工确认状态。


---

# 2. 产品范围

## 2.1 纳入范围

| 模块 | 说明 |
|---|---|
| 报告详情通用壳层 | Header、Conclusion Bar、Mode Switch、Navigation Rail、Content Canvas、Action Rail、Evidence Drawer |
| 报告详情模板 | 普通报告、图片矩阵对比、指标表对比、混合对比、型号阶段演进、自定义合并专题 |
| 报告详情模式 | 阅读模式、数据模式、证据模式、审核模式、打印预览 |
| 模块与内容块 | Section / Block / Evidence Slot / Print Block |
| 证据呈现 | 就地证据、补充证据、完整归档、证据 Drawer |
| 指标呈现 | 指标表、公式面板、阈值规则、异常说明 |
| 可比性呈现 | 强可比、中强可比、弱可比、不可比 |
| AI 结果呈现 | Cell / Row / Report AI 的位置、状态、确认 |
| PDF/打印 | 预检、Print Block、Profile、分页、拆列 |
| 数据模型/API/QA | 报告详情相关字段、接口、验收用例 |

## 2.2 不纳入范围

1. 不继续重做报告中心首页/交付总览。
2. 不新增一级“对比中心”。
3. 不重写旧版两报告 AI 对比模型。
4. 不支持自由画布式任意排版。
5. 不把 Excel 原样网页化。
6. 不允许附录替代正文关键证据。
7. 不允许弱可比历史合并报告默认输出“最优推荐”。


---

# 3. 用户角色与功能场景

| 角色 | 进入报告详情后的目标 | 重点模块 |
|---|---|---|
| 产品工程师/PM | 判断表现、风险和下一步产品决策 | 结论条、关键差异、指标异常、未关闭问题 |
| 体验工程师 | 审核报告、补证据、确认 AI、发布报告 | 审核模式、证据位、AI 模块、PDF 预检 |
| 研发工程师 | 看问题现象、证据、责任、整改方案 | 问题闭环、问题证据、复评估 |
| 工业设计师 | 看体验过程、图片/视频、操作/外观问题 | 证据模式、功能效果、五感/操作 |
| 体验负责人 | 看阶段风险、报告质量、是否可交付 | 结论、风险、可比性边界、发布状态 |
| 管理员 | 看版本、权限、渲染配置、审计 | 来源追溯、版本、审计日志 |

## 3.1 场景 A：产品工程师阅读单对象试制报告

```text
报告中心点击报告
→ 进入 Single Report Narrative
→ 首屏看到报告目的、样机信息、核心结论、A/B级问题数
→ 点击问题闭环
→ 展开 A 级问题，查看证据图、影响、建议、责任人
→ 查看功能效果判断是否影响体验目标
→ 导出 PDF 或发起整改
```

## 3.2 场景 B：产品工程师查看多对象对比报告

```text
点击对比报告
→ 进入 Comparison Image Matrix / Metric Table / Mixed Template
→ 顶部看到对象条、可比性声明、推荐对象或关键差异
→ 使用只看差异/只看异常/只看未关闭问题
→ 点击矩阵单元格查看图片、指标、问题、AI
→ 确认行级结论
→ 发布或生成 PDF
```

## 3.3 场景 C：研发工程师从问题通知进入

```text
点击问题通知
→ 进入报告详情的问题闭环模块
→ 自动筛选该问题或我的责任问题
→ 查看证据、影响、整改建议
→ 更新整改方案和计划完成时间
→ 上传复评估证据
→ 申请关闭
```

## 3.4 场景 D：体验负责人审核型号合并报告

```text
点击型号合并报告
→ 进入 Model Dossier Timeline
→ 查看型号档案、阶段轴、问题演进、功能效果演进
→ 检查反复出现问题和未关闭风险
→ 确认 AI 阶段总结
→ 发布型号档案快照
```

## 3.5 场景 E：管理层查看自定义合并专题报告

```text
点击自定义合并报告
→ 先看到合并目的、来源报告、字段对齐、弱可比提示
→ 查看专题结论、共性问题、差异和缺口
→ 查看后续验证建议
→ 下载 PDF
```


---

# 4. 报告详情总体架构

## 4.1 Universal Report Shell

所有报告详情共用以下壳层：

```text
ReportDetailPage
├─ ReportHeader
├─ ReportConclusionBar
├─ ReportViewModeSwitch
├─ ReportBodyShell
│  ├─ ReportNavigationRail
│  ├─ ReportContentCanvas
│  └─ ReportActionRail
├─ EvidenceDrawer
├─ SourceTraceDrawer
├─ MetricFormulaPopover
├─ IssueDetailDrawer
└─ PrintPreflightDialog
```

## 4.2 五种 View Mode

| 模式 | 目标 | 展示规则 |
|---|---|---|
| 阅读模式 read | 业务快速理解 | 结论优先，隐藏编辑噪音 |
| 数据模式 data | 工程师查字段和指标 | 展示原始值、公式、字段、来源 |
| 证据模式 evidence | 设计/体验查看媒体证据 | 按对象/项目/问题组织图库 |
| 审核模式 review | 负责人发布前检查 | AI、证据、可比性、缺失项、PDF 预检突出 |
| 打印预览 print | 检查 PDF/打印 | 显示页型、分页、拆列、阻断项 |

规则：

1. 模式切换不改变底层数据。
2. 分享页默认只开放阅读模式和打印预览。
3. 无编辑权限用户不可进入审核模式。
4. 打印预览基于快照；草稿预览必须带水印。
5. 用户最近一次模式可作为个人偏好，但不改变报告默认模板。

## 4.3 Report Header 字段

| 字段 | 说明 |
|---|---|
| report_id | 报告 ID |
| report_title | 报告标题 |
| report_type | single_report / comparison_report / model_merged_report / custom_merged_report |
| layout_profile | single_problem_effect / comparison_image_matrix / comparison_metric_table / comparison_mixed / model_stage_timeline / custom_synthesis |
| category / product_line / product_model | 品类、产品线、型号 |
| stage | 阶段 |
| source_task_ids / source_report_ids | 来源任务/报告 |
| snapshot_status | draft / published / invalidated / archived |
| snapshot_version | 快照版本 |
| ai_confirmation_status | pending / generated / confirmed / rejected / not_applicable |
| comparability_level | not_applicable / strongly_comparable / mostly_comparable / weakly_comparable / not_comparable |
| test_condition_summary | 测试条件摘要 |
| template_version | 模板版本 |
| metric_formula_version | 指标公式版本 |

展示规则：

1. Header 首屏完整展示，下滚压缩为 Sticky Mini Header。
2. 草稿、已发布、失效、归档必须视觉区分。
3. 弱可比/不可比必须在 Header 明显提示。
4. 来源报告多于 1 份时，点击“来源 N 份”打开 SourceTraceDrawer。
5. Excel 导入生成的报告显示导入质量分和待确认项。

## 4.4 Report Conclusion Bar

| 字段 | 说明 |
|---|---|
| key_conclusion | 一句话结论，建议 80 字以内 |
| conclusion_level | positive / neutral / risk / blocked |
| key_risks | 关键风险，最多首屏展示 3 条 |
| recommended_next_action | confirm_ai / publish / fill_missing / close_issue / retest / export_pdf / share / no_action |
| conclusion_source | manual / ai_confirmed / ai_generated / imported |
| confidence_score | 可信度 |
| confirmed_by / confirmed_at | 确认人和确认时间 |

规则：

1. 未确认 AI 不得作为正式结论进入已发布快照。
2. 自定义合并报告默认不展示“推荐最优对象”。
3. blocked 状态时主操作只能是补字段、补证据、审核可比性。
4. 关键风险超过 3 条进入风险模块。
5. 结论来源必须可见。

## 4.5 Navigation Rail

目录自动按报告类型生成，不显示无数据模块，但审核模式下可显示缺失模块。

通用目录：

```text
总览
测试对象/条件
核心正文
  问题闭环
  功能效果
  指标对比
  图片证据
  对比矩阵
  阶段演进
  字段对齐
交付与追溯
  AI结论
  下一步行动
  来源追溯
  完整证据归档
  版本记录
```

规则：

1. 有 AI 待确认、证据缺失、A/B 级问题时目录项显示状态点。
2. 点击目录项滚动定位。
3. 长报告支持搜索模块名、问题关键词、对象名。
4. 移动端目录变成顶部下拉或底部锚点。


---

# 5. 四类报告详情模板

## 5.1 普通报告：Single Report Narrative Template

### 适用

`report_type = single_report`，如单型号试制/试产/ODM 体验报告。

### 主阅读目标

看清体验目的、样机表现、主要问题、证据、整改建议和下一步。

### 页面结构

```text
Single Report Detail
├─ 总览：体验目的、样机信息、测试条件、核心结论
├─ 问题闭环：A/B级问题重点卡、问题清单、整改/关闭状态
├─ 功能效果：食谱/功能/场景分组、效果评价、证据
├─ 五感/操作体验：感官、操作、清洁、噪音等体验问题
├─ 风险与建议：当前风险、整改优先级、复评估建议
├─ AI结论：已确认/待确认结果
├─ 来源与版本
└─ 完整证据归档
```

### 关键字段

| 模块 | 字段 |
|---|---|
| 总览 | experience_purpose、product_model、sample_stage、sample_status、test_date、tester、scenario_summary、test_condition_summary、key_conclusion、risk_level |
| 问题闭环 | issue_layer、issue_node、issue_description、severity、evidence_slot_id、improvement_suggestion、owner_department、owner_user、plan_finish_date、solution_description、closure_status、re_evaluation_evidence_ids |
| 功能效果 | function_name、recipe、step_name、effect_description、success_criteria、actual_result、effect_evidence_slot_id、evaluation_score、issue_tags |
| 风险建议 | risk_type、risk_reason、affected_module、suggested_action、priority、owner |

### 交互规则

1. A/B 级问题默认置顶。
2. 问题行内直接显示 1–3 张关键证据缩略图，更多进入 Drawer。
3. 支持“全部问题 / 未关闭 / A/B级 / 我的责任”筛选。
4. 功能效果按食谱、功能或场景分组。
5. 功能效果无证据时显示“证据缺失”，发布前需确认。
6. 已关闭问题必须展示关闭说明和复评估证据。
7. PDF 中问题表和关键证据不得被拆到不同章节。

## 5.2 对比报告：Comparison Report Template

### 适用

`report_type = comparison_report`，包括多型号、同主机多变体、竞品、多阶段计划内对比。

### 主阅读目标

看清对象、测试条件、可比性、关键差异、推荐/风险、证据和问题闭环。

### 通用结构

```text
Comparison Report Detail
├─ Object Strip：对象信息条
├─ Comparability Statement：可比性声明
├─ Difference Summary：关键差异摘要
├─ 主对比区：图片矩阵 / 指标表 / 混合矩阵
├─ Row Conclusions：行级结论
├─ Common Issues：共同问题
├─ Object Risk Cards：单对象风险
├─ Issue Closure：问题闭环
├─ AI 结论与人工确认
├─ 来源与测试条件
└─ 完整证据归档
```

### Object Strip 字段

| 字段 | 说明 |
|---|---|
| object_name | 对象显示名 |
| object_type | own_model / competitor / variant / stage / historical |
| product_model | 型号 |
| stage | 阶段 |
| variant_key | 变体，如 120mm/160mm |
| sample_status | 样机状态 |
| cover_media_id | 对象封面 |
| test_condition_summary | 测试条件 |
| comparable_role | baseline / target / competitor / reference |
| display_order | 顺序 |

规则：

1. 2–3 个对象完整展示，4–5 个对象压缩为横向对象条。
2. 超过 5 个对象提示建议拆分报告。
3. 滚动矩阵时 Object Strip 变为 Sticky Object Header。
4. 竞品对象不进入整改责任字段，但可进入风险观察。

### Comparability Statement 字段

| 字段 | 说明 |
|---|---|
| comparability_level | strongly_comparable / mostly_comparable / weakly_comparable / not_comparable |
| comparable_basis | 同任务、同模板、同指标版本、同测试环境等 |
| differences_in_condition | 条件差异 |
| missing_items | 缺失项 |
| reviewer_confirmation | 是否人工确认 |
| reviewer_note | 审核说明 |

规则：

1. 强可比可展示推荐对象和排名。
2. 中强可比可推荐，但必须说明条件差异。
3. 弱可比只展示差异和风险，不默认推荐最优。
4. 不可比不进入排序。
5. AI 推荐与可比性冲突时，发布前必须人工处理。

### Difference Summary 字段

| 字段 | 说明 |
|---|---|
| difference_type | metric / image_effect / issue / usability / stability / common |
| related_object_ids | 相关对象 |
| related_item_node_ids | 相关项目 |
| summary | 差异摘要 |
| evidence_slot_ids | 证据位 |
| confirmation_status | manual / ai_confirmed / ai_pending |
| severity | high / medium / low |

## 5.3 对比报告子模板：图片矩阵型

### 适用

和面机食物效果、原汁机食材效果、外观/结构/清洁过程、多对象图片效果对比。

### 页面结构

```text
Image Matrix Report
├─ 图片矩阵工具栏：只看差异、只看异常、只看未确认AI、图片密度
├─ 分组矩阵：对象列 × 项目行
├─ 行级结论栏
├─ 单元格详情 Drawer
└─ 完整证据归档
```

### 单元格字段

| 字段 | 说明 |
|---|---|
| item_group / item_name | 项目分组与项目名 |
| object_id | 对象 |
| media_ids | 关键证据 |
| summary_text | 单元格小结 |
| issue_tags | 问题标签 |
| effect_score | 效果评分 |
| ai_status | AI 状态 |
| comparable_status | 可比状态 |
| row_conclusion_id | 行级结论 |

规则：

1. 每格默认展示最多 3 张图，可扩展到 5 张。
2. 超过 5 张进入补充证据，不撑高单元格。
3. 缺失项显示 `missing`，不能空白。
4. 弱可比显示提示，不参与排名。
5. 点击单元格打开完整证据、指标、问题、AI、来源。
6. PDF A3 横向展示，超宽拆列，重复对象头和项目列。

## 5.4 对比报告子模板：指标表型

### 适用

原汁机出汁率/纯汁率/含渣率、和面机成团时间/出膜等级/噪音/温升等。

### 页面结构

```text
Metric Table Report
├─ 指标总览：达标率、关键异常、公式版本
├─ 指标定义与阈值
├─ 指标对比表：项目 × 对象 × 指标
├─ 异常指标解释
├─ 指标证据
├─ 问题闭环
└─ 公式与来源追溯
```

### 指标字段

| 字段 | 说明 |
|---|---|
| metric_key / metric_name | 指标 key/名称 |
| unit | 单位 |
| formula_version_id | 公式版本 |
| threshold_rule_id | 阈值规则 |
| value | 计算值 |
| raw_values | 原始值 |
| evaluation_status | pass / warning / fail / missing / not_applicable |
| evidence_slot_id | 证据 |
| calculated_by | system / manual / imported |

规则：

1. 默认展示关键指标，可展开全部指标。
2. 点击指标值显示公式、原始值、阈值、版本。
3. 异常值必须有异常说明。
4. 支持只看异常、只看缺失、只看核心指标。
5. PDF 中公式进入脚注或公式附录，异常说明必须随表格出现。

## 5.5 对比报告子模板：混合型

适用于图片、指标、问题、AI 结论共同重要的复杂报告。

单元格展示最小决策单元：

```text
[关键图 1-2张]
指标：出汁率 81.7% / 纯汁率 97.3%
问题：轻微含渣 / 无卡停
小结：效果稳定，渣感低
状态：AI已确认 / 达标
```

规则：

1. 矩阵不堆满所有字段，只保留关键图、核心指标、问题标签、小结。
2. 完整指标、完整图片、问题和批注进入 Drawer。
3. PDF 首先展示关键差异摘要，再展示综合矩阵，最后补指标明细和问题闭环。

## 5.6 型号合并报告：Model Dossier Timeline Template

### 适用

`model_merged_report`，同型号多阶段、多次体验报告归集。

### 页面结构

```text
Model Dossier Detail
├─ 型号档案：型号、品类、当前阶段、当前结论
├─ 阶段轴：前期研究 → 试制 → 试产 → 量产
├─ 问题演进：新增 / 复现 / 已关闭 / 反复出现 / 未关闭
├─ 功能效果演进：各功能在不同阶段的变化
├─ 当前风险
├─ 下一阶段验证建议
├─ 来源报告
└─ 完整证据归档
```

### 阶段轴字段

| 字段 | 说明 |
|---|---|
| stage_name | 阶段名 |
| stage_date | 阶段日期 |
| stage_conclusion | 阶段结论 |
| issue_open_count / issue_closed_count | 问题数量 |
| new_issue_count / repeated_issue_count | 新增/复现问题数 |
| key_media_ids | 关键证据 |
| source_snapshot_id | 来源快照 |

规则：

1. 型号合并报告不默认输出最优对象。
2. 阶段轴按时间排列，可缺阶段。
3. 每个阶段卡显示结论、关键问题、证据和来源。
4. 问题演进必须区分新增、复现、关闭、反复出现。
5. 点击问题演进行可查看不同阶段证据对照。
6. PDF A4 纵向，阶段轴优先一页展示。

## 5.7 自定义合并报告：Custom Merge Synthesis Template

### 适用

`custom_merged_report`，用户手动多选历史报告形成专题总结。

### 页面结构

```text
Custom Merge Detail
├─ 合并目的
├─ 来源报告概览
├─ 字段对齐与可比性边界
├─ 专题结论
├─ 共性问题
├─ 差异与缺口
├─ 后续验证建议
├─ AI 结论与人工确认
└─ 来源追溯 / 完整证据归档
```

### 字段对齐字段

| 字段 | 说明 |
|---|---|
| field_key / field_name | 字段 |
| source_values | 各来源报告字段值 |
| alignment_status | aligned / partially_aligned / missing / conflict / not_comparable |
| explanation | 说明 |
| reviewer_status | pending / confirmed / rejected |
| reviewer_note | 审核说明 |

规则：

1. 专题结论前必须展示来源报告与可比性边界。
2. 缺失、冲突、弱可比字段必须可展开。
3. 默认不显示推荐最优对象。
4. AI 只输出共性问题、差异、风险和后续验证建议。
5. PDF 首页必须包含合并目的、来源报告、可比性边界。


---

# 6. 模块、内容块与证据位

## 6.1 分层模型

```text
Report
└─ Section
   └─ Block
      └─ Evidence Slot
```

| 层级 | 说明 | 示例 |
|---|---|---|
| Report | 一份报告资产 | 三台 7L 和面机对比报告 |
| Section | 报告模块 | 问题闭环、指标对比、阶段演进 |
| Block | 模块内内容块 | 问题表、指标热力表、图片矩阵 |
| Evidence Slot | 证据位 | 问题证据、步骤证据、效果证据 |

## 6.2 Section 类型

| section_key | 适用报告 | 说明 |
|---|---|---|
| overview | 全部 | 总览 |
| test_context | 全部 | 测试条件、对象、方法 |
| issue_closure | single/comparison/model | 问题闭环 |
| function_effect | single/comparison/model | 功能效果 |
| sensory_operation | single/comparison | 五感/操作体验 |
| comparison_matrix | comparison | 对比矩阵 |
| metric_compare | comparison | 指标对比 |
| image_evidence_compare | comparison | 图片证据对比 |
| stage_timeline | model | 阶段轴 |
| issue_evolution | model | 问题演进 |
| source_alignment | custom | 字段对齐 |
| synthesis | custom | 专题分析 |
| ai_review | 全部 | AI 结论与确认 |
| next_actions | 全部 | 下一步行动 |
| source_trace | 全部 | 来源追溯 |
| evidence_archive | 全部 | 完整证据归档 |
| version_audit | 全部 | 版本与审计 |

## 6.3 Block 类型

| block_type | 用途 |
|---|---|
| summary_card | 核心结论、风险、下一步 |
| meta_table | 样机信息、测试条件 |
| issue_table | 问题表 |
| issue_card_group | A/B级问题重点卡 |
| effect_card | 功能/食物效果评价 |
| metric_table | 指标表 |
| metric_heatmap | 指标热力/达标状态 |
| comparison_matrix | 对比矩阵 |
| image_matrix | 图片矩阵 |
| stage_timeline | 阶段轴 |
| evolution_table | 问题/功能演进表 |
| source_alignment_table | 来源字段对齐 |
| ai_result_panel | AI 结果 |
| evidence_strip | 证据条 |
| before_after_block | 整改前后对照 |
| appendix_table | 附录 |
| audit_log_panel | 审计日志 |

## 6.4 Evidence Slot 规则

| 业务对象 | 证据位 |
|---|---|
| 问题 | issue_evidence |
| 食谱/功能步骤 | step_evidence |
| 效果评价 | effect_evidence |
| 矩阵单元格 | matrix_cell_evidence |
| 指标异常 | metric_evidence |
| 整改复评估 | re_evaluation_evidence |
| 阶段事件 | stage_evidence |
| AI 结论 | ai_evidence_ref |
| 来源报告 | source_report_ref |

规则：

1. 主阅读区必须就地展示关键证据。
2. 完整证据归档只做审计、下载、补充查看。
3. 每个证据位可配置 `max_inline_count`。
4. 超出上限进入 Drawer 或附录。
5. 必填证据缺失时发布前阻断或要求豁免。
6. PDF 中关键证据不得全部被挪到附录。


---

# 7. 数据模型更新

## 7.1 reports 表扩展

```sql
ALTER TABLE reports
  ADD COLUMN detail_template_key VARCHAR(80),
  ADD COLUMN default_view_mode VARCHAR(40) DEFAULT 'read',
  ADD COLUMN detail_layout_schema_version VARCHAR(40) DEFAULT 'v2.6',
  ADD COLUMN report_render_profile_id UUID,
  ADD COLUMN print_profile_id UUID,
  ADD COLUMN evidence_completeness_score DECIMAL(5,2),
  ADD COLUMN detail_quality_status VARCHAR(40) DEFAULT 'draft',
  ADD COLUMN detail_quality_warnings JSONB DEFAULT '[]',
  ADD COLUMN module_summary_json JSONB DEFAULT '{}';
```

## 7.2 新增表

### report_detail_templates

| 字段 | 类型 | 说明 |
|---|---|---|
| id | uuid | 模板 ID |
| template_key | varchar | 模板 key |
| template_name | text | 模板名称 |
| report_type | varchar | 适用报告类型 |
| layout_profile | varchar | 版式 |
| section_schema | jsonb | 默认模块 |
| block_schema | jsonb | 默认内容块 |
| print_schema | jsonb | 打印规则 |
| is_system | boolean | 系统模板 |
| enabled | boolean | 是否启用 |

### report_detail_sections

| 字段 | 类型 | 说明 |
|---|---|---|
| id | uuid | Section ID |
| report_id | uuid | 报告 ID |
| section_key | varchar | 模块 key |
| section_title | text | 标题 |
| section_summary | text | 摘要 |
| section_type | enum | overview / issue / metric / matrix / evidence / timeline / synthesis / appendix |
| source_sheet_name | text | Excel 来源 Sheet |
| display_order | int | 排序 |
| visibility_status | enum | visible / hidden / empty / review_only |
| issue_count / media_count / risk_count | int | 统计 |
| ai_pending_count | int | AI 待确认数 |
| missing_required_count | int | 必填缺失数 |
| print_behavior | enum | include / exclude / appendix_only |

### report_detail_blocks

| 字段 | 类型 | 说明 |
|---|---|---|
| id | uuid | Block ID |
| report_id | uuid | 报告 ID |
| section_id | uuid | 模块 ID |
| block_type | enum | summary_card / meta_table / issue_table / effect_card / metric_table / metric_heatmap / comparison_matrix / image_matrix / stage_timeline / evolution_table / source_alignment_table / ai_result_panel / evidence_strip / before_after_block / appendix_table |
| title | text | 标题 |
| summary | text | 摘要 |
| data_ref_type | varchar | 引用对象类型 |
| data_ref_ids | uuid[] | 引用对象 ID |
| content_json | jsonb | 内容 |
| render_config | jsonb | Web 渲染配置 |
| print_config | jsonb | 打印配置 |
| status | enum | normal / warning / blocked / hidden |
| display_order | int | 顺序 |

### report_evidence_slots

| 字段 | 类型 | 说明 |
|---|---|---|
| id | uuid | 证据位 ID |
| report_id | uuid | 报告 ID |
| section_id | uuid | 模块 ID |
| block_id | uuid | Block ID |
| business_object_type | enum | issue / recipe_step / effect_evaluation / matrix_cell / metric_evaluation / stage_event / re_evaluation / ai_result / source_report |
| business_object_id | uuid | 业务对象 ID |
| slot_role | enum | primary / supporting / archive / before_after / cover |
| media_ids | uuid[] | 媒体 |
| max_inline_count | int | 正文展示上限 |
| required | boolean | 是否必填 |
| validation_status | enum | ok / missing / overflow / invalid / unchecked |
| overflow_behavior | enum | drawer / appendix / hidden |
| print_behavior | enum | inline / summary_only / appendix_only |
| caption | text | 说明 |

### report_print_blocks

| 字段 | 类型 | 说明 |
|---|---|---|
| id | uuid | 打印块 ID |
| report_id | uuid | 报告 ID |
| snapshot_id | uuid | 快照 ID |
| source_block_id | uuid | 来源 Web Block |
| print_block_type | enum | cover / summary / table / matrix / image_grid / timeline / appendix / footer |
| page_profile | enum | a4_portrait / a3_landscape |
| page_order | int | 页序 |
| split_group_key | varchar | 拆分组 |
| print_content_json | jsonb | 打印内容 |
| print_status | enum | ready / warning / blocked |
| warning_json | jsonb | 警告 |


---

# 8. API 更新

## 8.1 报告详情读取

| 方法 | 路径 | 功能 |
|---|---|---|
| GET | `/api/reports/[id]/detail` | 获取报告详情完整结构 |
| GET | `/api/reports/[id]/detail/header` | 获取 Header |
| GET | `/api/reports/[id]/detail/conclusion` | 获取结论条 |
| GET | `/api/reports/[id]/detail/sections` | 获取模块目录 |
| GET | `/api/reports/[id]/detail/sections/[sectionId]` | 获取单个模块 |
| GET | `/api/reports/[id]/detail/blocks/[blockId]` | 获取 Block |

## 8.2 详情配置

| 方法 | 路径 | 功能 |
|---|---|---|
| PUT | `/api/reports/[id]/detail/default-view-mode` | 设置默认模式 |
| PUT | `/api/reports/[id]/detail/template` | 设置详情模板 |
| PUT | `/api/reports/[id]/detail/render-profile` | 设置渲染配置 |
| POST | `/api/reports/[id]/detail/refresh` | 重新生成详情结构 |
| POST | `/api/reports/[id]/detail/validate` | 校验详情完整性 |

## 8.3 模块与内容块

| 方法 | 路径 | 功能 |
|---|---|---|
| POST | `/api/reports/[id]/sections` | 新增模块 |
| PUT | `/api/reports/[id]/sections/[sectionId]` | 更新模块 |
| POST | `/api/reports/[id]/sections/reorder` | 模块排序 |
| POST | `/api/reports/[id]/blocks` | 新增 Block |
| PUT | `/api/reports/[id]/blocks/[blockId]` | 更新 Block |
| POST | `/api/reports/[id]/blocks/reorder` | Block 排序 |
| POST | `/api/reports/[id]/blocks/[blockId]/regenerate` | 重新生成 Block |

## 8.4 证据位

| 方法 | 路径 | 功能 |
|---|---|---|
| GET | `/api/reports/[id]/evidence-slots` | 获取证据位 |
| GET | `/api/reports/[id]/evidence-slots/[slotId]` | 获取证据位详情 |
| PUT | `/api/reports/[id]/evidence-slots/[slotId]` | 更新证据位 |
| POST | `/api/reports/[id]/evidence-slots/[slotId]/media` | 添加媒体 |
| DELETE | `/api/reports/[id]/evidence-slots/[slotId]/media/[mediaId]` | 移除媒体 |
| POST | `/api/reports/[id]/evidence-slots/validate` | 校验证据完整性 |
| POST | `/api/reports/[id]/evidence-slots/auto-place` | 自动证据落位 |

## 8.5 审核与打印

| 方法 | 路径 | 功能 |
|---|---|---|
| GET | `/api/reports/[id]/review-checklist` | 获取审核清单 |
| POST | `/api/reports/[id]/review/confirm-ai` | 批量确认 AI |
| POST | `/api/reports/[id]/review/confirm-comparability` | 确认可比性 |
| POST | `/api/reports/[id]/review/waive-missing-evidence` | 豁免缺失证据 |
| POST | `/api/reports/[id]/print/preflight` | 打印预检 |
| GET | `/api/reports/[id]/print/preview` | 打印预览 |
| POST | `/api/reports/[id]/print/blocks` | 生成打印块 |


---

# 9. PDF / 打印规则

## 9.1 双模板同源机制

```text
report_snapshot_json
├─ web_sections       网页详情
├─ print_blocks       PDF/打印
├─ evidence_slots     证据位共用
├─ source_refs        来源共用
└─ render_profiles    Web 和 Print 分别配置
```

## 9.2 Web 与 PDF 差异

| 内容 | Web 详情 | PDF/打印 |
|---|---|---|
| Header | Sticky 可压缩 | 封面/页眉 |
| Conclusion | 首屏结论条 | 首页摘要 |
| Navigation | 模块跳转 | 目录/章节页眉 |
| Drawer | 可交互展开 | 内嵌、脚注或附录 |
| 横向矩阵 | 横向滚动 | A3 横向拆列 |
| 长表格 | 筛选/虚拟滚动 | 分页重复表头 |
| 图片 | 缩略图 + 放大 | 固定尺寸内嵌 |
| AI | 可确认/驳回 | 只显示已确认结果 |
| 草稿 | 可编辑 | 草稿水印 |

## 9.3 Profile

| Profile | 适用 | 规则 |
|---|---|---|
| single_a4_portrait | 普通报告 | A4纵向，问题表+就地证据 |
| comparison_image_matrix_a3_landscape | 图片矩阵对比 | A3横向，拆列，重复对象头 |
| comparison_metric_table_a3_landscape | 指标表对比 | A3横向，指标分页，公式脚注 |
| comparison_mixed_a3_landscape | 混合对比 | 矩阵+指标+问题分模块 |
| model_merged_a4_portrait | 型号合并 | A4纵向，阶段轴+问题演进 |
| custom_merged_a4_portrait | 自定义合并 | A4纵向，来源对齐+专题结论 |

## 9.4 打印预检阻断项

| 阻断项 | 说明 |
|---|---|
| 正式 PDF 使用草稿数据 | 必须基于快照 |
| 必填证据缺失 | 不允许生成正式 PDF |
| AI 未确认但正文引用 AI | 不允许生成正式 PDF |
| 自定义合并可比性未确认 | 不允许生成正式 PDF |
| 图片文件丢失 | 不允许生成 PDF |
| 视频缺封面且作为正文证据 | 不允许生成 PDF |

## 9.5 打印预警项

| 预警项 | 说明 |
|---|---|
| 对象超过 5 个 | 建议拆分 |
| 预计页数超过 30 页 | 建议分册 |
| 图片超过正文展示上限 | 超出进入附录 |
| 长表跨页 | 自动重复表头 |
| 弱可比项较多 | 首页提示 |
| 缺失指标较多 | 指标模块提示 |


---

# 10. 权限、状态与发布规则

## 10.1 权限

| 角色 | 可操作 |
|---|---|
| viewer | 查看已发布报告、分享页 |
| editor | 编辑草稿、补证据、调整模块 |
| reviewer | 确认 AI、确认可比性、发布快照 |
| owner | 管理报告、分享、导出、归档 |
| admin | 配置模板、查看审计、删除 |

## 10.2 状态

### 报告状态

```text
draft → needs_review → ready_to_publish → published → archived
published → invalidated
```

### 详情质量状态

```text
unchecked → valid → warning → blocked
```

### 证据位状态

```text
ok / missing / overflow / invalid / unchecked
```

## 10.3 发布规则

1. 存在 AI 待确认时，不允许发布正式快照。
2. 关键证据缺失时，不允许发布，除非负责人填写豁免原因。
3. 自定义合并报告可比性未确认时，不允许发布。
4. PDF 预检失败不阻断发布，但阻断 PDF 生成。
5. 发布后生成不可变快照。
6. 后续编辑生成新版本，不影响已发布分享页和 PDF。


---

# 11. QA 验收方案

## 11.1 Report Detail Golden Test

### RD-GT-01 普通报告详情

输入：单对象试制体验报告。

验收点：

1. 进入 `single_report_narrative` 模板。
2. 首屏可看到报告目的、核心结论、A/B 级问题数量、下一步动作。
3. A/B 级问题置顶。
4. 问题行内展示关键证据图。
5. 点击证据打开 Evidence Drawer，并显示来源任务、上传人、关联问题。
6. PDF 中问题和证据不分离。

### RD-GT-02 图片矩阵型对比报告详情

输入：三台 7L 和面机对比报告。

验收点：

1. 进入 `comparison_image_matrix` 模板。
2. Object Strip 显示三个对象。
3. 矩阵按中式/西式面团分组。
4. 横向滚动时对象头和项目列固定。
5. 支持只看差异、只看异常、只看未确认 AI。
6. 单元格展示关键图、小结、问题标签、AI 状态。
7. 点击单元格打开 Drawer。
8. PDF A3 横向拆列并重复对象头。

### RD-GT-03 指标表型对比报告详情

输入：原汁机 120mm / 160mm 指标报告。

验收点：

1. 进入 `comparison_metric_table` 模板。
2. 指标总览显示达标率、关键异常、公式版本。
3. 指标表按食材/对象/指标展示。
4. 点击指标值显示公式、原始值、阈值。
5. 异常指标有异常说明。
6. PDF 中公式、阈值、异常说明完整。

### RD-GT-04 型号合并报告详情

输入：球形桶和面机多阶段合并报告。

验收点：

1. 进入 `model_dossier_timeline` 模板。
2. 顶部显示型号档案和当前阶段结论。
3. 阶段轴展示前期研究、试制、试产。
4. 问题演进区分新增、复现、关闭、反复出现。
5. 不默认显示最优型号。
6. 每个阶段可追溯来源报告。

### RD-GT-05 自定义合并报告详情

输入：用户多选 3 份历史报告生成自定义合并。

验收点：

1. 进入 `custom_merge_synthesis` 模板。
2. 顶部先展示合并目的和来源报告。
3. 专题结论前展示字段对齐与可比性边界。
4. 缺失字段显示 `missing`，冲突字段显示 `conflict`。
5. 默认不显示推荐最优对象。
6. PDF 首页包含合并目的、来源报告、可比性边界。

## 11.2 视觉回归

| 页面/组件 | 断言 |
|---|---|
| Report Header | 状态标签不挤压标题 |
| Conclusion Bar | 结论、风险、下一步首屏可见 |
| Navigation Rail | 长报告滚动时目录固定并高亮当前模块 |
| Action Rail | 操作不遮挡正文 |
| Image Matrix | 5对象×30行不压缩列宽 |
| Metric Table | 长表不丢表头 |
| Evidence Drawer | 大图、元信息、批注稳定 |
| Print Preview | 页眉页脚、分页、图片不变形 |

## 11.3 性能验收

| 场景 | 指标 |
|---|---|
| 报告详情首屏 | < 2 秒 |
| 切换模块 | < 300 ms |
| 打开 Evidence Drawer | < 500 ms |
| 5对象×30行矩阵 | < 2 秒 |
| 指标表 1000 行筛选 | < 1 秒 |
| 打印预检 | < 10 秒 |
| PDF 30 页生成 | < 120 秒 |


---

# 12. 开发计划与本轮目标

## 12.1 本轮交付目标

V2.6 的目标不是继续扩展报告中心首页，也不是把所有报告能力一次性重写，而是把“点击具体报告后的详情阅读和交付”做成稳定、可验收、可继续扩展的产品底座。

本轮完成后必须达到：

1. **报告详情有统一骨架**：所有报告进入详情后都有 Header、结论条、目录、正文画布、操作区和证据查看，不再靠页面临时堆组件。
2. **四类报告有差异化主线**：普通报告看问题闭环，对比报告看差异矩阵，型号合并看阶段演进，自定义合并看来源与可比性边界。
3. **证据贴着业务对象**：问题、步骤、效果、指标异常、矩阵单元格和复评估都有就地证据位，附录只做完整归档。
4. **AI 与发布有边界**：未确认 AI 不进入正式结论、发布快照、分享页或 PDF。
5. **Web 阅读与 PDF 交付分层**：Web 详情负责业务扫读，Print Block / PDF Profile 负责稳定交付，不用网页截图代替 PDF。
6. **Golden Test 可复现**：至少用三份历史 Excel/报告样本验证普通报告、图片矩阵对比、指标对比、型号合并和自定义合并。

## 12.2 当前基线与开发边界

当前仓库已具备：

- 单任务报告详情、分享页、打印页、报告中心列表、素材上传、问题闭环、功能效果、复评估和本地 Docker 模拟环境。
- `comparison_*` 相关表、对比对象、矩阵单元格、报告快照、对比报告与 PDF 初版相关代码。
- `pnpm ts-check`、`pnpm lint`、`pnpm build`、`pnpm smoke:e2e`、`pnpm check:golden` 等验证脚本。

本轮不做：

- 不新增一级“对比中心”。
- 不重做报告中心首页 V2.5 已规划的交付总览。
- 不引入自由画布式报告编辑器。
- 不把历史 Excel 原样网页化。
- 不允许为赶进度绕开权限、快照、AI 确认和证据归属规则。

## P0：基线锁定、样本与契约盘点

**目标**：先锁定当前可运行基线，避免后续开发在漂移数据和软跳过测试上推进。

交付：

- 梳理现有 `reports.content`、`report_snapshots`、`comparison_*`、`materials`、`issues`、`issue_re_evaluations` 字段与 V2.6 数据契约的差距。
- 固化 Golden Test 样本：普通单任务报告、三台和面机图片矩阵、原汁机指标对比、球形桶多阶段报告、自定义合并报告。
- 确认样本数据可由 `pnpm seed:golden` 或等价脚本重复生成，且素材路径不依赖开发机隐式文件。
- 输出字段缺口清单，区分“本轮必须加字段”“可先由 content JSON 承载”“后续版本再结构化”。

验收：

- `pnpm check:golden` 可运行并能发现缺失契约。
- 每类报告至少有一个可打开的样本 ID。
- 字段缺口清单能直接支撑 P1/P2 开发。

## P1：报告详情数据契约与模板识别

**目标**：让前端打开报告详情时拿到稳定的详情模型，而不是在页面内猜测报告类型和模块顺序。

交付：

- `detail_template_key`、`layout_profile`、`default_view_mode`、`report_goal`、`comparability_level`、`snapshot_status` 的读取和兜底规则。
- `/api/reports/[id]/detail` 或等价服务层，返回 Header、Conclusion、Sections、Blocks、Evidence Slots、Actions。
- 模板选择逻辑：`single_report`、`comparison_report`、`model_merged_report`、`custom_merged_report`。
- 模块隐藏规则：阅读模式隐藏无数据模块，审核模式显示缺失模块与补齐动作。

验收：

- 四类报告可自动识别详情模板。
- 打开报告详情不依赖前端硬编码模块顺序。
- 分享页只读数据与登录态详情页使用同一份详情模型。

## P2：Universal Report Shell 与阅读模式

**目标**：建立所有报告详情共用的阅读壳层，先解决“进入报告后不知道看什么、点哪里”的问题。

交付：

- Report Header、Conclusion Bar、View Mode Switch、Navigation Rail、Content Canvas、Action Rail、Evidence Drawer。
- Sticky Mini Header、移动端模块导航、长报告当前模块高亮。
- 只读分享页兼容：隐藏审核/编辑操作，保留目录、证据查看和 PDF 导出。
- 权限边界：发布、删除、分享、AI 确认只对负责人或管理员开放。

验收：

- 所有报告详情具备统一上下文、结论、目录、操作和证据查看。
- 长报告滚动时 Header、目录和主操作不丢失。
- 移动端可按模块阅读，不被宽表格阻断主线。

## P3：单报告与问题闭环模板

**目标**：先打通最常用的普通报告详情，把问题、功能效果、五感体验和复评估做成可交付阅读结构。

交付：

- Single Report Narrative 模板。
- 问题闭环模块：等级、状态、来源、责任、整改、验证、复评估。
- 功能效果模块：食谱/功能、参数、步骤、效果评价、问题点、AI 评分摘要。
- 五感/操作体验模块：标准类型、体验流程、触点、结果和证据。
- 问题、步骤、效果、复评估的就地证据条。

验收：

- A/B 级或一类/二类问题可置顶、筛选和展开证据。
- 问题行内能看到关键证据，不依赖跳到附录理解正文。
- 报告详情、分享页、打印页的事实内容一致。

## P4：对比报告模板

**目标**：让计划内多对象对比从“能录入/能生成”升级为“能阅读/能决策/能交付”。

交付：

- Object Strip、测试条件、可比性声明、关键差异摘要。
- 图片矩阵、指标表、混合矩阵三类 Block。
- 只看差异、只看异常、只看未关闭问题、隐藏相同项。
- Row Conclusion、Cell AI/Row AI/Report AI 状态呈现与人工确认入口。
- 单元格 Evidence Drawer：图片、指标、问题、AI 结果和来源记录。

验收：

- 三台和面机图片矩阵样本可完整阅读。
- 原汁机指标表样本可查看公式、阈值、异常原因和证据。
- AI 未确认时不能发布、分享正式快照或进入 PDF。

## P5：型号合并与自定义合并模板

**目标**：把“同型号多阶段”和“人工选择多报告专题”从列表聚合升级为有明确边界的报告资产。

交付：

- Model Dossier Timeline：型号档案、阶段轴、问题演进、功能效果演进、当前风险、下一阶段建议。
- Custom Merge Synthesis：合并目的、来源报告、字段对齐、缺失项、可比性边界、专题结论。
- 来源追溯 Drawer：源任务、源报告、快照版本、生成时间、字段映射。
- 弱可比/不可比报告的醒目提示与发布拦截规则。

验收：

- 型号合并报告围绕阶段演进呈现，不默认排名。
- 自定义合并报告先显示来源和可比性边界，再显示专题结论。
- 来源报告可追溯到快照版本，删除源任务不影响已发布快照阅读。

## P6：打印预览与 PDF 交付映射

**目标**：让 PDF 成为可控交付物，而不是浏览器当前页面的偶然截图。

交付：

- `report_print_blocks`、`report_render_profiles`、Print Preflight、Print Preview、PDF Job 状态。
- PDF Profile：普通 A4、图片矩阵 A3 横向、指标表 A3 横向、混合对比 A3 横向、型号合并 A4、自定义合并 A4。
- 预检规则：证据缺失、视频无封面、图片超限、矩阵过宽、AI 未确认、快照未发布。
- PDF 失败重试与报告中心/详情页状态提示。

验收：

- 四类报告均可生成或预览对应 PDF Profile。
- PDF 中问题、步骤、效果、矩阵、复评估的关键证据保持就地呈现。
- PDF 预检能阻止明显不可交付的报告进入正式输出。

## P7：QA 自动化、权限负测与上线验收

**目标**：把 V2.6 从“视觉和文档像完成”推进到“真实点击路径、数据持久化、快照和 PDF 都能证明完成”。

交付：

- RD-GT-01 至 RD-GT-05 Golden Test。
- Playwright 核心路径：登录、打开报告详情、切换模块、打开证据、分享页、打印预览。
- 权限负测：匿名、普通用户、负责人、管理员、分享访问。
- PDF 结构检查：关键模块、证据数量、页眉页脚、矩阵拆列。
- 发布前检查清单：软跳过测试、log-only 测试、缺失断言必须清理。

验收：

- `pnpm ts-check`、`pnpm lint`、`pnpm build` 通过。
- `pnpm smoke:e2e` 覆盖核心详情路径并有硬断言。
- `pnpm check:golden` 覆盖四类报告详情契约。
- 无 P0/P1 阻断缺陷，无 AI 未确认误发布，无关键证据丢失。

当前实现状态（2026-06-23）：

- 已补齐 `pnpm check:v2.6-success` 成功指标脚本，覆盖 section renderer、打印/PDF、分享只读、权限负测、移动端路径与自动化硬断言。
- 已补齐普通用户负测账号 `goldenuser / GoldenUser2026` 的 Golden Seed，验证普通用户可读内部报告但不能分享他人报告。
- 已复跑 `pnpm ts-check`、`pnpm lint`、`pnpm build`、`pnpm smoke:e2e`、`pnpm check:golden`、`pnpm check:v2.6-success`，本地验收全部通过。

## 12.3 阶段门禁

| 门禁 | 通过标准 | 未通过处理 |
|---|---|---|
| P0 完成 | Golden Test 样本与字段缺口明确 | 不进入模板开发 |
| P2 完成 | 通用壳层覆盖四类报告，移动端可读 | 不进入复杂模板并行开发 |
| P4 完成 | 对比报告样本具备可读矩阵、证据和 AI 状态 | 不进入正式对比报告发布 |
| P6 完成 | PDF 预检与 Profile 可阻断不可交付报告 | 不开放正式 PDF 导出 |
| P7 完成 | 自动化、权限、Golden Test 通过 | 不进入上线验收 |


---

# 13. 成功指标

## 13.1 产品体验指标

| 指标 | 目标 |
|---|---|
| 报告详情首屏理解效率 | 试点用户 5 秒内可说出报告目的、核心结论、下一步，比例 ≥ 85% |
| 目标模块定位效率 | 从进入报告到找到目标模块平均点击 ≤ 2 次 |
| 证据查找效率 | 从问题/指标/矩阵单元格到打开证据 ≤ 1 次点击 |
| Excel 替代满意度 | 业务评价“比 Excel 更清晰” ≥ 4/5 |
| 移动端可读性 | 普通报告和问题闭环在移动端无需横向滚动即可完成主阅读 |

## 13.2 交付质量指标

| 指标 | 目标 |
|---|---|
| PDF 一次预检通过率 | ≥ 90% |
| PDF 一次生成成功率 | ≥ 95% |
| 证据缺失率 | 发布报告中必填证据缺失率 = 0 |
| AI 未确认误发布率 | 0 |
| 弱可比误排名率 | 0 |
| 分享页一致性 | 分享页与已发布快照内容一致，草稿分享必须有醒目标识 |

## 13.3 工程健康指标

| 指标 | 目标 |
|---|---|
| 报告详情首屏性能 | < 2 秒 |
| 模块切换性能 | < 300 ms |
| Evidence Drawer 打开性能 | < 500 ms |
| Golden Test 契约覆盖 | RD-GT-01 至 RD-GT-05 全部有硬断言 |
| 自动化验证 | `pnpm ts-check`、`pnpm lint`、`pnpm build`、`pnpm smoke:e2e`、`pnpm check:golden`、`pnpm check:v2.6-success` 在验收分支通过 |
| 权限负测 | 匿名、普通用户、负责人、管理员、分享访问均有覆盖 |

---

# 14. 风险与应对

| 风险 | 影响 | 应对 |
|---|---|---|
| 模板过多导致开发复杂 | 交付周期变长 | 先做通用壳层 + 5 个系统模板 |
| 历史报告数据不完整 | 模块缺失 | 审核模式显示缺失，不强行发布 |
| 图片过多影响性能 | 首屏慢、PDF 慢 | 缩略图、懒加载、正文上限、附录归档 |
| 宽矩阵难打印 | PDF 不可读 | A3 横向、拆列、重复表头 |
| AI 结论误导 | 可信度风险 | 人工确认、证据引用、未确认不入快照 |
| 自定义合并弱可比 | 错误排序 | 强制可比性边界和字段对齐 |
| 用户不理解多模式 | 学习成本 | 默认阅读模式，其他模式通过清晰按钮进入 |
| 模板配置过度灵活 | 失去秩序 | 系统模板为主，管理员配置为辅 |

---

# 15. 附录：四类报告详情蓝图

## 普通报告

```text
Header
Conclusion
总览
问题闭环
功能效果
五感/操作
风险建议
AI确认
来源与版本
证据归档
```

## 图片矩阵对比报告

```text
Header
Conclusion
Object Strip
Comparability
Difference Summary
Image Matrix
Row Conclusions
Common Issues
Object Risks
Evidence Archive
```

## 指标表型对比报告

```text
Header
Conclusion
Object Strip
Metric Summary
Formula & Threshold
Metric Table
Anomaly Explanation
Evidence
Issue Closure
Formula Appendix
```

## 型号合并报告

```text
Header
Conclusion
Model Dossier
Stage Timeline
Issue Evolution
Function Effect Evolution
Current Risks
Next Stage Validation
Source Reports
```

## 自定义合并报告

```text
Header
Conclusion
Merge Purpose
Source Reports
Field Alignment
Comparability Boundary
Synthesis
Common Issues
Gaps & Missing Items
Validation Suggestions
```
