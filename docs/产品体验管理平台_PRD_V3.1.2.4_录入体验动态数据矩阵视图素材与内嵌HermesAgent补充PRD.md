# 产品体验管理平台 PRD V3.1.2.4 补充需求
## 录入体验重构、动态数据矩阵视图、素材归属与内嵌 Hermes Agent 完整替代版

---

## 0. 文档控制

| 项目 | 内容 |
|---|---|
| 文档名称 | 产品体验管理平台 PRD V3.1.2.4 补充需求：录入体验重构、动态数据矩阵视图、素材归属与内嵌 Hermes Agent |
| 文档类型 | V3.1.2.3 的完整替代版；用于替换上一版补充 PRD |
| 适用平台 | 产品体验管理平台：体验任务、功能效果、五感体验、既有对比矩阵、动态数据矩阵、素材库、报告中心、Agent 辅助、企微入口 |
| 版本 | V3.1.2.4 |
| 输出形态 | Markdown PRD |
| 本版关键修订 | 重新定义动态数据矩阵的 Excel 型结构化录入视图；明确 A~Q 列示例仅为附录理解样例，不是系统预设字段；补充用户自定义对比维度、受控单元格公式、跨行相对引用下推、基础文字样式、底部小结与备注、Agent 评价 icon、接口与数据模型 |
| 替代关系 | 本文直接替代《产品体验管理平台 PRD V3.1.2.3_录入体验动态数据矩阵素材与内嵌 Hermes Agent 补充 PRD》 |
| 冲突处理原则 | 如本文与 V3.1.2.3 或更早补充文档存在冲突，以本文为准；如本文与主 PRD V3.1/V3.1.1 中未实现能力冲突，以本文描述的“新增能力边界”为准 |

---

## 0.1 本版最高准则

### S-01 动态数据矩阵不是固定模板

动态数据矩阵不是“原汁机数据模板”、不是“产品 × 口径 × 食材”的固定模板，也不是把附件中的列名写死到系统中。

附件中的“产品”“口径规则”“食物”“耗时”“食物重量”“出汁率”等，只是用于说明矩阵视图的示例字段。系统必须将其抽象为：

```text
用户自定义一级大类
用户自定义二级细项
用户自定义三级细项
用户自定义一级对比类目
用户自定义详细对比维度列
用户自定义详细对比维度计算列
用户自定义图片/视频素材列
用户自定义评价列
用户自定义问题点列
用户自定义小结与备注
```

系统只负责提供结构、视图、保存、计算、素材绑定、问题闭环、报告投影和审计能力，不解释、不预设、不锁死业务字段含义。

### S-02 动态数据矩阵必须接近 Excel 型矩阵录入体验，但不是通用 Excel

本模块应保留附件中 Excel 数据矩阵对体验人员有价值的能力：

- 左侧多级行头。
- 视觉合并行头。
- 大量横向测量列。
- 用户新增普通对比维度列。
- 用户新增计算列。
- 点选单元格设计公式。
- 公式相对引用下推。
- 图片/视频与单元格就近绑定。
- 文本直接点击编辑。
- 基础文字样式。
- 底部小结与备注。

但系统不实现完整电子表格能力：

- 不支持工作簿、工作表、多 Sheet。
- 不支持宏、脚本、VBA、JavaScript、Python 公式。
- 不支持外部引用。
- 不支持任意 Excel 函数。
- 不支持数据透视表。
- 不支持无损还原历史 Excel 样式。
- 不支持绕过平台证据链的图片粘贴事实。

### S-03 计算区也由用户定义

系统不得预设出汁率、纯汁率、含渣率、成功率、耗时均值等指标。

用户可以创建任意名称的计算列，只要公式满足 P0 支持范围：

```text
+  -  *  /  ()
受控单元格引用
受控相对引用下推
```

### S-04 最新计算规则优先于旧版“禁止跨行公式”

旧版 PRD 中“不支持跨行公式”的描述废止。

本版定义为：

- 支持同一矩阵内、当前数据区的受控跨行单元格引用。
- 支持点选单元格形成公式。
- 支持相对引用下推。
- 不支持跨矩阵引用、跨任务引用、外部引用、宏、脚本和复杂函数。

### S-05 基础文字样式纳入 P0

旧版“不支持自由样式”的描述修正为：

- 不支持完整 Excel 样式系统。
- P0 支持基础文字样式：字体颜色、加粗、斜体、字号。
- 样式必须走安全白名单，不允许用户输入 CSS。
- 样式可应用于列标题、文本单元格、数值单元格、计算结果单元格、评价单元格和问题点单元格。

### S-06 Hermes 内嵌于平台代码

Hermes 是平台内嵌 Agent Runtime，不作为独立部署服务。

```text
部署产品体验平台 = Hermes Runtime 已随平台一起部署完成。
```

管理员已有模型配置中的：

```text
base_url
api_key
model_name
```

直接作为 Hermes 调用模型的配置。系统不得新增 Hermes 专属 base_url、api_key、model_name 第二套配置。

---

## 0.2 当前已实现能力与本次新增能力边界

| 模块 | 当前状态 | 本次是否新增/重构 | 关键说明 |
|---|---|---:|---|
| 功能效果 | 已实现 | 交互重构 | 去掉“编辑/保存”按钮，改为点击即编辑、自动保存；保留原数据结构。 |
| 五感体验 | 已实现 | 交互重构 | 去掉“编辑/保存”按钮，改为点击即编辑、自动保存；保留原数据结构。 |
| 既有对比矩阵 | 已实现但体验差 | 编辑体验重构 | 改为新增对象/细项后即时生成可编辑单元格；不迁移为动态数据矩阵。 |
| 动态数据矩阵 | 新增 | 新增核心模块 | 任务侧用户自定义矩阵视图、层级、字段、素材、计算列、小结、备注、报告投影。 |
| 素材库 | 已有证据链基础 | 新增素材归属体验 | 建立 MaterialAsset 状态机、暂存池、待归属池、项目素材库视图。 |
| AI 辅助 | 现有能力不足 | 改为内嵌 Hermes Agent | Web 对话、矩阵小结 icon、企微素材入口、报告草稿建议、审计。 |
| 企微入口 | 新增 | 新增 | 通过企微发送图片/视频/文本，进入素材归属和 Agent 辅助链路。 |

---

## 1. One Pager

### 1.1 Overview

本补充 PRD 解决四类直接影响产品体验平台可用性的问题：

1. **录入体验问题**：当前五感体验、功能效果、总结等模块需要反复点击“编辑/保存”，录入体验不符合现场测试人员的工作习惯。
2. **矩阵能力问题**：当前数据矩阵 Tab 基本为空，既有对比矩阵也依赖“生成矩阵”动作，不能像 Excel 一样在新增细项后即时录入。
3. **素材归属问题**：图片/视频拖动绑定难以精准校准，体验人员无法快速把现场素材归属到任务、矩阵行、功能效果或问题点。
4. **AI 辅助问题**：现有 AI 辅助功能不足以承担真正的 Agent 性工作，需要改为平台内嵌 Hermes Agent，通过 Web 对话与企微入口完成素材整理、矩阵总结、报告草稿建议等。

### 1.2 Problem

体验人员当前在平台内录入体验事实时，面临以下问题：

| 问题 | 具体表现 | 业务影响 |
|---|---|---|
| 录入动作过重 | 文字必须先点编辑，再保存 | 现场录入慢，用户倾向回到 Excel 或聊天工具 |
| 数据矩阵不可用 | Tab 空白或没有明确新建路径 | 无法承接高密度测量数据 |
| 对比矩阵生成逻辑不自然 | 必须点击生成矩阵后才能编辑 | 用户新增细项后无法立即录入 |
| 素材绑定误差大 | 拖动图片难以准确落到目标单元格或区域 | 证据归属错误、后续报告难追溯 |
| AI 只是文案工具 | 缺乏上下文、工具调用、记忆隔离和企微入口 | 不能真正帮助体验人员整理素材与报告 |
| 数据矩阵视图过于抽象 | 旧版 PRD 没充分表达附件矩阵的 A~Q 列结构 | 工程无法按真实 Excel 型矩阵体验实现 |

### 1.3 Objectives

