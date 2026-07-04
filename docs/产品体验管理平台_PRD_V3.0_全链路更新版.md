---
title: "产品体验管理平台 PRD V3.0"
subtitle: "全链路体验任务、问题闭环与报告交付平台"
date: "2026-06-26"
lang: zh-CN
---

# 0. 文档控制

| 项目 | 内容 |
|---|---|
| 文档名称 | 产品体验管理平台 PRD V3.0 |
| 文档定位 | 全平台产品需求文档；替代仅聚焦报告详情的 V2.6 版本 |
| 版本 | V3.0 |
| 修订日期 | 2026-06-26 |
| 输入基线 | V2.6 报告详情增强版、V2.6.1 实现期修正记录，以及三类现有 Excel 体验报告样本 |
| 产品主线 | 体验任务 -> 结构化记录 -> 问题闭环 -> 报告生成与阅读 -> 跨报告问题追踪 |
| 当前原则 | 以问题为业务主线；数据和证据贴着业务对象呈现；用户不在新建阶段选择报告模板；报告布局由实际内容决定 |
| 适用读者 | 产品、UX、前后端开发、测试、运维、数据/AI、项目管理、业务负责人 |
| 实施标记 | `P0 当前开发`、`P1 后续开发`、`RESERVED 预留设计，当前不开发` |

## 0.1 本次完整修订摘要

V2.6 的主目标是改善“点击报告后不如 Excel 有序”的问题。V3.0 扩展为覆盖平台全链路的统一设计，并做出以下关键调整：

1. 从“以报告详情为中心”改为“以体验任务和问题闭环为中心”。
2. 取消前台由用户选择报告模板；模板改为后台的**内容渲染策略**，由数据结构与报告内容自动推断。
3. 取消独立的“数据模式、证据模式”和右侧详情抽屉。数据、证据、问题、整改、复测必须在同一业务上下文内阅读；复杂编辑进入独立详情页或在当前行/卡片下方展开。
4. 顶部仅保留报告信息与状态计数；“报告总结”是唯一的报告级文字结论，避免与首屏摘要重复。
5. “问题、证据、整改、复测”不合并为一个大对象：以**问题主档**为闭环核心，证据可以同时关联功能效果、指标、问题、整改与复测。
6. 外部需求系统自动创建任务、Excel 结构化导入、自动识别跨报告同一问题、复杂 PDF 分册等能力全部保留完整设计，但明确为 `RESERVED`，不进入当前开发。
7. 补齐角色、路径、状态机、失败退回、提醒、跳转关联、数据模型、API、领域事件、权限、技术架构、监控与 QA。

## 0.2 产品边界

本平台服务于产品体验测试、试制/试产体验、竞品对比、功能/食谱效果验证、问题整改与复测、体验报告交付。

平台不承担以下职责：

- 不替代上游的需求立项、样机申请、项目排期或 PLM/BOM 主数据系统。
- 不替代研发缺陷管理系统；可与其建立问题链接或同步，但体验问题闭环以本平台为准。
- 不提供自由画布式文档排版。
- 不将任意 Excel 无损还原为网页；Excel 先作为来源附件，结构化导入仅支持明确配置的模板。
- 不允许未确认的 AI 结论作为正式发布结论。
- 不以“评分排名”替代可比性判断；弱可比和不可比数据不得输出默认最优推荐。

# 1. 背景、问题与设计原则

## 1.1 当前业务问题

现有体验报告以 Excel 为主要载体。Excel 在“行列关系、就近图片、临时编辑、公式查看”方面高效，但在以下方面存在长期问题：

| 问题 | 业务影响 | 平台应对 |
|---|---|---|
| 任务入口分散 | 需求、样机、测试对象、责任人需要重复填报 | 统一体验任务，未来接收外部系统申请事件 |
| 过程记录与报告混写 | 记录人一边做测试一边维护长报告，打断体验过程 | 先记录业务事实，再自动组织为报告 |
| 问题难跨报告追踪 | 同一问题在试制、试产、复测中被重复新建 | 建立问题主档与问题出现记录 |
| 图片和指标缺少稳定语义 | 图片贴在单元格旁，但系统无法理解其对应对象 | 证据按业务对象绑定，保留来源、时间、上传人 |
| 对比关系不稳定 | 多对象、食材、阶段、指标混在同一表，阅读成本高 | 根据内容推断适宜的展示方式，但不改变底层数据 |
| 整改闭环靠人工催办 | 责任、计划、复测、关闭缺少状态与提醒 | 明确整改与复测状态机、提醒与升级 |
| 报告阅读路径单一 | 工程师、产品、管理层在同一长页面中寻找各自信息 | 全量报告、汇报简报、问题详情三种路径共享同一数据 |
| 导入与系统衔接不稳定 | Excel 和上游需求表单难直接复用 | 先保留附件与来源标识，未来按契约接入 |

## 1.2 三类样本对平台的启示

三类已提供样本显示，报告在业务上天然有不同重心：

| 样本形态 | 主要阅读任务 | 平台默认渲染策略 | 用户不需要做的选择 |
|---|---|---|---|
| 多台和面机同条件对比 | 看同一食谱/项目下对象差异、关键问题与证据 | 对比矩阵或混合对比 | 不需在新建时选择“矩阵模板” |
| 原汁机不同口径/食材效果 | 看食材 x 口径 x 指标与异常原因 | 指标强化表 + 异常证据 | 不需在新建时选择“指标报告” |
| 同型号跨研究/试制/试产 | 看问题是否复现、整改是否有效、风险如何演进 | 阶段演进与问题轨迹 | 不需在新建时选择“阶段报告” |

## 1.3 产品原则

1. **任务先于报告**：用户承接的是体验任务；报告是任务中结构化事实的呈现与交付。
2. **问题优先**：问题是产品决策、研发整改和风险管理的共同语言。
3. **证据随对象**：图片、视频、原始指标不进入独立“素材区”后再人工寻找，而是随问题、功能效果、指标异常或复测结果出现。
4. **一份报告只有一个报告总结**：标题区不重复生成结论文字；顶部只展示元信息、状态和数量。
5. **录入不要求预判报告形态**：用户先录入事实；平台在阅读/导出时使用渲染策略生成更适合的版面。
6. **渐进披露，不打断阅读**：简要内容默认可扫读；步骤、原始数据、全部证据在当前上下文就地展开或进入独立详情页。
7. **人始终确认关键判断**：AI 可辅助归纳、推荐关联、发现缺失，但不能越过人工确认、可比性校验和发布规则。
8. **所有自动化都可追溯**：自动建任务、自动分配、自动计算、自动提醒、AI 建议均需保留来源、规则版本、执行结果与人工修正记录。
9. **预留完整、实现分期**：`RESERVED` 能力必须有对象、契约、状态、异常和权限设计，但当前代码、接口开关、页面入口不提前上线。

# 2. 目标、非目标与成功指标

## 2.1 产品目标

| 编号 | 目标 |
|---|---|
| G-01 | 体验人员可在最少重复填写下完成任务承接、功能记录、问题创建、证据上传和提交审核。 |
| G-02 | 产品、研发、设计可在报告中优先看到问题、影响、证据、整改和复测状态。 |
| G-03 | 报告比 Excel 更容易阅读，但保留 Excel 的结构优势：稳定关系、指标公式、就近证据、分组与冻结上下文。 |
| G-04 | 同一问题可跨报告追踪其发现、整改、复测与关闭历程。 |
| G-05 | 后续接入外部需求系统时，可安全、幂等地自动创建任务、预填字段并进行规则分配。 |
| G-06 | 报告、问题、证据、整改、复测、通知与导出均可审计、可定位、可追溯。 |

## 2.2 阶段性目标

| 阶段 | 范围 | 成功判定 |
|---|---|---|
| P0 当前开发 | 手动任务、结构化记录、问题闭环、基础报告、统一 PDF、通知、审计 | 真实任务可从创建到报告发布和问题复测闭环 |
| P1 后续开发 | 汇报简报、跨报告问题轨迹、深化搜索、移动端增强 | 管理层简报不再依赖人工二次做 PPT；同一问题可快速查看历史 |
| RESERVED | 外部系统自动建任务、规则分配、Excel 结构化导入、自动相似问题推荐、高级 PDF | 已具备实施契约、字段、状态、异常与测试方案；默认不开启 |

## 2.3 非目标

- 不在 P0 中开发任意 Excel 自动解析和通用映射。
- 不在 P0 中开放用户可见的报告模板选择器。
- 不在 P0 中做多版本 PDF、PDF 预检分册、复杂 A3/A4 Profile。
- 不在 P0 中通过 AI 自动创建/关闭问题。
- 不在 P0 中做外部系统实时双向同步。
- 不在 P0 中开发“右侧详情抽屉”交互范式。

## 2.4 成功指标

| 类型 | 指标 | P0 目标 |
|---|---|---|
| 录入效率 | 新建一条问题的中位完成时间 | 比现有 Excel 方式降低 30% |
| 录入完整性 | 提交任务时必填字段/证据完整率 | >= 95% |
| 阅读效率 | 读者定位某一未关闭高优问题的时间 | <= 30 秒 |
| 整改效率 | 到期整改项的提醒送达率 | >= 99% |
| 闭环质量 | 已关闭问题带复测证据的比例 | >= 95% |
| 报告质量 | 发布被阻断后一次修正通过率 | >= 80% |
| 技术健康 | P0 核心 API 5xx 比率 | < 0.5% |
| 可追溯性 | 发布报告中的问题/证据可回到来源任务比例 | 100% |

# 3. 核心概念、对象与关系

## 3.1 统一对象定义

| 对象 | 定义 | 关键责任 |
|---|---|---|
| 体验任务 `Task` | 某一产品/样机/阶段/对象范围内的体验工作单元 | 承接、分配、执行、提交、归档 |
| 测试对象 `TestObject` | 被体验或被对比的实体，如本机、竞品、变体、历史阶段样机 | 提供对象上下文与可比性基础 |
| 记录项 `RecordItem` | 对某项功能、食谱、场景、五感、步骤或指标的事实记录 | 承载结果、说明、指标、关联问题与证据 |
| 指标记录 `MetricRecord` | 原始值、计算值、阈值与结论 | 支持公式、版本、异常解释 |
| 证据 `Evidence` | 图片、视频、附件、现场记录等 | 可关联多个业务对象，保留原始来源 |
| 问题主档 `Issue` | 可跨报告持续追踪的产品问题实体 | 负责状态、责任、整改、复测与关闭 |
| 问题出现记录 `IssueOccurrence` | 某问题在某个任务/报告/记录项中的一次发现或复现 | 保存当次现象、证据、影响与上下文 |
| 整改动作 `RectificationAction` | 针对问题制定并执行的整改计划 | 记录负责人、期限、方案、结果 |
| 复测 `Verification` | 对整改后的验证活动 | 确认通过、失败、需补证据或重新打开 |
| 报告 `Report` | 对任务或多个来源任务/报告生成的阅读与交付视图 | 汇总、阅读、发布、导出、分享 |
| 报告总结 `ReportSummary` | 该报告唯一的文字性结论模块 | 人工维护或确认 AI 生成结果 |
| 报告渲染策略 `RenderProfile` | 根据数据结构选择的阅读布局规则 | 后台推断，不作为创建时的用户选择 |
| 通知 `Notification` | 任务、问题、整改、审核、发布等事件的提醒载体 | 站内、邮件/IM 渠道适配、已读与升级 |
| 来源连接 `SourceLink` | 外部申请、原始 Excel、来源报告等的可追溯链接 | 预留外部系统与导入设计 |

## 3.2 关系模型

```text
外部申请 / 手动创建
        ↓
     体验任务 Task
        ├─ 测试对象 TestObject (1..N)
        ├─ 记录项 RecordItem (1..N)
        │     ├─ 指标记录 MetricRecord (0..N)
        │     ├─ 证据 Evidence (0..N)
        │     └─ 问题出现记录 IssueOccurrence (0..N)
        ├─ 报告 Report (0..N)
        └─ 任务附件/来源链接 SourceLink (0..N)

问题主档 Issue
        ├─ 问题出现记录 IssueOccurrence (1..N)
        ├─ 整改动作 RectificationAction (0..N)
        └─ 复测 Verification (0..N)
              └─ 证据 Evidence (0..N)
```

## 3.3 关键建模约束

1. `Issue` 是主档，`IssueOccurrence` 是某一次观察到的问题事实。两个概念不得混用。
2. `Evidence` 使用多态关联表 `evidence_links`，可同时关联 `RecordItem`、`MetricRecord`、`IssueOccurrence`、`RectificationAction`、`Verification`、`Report`。
3. `Report` 不拥有问题真相；报告只引用任务数据和问题出现记录。发布时生成不可变 `ReportSnapshot`。
4. `RenderProfile` 只影响呈现，不改变原始任务、记录、问题、指标和证据数据。
5. 任务和报告的删改不应破坏已发布快照。删除采用软删除或归档，保留审计链。
6. 预留能力不得通过未来不可兼容的“备注字段”临时塞入。外部来源、导入作业、规则版本、相似度建议均须有正式对象。

# 4. 角色、权限与责任边界

## 4.1 角色定义

| 角色 | 典型人群 | 核心目标 |
|---|---|---|
| 申请人 `requester` | 上游需求发起人/项目成员 | 提交申请、查看关联任务和公开结果 |
| 体验承接人 `experience_executor` | 体验工程师 | 承接任务、记录体验、创建问题、上传证据、提交审核 |
| 任务负责人 `task_owner` | 体验负责人/项目负责人 | 分配、调整范围、退回、关闭/取消任务 |
| 研发整改负责人 `rectification_owner` | 研发、结构、电控、软件等 | 查看问题、提交整改方案、更新计划、发起复测 |
| 设计协作者 `design_collaborator` | 工业设计/交互/包装等 | 补充设计相关分析、查看问题和证据 |
| 产品决策者 `product_manager` | 产品经理/产品工程师 | 阅读报告、确认风险、创建后续验证/任务 |
| 审核发布人 `reviewer` | 体验负责人、指定评审人 | 审核任务/报告、确认结论、发布报告 |
| 管理层读者 `executive_viewer` | 管理人员 | 阅读发布报告与汇报简报，不编辑事实 |
| 平台管理员 `platform_admin` | 系统管理员 | 用户、组织、字典、权限、配置、审计管理 |
| 集成管理员 `integration_admin` | IT/系统集成人员 | 管理外部系统连接、字段映射、分配规则、失败队列 |
| 审计员 `auditor` | 质量/内控 | 只读查看审计与必要的原始记录 |

## 4.2 权限模型

采用 `RBAC + Resource Scope + Attribute Check`：

- RBAC：决定角色可访问的能力。
- Resource Scope：决定用户可访问的组织、产品线、项目、任务。
- Attribute Check：决定是否为任务负责人、问题责任人、审核人、来源系统管理员等。

| 能力 | 允许角色 | 约束 |
|---|---|---|
| 新建手动任务 | executor、task_owner、admin | requester 是否可新建由组织策略决定 |
| 编辑执行中任务 | executor、task_owner、admin | executor 仅限本人承接任务 |
| 创建问题/证据 | executor、task_owner、rectification_owner、reviewer、admin | 后两类只能补充本人有权限范围内的证据 |
| 更新整改 | rectification_owner、task_owner、reviewer、admin | rectification_owner 仅更新本人负责整改；reviewer 以退回/确认方式操作 |
| 发起/填写复测 | executor、task_owner、rectification_owner、reviewer、admin | rectification_owner 可申请；reviewer 可确认结论 |
| 编辑报告总结 | executor、task_owner、reviewer、admin | executor 可草拟；reviewer 负责确认 |
| 发布报告 | reviewer、admin | task_owner 可提交发布申请，不可绕过审核 |
| 查看已发布报告 | 受资源范围控制的全部角色 | executive 只读；分享页额外受分享策略控制 |
| 管理集成/导入 | platform_admin、integration_admin | integration_admin 仅管理连接、映射、异常，不能绕开业务权限 |

## 4.3 权限失败规则

| 场景 | 系统行为 |
|---|---|
| 用户直接访问无权限任务链接 | 返回 403；不泄露标题、人员、产品或问题数量；显示“无访问权限” |
| 用户曾有权限但权限已收回 | 当前页面提示权限已变化，停止自动保存，返回列表页 |
| 用户尝试更新非本人负责的整改 | 返回 403，并展示责任人和可申请协作入口 |
| 发布人尝试发布未审核报告 | 返回 409，展示阻断项与跳转锚点 |
| 外部分享链接过期/撤销 | 返回 410，显示“链接已失效”，不展示缓存内容 |

# 5. 全平台信息架构与端到端链路

## 5.1 一级导航

```text
工作台
├─ 我的待办
├─ 体验任务
├─ 问题中心
├─ 报告中心
├─ 通知中心
└─ 管理配置（按权限可见）
   ├─ 产品/组织/字典
   ├─ 模板与指标规则
   ├─ 用户与权限
   ├─ 集成中心 RESERVED
   ├─ Excel 导入配置 RESERVED
   └─ 审计与运维
```

## 5.2 全链路总览

```text
A. 需求入口
   手动建任务 / RESERVED 外部申请事件
        ↓
B. 任务分配
   自动规则（未来）或人工分配
        ↓
C. 体验执行
   对象、功能/食谱、指标、证据、问题
        ↓
D. 问题闭环
   分诊 -> 整改 -> 复测 -> 关闭/重开
        ↓
E. 报告交付
   自动聚合 -> 报告总结 -> 审核 -> 发布 -> PDF/分享/简报
        ↓
F. 持续追踪
   历史报告、问题主档、问题轨迹、后续任务
```

## 5.3 全局跳转规范

所有重要对象必须可深链、可返回来源：

| 源页面 | 目标 | URL/交互规范 |
|---|---|---|
| 通知 | 任务、问题、整改、报告 | `/tasks/{id}`、`/issues/{id}`、`/issues/{id}?tab=rectification`、`/reports/{id}` |
| 报告问题行 | 问题详情 | `/issues/{issueId}?occurrence={occurrenceId}&fromReport={reportId}` |
| 任务记录项 | 报告对应位置 | `/reports/{reportId}#record-{recordItemId}` |
| 问题详情 | 所有历史出现 | `/issues/{issueId}?tab=timeline` |
| 整改项 | 关联复测 | `/verifications/{verificationId}` 或 Issue 详情的复测页签 |
| 发布阻断清单 | 缺失字段/证据位置 | 使用锚点 `#issue-{id}`、`#record-{id}`、`#summary` |
| 外部来源 | 来源系统 | 仅在权限允许时显示安全跳转链接；新窗口打开且记录审计 |
| Excel 附件 | 原始文件预览/下载 | 使用短期签名 URL；记录访问审计 |

不使用右侧抽屉作为核心跳转方式。轻量内容在当前行或卡片下方展开；需要编辑、复杂历史、跨对象操作时进入独立详情页。

# 6. 关键状态机与统一退回策略

## 6.1 体验任务状态机

```text
draft
  -> pending_assignment
  -> assigned
  -> in_progress
  -> submitted
  -> under_review
  -> completed
  -> archived

pending_assignment -> cancelled
assigned -> pending_assignment        (承接人拒绝/人员变动)
in_progress -> blocked                (缺样机/条件不满足)
blocked -> in_progress
submitted -> in_progress              (审核退回)
under_review -> in_progress           (要求补录)
under_review -> completed
draft/pending_assignment/assigned/in_progress -> cancelled
completed -> reopened                  (发现遗漏或发起补测)
reopened -> in_progress
```

| 状态 | 说明 | 主操作 | 退回原因是否必填 |
|---|---|---|---|
| draft | 尚未提交分配 | 编辑、提交分配、取消 | 否 |
| pending_assignment | 等待指定承接人 | 分配、转待分配池、取消 | 分配失败时必填 |
| assigned | 已分配，待接受/开始 | 接受、拒绝、转交 | 拒绝时必填 |
| in_progress | 正在体验记录 | 保存、创建问题、提交审核、阻塞 | 阻塞时必填 |
| blocked | 因条件无法执行 | 恢复、调整计划、取消 | 是 |
| submitted | 执行人已提交 | 审核、退回 | 退回时必填 |
| under_review | 审核中 | 通过、退回 | 退回时必填 |
| completed | 任务完成 | 查看报告、发起补测/新任务 | 否 |
| reopened | 因新增事项重新打开 | 恢复执行 | 必须关联原因 |
| cancelled | 取消且不可继续 | 查看审计 | 必须记录原因 |

## 6.2 问题状态机

```text
open
 -> triaged
 -> assigned
 -> rectifying
 -> pending_verification
 -> verified_closed

open/triaged/assigned/rectifying/pending_verification -> waived
pending_verification -> rectifying          (复测失败)
verified_closed -> reopened                  (后续复现)
waived -> reopened                           (豁免失效)
```

| 状态 | 责任 | 进入条件 | 可退回/跳转 |
|---|---|---|---|
| open | 创建人/任务负责人 | 已填现象、至少一个上下文；高等级问题需证据或豁免 | 可合并、可分诊 |
| triaged | 任务负责人 | 已确定严重度、所属模块、处理方式 | 退回补充事实 |
| assigned | 整改负责人 | 已分配责任人和计划 | 责任人可拒绝并退回分诊 |
| rectifying | 整改负责人 | 已提交整改方案 | 可更新计划、上传方案证据 |
| pending_verification | 体验/审核方 | 已申请复测 | 复测失败则回到 rectifying |
| verified_closed | 审核人 | 复测通过且有结论/证据 | 后续复现可 reopened |
| waived | 审核人 | 已说明风险接受/不处理原因与有效期 | 到期提醒，必要时 reopened |

## 6.3 报告状态机