| 编号 | 目标 |
|---|---|
| O-01 | 全平台普通文本、数值、说明、总结、矩阵单元格支持点击即编辑和自动保存。 |
| O-02 | 数据矩阵 Tab 永远不空白，必须有功能未启用、无权限、失败、空状态、列表等明确状态。 |
| O-03 | 动态数据矩阵支持用户自定义一级/二级/三级行头、一级对比类目、详细对比维度、计算列、素材列、评价列、问题列、小结与备注。 |
| O-04 | 动态数据矩阵视图必须支持类似附件 Excel 的左侧合并行头、横向列区、底部小结和备注区。 |
| O-05 | 计算列支持用户点选单元格并使用加减乘除设计公式，支持受控跨行引用和相对引用下推。 |
| O-06 | 素材绑定从“像素级拖拽”升级为“暂存池 + 点击绑定 + 拖拽吸附 + 撤销/改绑 + Agent 建议”。 |
| O-07 | Hermes 以内嵌 Runtime 方式随平台部署，复用管理员现有模型配置。 |
| O-08 | 企微成员、平台账号、Agent 实例、项目/任务、记忆命名空间全链路隔离，防止素材和记忆串用。 |
| O-09 | 所有 Agent 产出仅作为待确认草稿或建议，不自动改写已确认事实、不自动发布报告。 |

### 1.4 Constraints

| 约束 | 说明 |
|---|---|
| 不做通用 Excel | 不实现完整电子表格能力，只实现本平台需要的矩阵录入、公式、素材和报告投影能力。 |
| 不预设业务字段 | 附件中的列名仅作示例，不得写死。 |
| 不替代既有模块 | 动态数据矩阵不替代功能效果、五感体验、既有对比矩阵。 |
| 不绕过证据链 | 图片/视频必须通过 MaterialAsset / Evidence / evidence_links 归属。 |
| 不允许静默覆盖 | 自动保存必须有版本校验和冲突处理。 |
| Hermes 不独立部署 | 平台部署即包含 Hermes Runtime，不再要求客户额外部署 Hermes 服务。 |
| 模型配置不重复 | Hermes 使用管理员现有 base_url/api_key/model_name，不新增 Hermes 专属配置。 |

---

## 2. Personas

| Persona | 目标 | 关键痛点 | 本版支持 |
|---|---|---|---|
| 体验执行人 | 快速记录现场体验、图片、视频、测量结果、问题 | 平台录入慢，素材难归属，矩阵不如 Excel 顺手 | Inline 编辑、动态数据矩阵、素材暂存池、企微上传 |
| 任务负责人 | 组织体验任务、审核数据完整性、形成报告 | 数据散落、问题难闭环、报告重复整理 | 矩阵报告投影、小结、备注、问题点转 Issue |
| 产品/研发读者 | 快速阅读对比结果、问题、证据 | Excel 信息密集但难追溯，平台报告不够完整 | 数据矩阵只读投影、证据链、问题深链 |
| 平台管理员 | 配置权限、模型、Agent、企微绑定 | AI 记忆串用、企微身份混乱、配置重复 | Agent 管理、企微绑定、模型配置复用、审计 |
| 审计/质量人员 | 查看记录来源、修改历史和证据链 | 自动保存和 Agent 产出难追溯 | inline_field_versions、audit_logs、agent_runs、evidence_links |

---

## 3. User Stories

| ID | 用户故事 | 优先级 |
|---|---|---|
| US-01 | 作为体验执行人，我希望点击文本即可编辑，并自动保存，这样我不需要反复点击编辑和保存。 | P0 |
| US-02 | 作为体验执行人，我进入数据矩阵 Tab 时，总能看到明确状态或新建入口，而不是空白页。 | P0 |
| US-03 | 作为体验执行人，我希望按本次任务自定义一级大类、二级细项、三级细项，而不是被固定为产品、口径、食材。 | P0 |
| US-04 | 作为体验执行人，我希望在一级大类下新增细项后，左侧合并行头自动扩展，方便横向对比同组结果。 | P0 |
| US-05 | 作为体验执行人，我希望新增详细对比维度列，例如耗时、重量、温度、容量等，并能点击单元格直接录入。 | P0 |
| US-06 | 作为体验执行人，我希望新增计算列，并通过点选单元格和四则运算定义公式。 | P0 |
| US-07 | 作为体验执行人，我希望计算列自动向下应用到后续行，并按相对引用变化。 | P0 |
| US-08 | 作为体验执行人，我希望在矩阵中直接调整字体颜色、加粗、斜体和字号，用于标记重点或异常。 | P0 |
| US-09 | 作为体验执行人，我希望从素材库给图片列关联最多 3 张图片，给效果图列关联图片或视频。 | P0 |
| US-10 | 作为体验执行人，我希望在问题点列一行录入一个问题点，并可转为问题闭环。 | P0 |
| US-11 | 作为体验执行人，我希望在小结行右侧点击 AI icon，让系统基于一级大类同组数据生成待确认总结。 | P1 |
| US-12 | 作为体验执行人，我希望备注为空时，报告不展示备注区。 | P0 |
| US-13 | 作为体验执行人，我希望通过企微发送现场图片/视频，平台自动进入对应项目素材库或待归属池。 | P1 |
| US-14 | 作为管理员，我希望创建和绑定 Hermes Agent 实例，并管理企微绑定，避免不同人员记忆和素材混用。 | P1 |

---

## 4. Features In / Features Out

### 4.1 Features In

| 编号 | Feature | 说明 | 优先级 |
|---|---|---|---|
| F-01 | InlineEditable 平台级组件 | 点击即编辑、自动保存、状态提示、冲突处理、离线队列。 | P0 |
| F-02 | 数据矩阵 Tab 状态页 | 功能未启用、无权限、接口失败、空状态、列表态。 | P0 |
| F-03 | 动态数据矩阵视图 | 按附件型矩阵体验实现 A~Q 区域抽象能力。 | P0 |
| F-04 | 多级行头 | 用户自定义一级/二级/三级细项，支持视觉合并。 | P0 |
| F-05 | 详细对比维度列区 | 用户新增普通测量/文本/数值/时长/温度/容量等列。 | P0 |
| F-06 | 详细对比维度计算列区 | 用户新增计算列，支持四则运算、点选单元格、跨行引用、相对下推。 | P0 |
| F-07 | 基础文字样式 | 字体颜色、加粗、斜体、字号，安全白名单。 | P0 |
| F-08 | 图片/视频素材列 | D 列型纯图片槽位、O 列型图片/视频效果素材槽位。 | P0 |
| F-09 | 问题点列 | 一行一个问题点，支持转 IssueOccurrence。 | P0 |
| F-10 | 小结与备注区 | 底部跨列视觉区；备注为空时报告不展示。 | P0 |
| F-11 | 矩阵 AI 评价 icon | 小结输入框右侧 icon，调用内嵌 Hermes 生成待确认总结。 | P1 |
| F-12 | 素材暂存池/项目素材库 | MaterialAsset 状态视图，支持待归属、建议、绑定。 | P0/P1 |
| F-13 | 企微素材入口 | 企微图片/视频接收、下载、扫描、转码、归属建议。 | P1 |
| F-14 | 内嵌 Hermes Agent | Web 对话、矩阵总结、报告草稿、素材整理建议。 | P1 |
| F-15 | 管理员 Agent 绑定 | Agent 实例、平台账号、企微成员、项目/任务、记忆命名空间管理。 | P1 |

### 4.2 Features Out

| Feature Out | 原因 |
|---|---|
| 完整 Excel 引擎 | 范围过大，且会破坏平台结构化事实和审计模型。 |
| 任意 Excel 函数 | P0 只支持四则运算。 |
| 宏、脚本、VBA、JS 公式 | 安全风险，不进入本阶段。 |
| 跨矩阵/跨任务公式 | 会导致依赖、权限和快照复杂化。 |
| 无损 Excel 导入 | P0 不做任意历史 Excel 解析和还原。 |
| Agent 自动发布报告 | 产出必须人工确认。 |
| Agent 自动创建/关闭问题 | 问题闭环必须由用户确认。 |
| Hermes 独立部署服务 | 本版定义为平台代码内嵌 Runtime。 |
| Hermes 专属模型配置 | 复用管理员已有模型配置。 |

---

## 5. 全平台录入体验重构

## 5.1 InlineEditable 统一原则

所有普通录入区域从“编辑按钮 + 保存按钮”改为：

```text
点击内容 → 进入编辑 → 停止输入/失焦/切换字段 → 自动保存
```

适用对象：

- 功能效果说明。
- 五感体验记录。
- 问题现象。
- 整改说明。
- 复测结论。
- 报告总结。
- 既有对比矩阵单元格。
- 动态数据矩阵单元格、列名、行头、小结、备注。

### 5.2 保存状态

| 状态 | 显示 | 用户行为 |
|---|---|---|
| `idle` | 无状态 | 可编辑 |
| `dirty` | “未保存”弱提示 | 可继续输入 |
| `saving` | “保存中” | 可继续编辑其他字段，不阻断页面 |
| `saved` | “已保存”短暂显示 | 自动消失 |
| `error` | “保存失败，点击重试” | 可重试，不丢内容 |
| `conflict` | “内容冲突，需处理” | 打开冲突面板 |
| `offline_queued` | “待同步” | 可继续编辑，受队列上限限制 |

### 5.3 自动保存触发