```text
draft -> preparing -> pending_review -> changes_requested -> preparing
pending_review -> ready_to_publish -> published -> superseded -> archived
published -> invalidated
```

说明：

- `draft`：任务数据正在汇总，报告可编辑。
- `preparing`：系统重算内容、指标和渲染策略。
- `pending_review`：提交审核。
- `changes_requested`：审核退回，必须含退回说明与定位链接。
- `ready_to_publish`：所有阻断项已通过。
- `published`：创建不可变快照和可分享版本。
- `superseded`：有新发布版本但保留旧版可追溯。
- `invalidated`：发现严重数据错误，保留可审计访问但默认不作为有效交付。

## 6.4 通用退回与失败处理原则

1. 退回不是“状态回滚后消失”：必须记录 `reason_code`、自由文本、操作人、时间、来源对象。
2. 任何异步失败不得悄悄丢失：任务创建、媒体转码、通知、PDF、导入、外部事件均需状态、重试次数和告警。
3. 用户在输入过程中断网或刷新时，草稿应保留；提交失败不清空已输入内容。
4. 状态跃迁由服务端校验，前端只根据服务端返回结果更新。
5. 严重失败可降级：例如 PDF 失败不影响已发布报告阅读；消息渠道失败不影响站内待办生成。

# 7. 模块一：工作台与待办

**实施阶段：P0**

## 7.1 页面目标

用户登录后无需理解复杂体系，应先看到“我要处理什么”。工作台按任务、问题、整改、审核四类待办汇总，不按系统模块堆卡片。

## 7.2 页面结构

```text
顶部：全局搜索 | 新建体验任务 | 通知 | 个人菜单
------------------------------------------------
我的待办
[待承接任务] [执行中任务] [待我整改] [待我审核] [即将到期]
------------------------------------------------
优先处理
- A 级问题复测待确认
- 今日到期整改
- 审核退回的任务
------------------------------------------------
最近访问
任务 / 问题 / 报告
```

## 7.3 待办规则

| 待办类型 | 触发事件 | 默认排序 | 点击跳转 |
|---|---|---|---|
| 待承接 | 任务分配给我 | 优先级、计划开始时间 | 任务详情，突出接受/拒绝 |
| 执行中 | 我为执行人且未提交 | 截止时间、最后编辑时间 | 任务工作台 |
| 待我整改 | 我为整改负责人且问题未关闭 | 严重度、计划完成时间 | 问题详情的整改页签 |
| 待我复测 | 我为复测人 | 申请时间、问题等级 | 复测任务/问题详情 |
| 待我审核 | 我是审核人 | 提交时间、风险等级 | 任务审核或报告审核 |
| 即将到期 | 任务/整改/复测临近期限 | 距到期时间 | 对应对象 |

## 7.4 失败与边界

- 待办聚合服务异常：显示上次成功更新时间与“刷新重试”，不展示虚假空态。
- 用户无权限的历史待办：自动从列表移除，并记录权限变动审计。
- 同一事项多渠道重复提醒：站内只保留一条聚合待办，渠道发送使用去重键。
- 任务被取消或问题关闭后，未读通知不删除，但点击时提示状态已变化并跳转最新状态。

# 8. 模块二：体验任务创建、分配与承接

## 8.1 创建入口

| 入口 | 阶段 | 说明 |
|---|---|---|
| 手动新建任务 | P0 | 任务负责人/体验人员创建 |
| 从报告/问题发起补测 | P0 | 自动带入产品、对象、问题、复测目标 |
| 从复制历史任务创建 | P1 | 复制结构，不复制问题/结论/证据 |
| 外部系统申请自动创建 | RESERVED | 接收入站事件，映射字段并路由分配 |
| Excel 附件创建草稿 | RESERVED | 上传来源 Excel，先作为附件，不自动解析 |

## 8.2 手动新建任务流程

```text
选择基础信息
 -> 配置测试对象与范围
 -> 选择记录项集合
 -> 指定执行人与计划
 -> 保存草稿 / 提交分配
```

### 8.2.1 基础信息字段

| 字段 | 必填 | 规则 |
|---|---:|---|
| 任务名称 | 是 | 自动建议“产品/型号 + 阶段 + 体验类型”，允许编辑 |
| 产品线/品类/型号 | 是 | 来源于产品字典；支持多个测试对象 |
| 阶段 | 是 | 前期研究/手板/试制/试产/量产/竞品等可配置 |
| 体验目的 | 是 | 200 字内；用于后续报告信息，不等于报告总结 |
| 体验类型 | 是 | 单对象体验、对比体验、复测、专项验证等；只影响默认记录项 |
| 优先级 | 是 | P0/P1/P2 或业务字典；不等同问题严重度 |
| 测试条件摘要 | 否 | 场地、环境、样机状态、原料批次、前置条件 |
| 计划开始/完成时间 | 是 | 结束不得早于开始 |
| 来源链接/附件 | 否 | 可关联上游申请、原始 Excel、邮件/文档 |
| 执行人/承接组 | 是 | 支持先分配到组，再由组内承接 |

### 8.2.2 记录项集合

用户不选择“报告模板”，只选择或继承体验范围：

- 食谱/功能效果。
- 功能/操作步骤。
- 五感/清洁/噪音。
- 指标测量。
- 对比对象。
- 专项检查项。

平台根据 `体验类型 + 产品品类 + 阶段 + 选定范围` 推荐默认记录项；用户可新增、删除、排序。每项有唯一 `record_item_id`，避免后续报表依赖自由文本标题。

## 8.3 分配与承接

### 8.3.1 P0 人工分配

任务负责人选择执行人或承接组，系统校验：

- 执行人具备组织/产品线访问权限。
- 执行人未离职/禁用。
- 截止日期合理。
- 高优任务是否需要至少一名审核人。
- 同一任务不能重复创建相同执行角色。

执行人可“接受”或“拒绝”。拒绝必须选择原因：工作量冲突、能力/权限不匹配、测试条件未具备、其他；拒绝后任务回到 `pending_assignment`，通知任务负责人。

### 8.3.2 RESERVED：外部系统触发与规则分配

#### 设计目标

当上游需求申请通过时，外部系统发送事件。平台按照字段映射和分配规则创建任务、预填基础信息、分配承接组/人，并将结果回写或提供查询状态。

#### 外部事件契约

```json
{
  "event_id": "uuid",
  "event_type": "experience_request.approved",
  "occurred_at": "2026-06-26T10:00:00Z",
  "source_system": "upstream-system",
  "source_record_id": "REQ-20260626-001",
  "schema_version": "1.0",
  "payload": {
    "request_title": "160mm 原汁机试制体验",
    "product_line_code": "JUICER",
    "product_model_code": "YZJ-F01M1",
    "stage_code": "trial",
    "experience_type_code": "comparison",
    "priority_code": "P1",
    "requested_due_at": "2026-07-05T18:00:00+08:00",
    "requester_id": "external-user-id",
    "source_url": "https://source.example/REQ-20260626-001",
    "custom_fields": {}
  }
}
```

#### 字段映射与默认策略

| 外部字段 | 平台字段 | 映射失败策略 |
|---|---|---|
| request_title | task.title | 使用“待补充标题”，进入人工待处理池 |
| product_line_code | task.product_line_id | 无映射：不创建正式任务，进入 `mapping_failed` |
| product_model_code | test_object.model_id | 无映射：创建待确认对象，不允许提交执行 |
| stage_code | task.stage_code | 无映射：使用 `unknown`，要求管理员确认 |
| experience_type_code | task.experience_type | 无映射：使用默认“专项验证”，标记待确认 |
| priority_code | task.priority | 无映射：默认 P2，并记录告警 |
| requested_due_at | task.due_at | 不合法：使用系统默认 SLA，标记待确认 |
| requester_id | source_link.requester_ref | 无匹配：保存原始 ID，不创建内部用户关系 |

#### 分配规则模型

```text
按优先级排序的规则：
产品线 + 品类 + 阶段 + 体验类型 + 地点/组织 + 优先级
  -> 承接组
  -> 可选指定执行人
  -> 审核人
  -> SLA 与提醒策略
```

规则必须具备：

- 生效时间、停用时间、版本号、模拟测试能力。
- 条件冲突检测：多条规则命中时按优先级和最具体匹配原则选择。
- 无规则命中时进入“待分配池”，不得静默分给任意人。
- 人员不可用时优先转承接组，不自动改派到无权限用户。
- 所有自动分配需要写入 `assignment_decision`：命中规则、候选人、最终结果、时间、是否人工改写。

#### 幂等、重试与回退

| 场景 | 行为 |
|---|---|
| 同一 `source_system + event_id` 重复发送 | 返回首次处理结果，不重复建任务 |
| 同一来源单据产生更新事件 | 根据事件类型执行更新；不允许覆盖已执行的关键事实 |
| 签名验证失败 | 拒绝 401/403，记录安全审计，不进入业务队列 |
| 字段映射失败 | 进入集成异常队列，通知集成管理员，不创建半成品正式任务 |
| 分配规则失败 | 可创建 `pending_assignment` 任务，但必须标记“自动分配失败” |
| 消息消费失败 | 指数退避重试；超过阈值进入死信队列；支持人工重放 |
| 回写上游失败 | 平台任务保留；进入回写重试，不回滚已成功建成的任务 |
| 外部撤销申请 | 若任务未开始则取消；若已执行则标记“来源已撤销”，交由任务负责人决定继续/取消 |

**当前实现要求：**仅创建数据模型、接口契约、规则配置原型、权限与测试用例；不接入任何真实系统、不启用事件端点、不部署消费者。

# 9. 模块三：体验任务工作台与录入

**实施阶段：P0**

## 9.1 页面结构

```text
任务信息条：任务名 | 产品/阶段 | 执行状态 | 保存状态 | 提交审核
----------------------------------------------------------------
记录导航：总览 | 功能/食谱 | 指标 | 五感/操作 | 问题 | 附件
----------------------------------------------------------------
当前记录区（按记录项分组）
- 食谱/功能卡
- 指标录入表
- 过程步骤（默认折叠）
- 证据缩略图
- 关联问题
```

任务工作台不是报告预览。它服务于“边体验边记录、少跳转、可恢复”。

## 9.2 统一录入路径

### 9.2.1 食谱/功能效果卡

默认可见字段：

```text
食谱/功能名称
食材清单/前置条件
功能效果（达标/待观察/不达标/不适用）
效果说明
关键证据（0-3）
关联问题（0-N）
[展开步骤与完整过程]
```

“步骤”默认折叠，只在以下情形自动提醒展开：

- 结果为不达标。
- 创建了问题。
- 录入人员主动标记“过程异常”。
- 模板/规则要求某一步必须填写。
- 审核人退回并定位到某步骤。

### 9.2.2 条件触发

| 条件 | 触发 UI | 后台行为 |
|---|---|---|
| 功能效果 = 达标 | 显示简短说明与可选证据 | 可继续下一项 |
| 功能效果 = 待观察 | 显示待补充原因、建议复测时间 | 生成提醒候选，不自动建问题 |
| 功能效果 = 不达标 | 自动打开问题创建区 | 预填当前任务、对象、记录项、步骤、证据 |
| 指标超阈值 | 显示异常说明字段和“创建/关联问题” | 记录规则版本与计算结果 |
| 上传失败 | 当前证据位显示失败状态和重试 | 不丢失文件元数据与本地草稿引用 |
| 同一问题疑似存在 | P1/RESERVED 才可提示候选 | 不自动关联，由用户确认 |

### 9.2.3 问题创建的预填规则

用户从记录项/步骤/指标异常创建问题时，系统自动带入：

- 任务、测试对象、产品型号、阶段。
- 当前记录项、食谱、功能、步骤。
- 当前测试条件与原料/场景。
- 已上传的关键图片/视频/指标记录。
- 建议问题模块/标签（可编辑）。
- 发现人、发现时间。

用户需确认或填写：

- 问题现象。
- 严重度。
- 影响范围。
- 建议方向（可选）。
- 是否关联已有问题主档。
- 责任部门/建议责任人（可选，最终由分诊确认）。

## 9.3 数据录入与证据交互

### 9.3.1 证据上传

支持图片、视频、文档、音频（按组织策略开关）。上传流程：

```text
选择文件 -> 本地校验 -> 分片/直传 -> 病毒扫描 -> 转码/缩略图 -> 可用 -> 绑定业务对象
```

| 阶段 | 规则 |
|---|---|
| 本地校验 | 校验格式、大小、数量、网络状态；不通过即提示 |
| 直传 | 使用短期签名 URL，避免文件经应用服务器中转 |
| 扫描 | 未扫描完成前标记 `processing`，不能作为发布关键证据 |
| 转码 | 视频生成预览图与播放版本；失败时保留原件且允许重试 |
| 绑定 | 必须记录绑定对象、角色（关键/补充/复测前后）、说明 |
| 删除 | 已发布快照引用的证据不能物理删除；仅可标记不可用并说明 |

### 9.3.2 自动保存与冲突

- 字段编辑后 800ms 防抖自动保存；顶部显示“保存中/已保存/保存失败”。
- 提交审核前执行完整校验。
- 使用 `version` 或 `updated_at` 实现乐观锁；冲突时服务端返回 409 和最新版本。
- 冲突页面提供：查看差异、保留我的内容、采用最新内容、复制到备注。不得无提示覆盖。
- 断网时保留本地草稿队列；恢复网络后按顺序同步；发生冲突进入人工处理。

## 9.4 任务提交审核校验

### 阻断项

- 缺少必填测试对象/任务目的/关键记录项结果。
- 不达标记录没有问题或明确豁免说明。
- 高严重度问题没有关键证据或证据豁免原因。
- 指标异常没有异常说明。
- 复测任务没有关联原问题或验证结论。
- 存在未完成上传/扫描失败的关键证据。

### 预警项

- 过程步骤大量为空但未标记不适用。
- 多个问题未分配模块/严重度。
- 任务已超过计划完成时间。
- 存在待观察结果且未规划复测。
- 同一记录项的图片数量超过建议上限。

提交失败时用户停留在当前任务，顶部展示校验摘要，点击后跳转到对应记录项并高亮字段。

# 10. 模块四：问题中心、整改与复测

**实施阶段：P0；跨报告轨迹 P1**

## 10.1 问题中心列表

默认列表字段：

| 字段 | 说明 |
|---|---|
| 问题编号/标题 | 可读编号 + 简要现象 |
| 产品/型号/阶段 | 业务定位 |
| 严重度 | A/B/C 或可配置等级 |
| 当前状态 | open 至 verified_closed/waived |
| 责任人 | 当前整改责任人 |
| 计划完成时间 | 用于排序/提醒 |
| 最近一次出现 | 最近任务/报告/复测 |
| 是否复现 | 显示历史轨迹提示 |
| 关联报告数 | 可进入报告列表 |
| 更新日期 | 最新动作时间 |

筛选：产品线、型号、阶段、严重度、状态、责任人、部门、是否复现、是否逾期、来源任务、关联报告。

## 10.2 问题详情页

```text
问题标题 / 编号 / 严重度 / 状态 / 责任人
------------------------------------------------
概览
- 当前现象、影响、首次发现、最近出现、关联产品
------------------------------------------------
当次发现（Issue Occurrences）
- 每次出现的任务、记录项、证据、原始指标、描述
------------------------------------------------
整改
- 整改方案、责任人、计划、执行证据、变更记录
------------------------------------------------
复测
- 复测任务、结论、证据、审核意见
------------------------------------------------
轨迹（P1）
- 发现 -> 分诊 -> 整改 -> 复测失败/通过 -> 关闭/重开
------------------------------------------------
关联
- 报告、任务、外部系统链接、相似问题候选（RESERVED）
```

不使用右侧详情抽屉。报告内点击问题进入独立问题详情；仅快速查看场景允许报告行内展开简短信息。

## 10.3 分诊与整改

### 10.3.1 分诊字段

| 字段 | 必填 | 说明 |
|---|---:|---|
| 严重度 | 是 | A/B/C 或组织字典 |
| 问题模块 | 是 | 结构、性能、软件、操作、外观、清洁等 |
| 影响范围 | 是 | 单一食谱/功能、对象、批次、全局等 |
| 处理策略 | 是 | 整改、观察、豁免、合并到既有问题 |
| 整改责任人 | 整改时必填 | 可为部门/用户 |
| 计划完成时间 | 整改时必填 | 用于 SLA |
| 复测要求 | 是 | 是否需复测、建议场景/指标 |
| 分诊说明 | 是 | 解释判断依据 |

### 10.3.2 整改更新

整改负责人可编辑：方案、计划完成时间、执行状态、实际完成时间、整改证据、风险说明。计划延期必须填写原因，触发任务负责人和审核人提醒。

### 10.3.3 复测

复测不在问题页“直接关闭”，而是创建/关联一个复测任务：

```text
问题详情 -> 发起复测
  -> 预填原问题、相关对象、关键场景、验收标准、原始证据链接
  -> 指定复测人/计划
  -> 复测任务完成
  -> 提交复测结论
  -> 审核通过：问题关闭；失败：问题退回整改
```

复测结论：`pass`、`fail`、`partial_pass`、`inconclusive`。

| 结论 | 系统动作 |
|---|---|
| pass | 允许审核关闭问题 |
| fail | 问题转回 `rectifying`，保留失败复测记录 |
| partial_pass | 要求审核人选择“继续整改/拆分新问题/风险豁免” |
| inconclusive | 创建补测待办，不允许关闭 |

## 10.4 跨报告问题演进

### P1 当前可做的最小版本

- 同一 `Issue` 可在多个任务/报告中创建多个 `IssueOccurrence`。
- 用户在创建问题时可搜索并手动关联既有问题。
- 问题详情按时间显示所有出现、整改、复测。
- 报告中展示该问题“首次发现、最近状态、是否复现、关联报告数”。

### RESERVED：自动相似问题推荐

- 输入：产品/型号、模块、功能节点、标签、文本、图像/媒体特征（如后续启用）。
- 输出：候选问题及相似原因，不直接合并。
- 人工确认后创建 `issue_relation`，关系可为 `same_issue`、`related_issue`、`duplicate`、`split_from`。
- 必须保存模型/规则版本、候选分数、用户决策和误判反馈。
- 无论置信度多高，不得自动关闭、合并或改变历史问题。

# 11. 模块五：报告生成、阅读、审核与发布

## 11.1 核心原则

1. 一份报告的阅读顺序固定为：**报告信息 -> 报告总结 -> 问题点列表 -> 动态结果区 -> 行动与追溯**。
2. “报告总结”是唯一报告级叙事结论；顶部不再设置重复的 `Conclusion Bar`。
3. 数据和证据不独立成页面/模式；它们与问题、功能效果、指标、复测结论一起呈现。
4. 不向创建者暴露模板选择。系统从任务数据推断默认渲染策略；阅读者可在合规范围内切换“全量报告/汇报简报”，不改变原始数据。
5. 问题列表始终比“花哨的报告结构”优先，按严重度、状态和影响排序。

## 11.2 报告页面结构

```text
报告信息条
  标题 | 产品/阶段 | 来源任务 | 状态 | 版本 | 报告类型标签 | 导出/分享
------------------------------------------------------------
报告总结（唯一结论模块）
  结论正文 | 关键风险 | 下一步建议 | 人工确认状态
------------------------------------------------------------
问题点列表（默认优先）
  筛选：全部 / 未关闭 / A-B级 / 我的责任 / 已复测
  行内：现象、影响、严重度、状态、关键证据、责任、计划、复测
------------------------------------------------------------
动态结果区（按数据存在性出现）
  功能/食谱效果 | 指标结果 | 对比矩阵 | 五感/操作 | 阶段演进
------------------------------------------------------------
行动与追溯
  下一步任务/复测 | 来源任务/原始附件 | 版本/审计
```

## 11.3 报告信息条

只放高频定位与状态，不放重复结论文字：

| 字段 | 说明 |
|---|---|
| 报告标题 | 可编辑规则生成标题 |
| 报告状态 | 草稿、审核中、已发布、失效、归档 |
| 产品/型号/阶段 | 可定位业务对象 |
| 来源任务/报告 | 多来源时显示数量并进入独立来源页 |
| 测试对象数量 | 多对象报告显示 |
| 关键问题计数 | A/B 级、未关闭、待复测计数 |
| 版本 | 发布快照版本 |
| 创建/更新时间 | 基础追溯 |
| 主操作 | 提交审核、发布、导出、分享；按权限显示 |

## 11.4 报告总结

字段：

| 字段 | 规则 |
|---|---|
| 总结正文 | 建议 80-300 字；由人工填写或确认 AI 草案 |
| 结论等级 | positive / neutral / risk / blocked |
| 关键风险 | 最多 3 条在正文旁显示，超过后在正文中查看 |
| 下一步建议 | 可关联任务、问题或自由文本行动项 |
| 结论来源 | manual / ai_confirmed / imported_draft |
| 确认人/时间 | 发布时必须可追溯 |
| 数据范围声明 | 对比/合并报告必须展示样本范围、条件差异和可比性 |

AI 草案必须显示为“待确认”，不得覆盖人工已确认内容。用户改写 AI 草案后，保留生成版本与人工版本的审计差异。

## 11.5 动态结果区与渲染策略

### 渲染策略（后台，不是用户新建模板）

| `render_profile` | 触发条件 | 默认展示重点 |
|---|---|---|
| `single_narrative` | 单测试对象、多个记录项 | 功能效果 + 问题 + 证据 |
| `comparison_matrix` | 多对象且记录项语义可对齐 | 对象列 x 项目行，固定对象头和项目列 |
| `metric_emphasis` | 多项量化指标、阈值/公式重要 | 指标表、异常解释、关键证据 |
| `mixed_comparison` | 图片、指标和问题同等重要 | 最小决策单元：关键图 + 核心指标 + 问题 + 小结 |
| `stage_timeline` | 同一型号跨阶段/多次复测 | 阶段轴、问题复现与关闭、效果演进 |
| `synthesis` | 多来源专题整合 | 来源范围、可比性边界、共性/差异/缺口 |