| 触发 | 行为 |
|---|---|
| 停止输入 800ms | 触发保存 |
| 失焦 | 立即保存 |
| Tab/Enter 切换字段 | 先提交当前字段保存请求，再移动焦点 |
| 切换记录项 | 触发当前脏字段保存；不等待则乐观切换，但提交审核前必须全部同步 |
| 关闭页面 | 浏览器提示存在未同步内容 |
| 提交审核 | 等待当前 saving 最多 10 秒；仍有 saving/offline_queued/error/conflict 则阻断提交 |

### 5.4 离线队列

- 离线期间允许继续编辑文本、数值、样式和备注。
- 本地队列上限：200 条字段变更或 5MB 文本数据。
- 超过上限后，禁止继续编辑新字段，提示用户联网同步。
- 媒体上传不承诺离线长期保存，离线时应提示“联网后重新上传”。
- 任务提交、报告发布、问题关闭前必须清空离线队列。

### 5.5 冲突 UI

桌面端：

- 在当前字段下方行内展开冲突面板。
- 展示“我的版本 / 服务器版本 / 合并后版本”。
- 用户可选择覆盖、接受服务器版本、手动合并。

移动端/企微 WebView：

- 使用全屏冲突处理页。
- 不使用 hover。
- 保存后返回原字段并保留滚动位置。

---

# 6. 动态数据矩阵：产品定义

## 6.1 模块定位

动态数据矩阵是体验任务中的结构化矩阵录入模块，用于替代用户在 Excel 中维护高密度对比数据、图片、评价、问题和小结的过程。

它不是既有对比矩阵的改名，也不是报告端矩阵。它是任务侧可编辑事实来源。

```text
动态数据矩阵 = 用户自定义层级 + 用户自定义列区 + 用户自定义公式 + 素材绑定 + 问题点 + 小结备注 + 报告投影
```

## 6.2 附录示例字段的解释规则

附件中的字段含义如下：

| 附录列 | 示例名称 | 平台抽象 | 是否预设 |
|---|---|---|---:|
| A | 产品 | 一级大类列 | 否 |
| B | 口径规则 | 二级细项列 | 否 |
| C | 三级细项 | 三级细项列 | 否 |
| D | 产品图 | 纯图片素材列 | 否 |
| E | 食物 | 一级对比类目列 | 否 |
| F-K | 耗时、重量等 | 详细对比维度列区 | 否 |
| L-N | 出汁率等 | 详细对比维度计算列区 | 否 |
| O | 效果图 | 图片/视频素材列 | 否 |
| P | 效果说明 | 功能效果评价区 | 否 |
| Q | 问题点 | 问题点列 | 否 |
| 行 21 | 小结 | 小结区 | 否 |
| 行 22 | 备注 | 备注区 | 否 |

系统可以在创建矩阵时提供“空白矩阵”和“参考示例”，但示例字段不得作为强制模板。

---

# 7. 动态数据矩阵视图结构

## 7.1 整体布局

桌面端矩阵视图分为七个区：

```text
左侧层级区         A/B/C
对象图片区         D
一级对比类目区     E
详细对比维度区     F~K，可无限增减，受上限控制
计算列区           L~N，可无限增减，受上限控制
效果素材与评价区   O/P/Q
底部叙事区         小结 / 备注
```

视觉结构：

```text
┌────────────── 固定表头 ──────────────┐
│ A 一级大类 │ B 二级细项 │ C 三级细项 │ D 素材 │ E 一级对比类目 │ F...K 详细对比维度 │ L...N 计算列 │ O 效果素材 │ P 评价 │ Q 问题点 │
├─────────────────────────────────────┤
│ 合并行头   │ 行文本     │ 行文本     │ 图片   │ 合并文本       │ 数据单元格         │ 公式结果     │ 图片视频   │ 文本   │ 问题   │
│            │ 行文本     │ 行文本     │ 图片   │                │ 数据单元格         │ 公式结果     │ 图片视频   │ 文本   │ 问题   │
├─────────────────────────────────────┤
│ 小结：跨列视觉区域，右侧 AI 评价 icon │
├─────────────────────────────────────┤
│ 备注：跨列视觉区域；为空则报告不展示 │
└─────────────────────────────────────┘
```

## 7.2 左侧固定与滚动规则

- A/B/C/D/E 列默认左侧冻结。
- 详细对比维度区、计算列区、O/P/Q 横向滚动。
- 顶部表头冻结。
- A/B/C/E 的合并行头随纵向滚动保持视觉连续。
- 当列数超过可视宽度时，底部显示横向滚动条。
- 移动端不展示完整横向大表，使用卡片式录入，详见第 7.14 节。

## 7.3 A 列：一级大类列

### 7.3.1 定义

A 列是一级大类列。用户可将其命名为产品、食材、场景、功能、版本、批次、对象、测试组等。

系统不得预设其语义。

### 7.3.2 新增一级大类

入口：表格左上侧固定 `+ 一级类目`。

用户点击后：

1. 新增一个一级大类节点。
2. 生成一个大合并行头。
3. 默认创建一个空的二级细项行，保证用户可以立即录入。
4. A 列文本处于编辑态。
5. E 列一级对比类目同步创建同范围合并单元格。

### 7.3.3 合并行高度

A 列视觉合并高度由该一级大类下的叶子数据行数决定：

| 情况 | 行数计算 |
|---|---|
| 有三级细项 | 该一级大类下所有三级细项叶子行数 |
| 无三级细项但有二级细项 | 该一级大类下所有二级细项行数 |
| 只有一级大类 | 1 行 |

### 7.3.4 编辑与删除

- 用户点击 A 列文字直接编辑。
- 停止输入自动保存。
- 空一级大类可直接删除。
- 已有数据的一级大类只能归档，必须二次确认。
- 归档后报告快照仍可读。

## 7.4 B 列：二级细项列

### 7.4.1 定义

B 列是一级大类下的二级细项。示例中的“口径规则”只是示例，可被用户定义为规格、容量、对象、型号、批次、环境、模式等。

### 7.4.2 启用二级细项列

如果矩阵创建时未启用 B 列，用户可点击左侧 `+ 二级细项` 启用该列。

启用后：

- B 列出现在 A 列右侧。
- 既有一级大类下自动创建一个空二级细项。
- 用户可在每个一级大类中单独新增二级细项行。

### 7.4.3 新增二级细项

入口：在某个一级大类合并行头中点击 `+ 二级细项`。

行为：

1. 在该一级大类下新增一条二级细项。
2. 若三级细项未启用，则新增一条叶子数据行。
3. 若三级细项已启用，则该二级细项下默认新增一条空三级细项。
4. B 列文本进入编辑态。
5. 对应的 D~Q 单元格生成空占位。

### 7.4.4 删除二级细项

- 空二级细项可删除。
- 已有数据、素材、问题或计算结果的二级细项需要归档确认。
- 如果二级细项下存在三级细项，删除二级细项会同时归档其下所有三级细项和叶子行。

## 7.5 C 列：三级细项列

### 7.5.1 定义

C 列是可选三级细项。不同二级细项可以选择是否新增三级细项。

系统最多支持三级结构：

```text
一级大类_二级细项_三级细项
```

不支持第四层。

### 7.5.2 新增三级细项

入口：在某个二级细项行内点击 `+ 三级细项`。

行为：

1. C 列如未显示，则显示 C 列。
2. 在当前二级细项下新增三级细项叶子行。
3. C 列文本进入编辑态。
4. B 列根据三级行数视觉合并。
5. A/E 列根据叶子行数重新计算视觉合并范围。

### 7.5.3 删除三级细项

- 空三级细项可删除。
- 已有数据的三级细项需归档确认。
- 删除后需要触发计算列重算。
- 如果公式引用因行数变化失效，计算单元格进入 `formula_reference_invalid` 状态。

## 7.6 D 列：纯图片素材列

### 7.6.1 定义

D 列是行级纯图片素材槽位。示例中的“产品图”只是示例。

### 7.6.2 规则

- 默认仅允许图片。
- 每个叶子行最多 3 张图片。
- 图片必须从素材库或素材暂存池关联。
- 支持拖拽吸附和点击选择。
- 支持撤销、改绑、预览。
- 不允许绕过素材扫描直接贴图成为正式证据。

### 7.6.3 字段配置

| 配置项 | 默认值 |
|---|---|
| `allowed_media_types` | `image` |
| `max_count` | 3 |
| `binding_scope` | `matrix_leaf_row` |
| `required` | false |
| `show_in_report` | true |

## 7.7 E 列：一级对比类目列

### 7.7.1 定义

E 列是与 A 列同属一级范围的一级对比类目。示例中的“食物”只是示例。

它可以被用户定义为：

- 食谱。
- 功能。
- 其他。
- 测试对象说明。
- 测试目标。
- 评价对象。
- 同组对比描述。