### 策略推断规则

- 使用 `test_object_count`、`record_item_alignment_rate`、`metric_density`、`stage_count`、`source_report_count` 等字段推断。
- 平台输出“推荐阅读布局”，报告负责人可在审核前选择另一可用布局，但选择不影响数据与字段。
- 若无法安全推断，回退到 `single_narrative`，并在审核清单提示“建议确认阅读布局”。
- 对比报告未确认可比性时，不展示自动排名；只展示差异与条件边界。

## 11.6 各结果区的交互细节

### 11.6.1 问题点列表

默认排序：未关闭 A -> 未关闭 B -> 待复测 -> 其他未关闭 -> 已关闭。每行展示：

```text
严重度 | 现象摘要 | 影响 | 关键证据 1-3 | 当前状态 | 责任人 | 计划 | 复测结论
```

- 点击行：在当前行下方展开“完整描述、出现记录、整改摘要、复测摘要、跳转问题详情”。
- 点击图片：全屏预览并支持前后对照；关闭后回到原行位置。
- 点击整改状态：进入问题详情的整改页签。
- 点击复测状态：进入关联复测任务/记录。
- 无关键证据：显示“证据缺失”及原因，不允许以空白代替。

### 11.6.2 功能/食谱效果

按食谱、功能或场景分组，每张卡默认显示：

```text
名称 | 食材清单/前置条件 | 功能效果 | 一句说明 | 关键证据 | 关联问题
> 展开步骤与完整过程
```

步骤折叠展示，展开后可见时间、操作、观察、对应证据和问题。若本卡存在异常，则自动显示异常步骤与关联问题，不要求读者手动翻全流程。

### 11.6.3 指标结果

- 默认展示核心指标与异常项。
- 指标值可就地展开公式、原始值、阈值、公式版本、录入来源与异常说明。
- 不使用右侧抽屉。
- 缺失、不可用、不可比必须明确显示，不得用 0 或空白伪装。
- 指标异常旁直接展示关联证据、问题和整改状态。

### 11.6.4 对比矩阵

- 固定项目列和对象头；对象超过 5 个时提示缩小范围或切换分组。
- 单元格仅展示最小决策信息：关键图 1-2 张、核心指标、问题标签、简短结论。
- 点击单元格在原表格下方展开该单元格的完整记录和证据；避免侧抽屉。
- 支持“仅看差异、仅看异常、仅看未关闭问题”。
- 缺失项显示 `未测试/缺失/不适用`，不允许空白。

### 11.6.5 阶段演进

- 按真实时间与阶段排序，允许缺阶段。
- 每阶段显示：阶段结论、关键问题、关闭/复现数量、关键证据、来源任务/报告。
- 点击问题显示其跨阶段出现和复测轨迹。
- 不生成“最优阶段”排名。

## 11.7 审核与发布

### 审核清单

| 检查项 | 阻断/预警 | 规则 |
|---|---|---|
| 报告总结已确认 | 阻断 | 必须由有权限人员确认 |
| 高等级问题证据 | 阻断 | 缺失需豁免原因 |
| 不达标结果问题闭环 | 阻断 | 必须存在问题/豁免 |
| 指标异常解释 | 阻断 | 必须有解释或不适用依据 |
| 对比可比性 | 阻断 | 对比/整合报告必须确认范围和边界 |
| 来源可追溯 | 阻断 | 报告至少关联来源任务/来源报告 |
| 待观察项 | 预警 | 需有计划或说明 |
| 逾期整改 | 预警 | 允许发布但突出显示 |
| 图片过多 | 预警 | 不阻断，建议缩减正文证据 |

### 发布行为

- 发布创建 `ReportSnapshot`，写入数据范围、引用对象版本、渲染策略版本、报告总结版本和导出版本。
- 已发布报告允许生成新草稿版本，不直接覆盖已发布快照。
- 已发布报告发现重大错误可 `invalidated`，必须填写原因；旧链接打开时显示失效标识和有效新版本链接（若有）。
- 发布后自动生成站内通知；外部分享仅在明确开启后创建，带有效期与撤销能力。

# 12. 模块六：报告中心、搜索、分享与简报

## 12.1 报告中心

**实施阶段：P0**

报告中心解决“找到报告、看状态、处理待办”，不是复杂分析驾驶舱。

列表字段：

| 字段 | 说明 |
|---|---|
| 标题 | 主信息 |
| 产品/型号/阶段 | 范围定位 |
| 报告类型 | 自动推断/人工确认后的标签 |
| 状态/版本 | 草稿、审核中、已发布等 |
| 关键问题 | 未关闭 A/B、待复测数量 |
| 来源任务 | 数量与入口 |
| 创建人/审核人 | 责任追溯 |
| 更新时间 | 版本判断 |
| 分享状态 | 仅有权限用户可见 |

筛选：产品线、品类、型号、阶段、状态、报告类型、创建人、审核人、时间范围、是否有未关闭高等级问题、是否可比。

## 12.2 全局搜索

**实施阶段：P1，P0 可先支持标题/编号搜索**

搜索对象：任务、问题、报告、产品型号、食谱/功能、责任人。

- P0：PostgreSQL 索引 + 前缀/全文搜索，结果按权限过滤。
- P1：高亮命中、最近访问、组合条件、问题正文与证据说明搜索。
- 不在 P0 引入独立搜索引擎；当数据量和查询压力超过阈值后再评估。

## 12.3 分享

- 默认不公开分享。
- 创建分享链接需要 `share_report` 权限。
- 分享页仅显示已发布快照，可配置访问密码、有效期、下载权限、水印。
- 分享页默认关闭编辑、问题整改、原始附件下载；根据安全策略可开放部分视频播放。
- 链接撤销/到期后不可使用；访问、下载、导出记录审计。

## 12.4 汇报简报翻页模式

**实施阶段：P1**

简报不是另一份需要人工维护的报告，而是同一份已发布报告的“决策阅读布局”。

默认页序：

```text
1. 报告结论与范围
2. 关键问题与风险
3. 关键功能/食谱效果
4. 关键指标/对比差异（按数据存在性）
5. 整改与下一步
```

规则：

- 页面内容由报告数据自动生成，允许报告负责人选择“是否纳入某个关键问题/图表”，但不得修改事实。
- 支持键盘/点击翻页和投屏阅读。
- 不能替代全量报告；每页可跳转到报告对应章节。
- 无复杂 PDF 分册逻辑。P0 的 PDF 只导出已发布报告的统一内容。

# 13. 模块七：通知、提醒、升级与订阅

## 13.1 事件与提醒类型

| 事件 | 收件人 | 默认渠道 | 触发时间 |
|---|---|---|---|
| 任务已分配 | 执行人/承接组 | 站内 + 可选 IM/邮件 | 即时 |
| 任务被拒绝 | 任务负责人 | 站内 | 即时 |
| 任务临近到期 | 执行人、负责人 | 站内 | 到期前可配置 |
| 任务审核退回 | 执行人、负责人 | 站内 | 即时 |
| 问题分配 | 整改负责人 | 站内 + 可选 IM/邮件 | 即时 |
| 整改临期/逾期 | 整改负责人、负责人 | 站内；逾期可升级 | 按 SLA |
| 复测待执行/待确认 | 复测人、审核人 | 站内 | 即时 |
| 报告待审核/已发布/失效 | 审核人、订阅人 | 站内 | 即时 |
| 外部集成失败 | 集成管理员 | 站内 + 运维告警 | 即时 |
| Excel 导入失败 | 导入发起人、管理员 | 站内 | 即时 |

## 13.2 通知策略

- 每个通知有 `notification_key` 做去重，例如 `issue:{id}:due:{date}`。
- 同一对象 24 小时内相同提醒合并，不刷屏。
- 允许用户配置非关键提醒免打扰；A 级问题、逾期升级、审核退回不可完全关闭。
- 渠道失败时保留站内通知；IM/邮件可重试并记录投递状态。
- 已读不等于已处理；待办状态以业务对象状态为准。

## 13.3 升级规则

| 场景 | 第一次提醒 | 升级 |
|---|---|---|
| 整改临期 | 责任人 | 到期后通知任务负责人 |
| 整改逾期 | 责任人 + 任务负责人 | 超过配置阈值通知体验负责人 |
| A 级问题未分诊 | 任务负责人 | 超过 SLA 通知审核发布人 |
| 复测申请未处理 | 复测人 | 超过 SLA 通知问题负责人 |
| 报告审核超时 | 审核人 | 超过 SLA 通知报告所有者 |
| 集成死信 | 集成管理员 | 超过阈值通知平台管理员/运维 |

# 14. 模块八：AI 辅助与治理

## 14.1 P0 可启用的 AI 辅助

| 能力 | 输入 | 输出 | 人工控制 |
|---|---|---|---|
| 报告总结草案 | 已确认记录、问题、指标 | 总结、风险、下一步建议草案 | 必须人工确认/编辑 |
| 问题描述润色 | 用户输入的现象与上下文 | 结构化描述建议 | 用户一键应用或拒绝 |
| 缺失检查提示 | 记录项、证据、指标状态 | 缺失项提示 | 不自动补写 |
| 对比差异草案 | 可比对象、指标、记录 | 差异摘要建议 | 必须可见来源与确认状态 |

## 14.2 RESERVED AI 能力

- 相似问题推荐。
- 图片/视频辅助标签。
- 证据质量检测。
- 外部 Excel 字段语义辅助映射。
- 复测建议生成。

## 14.3 AI 安全规则

1. AI 结果永远带来源数据范围、生成时间、模型/提示词版本、置信度（如适用）。
2. AI 不得直接发布报告、关闭问题、分配整改、改变严重度、改变可比性判断。
3. 用户可查看 AI 使用的证据列表；找不到来源的结论不允许进入发布报告。
4. 业务数据发送到模型前遵守组织数据边界与脱敏策略。
5. AI 失败时不阻断用户手工流程；明确显示“生成失败，可重试或手工填写”。

# 15. RESERVED：Excel 来源附件、结构化导入与质量校验

## 15.1 分阶段策略

| 阶段 | 能力 | 是否开发 |
|---|---|---|
| P0 | 上传 Excel 作为来源附件、手工录入结构化数据 | 是 |
| P1/P2 | 为明确固定模板配置字段映射、解析预览、人工确认 | 规划 |
| RESERVED | 多 Sheet、图片、公式、合并单元格的可配置导入作业 | 不开发 |
| 不做 | 任意未知 Excel 一键无损转报告 | 不做 |

## 15.2 为什么不做通用智能导入

现有样本的 Sheet 名称、合并单元格、图片位置、阶段划分、指标字段与备注写法均可能不同。通用解析会造成“看似成功、实际语义错误”的高风险，尤其会错误绑定图片、阶段、指标和问题。因此导入必须是**模板级、可审查、可回滚**，而非黑盒自动迁移。