### 7.7.2 与 A 列关系

- 一个一级大类对应一个一级对比类目。
- E 列合并范围与 A 列相同。
- 当 A 列新增一级大类时，E 列同步创建同范围空文本。
- 当 A 列归档时，E 列对应文本一并归档。

### 7.7.3 编辑与删除

- 用户点击 E 列文字直接编辑。
- 用户可清空 E 列内容。
- 删除 E 列文本不删除 A 列一级大类。
- 若 E 列为空，报告中该位置可不显示或显示为未命名，由报告配置决定。

## 7.8 F~K 区：详细对比维度列区

### 7.8.1 定义

详细对比维度列区用于用户自定义测量、观察、记录字段。示例中的“耗时、食物重量、出汁重量、果渣重量、果汁过筛重量、果汁内渣重量”只是示例。

用户可以新增任意业务含义的列。

### 7.8.2 新增详细对比维度

入口：E 列右侧、详细对比维度区表头中的 `+ 详细对比维度`。

点击后打开列配置浮层：

| 配置项 | 必填 | 说明 |
|---|---:|---|
| 列名 | 是 | 用户自定义 |
| 字段类型 | 是 | 文本、数字、时长、重量、容量、温度、百分比、日期等 |
| 单位 | 否 | g、kg、ml、℃、min 等，用户自定义 |
| 小数位 | 否 | 数字类字段使用 |
| 是否必填 | 否 | 默认否 |
| 是否进入报告 | 否 | 默认是 |
| 默认列宽 | 否 | 桌面端使用 |

创建后：

- 新列插入到详细对比维度区末尾。
- 所有现有叶子行生成空单元格。
- 新增行时自动生成该列空单元格。

### 7.8.3 删除详细对比维度

- 空列可删除。
- 已有数据列必须归档，不能物理删除。
- 被计算列引用的详细对比维度不可直接归档，需先处理依赖公式。

### 7.8.4 单元格编辑

- 用户点击单元格内容直接编辑。
- 数字类字段使用数值输入。
- 时长字段支持 `3′32″`、`3:32`、`212s` 等输入，服务端统一存储秒数并保留展示格式。
- 文本字段支持基础文字样式。
- 数字字段支持字体颜色、加粗、斜体、字号和单元格格式。

## 7.9 L~N 区：详细对比维度计算列区

### 7.9.1 定义

计算列区用于用户自定义公式计算结果。示例中的“出汁率、纯汁率、果汁含渣率”只是示例。

### 7.9.2 新增计算列与新增普通对比维度的区别

| 操作 | 入口 | 结果 | 是否需要公式 |
|---|---|---|---:|
| 新增详细对比维度 | `+ 详细对比维度` | 新增人工录入列 | 否 |
| 新增计算列 | `+ 计算列` / `fx 新增计算列` | 新增自动计算列 | 是 |

UI 必须用视觉区隔：

- 详细对比维度区表头显示“详细对比维度”。
- 计算列区表头显示“计算列 / fx”。
- 两个区之间有冻结或弱分割线。
- 计算列标题带 `fx` 标识。
- 计算结果单元格默认只读，但可编辑公式和格式。

### 7.9.3 公式编辑方式

用户新增计算列时，打开公式编辑器。

公式编辑器支持两种输入：

1. 点选单元格。
2. 键盘输入四则运算符。

示例：

```text
=G4/H5
=G4-G5
=(G4+H4)/I4
```

系统内部不得直接保存 Excel 字符串作为唯一事实，必须解析为 AST 与引用模型。

### 7.9.4 P0 支持的公式能力

| 能力 | P0 支持 | 说明 |
|---|---:|---|
| 加法 | 是 | `+` |
| 减法 | 是 | `-` |
| 乘法 | 是 | `*` |
| 除法 | 是 | `/` |
| 括号 | 是 | `()` |
| 单元格点选引用 | 是 | 仅限当前矩阵数据区 |
| 跨行引用 | 是 | 受控，当前矩阵内 |
| 相对引用下推 | 是 | 同一计算列下方单元格自动调整引用 |
| 百分比显示 | 是 | 结果格式配置 |
| 小数位 | 是 | 结果格式配置 |
| 任意 Excel 函数 | 否 | 如 SUM、AVG、IF、VLOOKUP 均不支持 P0 |
| 跨矩阵引用 | 否 | 不支持 |
| 跨任务引用 | 否 | 不支持 |
| 宏/脚本 | 否 | 不支持 |

### 7.9.5 相对引用下推规则

当用户在计算列首个配置行输入公式：

```text
=G4/H5
```

系统将其解析为：

```text
当前公式单元格行 r
引用 1：G 列，row_offset = 0
引用 2：H 列，row_offset = +1
运算：引用1 / 引用2
```

同一计算列下一行自动变为：

```text
=G5/H6
```

再下一行自动变为：

```text
=G6/H7
```

规则：

- 引用按当前可见数据行顺序计算。
- 归档行默认不参与下推。
- 如果下推引用超出数据行范围，结果为 `formula_reference_out_of_range`。
- 如果引用单元格为空，结果为 `calculation_pending`。
- 如果除数为 0，结果为 `division_by_zero`。
- 如果引用了非数值/非可计算字段，结果为 `formula_type_error`。

### 7.9.6 跨组引用警告

如果公式下推会跨一级大类边界，系统必须提示：

```text
该公式引用可能跨越一级大类边界。是否允许跨组计算？
[仅在当前一级大类内应用] [允许跨组应用]
```

P0 默认：不允许静默跨组。

### 7.9.7 公式存储要求

公式必须同时保存：

| 字段 | 说明 |
|---|---|
| `expression_display` | 用户看到的公式，如 `=G4/H5` |
| `expression_ast` | 服务端解析后的 AST |
| `reference_mode` | `relative_by_visible_row` |
| `apply_scope` | `matrix / level_1_group` |
| `dependency_cell_refs` | 引用列、行偏移、目标字段 |
| `result_format` | 数字、百分比、文本等 |
| `decimal_places` | 小数位 |

### 7.9.8 计算列样式与格式

用户可设置：

- 数字。
- 小数位。
- 百分比。
- 通用文本。
- 字体颜色。
- 加粗。
- 斜体。
- 字号。

计算结果默认只读。用户点击计算结果时，展示公式来源与引用单元格高亮；如需修改，进入公式编辑器。

## 7.10 O 列：图片/视频效果素材列

### 7.10.1 定义

O 列是行级效果素材列。示例中的“效果图”只是示例。它可承载图片或视频。

### 7.10.2 规则

- 支持图片、视频。
- 支持从素材库选择。
- 支持从企微上传后归属。
- 支持多素材展示。
- 默认每个叶子行最多 12 个素材，可由管理员配置，硬上限 30。
- 支持缩略图墙、全屏预览、素材详情。

## 7.11 P 列：功能效果评价区

### 7.11.1 定义

P 列是行级评价文本列。示例中的“效果说明”只是示例。

### 7.11.2 规则

- 长文本录入。
- 点击文字直接编辑。
- 支持基础文字样式。
- 支持自动保存。
- 可在报告投影中展示。
- 可被 Agent 总结引用。
- 不等同于既有“功能效果模块”，但可以关联功能效果记录。

## 7.12 Q 列：问题点

### 7.12.1 定义

Q 列是一行一个问题点的录入区。

### 7.12.2 规则

- 每个叶子数据行 P0 只显示一个主问题点。
- 用户可直接录入问题点文本。
- 用户可将问题点转为 IssueOccurrence。
- 用户可关联已有 Issue。
- 若用户需要记录多个问题，P1 可支持“展开更多问题”，P0 只保证一行一个主问题点。
- 报告中优先展示已转为 IssueOccurrence 的问题点。

## 7.13 行 21：小结区

### 7.13.1 定义

小结区是矩阵底部跨列视觉区域，用于用户总结本矩阵结果。

### 7.13.2 AI 评价 icon

在小结输入框最右侧展示一个 icon。规则：

- 默认仅显示 icon。
- 鼠标 hover 显示文字：“基于当前矩阵生成评价建议”。
- 点击后调用内嵌 Hermes Agent 的“功能效果评估 skill”。
- Agent 按一级大类同组描述生成总结建议。
- 生成内容进入待确认状态，不直接覆盖小结。
- 用户可接受、编辑后接受、拒绝。

### 7.13.3 小结写入报告

- 用户确认后的小结进入报告中心。
- 未确认的 Agent 建议不进入正式报告。
- 若用户清空小结，报告可不展示小结区。

## 7.14 行 22：备注区

### 7.14.1 定义

备注区是矩阵底部说明区，可用于测试口径、公式说明、测量损耗、异常条件等。

### 7.14.2 规则