## 15.3 RESERVED 导入对象与流程

```text
上传文件
 -> 安全扫描
 -> 选择/识别导入模板
 -> 解析预览
 -> 字段映射与异常清单
 -> 人工确认
 -> 创建草稿任务/报告
 -> 校验与发布前审核
```

### 导入作业状态

```text
uploaded -> scanning -> parsing -> mapping_review -> ready_to_import
ready_to_import -> importing -> imported_draft
uploaded/scanning/parsing/mapping_review/importing -> failed
mapping_review -> rejected
```

### 导入错误处理

| 问题 | 行为 |
|---|---|
| 文件损坏/密码保护 | 失败，不创建草稿；说明原因 |
| 模板无法识别 | 进入手动选择模板；仍可作为附件保留 |
| 必填字段缺失 | 生成异常清单；不可导入为可发布报告 |
| 图片无法定位 | 导入文本/表格，图片进入待关联区；必须人工绑定 |
| 公式无法计算 | 导入公式文本/缓存值，标记“需确认” |
| 同一文件重复导入 | 通过文件哈希 + 导入配置检测，提示复用或新建版本 |
| 部分成功 | 创建 `imported_draft`，不允许自动发布；保留每条成功/失败记录 |

## 15.4 导入质量分

仅用于审核提醒，不替代人工判断：

```text
完整度（必填字段） + 可追溯性（来源/图片/公式） + 语义确认度 + 错误扣分
```

低质量导入必须显示“待确认”，不允许直接进入正式报告。

# 16. 数据模型与数据库设计

## 16.1 技术选型建议

- 关系型数据库：PostgreSQL 15+。
- 事务与 ORM：按现有技术栈选型；必须支持事务、乐观锁、JSONB、全文检索、行级索引。
- 文件存储：对象存储（S3 兼容），媒体访问使用短期签名 URL。
- 异步任务：队列/消息系统（例如 Redis 队列、RabbitMQ、Kafka 之一，按组织基线选择）。
- 缓存：Redis，用于短期缓存、幂等键、限流、会话/队列。
- 搜索：P0 使用 PostgreSQL 全文与索引；规模增长后再独立搜索服务。
- 可观测性：结构化日志、Trace ID、指标、错误监控。
- 身份认证：企业 SSO/OIDC/SAML 或现有认证体系；API 使用服务账号和最小权限。

## 16.2 主表

### users / organizations / roles

| 表 | 关键字段 |
|---|---|
| organizations | id, name, parent_id, status |
| users | id, external_ref, name, email, status, organization_id |
| roles | id, code, name |
| user_roles | user_id, role_id, scope_type, scope_id, valid_from, valid_to |

### tasks

| 字段 | 说明 |
|---|---|
| id | UUID |
| task_no | 业务编号 |
| title | 标题 |
| product_line_id / category_id / model_id | 产品上下文 |
| stage_code / experience_type / priority | 任务属性 |
| purpose | 体验目的 |
| test_condition_summary | 条件摘要 |
| status | 任务状态 |
| owner_id / executor_id / assignee_group_id / reviewer_id | 责任关系 |
| planned_start_at / due_at | 计划 |
| source_type / source_system / source_record_id | 来源追溯 |
| version | 乐观锁版本 |
| created_at / updated_at / deleted_at | 生命周期 |

### test_objects / task_test_objects

| 字段 | 说明 |
|---|---|
| test_objects.id | 对象主档 |
| object_type | own_model / competitor / variant / historical_stage |
| model_id / display_name / variant_key | 对象识别 |
| task_test_objects.task_id | 关联任务 |
| comparable_role | baseline / target / competitor / reference |
| display_order | 呈现顺序 |
| condition_summary | 对象条件差异 |

### record_items / record_steps / metric_records

| 表 | 关键字段 |
|---|---|
| record_items | id, task_id, object_id, record_type, group_key, name, result_status, summary, sort_order, source_template_ref |
| record_steps | id, record_item_id, step_name, sort_order, observation, status, started_at, ended_at |
| metric_definitions | id, metric_key, name, unit, formula_expression, formula_version, threshold_rule_json, active |
| metric_records | id, record_item_id, object_id, metric_definition_id, raw_values_json, calculated_value, evaluation_status, anomaly_reason, calculated_by |

### evidence / evidence_links

| 表 | 关键字段 |
|---|---|
| evidences | id, storage_key, file_name, mime_type, size_bytes, checksum, status, preview_key, uploader_id, captured_at |
| evidence_links | id, evidence_id, target_type, target_id, role, caption, sort_order, required, created_at |

`target_type` 枚举：task、record_item、record_step、metric_record、issue_occurrence、rectification_action、verification、report、report_snapshot。

### issues / issue_occurrences / issue_relations

| 表 | 关键字段 |
|---|---|
| issues | id, issue_no, title, current_status, severity, module_code, impact_scope, owner_id, due_at, first_seen_at, last_seen_at, created_by |
| issue_occurrences | id, issue_id, task_id, record_item_id, object_id, observed_at, description, impact_description, severity_at_time, status_at_time |
| issue_relations | id, from_issue_id, to_issue_id, relation_type, confidence, proposed_by, confirmed_by |

### rectification_actions / verifications

| 表 | 关键字段 |
|---|---|
| rectification_actions | id, issue_id, owner_id, plan, planned_finish_at, actual_finish_at, status, delay_reason, version |
| verifications | id, issue_id, source_task_id, requested_by, verifier_id, result, conclusion, requested_at, verified_at, status |

### reports / report_summaries / report_snapshots

| 表 | 关键字段 |
|---|---|
| reports | id, report_no, title, report_scope_type, status, render_profile, source_task_ids_json, source_report_ids_json, owner_id, reviewer_id, version |
| report_summaries | id, report_id, content, conclusion_level, key_risks_json, next_actions_json, source_type, ai_run_id, confirmed_by, confirmed_at |
| report_snapshots | id, report_id, version_no, snapshot_json, render_profile_version, published_by, published_at, invalidated_at, invalidation_reason |

### notifications / audits

| 表 | 关键字段 |
|---|---|
| notifications | id, recipient_id, type, object_type, object_id, dedupe_key, channel, status, payload_json, read_at |
| audit_logs | id, actor_type, actor_id, action, object_type, object_id, before_json, after_json, trace_id, created_at |

### RESERVED 集成与导入表

| 表 | 关键字段 |
|---|---|
| integration_connections | id, provider, auth_config_ref, status, secret_ref, created_by |
| integration_field_mappings | id, connection_id, event_type, source_path, target_field, transform_rule, required |
| assignment_rules | id, priority, condition_json, target_group_id, target_user_id, reviewer_id, sla_policy_id, active_from, active_to |
| inbound_events | id, source_system, event_id, event_type, status, payload_json, idempotency_key, retry_count, error_json |
| import_templates | id, name, version, sheet_mapping_json, field_mapping_json, validation_rules_json |
| import_jobs | id, file_evidence_id, template_id, status, quality_score, error_json, created_task_id, created_report_id |

## 16.3 索引与约束

- `tasks(task_no)`、`issues(issue_no)`、`reports(report_no)` 唯一。
- `inbound_events(source_system, event_id)` 唯一。
- `evidences(checksum, size_bytes)` 可用于重复提示，但不强制物理去重。
- `issue_occurrences(issue_id, task_id, record_item_id)` 允许多次出现，但需记录时间，避免错误的唯一约束。
- 所有主表有 `version` 或等效并发控制字段。
- 所有状态字段使用枚举或受控字典；服务端拒绝非法跃迁。
- 审计表按时间分区/归档策略设计，避免主库长期膨胀。

# 17. API 设计

## 17.1 通用约定

- 基础前缀：`/api/v1`。
- 鉴权：用户会话/Access Token；服务对服务调用使用服务账号。
- 所有写接口支持 `Idempotency-Key`；创建外部来源任务必须要求。
- 返回统一包含：`trace_id`、`request_id`、`data`、`error`。
- 并发更新使用 `If-Match` 或 `version`，冲突返回 `409 Conflict`。
- 分页使用游标优先；列表接口必须权限过滤。
- 删除采用软删除/归档；物理清理由后台数据保留策略执行。
- 事件端点需要签名校验、时钟偏差控制、重放防护和 IP/网络策略。

### 统一错误格式

```json
{
  "trace_id": "tr_...",
  "error": {
    "code": "TASK_SUBMISSION_BLOCKED",
    "message": "任务存在 3 个阻断项，暂不能提交审核。",
    "details": [
      {
        "field": "record_item_id",
        "reason": "FAILED_RESULT_WITHOUT_ISSUE",
        "target_url": "/tasks/t_123?focus=record-ri_456"
      }
    ]
  }
}
```

## 17.2 任务 API

| 方法 | 路径 | 阶段 | 说明 |
|---|---|---|---|
| POST | `/tasks` | P0 | 新建手动任务 |
| GET | `/tasks` | P0 | 任务列表/筛选 |
| GET | `/tasks/{taskId}` | P0 | 任务详情 |
| PATCH | `/tasks/{taskId}` | P0 | 更新任务基础信息 |
| POST | `/tasks/{taskId}/submit-assignment` | P0 | 提交分配 |
| POST | `/tasks/{taskId}/assign` | P0 | 人工分配/转交 |
| POST | `/tasks/{taskId}/accept` | P0 | 执行人接受 |
| POST | `/tasks/{taskId}/reject` | P0 | 执行人拒绝 |
| POST | `/tasks/{taskId}/block` | P0 | 标记阻塞 |
| POST | `/tasks/{taskId}/resume` | P0 | 恢复执行 |
| POST | `/tasks/{taskId}/submit-review` | P0 | 提交审核 |
| POST | `/tasks/{taskId}/review` | P0 | 通过/退回 |
| POST | `/tasks/{taskId}/cancel` | P0 | 取消 |
| POST | `/tasks/{taskId}/reopen` | P1 | 重新打开 |
| POST | `/tasks/{taskId}/clone` | P1 | 复制任务结构 |

## 17.3 记录、指标与证据 API

| 方法 | 路径 | 阶段 | 说明 |
|---|---|---|---|
| GET | `/tasks/{taskId}/record-items` | P0 | 获取记录项 |
| POST | `/tasks/{taskId}/record-items` | P0 | 新增记录项 |
| PATCH | `/record-items/{recordItemId}` | P0 | 自动保存记录项 |
| POST | `/record-items/{recordItemId}/steps` | P0 | 新增步骤 |
| PATCH | `/record-steps/{stepId}` | P0 | 更新步骤 |
| POST | `/record-items/{recordItemId}/metrics` | P0 | 写入指标 |
| PATCH | `/metric-records/{metricRecordId}` | P0 | 更新原始值/异常说明 |
| POST | `/uploads/initiate` | P0 | 申请直传签名 URL |
| POST | `/uploads/complete` | P0 | 通知上传完成 |
| GET | `/evidences/{evidenceId}` | P0 | 获取证据元数据与预览授权 |
| POST | `/evidences/{evidenceId}/links` | P0 | 绑定业务对象 |
| DELETE | `/evidence-links/{linkId}` | P0 | 解除绑定（受快照约束） |
| POST | `/evidences/{evidenceId}/retry-processing` | P0 | 重试转码/扫描 |