- 用户可不输入。
- 为空时报告中心不展示。
- 支持多条备注。
- 支持点击编辑、自动保存。
- 支持基础文字样式。
- 不进入问题闭环。
- 不作为计算输入。

### 7.14.3 备注类型

| 类型 | 示例 |
|---|---|
| `method_note` | 果汁过筛使用 60 目筛网 |
| `formula_note` | 出汁率 = 汁重 / 水果重量 |
| `measurement_note` | 称重果汁中的渣有损耗 |
| `limitation_note` | 本次测试未覆盖长期使用场景 |
| `general_note` | 普通备注 |

## 7.15 移动端矩阵体验

移动端不展示完整横向大表。

移动端结构：

```text
矩阵列表
  → 一级大类列表
    → 二级/三级细项卡片
      → 字段分组录入
        → 素材/评价/问题/小结
```

规则：

- 支持编辑 A/B/C/E 文本。
- 支持录入详细对比维度。
- 支持查看计算结果。
- P0 不在手机端完整编辑公式；公式编辑建议在桌面端完成。
- 手机端可上传/绑定图片视频。
- 手机端可编辑小结和备注。
- 手机端支持问题点录入。

---

# 8. 动态数据矩阵数据模型

## 8.1 核心实体

```text
Task
 └─ TaskMatrix
     ├─ MatrixViewDefinition
     ├─ MatrixHierarchyNode
     ├─ MatrixLeafRow
     ├─ MatrixColumnDefinition
     ├─ MatrixCellValue
     ├─ MatrixCellStyle
     ├─ MatrixFormulaDefinition
     ├─ MatrixFormulaRun
     ├─ MatrixMediaLink
     ├─ MatrixIssuePoint
     ├─ MatrixNarrativeBlock
     └─ MatrixReportProjection
```

## 8.2 `task_matrices`

| 字段 | 类型 | 说明 |
|---|---|---|
| `id` | UUID | 主键 |
| `tenant_id` | UUID | 租户 |
| `task_id` | UUID | 任务 |
| `name` | VARCHAR(100) | 矩阵名称 |
| `status` | ENUM | `draft / active / review_locked / completed / archived` |
| `current_view_definition_id` | UUID | 当前视图定义 |
| `created_by` | UUID | 创建人 |
| `created_at` | TIMESTAMP | 创建时间 |
| `updated_at` | TIMESTAMP | 更新时间 |
| `version` | INT | 乐观锁 |

## 8.3 `matrix_view_definitions`

| 字段 | 类型 | 说明 |
|---|---|---|
| `id` | UUID | 主键 |
| `matrix_id` | UUID | 所属矩阵 |
| `version_no` | INT | 视图版本 |
| `max_hierarchy_level` | INT | P0 固定最大 3 |
| `left_frozen_column_count` | INT | 默认 5 |
| `formula_mode` | ENUM | `relative_cell_reference` |
| `style_mode` | ENUM | `basic_text_style` |
| `status` | ENUM | `draft / confirmed / superseded` |
| `design_hash` | VARCHAR(128) | 结构哈希 |
| `confirmed_by` | UUID | 确认人 |
| `confirmed_at` | TIMESTAMP | 确认时间 |

## 8.4 `matrix_hierarchy_nodes`

| 字段 | 类型 | 说明 |
|---|---|---|
| `id` | UUID | 主键 |
| `matrix_id` | UUID | 所属矩阵 |
| `parent_id` | UUID nullable | 父节点 |
| `level` | INT | 1/2/3 |
| `node_label` | VARCHAR(200) | 用户输入文本 |
| `node_type` | ENUM | `level_1 / level_2 / level_3` |
| `sort_order` | INT | 排序 |
| `rowspan_cache` | INT | 前端渲染缓存，可重算 |
| `created_by` | UUID | 创建人 |
| `archived_at` | TIMESTAMP nullable | 归档时间 |

约束：

```sql
UNIQUE (matrix_id, parent_id, level, node_label) WHERE archived_at IS NULL
```

## 8.5 `matrix_leaf_rows`

叶子行是 D~Q 单元格真正挂载的行。

| 字段 | 类型 | 说明 |
|---|---|---|
| `id` | UUID | 主键 |
| `matrix_id` | UUID | 所属矩阵 |
| `level_1_node_id` | UUID | 一级节点 |
| `level_2_node_id` | UUID nullable | 二级节点 |
| `level_3_node_id` | UUID nullable | 三级节点 |
| `visible_row_index` | INT | 当前可见行序 |
| `group_row_index` | INT | 一级组内行序 |
| `status` | ENUM | `active / archived` |
| `created_at` | TIMESTAMP | 创建时间 |
| `archived_at` | TIMESTAMP nullable | 归档时间 |

## 8.6 `matrix_column_definitions`

| 字段 | 类型 | 说明 |
|---|---|---|
| `id` | UUID | 主键 |
| `matrix_id` | UUID | 所属矩阵 |
| `column_zone` | ENUM | `hierarchy / primary_media / comparison_category / detail_dimension / calculation_dimension / effect_media / evaluation / issue_point` |
| `column_label` | VARCHAR(100) | 用户定义列名 |
| `data_type` | ENUM | `text / long_text / number / duration / percentage / temperature / volume / image_slot / media_slot / formula / issue_point` |
| `unit_text` | VARCHAR(30) nullable | 单位 |
| `display_order` | INT | 展示顺序 |
| `desktop_width_px` | INT | 列宽 |
| `min_width_px` | INT | 最小列宽 |
| `max_width_px` | INT | 最大列宽 |
| `is_pinned` | BOOLEAN | 是否冻结 |
| `is_required` | BOOLEAN | 是否必填 |
| `show_in_report` | BOOLEAN | 是否进报告 |
| `max_media_count` | INT nullable | 素材槽位最大数量 |
| `created_by` | UUID | 创建人 |
| `archived_at` | TIMESTAMP nullable | 归档时间 |

## 8.7 `matrix_cell_values`

采用 EAV + typed columns，不使用纯 JSONB。

| 字段 | 类型 | 说明 |
|---|---|---|
| `id` | UUID | 主键 |
| `matrix_id` | UUID | 所属矩阵 |
| `leaf_row_id` | UUID | 叶子行 |
| `column_id` | UUID | 列定义 |
| `value_text` | TEXT nullable | 文本 |
| `value_number` | DECIMAL nullable | 数字 |
| `value_duration_seconds` | INT nullable | 时长 |
| `value_percentage` | DECIMAL nullable | 百分比 |
| `display_text` | TEXT nullable | 展示文本 |
| `value_state` | ENUM | `empty / filled / invalid / calculation_pending / calculation_failed / archived` |
| `version` | INT | 乐观锁 |
| `updated_by` | UUID | 更新人 |
| `updated_at` | TIMESTAMP | 更新时间 |

索引：

```sql
idx_matrix_cell_values_matrix_row
idx_matrix_cell_values_column
idx_matrix_cell_values_state
UNIQUE (matrix_id, leaf_row_id, column_id)
```

## 8.8 `matrix_cell_styles`

| 字段 | 类型 | 说明 |
|---|---|---|
| `id` | UUID | 主键 |
| `matrix_id` | UUID | 所属矩阵 |
| `target_type` | ENUM | `column_header / cell / narrative_block` |
| `target_id` | UUID | 目标 ID |
| `font_color_token` | VARCHAR(30) nullable | 颜色 token |
| `font_size_token` | ENUM | `xs / sm / md / lg / xl` |
| `bold` | BOOLEAN | 加粗 |
| `italic` | BOOLEAN | 斜体 |
| `updated_by` | UUID | 更新人 |
| `updated_at` | TIMESTAMP | 更新时间 |

安全要求：

- 不允许用户输入 CSS。
- 字体颜色必须来自白名单或管理员配置色板。
- 字号只能从 token 选择。

## 8.9 `matrix_formula_definitions`

| 字段 | 类型 | 说明 |
|---|---|---|
| `id` | UUID | 主键 |
| `matrix_id` | UUID | 所属矩阵 |
| `column_id` | UUID | 计算列 |
| `expression_display` | TEXT | 用户可见公式 |
| `expression_ast` | JSONB | 公式 AST |
| `reference_mode` | ENUM | `relative_by_visible_row` |
| `apply_scope` | ENUM | `matrix / level_1_group` |
| `result_format` | ENUM | `number / percentage / text` |
| `decimal_places` | INT | 小数位 |
| `status` | ENUM | `active / invalid / archived` |
| `created_by` | UUID | 创建人 |
| `updated_at` | TIMESTAMP | 更新时间 |

## 8.10 `matrix_formula_runs`

| 字段 | 类型 | 说明 |
|---|---|---|
| `id` | UUID | 主键 |
| `formula_id` | UUID | 公式 |
| `matrix_id` | UUID | 矩阵 |
| `leaf_row_id` | UUID | 计算行 |
| `status` | ENUM | `success / pending / failed` |
| `result_value` | DECIMAL nullable | 计算结果 |
| `error_code` | VARCHAR nullable | 错误码 |
| `dependency_snapshot` | JSONB | 依赖值快照 |
| `created_at` | TIMESTAMP | 计算时间 |

## 8.11 `matrix_narrative_blocks`

| 字段 | 类型 | 说明 |
|---|---|---|
| `id` | UUID | 主键 |
| `matrix_id` | UUID | 所属矩阵 |
| `block_type` | ENUM | `summary / note / formula_note / method_note / limitation_note` |
| `scope` | ENUM | `matrix / level_1_group` |
| `scope_node_id` | UUID nullable | 一级节点 |
| `content` | TEXT | 内容 |
| `ai_suggestion_id` | UUID nullable | 来源建议 |
| `show_in_report` | BOOLEAN | 备注为空时 false |
| `sort_order` | INT | 排序 |
| `updated_by` | UUID | 更新人 |
| `updated_at` | TIMESTAMP | 更新时间 |

---

# 9. 素材归属与绑定

## 9.1 MaterialAsset 统一模型

素材暂存池、待归属池、项目素材库不是三套表，而是同一 `material_assets` 的不同状态视图。

| 前台视图 | 状态条件 |
|---|---|
| 素材暂存池 | `uploaded / scanning / processing / unassigned / suggested` |
| 待归属池 | `unassigned` |
| 项目素材库 | `library_ready / bound` 且有 `project_id` |

## 9.2 状态机

```text
created
  → uploading
  → uploaded
  → scanning
  → scan_failed
  → processing
  → process_failed
  → unassigned
  → suggested
  → library_ready
  → bound
  → archived
```

## 9.3 矩阵素材绑定方式

| 方式 | 说明 |
|---|---|
| 点击绑定 | 选中素材 → 进入目标选择模式 → 点击目标槽位 |
| 拖拽吸附 | 拖拽素材到行/单元格，目标区放大高亮 |
| 从槽位上传 | 在 D/O 列直接上传，默认绑定当前行槽位 |
| 企微归属 | 企微发图/视频 → 平台识别项目/任务 → 进入素材库或待归属池 |
| Agent 建议 | Agent 建议素材属于某矩阵行/问题/功能效果，用户确认后绑定 |

## 9.4 目标选择模式

- 非模态，不锁页面。
- 顶部出现“选择绑定目标”模式条。
- 支持搜索目标。
- 支持按矩阵、功能效果、五感、问题过滤。
- 支持最近编辑目标。
- 支持滚动长页面。
- 目标槽位高亮。
- 绑定后显示确认条。

## 9.5 绑定确认条

桌面端：目标槽位下方 inline confirmation。

移动端/企微 WebView：底部固定条。

文案：

```text
已绑定到：{矩阵名} / {一级大类} / {二级细项} / {列名}
[撤销] [改绑] [查看素材]
```

---

# 10. 既有对比矩阵编辑体验修正

本版不把既有对比矩阵迁移为动态数据矩阵，但要修正其编辑体验。

## 10.1 渐进式生成

旧逻辑：

```text
用户新增对象/细项 → 点击生成矩阵 → 才能编辑
```

新逻辑：

```text
用户新增对象/细项 → 系统即时生成行/列/单元格 → 单元格可直接编辑
```

## 10.2 单元格三槽位

既有对比矩阵单元格保留三槽位：

```text
效果结论
过程记录
关联问题
```

- 点击即编辑。
- 自动保存。
- 支持素材关联。
- 不与动态数据矩阵双写。

---

# 11. 内嵌 Hermes Agent

## 11.1 定义

Hermes 是产品体验平台内嵌 Agent Runtime。平台部署完成后，Hermes Runtime 已随平台代码一并可用。

```text
前端 Web 对话 / AI icon / 企微入口
  → 平台 Agent Gateway
  → 内嵌 Hermes Runtime
  → 管理员现有模型配置 base_url / api_key / model_name
  → 平台工具 API
```

## 11.2 模型配置复用

管理员设置中已有模型配置：

```text
base_url
api_key
model_name
```

Hermes 直接使用该配置。

禁止新增：

```text
hermes_base_url
hermes_api_key
hermes_model_name
```

Agent 实例不保存 API Key，只保存对平台模型配置的引用和运行时快照。

## 11.3 Agent 实例

P0 默认每租户最多 5 个活跃 Agent 实例。

| 状态 | 是否占用上限 | 是否可调用 |
|---|---:|---:|
| draft | 否 | 否 |
| active | 是 | 是 |
| paused | 否 | 否 |
| maintenance | 是 | 否 |
| frozen | 否 | 否 |
| archived | 否 | 否 |

## 11.4 Agent 记忆隔离

每次 Agent 调用必须包含：

```text
tenant_id
platform_user_id
wecom_user_id nullable
agent_instance_id
binding_id
project_id nullable
task_id nullable
conversation_id
memory_namespace
```

记忆命名空间必须入库，不允许只拼字符串。

## 11.5 Agent 建议块

Agent 输出必须拆成建议块：

```text
pending
accepted
edited_then_accepted
rejected
expired
```

部分接受 = 同一次 agent_run 下存在多种建议块状态。

单块接受后立即写入目标草稿，不等待全量批量提交。

## 11.6 矩阵小结 Agent Skill

小结区右侧 icon 调用矩阵总结 skill。

输入范围：

- 当前矩阵结构。
- 一级大类分组。
- 详细对比维度数据。
- 计算列结果。
- 素材摘要。
- 问题点。
- 已有小结与备注。

输出：

- 按一级大类同组描述的评价建议。
- 重点异常提示。
- 不确定性说明。

输出不直接覆盖事实。

## 11.7 Web 对话 SSE

```http
GET /api/v1/agent/conversations/{conversationId}/stream
```

规则：

- SSE 心跳：15 秒。
- 客户端重试：3 秒、5 秒、10 秒退避，最多 5 次。
- 每条事件必须有 `event_id`。
- 支持 `Last-Event-ID` 恢复。
- 60 秒无事件提示连接中断。

事件类型：

```text
message.delta
message.completed
tool.started
tool.completed
tool.failed
suggestion.created
error
ping
```

## 11.8 Hermes 调用失败

失败时：

- 不静默降级。
- 不切换其他模型。
- 不自动生成规则文本冒充 Agent 输出。
- 用户看到“助手暂不可用，请稍后重试”。
- 后台记录 `agent_run.failed`。
- 不写入建议块。

错误类型：

```text
api_key_invalid
model_timeout
rate_limited
provider_unreachable
model_response_invalid
unknown
```

---

# 12. 企微入口

## 12.1 绑定关系

管理员后台配置：

```text
平台账号 ↔ 企微成员 ↔ Agent 实例 ↔ 项目/任务范围
```

规则：

- 一个企微成员只能绑定一个平台账号。
- 一个平台账号 P0 默认绑定一个个人 Agent。
- 项目 Agent 可绑定项目群，但必须识别发言人。
- 解绑个人 Agent 默认冻结个人记忆。

## 12.2 企微素材入口

流程：

```text
用户企微发送图片/视频/文字
  → 企微 Callback
  → 平台校验绑定关系
  → 下载临时素材
  → 安全扫描
  → 转码/生成缩略图
  → MaterialAsset 入库
  → 识别项目/任务
  → 进入项目素材库或待归属池
  → Agent 生成归属建议
```

## 12.3 临时素材下载重试

- 收到消息后 30 秒内入队。
- 首次下载目标：5 分钟内完成。
- 最大自动重试：12 次。
- 重试窗口：24 小时。
- 超过 24 小时进入 dead_letter。
- 超过 48 小时通知管理员。
- 距企微素材过期 12 小时进入高危告警。

---

# 13. API 设计

## 13.1 数据矩阵 Tab 状态

```http
GET /api/v1/tasks/{taskId}/matrix-tab-state
```

返回：

```json
{
  "enabled": true,
  "permission": "editable",
  "state": "empty",
  "matrices": [],
  "cta": { "primary": "create_matrix" },
  "trace_id": "tr_xxx"
}
```

`state`：

```text
feature_disabled
api_error
forbidden
empty
ready
```

## 13.2 创建矩阵

```http
POST /api/v1/tasks/{taskId}/matrices
```

请求：

```json
{
  "name": "本次体验数据矩阵",
  "view_mode": "excel_like_dynamic_matrix",
  "initial_structure": "blank"
}
```

## 13.3 新增一级大类

```http
POST /api/v1/matrices/{matrixId}/hierarchy-nodes
```

```json
{
  "level": 1,
  "parent_id": null,
  "node_label": "未命名一级类目"
}
```

## 13.4 新增二级/三级细项

同接口，通过 `level` 与 `parent_id` 区分。