## 17.4 问题、整改与复测 API

| 方法 | 路径 | 阶段 | 说明 |
|---|---|---|---|
| GET | `/issues` | P0 | 问题列表/筛选 |
| POST | `/issues` | P0 | 新建问题主档及首次出现记录 |
| GET | `/issues/{issueId}` | P0 | 问题详情 |
| PATCH | `/issues/{issueId}` | P0 | 分诊/编辑基础字段 |
| POST | `/issues/{issueId}/occurrences` | P0 | 关联新一次发现/复现 |
| POST | `/issues/{issueId}/link-existing` | P1 | 将记录关联到既有问题 |
| POST | `/issues/{issueId}/assign` | P0 | 分配整改责任 |
| POST | `/issues/{issueId}/rectifications` | P0 | 创建整改 |
| PATCH | `/rectifications/{actionId}` | P0 | 更新整改计划/结果 |
| POST | `/issues/{issueId}/verifications` | P0 | 发起复测 |
| PATCH | `/verifications/{verificationId}` | P0 | 填写复测结论 |
| POST | `/issues/{issueId}/close` | P0 | 审核关闭 |
| POST | `/issues/{issueId}/reopen` | P0 | 重新打开 |
| POST | `/issues/{issueId}/waive` | P0 | 风险豁免 |
| GET | `/issues/{issueId}/timeline` | P1 | 问题轨迹 |
| GET | `/issues/{issueId}/similar-candidates` | RESERVED | 相似问题候选 |

## 17.5 报告 API

| 方法 | 路径 | 阶段 | 说明 |
|---|---|---|---|
| POST | `/reports` | P0 | 从任务/来源创建报告草稿 |
| GET | `/reports` | P0 | 报告中心列表 |
| GET | `/reports/{reportId}` | P0 | 报告阅读数据 |
| PATCH | `/reports/{reportId}` | P0 | 更新标题/范围/渲染策略确认 |
| GET | `/reports/{reportId}/summary` | P0 | 获取报告总结 |
| PATCH | `/reports/{reportId}/summary` | P0 | 编辑/确认总结 |
| POST | `/reports/{reportId}/rebuild` | P0 | 重新聚合报告结构 |
| POST | `/reports/{reportId}/submit-review` | P0 | 提交审核 |
| POST | `/reports/{reportId}/review` | P0 | 通过/退回 |
| POST | `/reports/{reportId}/publish` | P0 | 发布快照 |
| POST | `/reports/{reportId}/invalidate` | P0 | 标记失效 |
| GET | `/reports/{reportId}/snapshots` | P0 | 版本列表 |
| GET | `/reports/{reportId}/briefing` | P1 | 获取翻页简报 |
| POST | `/reports/{reportId}/export` | P0 | 导出统一 PDF |
| POST | `/reports/{reportId}/shares` | P0 | 创建分享链接 |
| DELETE | `/reports/{reportId}/shares/{shareId}` | P0 | 撤销链接 |

## 17.6 通知、配置、审计 API

| 方法 | 路径 | 阶段 | 说明 |
|---|---|---|---|
| GET | `/notifications` | P0 | 通知列表 |
| POST | `/notifications/{id}/read` | P0 | 标记已读 |
| GET | `/workbench/todos` | P0 | 我的待办聚合 |
| GET | `/audit-logs` | P0 | 审计查询 |
| GET | `/dictionaries` | P0 | 字典读取 |
| GET/POST/PATCH | `/metric-definitions` | P0 | 指标规则管理 |
| GET/POST/PATCH | `/assignment-rules` | RESERVED | 分配规则配置 |
| POST | `/integrations/{connectionId}/events` | RESERVED | 入站事件 |
| GET | `/integration-events` | RESERVED | 失败/死信管理 |
| GET/POST/PATCH | `/import-templates` | RESERVED | Excel 导入模板配置 |
| POST | `/import-jobs` | RESERVED | 创建导入作业 |
| GET | `/import-jobs/{jobId}` | RESERVED | 查询导入进度/异常 |

## 17.7 关键 API 行为示例

### 创建问题并关联当前记录项

```json
POST /api/v1/issues
{
  "title": "大分量面团翻滚不足，残留干粉",
  "severity": "B",
  "module_code": "mixing_performance",
  "occurrence": {
    "task_id": "task_123",
    "record_item_id": "ri_456",
    "object_id": "obj_789",
    "description": "运行 10 分钟后桶壁仍有干粉，面团未形成稳定团块。",
    "impact_description": "影响大分量和面结果一致性。",
    "evidence_ids": ["ev_001", "ev_002"],
    "metric_record_ids": ["mr_001"]
  }
}
```

### 报告发布被拦截

发布接口返回 `409 REPORT_PUBLISH_BLOCKED`，并在 `details` 中携带每个阻断项的 `reason`、可选 `issue_id` 与 `target_url`。前端必须直接将 `target_url` 渲染为“去修正”入口，示例见 17.1 的统一错误格式。

# 18. 领域事件、异步处理与技术线路

## 18.1 领域事件

| 事件 | 生产者 | 消费者 | 用途 |
|---|---|---|---|
| `task.created` | Task Service | 通知、审计、报告聚合 | 创建待办/日志 |
| `task.assigned` | Task Service | 通知 | 承接提醒 |
| `task.submitted_for_review` | Task Service | 通知、报告服务 | 审核待办/报告预聚合 |
| `record.updated` | Record Service | 报告服务、质量校验 | 刷新报告数据 |
| `evidence.ready` | Media Worker | Record/Issue/Report | 更新证据可用状态 |
| `issue.created` | Issue Service | 通知、报告服务 | 更新问题清单 |
| `rectification.overdue` | Scheduler | 通知、升级服务 | 逾期升级 |
| `verification.completed` | Verification Service | Issue Service、Report Service | 更新问题状态/报告 |
| `report.published` | Report Service | 导出、通知、搜索索引 | 发布交付 |
| `integration.event.received` | Integration Gateway | Integration Worker | RESERVED 外部入站 |
| `import.job.completed` | Import Worker | 通知、审计 | RESERVED 导入完成 |

## 18.2 异步处理原则

- 事务内写入业务数据与 `outbox_events`；异步发布器可靠投递，避免“数据库成功但通知丢失”。
- 消费者幂等，基于事件 ID/业务版本去重。
- 失败按指数退避重试；超过阈值进入死信队列并创建管理员待办。
- 每个异步任务有 `trace_id`，可从用户操作追踪到队列执行、存储、通知与日志。
- 异步结果不直接覆盖人工编辑；采用版本比较或创建待确认建议。

## 18.3 前端技术路线

建议基于现有 Web 技术栈遵循以下原则：

- TypeScript 严格类型，页面/接口共享 DTO 或由 OpenAPI 生成客户端。
- 表单：使用 schema 校验（例如 Zod/JSON Schema 等），前端即时提示，服务端二次校验。
- 数据请求：缓存与失效策略清晰；所有写操作具备乐观更新回滚。
- 大型报告：虚拟列表/懒加载媒体；矩阵在保持固定表头的同时避免一次渲染全部高分辨率图片。
- 路由：使用深链、锚点、焦点参数；返回时保持筛选和滚动位置。
- 媒体：前端直接上传对象存储，服务端只签名和确认；预览使用受控短链。
- 可访问性：键盘可达、焦点管理、图片替代说明、色彩不作为唯一状态表达。
- 移动端：记录页优先；报告矩阵可切换为对象分组纵向卡片，不强迫横向表格。

## 18.4 后端服务边界

可采用模块化单体起步，保证领域边界清晰；当负载/组织需求增长后再拆服务。

| 模块 | 责任 | 不应承担 |
|---|---|---|
| Identity/Permission | 认证、授权、组织范围 | 业务状态计算 |
| Task | 任务、分配、承接、状态 | 媒体转码 |
| Record | 记录项、步骤、指标 | 问题闭环决策 |
| Media | 上传、扫描、转码、签名访问 | 报告布局 |
| Issue | 问题、出现记录、整改、复测 | 任务分配规则 |
| Report | 聚合、总结、快照、渲染策略、发布 | 原始记录编辑 |
| Notification | 站内通知、渠道投递、升级 | 业务权限判定 |
| Integration | RESERVED 连接、映射、事件、回写 | 直接写核心业务表（应调用领域 API） |
| Import | RESERVED 解析、映射、异常、草稿创建 | 直接发布报告 |

# 19. 错误、失败、回退与恢复矩阵

| 模块 | 失败情形 | 用户看到什么 | 系统动作 | 恢复/回退 |
|---|---|---|---|---|
| 新建任务 | 必填字段缺失 | 字段级错误 + 顶部汇总 | 不创建任务 | 保留当前草稿 |
| 分配 | 执行人无权限/离岗 | 分配失败原因 | 不改变当前分配 | 选择承接组/其他人员 |
| 自动保存 | 网络中断 | “离线，待同步” | 本地队列缓存 | 网络恢复后同步；冲突需处理 |
| 媒体上传 | 文件失败/转码失败 | 单个证据显示失败/重试 | 保留元数据；关键证据不进入可用态 | 重试、重新上传、替换 |
| 提交任务 | 质量校验不通过 | 阻断清单与定位链接 | 不变更为审核状态 | 修正后再次提交 |
| 创建问题 | 已有关联问题冲突 | 提示选择新建/关联已有 | 不自动合并 | 用户确认 |
| 整改 | 非法状态跃迁 | “当前状态已更新” | 返回 409 + 最新状态 | 刷新后按新状态操作 |
| 复测 | 复测结论缺证据 | 阻断 | 不关闭问题 | 补充证据或标记不可得 |
| 报告聚合 | 后台计算失败 | “报告正在重试” | 旧草稿/已发布快照不受影响 | 自动重试；管理员介入 |
| 报告发布 | 条件不满足 | 发布阻断清单 | 不创建快照 | 按链接修正 |
| PDF | 导出失败 | “导出失败，请重试” | 不影响报告状态 | 重试；保留失败日志 |
| 通知 | 渠道不可用 | 不显示给普通用户 | 站内通知仍生成 | 渠道重试/降级 |
| 外部事件 | 签名/映射失败 | 管理员看到异常 | 不建正式任务或建待分配任务 | 修复映射后重放 |
| Excel 导入 | 解析异常 | 导入异常清单 | 不发布；可保留附件 | 修复模板/人工映射后重试 |

# 20. 审计、安全、隐私与数据保留

## 20.1 审计范围

必须审计：

- 状态变化：任务、问题、整改、复测、报告。
- 责任人、严重度、计划日期、可比性、报告总结的修改。
- 证据上传、删除、替换、下载与外部分享访问。
- 发布、失效、分享、导出。
- 权限、分配规则、指标公式、导入模板、集成映射的配置变更。
- AI 生成、确认、拒绝和应用。
- 外部事件接收、重放、失败、回写。