## 13.5 新增详细对比维度列

```http
POST /api/v1/matrices/{matrixId}/columns
```

```json
{
  "column_zone": "detail_dimension",
  "column_label": "耗时",
  "data_type": "duration",
  "unit_text": "min",
  "display_order": 10
}
```

## 13.6 新增计算列

```http
POST /api/v1/matrices/{matrixId}/columns
```

```json
{
  "column_zone": "calculation_dimension",
  "column_label": "计算结果",
  "data_type": "formula",
  "result_format": "percentage",
  "decimal_places": 2
}
```

随后保存公式：

```http
PUT /api/v1/matrix-formulas/{formulaId}
```

```json
{
  "expression_display": "=G4/H5",
  "apply_scope": "level_1_group",
  "result_format": "percentage",
  "decimal_places": 2
}
```

## 13.7 Inline Save

统一接口：

```http
PATCH /api/v1/inline-values/{entity_type}/{entity_id}/{field_id}
```

支持实体：

```text
record_item
issue
issue_occurrence
rectification_action
verification
report_summary
function_effect_record
sensory_record
comparison_matrix_cell
dynamic_matrix_cell_value
dynamic_matrix_column_definition
dynamic_matrix_hierarchy_node
dynamic_matrix_narrative_block
matrix_issue_point
```

## 13.8 保存单元格样式

```http
PATCH /api/v1/matrix-cell-styles/{targetType}/{targetId}
```

```json
{
  "font_color_token": "red_600",
  "font_size_token": "lg",
  "bold": true,
  "italic": false
}
```

## 13.9 素材绑定

```http
POST /api/v1/material-links
```

```json
{
  "material_asset_id": "mat_xxx",
  "target_type": "dynamic_matrix_cell_value",
  "target_id": "cell_xxx",
  "binding_method": "click_select"
}
```

## 13.10 Agent 矩阵小结

```http
POST /api/v1/agent/skills/matrix-evaluation-summary
```

```json
{
  "matrix_id": "mx_xxx",
  "scope": "by_level_1_group"
}
```

---

# 14. Feature Flag

| Flag | 默认值 | 说明 |
|---|---:|---|
| `matrix_tab_state_enabled` | true | 保证 Tab 有状态页 |
| `task_matrix_enabled` | false | 控制动态数据矩阵创建/编辑 |
| `dynamic_matrix_excel_like_view_enabled` | false | 控制本版 Excel 型矩阵视图 |
| `dynamic_matrix_formula_enabled` | false | 控制计算列 |
| `dynamic_matrix_cell_style_enabled` | false | 控制基础文字样式 |
| `inline_edit_enabled` | false | 控制点击即编辑 |
| `autosave_enabled` | false | 控制自动保存 |
| `material_staging_enabled` | false | 控制素材暂存池 |
| `hermes_agent_gateway_enabled` | false | 控制内嵌 Hermes Agent |
| `wecom_material_ingest_enabled` | false | 控制企微素材入口 |

规则：

- Flag 缺失不得导致空白页。
- 数据库无记录时使用代码默认值。
- `matrix_tab_state_enabled=true` 且 `task_matrix_enabled=false` 时，Tab 可见但显示“功能未启用”，不展示新建入口。

---

# 15. 错误码

## 15.1 矩阵结构

| 错误码 | 场景 |
|---|---|
| `MX-HIER-001` | 超过三级层级 |
| `MX-HIER-002` | 同级名称重复 |
| `MX-HIER-003` | 删除包含数据的节点需归档确认 |
| `MX-HIER-004` | 节点不存在或已归档 |

## 15.2 公式

| 错误码 | 场景 |
|---|---|
| `MX-FORMULA-001` | 公式语法错误 |
| `MX-FORMULA-002` | 引用了非数值单元格 |
| `MX-FORMULA-003` | 除数为 0 |
| `MX-FORMULA-004` | 引用超出数据行范围 |
| `MX-FORMULA-005` | 公式跨一级大类边界未确认 |
| `MX-FORMULA-006` | 使用了不支持的函数 |
| `MX-FORMULA-007` | 公式存在循环依赖 |

## 15.3 自动保存

| 错误码 | 场景 |
|---|---|
| `INLINE-409` | 版本冲突 |
| `INLINE-OFFLINE-001` | 离线队列超限 |
| `INLINE-SAVE-001` | 保存失败 |
| `INLINE-AUDIT-001` | 审计写入失败 |

## 15.4 素材

| 错误码 | 场景 |
|---|---|
| `MAT-UPLOAD-001` | 上传失败 |
| `MAT-SCAN-001` | 安全扫描失败 |
| `MAT-BIND-001` | 绑定目标不存在 |
| `MAT-BIND-002` | 超过素材数量上限 |
| `MAT-WECOM-001` | 企微身份未绑定 |
| `MAT-WECOM-002` | 临时素材下载过期 |

## 15.5 Agent

| 错误码 | 场景 |
|---|---|
| `AGENT-CONFIG-001` | 模型配置缺失 |
| `AGENT-AUTH-001` | 用户未绑定 Agent |
| `AGENT-RUNTIME-001` | Hermes Runtime 调用失败 |
| `AGENT-MODEL-001` | API Key 无效 |
| `AGENT-MODEL-002` | 模型超时 |
| `AGENT-MODEL-003` | 速率限制 |
| `AGENT-MEMORY-001` | 记忆命名空间异常 |

---

# 16. E2E 验收场景

## E2E-01 数据矩阵 Tab 不空白

**Given** 数据矩阵功能未启用。  
**When** 用户进入任务的数据矩阵 Tab。  
**Then** 页面显示“数据矩阵功能暂未启用”，不出现空白页。  
**And** 无新建矩阵按钮。  
**And** 管理员可看到启用配置提示。

## E2E-02 创建一级大类并自动生成合并行头

**Given** 用户新建空白动态数据矩阵。  
**When** 用户点击 `+ 一级类目`。  
**Then** A 列新增一级大类合并行头。  
**And** 默认生成一个二级细项空行。  
**And** E 列同步生成同范围一级对比类目合并单元格。  
**And** 用户点击文字即可编辑。

## E2E-03 新增二级细项和三级细项

**Given** 矩阵中已有一级大类。  
**When** 用户在该大类下点击 `+ 二级细项`。  
**Then** B 列新增一行。  
**And** A/E 的合并范围自动扩大。  
**When** 用户在该二级细项下点击 `+ 三级细项`。  
**Then** C 列显示并新增叶子行。  
**And** B 列视觉合并。

## E2E-04 新增详细对比维度

**Given** 矩阵已有叶子行。  
**When** 用户点击 `+ 详细对比维度` 并创建“耗时”列。  
**Then** 详细对比维度区新增列。  
**And** 所有叶子行生成空单元格。  
**And** 用户点击单元格可输入 `3′32″`。  
**And** 系统自动保存。

## E2E-05 新增计算列并点选公式

**Given** 矩阵已有数字列 G 和 H。  
**When** 用户点击 `+ 计算列`。  
**And** 在公式编辑器中点选 G4、输入 `/`、点选 H5。  
**Then** 公式显示为 `=G4/H5`。  
**And** 系统保存 AST。  
**And** 下一行自动应用为 `=G5/H6`。  
**And** 若 H6 为空，则下一行结果为 `calculation_pending`。

## E2E-06 跨一级大类引用提示

**Given** 用户创建的公式下推后会跨一级大类边界。  
**When** 用户保存公式。  
**Then** 系统提示“该公式引用可能跨越一级大类边界”。  
**And** 用户必须选择“仅当前一级大类内应用”或“允许跨组应用”。

## E2E-07 设置基础文字样式

**Given** 用户正在编辑计算结果单元格。  
**When** 用户选择红色、加粗、字号大。  
**Then** 单元格显示对应样式。  
**And** 系统保存 style token。  
**And** 不允许输入自定义 CSS。

## E2E-08 D 列关联最多 3 张图片

**Given** D 列为纯图片素材列。  
**When** 用户从素材库选择 3 张图片绑定。  
**Then** 单元格展示 3 张缩略图。  
**When** 用户尝试绑定第 4 张。  
**Then** 系统提示超过上限。

## E2E-09 O 列绑定图片/视频

**Given** O 列为效果素材列。  
**When** 用户绑定图片和视频。  
**Then** 单元格展示缩略图墙。  
**And** 点击可全屏预览。  
**And** 素材通过 material_links 记录绑定关系。

## E2E-10 问题点转 IssueOccurrence

**Given** 用户在 Q 列输入问题点。  
**When** 用户点击“转为问题”。  
**Then** 系统创建 IssueOccurrence。  
**And** 绑定当前矩阵、叶子行、列、素材上下文。  
**And** Q 列展示问题状态。

## E2E-11 小结 AI 评价

**Given** 矩阵已有多组一级大类数据。  
**When** 用户在小结输入框右侧点击 AI icon。  
**Then** 系统调用 Hermes 矩阵评价 skill。  
**And** 返回按一级大类分组的总结建议。  
**And** 用户可接受、编辑后接受、拒绝。  
**And** 未确认建议不进入报告。

## E2E-12 备注为空报告不展示

**Given** 用户未填写备注区。  
**When** 报告中心生成矩阵投影。  
**Then** 报告不展示备注区。

## E2E-13 企微素材归属

**Given** 用户已完成企微绑定。  
**When** 用户通过企微发送视频。  
**Then** 平台下载临时素材、扫描、转码。  
**And** 若识别到项目，进入项目素材库。  
**And** 若未识别，进入待归属池。  
**And** 不绕过平台证据链。

## E2E-14 Hermes 复用平台模型配置

**Given** 管理员已设置 base_url、api_key、model_name。  
**When** 用户调用矩阵小结 Agent。  
**Then** Hermes 使用该配置调用模型。  
**And** 不读取 Hermes 专属配置。  
**And** agent_run 保存模型配置快照。

---

# 17. 成功指标

| 类型 | 指标 | P0/P1 目标 |
|---|---|---|
| 录入效率 | 普通文本字段从点击到完成保存中位耗时 | ≤ 3 秒 |
| 保存可靠性 | 自动保存无提示覆盖 | 0 |
| 数据矩阵可用性 | Tab 空白页出现次数 | 0 |
| 矩阵录入效率 | 创建一级大类 + 二级细项 + 3 个数据列 + 1 个计算列的中位耗时 | ≤ 10 分钟 |
| 公式成功率 | 受控公式计算成功率 | ≥ 99% |
| 素材归属 | 已绑定素材可追溯到业务对象比例 | 100% |
| 备注呈现 | 空备注在报告中隐藏比例 | 100% |
| Agent 安全 | 未确认 Agent 建议进入正式报告次数 | 0 |
| 企微隔离 | 企微素材错绑到其他用户 Agent 次数 | 0 |

---

# 18. Wave 规划

| Wave | 范围 | 负责人角色 | 建议周期 | 依赖 |
|---|---|---|---|---|
| Wave 0 | Feature Flag 默认值、Inline Save Service、矩阵核心表、素材表、Agent 表结构 | 后端负责人、数据库负责人 | 1 Sprint | 无 |
| Wave 1 | InlineEditable、自动保存、冲突 UI、功能效果/五感/总结接入 | 前端负责人、UX | 1-2 Sprint | Wave 0 |
| Wave 2 | 动态数据矩阵 Excel 型视图、A~Q 区域、层级、详细对比维度、样式 | 前端负责人、后端负责人 | 2-3 Sprint | Wave 0/1 |
| Wave 3 | 计算列、点选公式、跨行相对下推、公式错误处理 | 后端负责人、前端负责人 | 1-2 Sprint | Wave 2 |
| Wave 4 | 素材暂存池、素材绑定、D/O 列素材、问题点转 Issue | 后端负责人、UX、前端 | 1-2 Sprint | Wave 2 |
| Wave 5 | 内嵌 Hermes Agent、小结 AI icon、Web 对话、企微入口 | AI/后端负责人、管理员配置负责人 | 2 Sprint | Wave 0/4 |
| Wave 6 | 报告投影、快照、E2E 回归、灰度发布 | 全角色 | 1 Sprint | Wave 2-5 |

---

# 19. 风险与缓解

| 风险 | 等级 | 缓解 |
|---|---|---|
| 动态数据矩阵过度 Excel 化 | 高 | 只开放本 PRD 定义范围，禁止宏/脚本/任意函数。 |
| 公式跨行导致错误 | 高 | 使用 AST、引用高亮、跨组提示、错误状态和公式快照。 |
| 自动保存丢数据 | 高 | 版本号、冲突面板、离线队列、提交阻断。 |
| 样式导致 XSS | 高 | 禁止 CSS 输入，只允许 style token。 |
| 素材错绑 | 高 | 绑定确认条、撤销、审计、目标选择模式。 |
| Agent 记忆串用 | 高 | tenant/user/wecom/agent/project/task/conversation 多维命名空间。 |
| Hermes 模型配置失效 | 中 | 不静默降级，后台失败诊断，用户明确提示。 |
| 企微临时素材过期 | 中 | 30 秒入队、12 次重试、24 小时窗口、过期告警。 |

---

# 20. Open Issues

| ID | 问题 | 当前处理 |
|---|---|---|
| OI-01 | 是否要支持 P1 分组聚合公式，如平均值、合计？ | P0 不支持，P1 评估。 |
| OI-02 | 是否要支持多问题点展开？ | P0 一行一个主问题点，P1 评估。 |
| OI-03 | 是否要支持矩阵视图模板复用？ | P0 不做，P1 评估。 |
| OI-04 | 是否要支持 Excel 导入生成矩阵草稿？ | P0 不做，P1/P2 受控导入。 |
| OI-05 | 是否要支持手机端公式编辑？ | P0 不做，桌面端优先。 |

---

# 21. Q&A

| 问题 | 答案 |
|---|---|
| “产品”“口径规则”“食物”是不是系统字段？ | 不是。它们只是附件示例中的用户自定义字段名。 |
| 数据矩阵是不是固定用于产品对比？ | 不是。用户可以用它记录任意体验任务中的多维数据。 |
| 计算列是不是只支持出汁率等固定公式？ | 不是。用户自定义公式，P0 支持加减乘除。 |
| 是否支持跨行公式？ | 支持受控跨行单元格引用和相对下推。 |
| 是否支持任意 Excel 公式？ | 不支持。 |
| 是否支持字体颜色、加粗、斜体、字号？ | 支持基础样式，但通过安全 token 实现。 |
| 小结 AI 会自动写入报告吗？ | 不会。必须用户确认。 |
| 备注为空是否显示？ | 不显示。 |
| Hermes 是否需要额外部署？ | 不需要。Hermes 内嵌平台代码，随平台部署。 |
| Hermes 是否有独立模型配置？ | 没有。复用管理员已有 base_url/api_key/model_name。 |

---

## 附录 A：动态数据矩阵区域命名建议

| 区域 | 建议前台默认名称 | 用户是否可改名 |
|---|---|---:|
| A | 一级大类 | 是 |
| B | 二级细项 | 是 |
| C | 三级细项 | 是 |
| D | 图片素材 | 是 |
| E | 一级对比类目 | 是 |
| F-K | 详细对比维度 | 是 |
| L-N | 计算列 | 是 |
| O | 效果素材 | 是 |
| P | 效果评价 | 是 |
| Q | 问题点 | 是 |
| 行 21 | 小结 | 可改显示名 |
| 行 22 | 备注 | 可改显示名 |

---

## 附录 B：公式语法 P0

```ebnf
Formula       := "=" Expression
Expression    := Term (("+" | "-") Term)*
Term          := Factor (("*" | "/") Factor)*
Factor        := Number | CellRef | "(" Expression ")"
CellRef       := ColumnLetter RowNumber
ColumnLetter  := "A".."Z" | "AA".."ZZ"
RowNumber     := Digit+
```

限制：

- CellRef 只能引用当前矩阵数据区中的可计算单元格。
- 不允许引用小结、备注、图片、问题点、长文本。
- 不允许函数。
- 不允许外部引用。
- 不允许宏或脚本。

---

## 附录 C：样式 token

| token | 说明 |
|---|---|
| `font_color_default` | 默认颜色 |
| `font_color_red` | 红色，用于异常或重点 |
| `font_color_orange` | 橙色，用于警示 |
| `font_color_blue` | 蓝色，用于说明 |
| `font_size_sm` | 小字号 |
| `font_size_md` | 默认字号 |
| `font_size_lg` | 大字号 |
| `bold_true` | 加粗 |
| `italic_true` | 斜体 |

---

## 附录 D：本版新增内容总表

| 新增内容 | 是否新增数据表 | 是否新增 API | 是否影响报告 |
|---|---:|---:|---:|
| 动态数据矩阵 Excel 型视图 | 是 | 是 | 是 |
| 多级行头与合并显示 | 是 | 是 | 是 |
| 详细对比维度列 | 是 | 是 | 是 |
| 计算列与公式下推 | 是 | 是 | 是 |
| 基础文字样式 | 是 | 是 | 是 |
| 图片/视频素材列 | 是 | 是 | 是 |
| 小结与备注区 | 是 | 是 | 是 |
| 小结 AI icon | 是 | 是 | 是，确认后 |
| InlineEditable | 是 | 是 | 间接影响 |
| MaterialAsset | 是 | 是 | 是 |
| Hermes Agent | 是 | 是 | 间接影响 |
| 企微素材入口 | 是 | 是 | 间接影响 |