审计日志至少包括：操作者、时间、对象、动作、前后值、IP/客户端（按合规策略）、Trace ID、来源系统/自动化标记。

## 20.2 安全要求

- 对象存储默认私有；前端通过短期签名 URL 访问。
- 外部共享内容使用快照，禁止透传草稿或原始权限范围外数据。
- 外部集成密钥保存在密钥管理服务，不写入数据库明文或日志。
- 入站 Webhook 校验签名、时间戳与事件 ID，限制重放。
- 上传文件进行病毒扫描和格式白名单校验。
- 报告导出与分享遵守数据权限，敏感字段可按配置脱敏。
- 生产环境日志不得记录访问令牌、完整签名 URL、敏感原始数据。

## 20.3 数据保留

- 已发布报告快照、问题闭环记录和关键证据遵从质量记录保留周期。
- 已取消任务和失败导入按组织策略保留，可在到期后清理。
- 审计日志单独归档，至少满足内部审计周期。
- 物理删除前必须校验是否被已发布快照、问题或导出引用。

# 21. 非功能需求

| 类别 | 要求 |
|---|---|
| 性能 | 任务/报告基础首屏在常规网络下 P95 <= 3 秒；报告媒体懒加载，不阻塞文字内容 |
| 可用性 | 核心读写 API 月度可用性目标 >= 99.9%；异步队列有重试与死信处理 |
| 一致性 | 状态跃迁、发布快照、问题关闭必须强一致；通知和搜索允许最终一致 |
| 并发 | 支持多用户编辑同一任务，冲突可见且不丢数据 |
| 媒体 | 支持断点/分片上传策略；转码失败可定位；大文件不通过应用服务器 |
| 可访问性 | 键盘操作、焦点可见、图像说明、状态非仅靠颜色 |
| 兼容性 | 最新 Chrome/Edge/Safari；移动端优先支持体验录入与问题处理 |
| 可观察性 | 关键请求/异步任务均具 Trace ID；告警覆盖 5xx、队列积压、转码失败、死信、导出失败 |
| 可维护性 | API 契约版本化；字典、指标、规则、导入模板配置化；发布前 DB 迁移与回滚方案 |
| 国际化 | P0 中文；字段模型与字典保留多语言扩展能力 |

# 22. QA、验收与测试矩阵

## 22.1 关键验收场景

### AT-01 手动任务到报告发布

```text
任务负责人创建任务
 -> 分配体验工程师
 -> 工程师记录食谱效果/指标/证据
 -> 不达标自动触发问题
 -> 研发填写整改
 -> 发起并完成复测
 -> 工程师提交任务
 -> 审核人确认报告总结
 -> 发布报告与导出 PDF
```

验收：

- 任务、问题、证据、整改、复测和报告之间可双向跳转。
- 不达标记录的上下文自动进入问题出现记录。
- 问题关闭前存在复测结论与证据。
- 报告中问题排序正确，数据/证据在对应对象位置。
- 发布生成不可变快照，后续修改不改写旧版本。

### AT-02 多对象对比

输入：三台和面机同食谱对比。

验收：

- 用户创建时只选择对象和记录范围，不选择“矩阵模板”。
- 系统推荐对比矩阵布局。
- 矩阵固定项目列和对象头。
- 仅看差异/异常筛选不改变原始数据。
- 每个异常单元格能就地展开完整证据和问题。
- 无可比性确认时不输出自动排名。

### AT-03 指标强化

输入：原汁机多食材、不同口径和多指标数据。

验收：

- 指标表显示公式版本、原始值、阈值与异常说明。
- 缺失指标不显示为 0。
- 指标异常可直接进入问题和证据。
- 报告总结能够引用已确认指标范围。

### AT-04 阶段问题轨迹

输入：球形桶和面机前期、试制、试产数据。

验收：

- 同一问题可在多个阶段创建出现记录。
- 问题详情显示出现、整改、复测和关闭轨迹。
- 报告可展示阶段演进，不把阶段强行排名。
- 后续复现会重新打开问题并记录原因。

### AT-05 失败与退回

验收：

- 网络断开后记录项内容不丢失。
- 上传/转码失败有明确重试入口。
- 审核退回包含原因和定位。
- 非法状态跃迁被服务端拒绝。
- 发布阻断项能跳转到具体字段。
- PDF 失败不影响已发布报告。
- 失去权限后用户不能继续编辑。

## 22.2 RESERVED 验收设计

### AT-R01 外部系统事件

- 正常事件创建任务且字段正确映射。
- 重复事件不重复建任务。
- 无映射的产品编码进入异常队列。
- 分配规则冲突按优先级与最具体匹配执行。
- 回写失败不回滚已建任务。
- 死信重放后不产生重复任务。

### AT-R02 Excel 结构化导入

- 固定模板能解析字段、Sheet、指标和附件映射。
- 图片不可定位时进入待关联清单，不自动错误绑定。
- 导入草稿不得直接发布。
- 同文件重复导入能识别。
- 导入异常与质量分可追溯。

### AT-R03 相似问题推荐

- 只输出候选，不自动合并。
- 相似度和推荐依据可见。
- 人工确认/拒绝均记录审计。
- 模型不可用时不影响手工新建问题。

## 22.3 自动化测试建议

| 层级 | 范围 |
|---|---|
| 单元测试 | 状态机、指标公式、阈值、映射规则、权限判断、渲染策略推断 |
| 集成测试 | 任务->问题->整改->复测->报告发布、事件 Outbox、媒体处理、通知去重 |
| 合约测试 | API DTO、外部事件 Schema、导入模板规则 |
| E2E | 核心角色路径、退回、离线保存、并发冲突、分享撤销 |
| 视觉回归 | 报告页面、矩阵、问题展开、移动端记录卡、简报页面 |
| 性能测试 | 大报告、媒体列表、多对象矩阵、任务/问题列表筛选 |
| 安全测试 | 权限越权、分享链接、签名 URL、Webhook 重放、上传安全 |

# 23. 实施分期与依赖

## 23.1 P0 当前开发

| 领域 | 交付 |
|---|---|
| 基础能力 | 认证权限、组织字典、产品/指标字典、审计、对象存储 |
| 任务 | 手动创建、人工分配、承接/拒绝、执行/提交/审核状态机 |
| 录入 | 记录项、食谱/功能卡、步骤折叠、指标、自动保存、证据上传 |
| 问题 | 问题主档、出现记录、分诊、整改、复测、关闭/重开/豁免 |
| 报告 | 单一报告总结、问题优先阅读、动态结果区、自动渲染策略、版本快照 |
| 交付 | 已发布报告分享、统一 PDF 导出 |
| 通知 | 站内待办、关键提醒与升级 |
| 技术 | API、Outbox、媒体 Worker、基础监控、核心测试 |

## 23.2 P1 后续开发

- 汇报简报翻页模式。
- 跨报告问题轨迹与手动关联完善。
- 全局搜索与高级筛选。
- 复制历史任务。
- 更完整移动端录入体验。
- 报告中的可选布局切换和更丰富对比。
- AI 草案、缺失提示、差异建议（前提是数据质量达标）。

## 23.3 RESERVED 预留、不开发

- 外部系统事件接入、字段映射、规则分配、回写与异常管理。
- Excel 模板级结构化导入、质量评分、人工确认。
- 相似问题推荐与自动化辅助。
- 高级 PDF Profile、复杂分册、A3 矩阵分页预检。
- 专题合并报告的字段对齐与可比性自动检查。

## 23.4 上线门禁

P0 不允许上线，除非：

1. 状态机、权限、发布快照、问题关闭均通过自动化与人工验收。
2. 高等级问题、关键证据、整改与复测的阻断规则生效。
3. 任务和报告的基本加载性能达标。
4. 上传/转码/通知/导出失败有可见处理与告警。
5. 审计日志覆盖核心写操作。
6. 三类实际样本各完成至少一条端到端演练。

# 24. 预留能力的实施前检查清单

## 24.1 外部系统接入前

- 明确来源系统的事件清单、字段字典、编码稳定性和责任方。
- 确认触发时点：申请提交、审批通过、变更、撤销分别如何处理。
- 确认数据安全协议、网络连通、服务账号、签名方式、回写责任。
- 运行字段映射与分配规则模拟，覆盖无匹配、冲突、人员离岗、重复事件。
- 执行灰度：仅记录事件 -> 仅建待分配任务 -> 启用规则分配 -> 启用回写。

## 24.2 Excel 导入前

- 选择 1-3 个真实且稳定的 Excel 模板，冻结版本。
- 标注文档中每个 Sheet、字段、图片、公式、合并单元格的业务语义。
- 先定义导入后“必须人工确认”的字段，不承诺无损。
- 建立导入样本库和回归测试文件。
- 确认原始文件保留、导入草稿与发布快照的关系。

## 24.3 相似问题推荐前

- 统一问题模块、标签、标题/描述最小质量规范。
- 定义“同一问题、关联问题、重复问题、拆分问题”的人工判定标准。
- 建立误报/漏报反馈闭环，禁止直接自动合并。
- 验证不同产品线、阶段和术语的偏差。

# 25. 待业务确认的开放项

| 编号 | 待确认项 | 默认建议 |
|---|---|---|
| O-01 | 问题严重度等级与 SLA | 先采用 A/B/C，并配置为字典 |
| O-02 | 任务与问题的组织范围 | 按产品线 + 项目/组织双重限制 |
| O-03 | 关键证据定义 | 高等级问题至少 1 个可用证据，允许有审批豁免 |
| O-04 | 问题关闭权限 | 审核人关闭；整改负责人只能申请关闭 |
| O-05 | 复测执行人 | 默认体验工程师，可由任务负责人指定 |
| O-06 | 报告总结审批 | 默认审核发布人确认 |
| O-07 | 统一 PDF 内容范围 | 输出已发布报告的可见内容，视频以缩略图和链接表示 |
| O-08 | 通知渠道 | P0 先站内；组织确认后再接入邮件/IM |
| O-09 | 任务分配粒度 | P0 支持人和承接组；外部自动分配先以组为主 |
| O-10 | 产品主数据来源 | P0 可平台字典维护；后续明确 PLM/主数据系统接入 |

# 26. 结论

本 PRD 将产品体验平台定义为一个以体验任务和问题闭环为核心的系统，而不是把 Excel 报告搬到网页。

用户的主路径应始终清晰：

```text
接到任务 -> 记录事实 -> 发现问题 -> 留下证据 -> 推动整改 -> 完成复测 -> 读懂报告 -> 沉淀历史
```

对于当前阶段，重点不是增加模板、抽屉、独立数据页或复杂导入，而是把上述路径做完整、可读、可追溯、可失败恢复。对于未来的外部系统接入、Excel 结构化导入、自动分配与智能关联，本 PRD 已提供完整对象、契约、状态、异常、API 和验收设计，但在没有真实系统边界与稳定模板前不进入开发。
