# 产品体验管理平台 PRD

> 版本：1.0 | 更新日期：2026-06-15 | 状态：当前

---

## 1. 产品概述

### 1.1 产品名称

产品体验管理平台（Product Experience Management Platform）

### 1.2 产品定位

面向体验工程师的本地化产品体验管理平台，将体验标准、现场走查、素材采集、问题整改、报告生成与数据分析整合为一个可追溯的完整工作流。当前按本地/单机内网部署优先维护。

### 1.3 目标用户

| 角色 | 职责 | 典型场景 |
|------|------|----------|
| **体验工程师**（user） | 执行体验计划、现场走查、素材采集 | 站在产线旁用手机录入检查结果、拍照取证 |
| **质量体验负责人**（admin） | 管理标准、审核账号、查看数据分析、导出 | 在办公室审阅报告、配置标准、导出数据 |
| **平台管理员**（admin） | 系统配置、AI 接入、安全审计 | 配置 AI 模型、管理用户权限、查看审计日志 |

### 1.4 品牌个性

**明亮、专业、可信。** 品牌主色 Golden Yellow（`#FFC60A`），体现积极、清晰和可识别的产品体验管理气质；界面整体保持克制，优先服务高频工作流。

**反面参考（避免）：** 营销落地页、装饰性后台、全屏大面积黄色、低对比黄底白字、厚重阴影、玻璃拟态、花哨渐变。警告状态不得与品牌黄色混淆。

---

## 2. 用户使用路径与场景

### 2.1 核心用户旅程

```
注册账号 → 管理员审核 → 登录
  │
  ├─→ [管理员] 配置品类产品 → 导入/创建标准 → 配置 AI 模型
  │
  └─→ [所有用户] 创建体验计划
        │
        ├─→ 现场走查 → 素材采集（拍照/录像/上传）
        │     │
        │     ├─→ 五感体验 → 关联标准 → 新增问题点
        │     │
        │     └─→ 功能效果 → 管理食谱/步骤 → AI 评价 → AI 问题点识别
        │
        ├─→ 生成报告 → 查看/编辑 → 分享（7天/30天/永久）→ PDF 导出
        │
        └─→ 问题整改 → 复评估 → 闭环
```

### 2.2 场景详述

#### 场景 1：新用户注册与审核

```
用户操作                            系统响应
─────────                          ────────
1. 访问登录页                       → 显示登录表单
2. 点击"注册账号"                   → 弹出注册对话框
3. 填写账号、姓名、密码              → 提交注册请求
4. 等待审核                         → 状态显示"待审核"
5. 管理员在设置页审核通过            → 用户可正常登录
6. 登录成功                         → 跳转到工作台
```

**业务规则：**
- 账号唯一，密码至少 10 位且含字母和数字
- 注册后状态为 `pending`，需管理员审核通过后才能登录
- 忘记密码同样需要管理员审核
- 非管理员修改名称/密码显示"待申请"状态

#### 场景 2：管理员导入标准

```
管理员操作                          系统响应
─────────                          ────────
1. 进入标准管理 → 点击"批量导入"    → 弹出导入对话框
2. 选择标准分类（通用/品类/感官）    → 切换对应字段结构
3. 上传 PDF 或 Excel 文件           → 解析文件
  ├─ PDF: 提取文本 → AI 结构化解析  → 返回检查项列表
  └─ Excel: 直接解析列映射           → 返回检查项列表
4. 确认导入                         → 创建标准及检查项
```

**业务规则：**
- PDF 导入：使用 `pdf-parse` 提取文本，AI 按分类结构化解析为检查项
  - 文本预处理：去页码、规范空白、合并空行
  - 长文本（>6000 字）自动分块处理
  - AI 超时 120 秒，maxTokens 4096
  - 解析失败时引导用户使用 Excel 格式
- Excel 导入：通过列名别名映射（如"检查条目"→`check_item`）
  - 支持多种列名写法（如"感官维度"/"感官"/"sensory_dimension"）
  - 空表头检测、列名匹配诊断
- 导入频率限制：每用户每小时 10 次
- 文件大小限制：20MB

#### 场景 3：创建体验计划与现场走查

```
用户操作                            系统响应
─────────                          ────────
1. 进入体验计划 → 新建              → 填写任务基本信息
  ├─ 品类、产品（级联选择）
  ├─ 产品型号（自研/改型降本优化时必填）
  ├─ 项目类型：ODM/OEM/竞品研究/自研/前期研究/改型降本优化/海外产品
  └─ 项目阶段（自研类型）：手板研究/试制/试产/量产
2. 进入任务详情 → 素材仓库          → 上传/拍照/录像
3. 切换到"五感体验" Tab              → 显示关联标准检查项
  ├─ 选择标准类型                    → 按类型展示不同字段
  │   ├─ 通用标准：阶段→流程→触点→要求→标准→工具→等级
  │   ├─ 品类标准：维度→检查维度→细分维度→条目→要求→标准
  │   ├─ 感官评价标准：维度→评价准备→主观满意度
  │   └─ 非标准：自由输入
  └─ 新增问题点                      → 关联检查项 + 描述 + 素材
4. 切换到"功能效果" Tab              → 管理食谱/功能
  ├─ 新增食谱/功能                    → 填写名称、食材、参数
  ├─ 编辑步骤                         → 操作描述 + 问题点
  ├─ AI 效果评价                      → 四维评分（质感/透彻/纯净/恒定）+ 综合评分 + 总结
  └─ AI 问题点识别                    → 识别操作问题点
```

**任务状态自动流转：**
- 创建时状态为"待执行"
- 新增检查记录或食谱时自动变为"进行中"
- 生成报告时自动变为"已完成"

#### 场景 4：报告生成与分享

```
用户操作                            系统响应
─────────                          ────────
1. 在任务详情点击"生成报告"          → 汇总五感体验 + 功能效果
2. 系统自动创建问题记录             → DB 唯一约束去重
3. 报告生成完成                      → 跳转报告详情页
  ├─ 查看报告内容                    → 问题清单 + 食谱详情 + 素材附录
  ├─ 同型号报告自动合并              → 仅自研/改型降本优化类型
  ├─ 生成分享链接                    → 设置有效期（7天/30天/永久）
  ├─ 打印/PDF导出                    → 浏览器打印功能
  └─ 报告对比                        → 选择多份报告对比查看
```

**业务规则：**
- 报告内容：任务信息 + 检查记录 + 问题清单 + 食谱详情 + 素材附录
- 重新生成报告时先删除旧报告和旧问题，再创建新的
- 同型号（`product_model`）的"自研"和"改型/降本/优化"报告合并展示
- 分享链接无需登录，只读查看

#### 场景 5：问题整改与复评估

```
用户操作                            系统响应
─────────                          ────────
1. 进入问题管理                      → 显示问题列表（按用户隔离）
2. 查看问题详情                      → 显示来源、等级、整改方案
  ├─ 问题来源：record_fail（五感体验）/ recipe_problem（功能效果）
  ├─ 问题等级：一类/二类/三类
  └─ 问题状态：待整改 → 整改中 → 已验证 / 不整改
3. 功能效果来源的问题点              → 支持复评估
  ├─ 新增复评估                       → 描述 + 素材 + AI 总结评分
  └─ 复评估 AI 评价                   → 可编辑的 AI 评分和总结
```

#### 场景 6：数据分析

```
管理员操作                          系统响应
─────────                          ────────
1. 进入数据分析页                    → 显示核心指标卡片
  ├─ 任务总数、完成率
  ├─ 问题总数、整改率
2. 筛选维度                          → 按品类/项目类型/任务人/时间范围
3. 查看图表                          → 任务状态分布 + 问题等级分布 + 整改进度
4. 导出 CSV                         → 仅管理员可导出
```

#### 场景 7：系统配置（管理员）

```
管理员操作                          系统响应
─────────                          ────────
1. 进入设置页
  ├─ 通用标准选项管理                → 编辑通用标准检查项的选项值
  ├─ 品类产品配置                    → 增删改品类和产品
  ├─ AI 模型配置                     → 配置 API URL/Key/模型/温度
  ├─ Agent Skill 配置                → 管理 Skill 模板和版本
  ├─ 用户管理                        → 审核/角色变更/删除账号
  └─ 安全审计日志                    → 查看操作日志
```

---

## 3. 功能模块详述

### 3.1 认证与权限

#### 3.1.1 用户角色

| 角色 | 权限范围 |
|------|----------|
| **admin** | 管理标准（创建/导入/编辑/删除）、审核账号、查看全部数据、导出数据分析、配置 AI 模型、管理品类产品、转移任务 |
| **user** | 执行自身任务、查看报告中心、浏览数据分析（不可导出）、编辑自己生成的报告 |

#### 3.1.2 审核流程

| 操作类型 | 流程 |
|----------|------|
| 注册 | 用户提交 → 管理员审核（approve/reject） → 通过后可登录 |
| 忘记密码 | 用户提交验证 → 管理员审核 → 密码重置生效 |
| 修改名称/密码 | 用户提交 → 管理员审核 → 变更生效 |

#### 3.1.3 数据隔离

- 体验计划和问题管理按 `created_by` 用户隔离，普通用户仅可见自己的数据
- 管理员可查看全部数据
- 标准管理和报告中心为平台共享数据

#### 3.1.4 安全机制

- 会话签名密钥（`AUTH_SESSION_SECRET`）保护 cookie
- AI API Key 使用 AES-256 加密存储（`AI_CONFIG_ENCRYPTION_KEY`）
- 安全审计日志 append-only，禁止修改/删除
- 多实例共享限速状态
- API 端点统一鉴权：`requireUser` / `requireAdmin` / `canAccess*`

### 3.2 标准管理

#### 3.2.1 标准分类体系

| 分类 | 检查项字段结构 | 适用场景 |
|------|---------------|----------|
| **通用标准** | 产品使用阶段 → 体验流程 → 感官维度 → 触点 → 检验范围及要求 → 体验标准 → 测量工具 → 问题等级 | 通用产品体验检查 |
| **品类标准** | 感官维度 → 检查维度 → 细分检查维度 → 具体检查条目 → 检查要求及区域 → 检查标准 | 品类特定检查 |
| **感官评价标准** | 感官维度 → 感官评价准备 → 主观满意度（分值 + 感受描述） | 主观感官评价 |
| **食谱功能标准** | 预留扩展 | 食谱功能检查 |

#### 3.2.2 受控词汇

**产品使用阶段：** 开箱 / 首次安装 / 产品使用 / 清洁收纳 / 其他

**体验流程（级联映射）：**
| 产品使用阶段 | 允许的体验流程 |
|-------------|---------------|
| 开箱 | 拿取外包装 / 拆开内包装 |
| 首次安装 | 配件梳理 / 外观美观 / 外观缺陷 / 标识文字 / 首次安装 |
| 产品使用 | 放置及组装 / 操作交互 / 产品运行 |
| 清洁收纳 | 冲水 / 擦拭 / 晾干 / 收纳 |
| 其他 | 其他 |

**感官维度：** 视觉 / 听觉 / 触觉 / 嗅觉 / 味觉

**问题等级：** 一类 / 二类 / 三类

#### 3.2.3 批量导入

| 格式 | 解析方式 | 容错机制 |
|------|----------|----------|
| PDF | `pdf-parse` 提取文本 → AI 结构化解析 | 文本预处理、长文本分块、120s 超时、解析失败引导 Excel |
| Excel (.xlsx) | `ExcelJS` 直接解析列映射 | 多别名映射、空表头检测、列名匹配诊断 |
| CSV | 自定义 CSV 解析器 → 复用 Excel 列映射 | BOM 去除、引号处理 |

**导入频率限制：** 每用户每小时 10 次

**文件大小限制：** 20MB

### 3.3 体验计划

#### 3.3.1 任务详情页结构

| Tab | 内容 | 操作 |
|-----|------|------|
| **基本信息** | 任务名称、品类、产品、型号、项目类型、阶段、状态 | 点击编辑（管理员可转移任务） |
| **素材仓库** | 图片/视频素材网格 | 拍照/录像/上传/编辑/删除 |
| **五感体验** | 关联标准检查项列表 | 选择标准类型 → 新增问题点 → 编辑记录 |
| **功能效果** | 食谱/功能列表 | 新增/删除/拖拽排序食谱 → 编辑步骤 → AI 评价 |

#### 3.3.2 项目类型与阶段

| 项目类型 | 是否需要产品型号 | 可选项目阶段 |
|----------|:---:|---------------|
| ODM/OEM | 否 | — |
| 竞品研究 | 否 | — |
| 自研 | 是 | 手板研究 / 试制 / 试产 / 量产 |
| 前期研究 | 否 | — |
| 改型/降本/优化 | 是 | — |
| 海外产品 | 否 | — |

#### 3.3.3 任务状态流转

```
创建 → 待执行 ──(新增内容)──→ 进行中 ──(生成报告)──→ 已完成
```

状态变更自动触发，无需手动切换。

### 3.4 素材管理

| 能力 | 说明 |
|------|------|
| 上传 | 支持图片/视频，单文件 100MB 限制 |
| 拍照 | 移动端调用设备原生相机 |
| 录像 | 移动端调用设备原生摄像机 |
| 图片编辑 | Canvas 画布编辑器：画笔、箭头、马赛克、文字、裁剪、旋转 |
| 关联 | 可关联检查记录/食谱步骤/食谱库步骤/食谱/问题/复评估 |
| 删除保护 | 删除关联实体时仅解除关联，不删除素材本身 |

### 3.5 五感体验

**新增问题点流程：**

1. 选择标准类型（通用/品类/感官评价/非标准）
2. 按类型展示不同筛选和输入字段
3. 填写问题描述
4. 关联素材
5. 保存后自动创建检查记录

**标准类型对应的字段结构：**

| 标准类型 | 输入字段 |
|----------|----------|
| 通用标准 | 产品使用阶段 → 体验流程 → 感官维度 → 触点 → 检验范围及要求 → 体验标准 → 测量工具 → 问题等级 |
| 品类标准 | 感官维度 → 检查维度 → 细分检查维度 → 检查条目 → 检查要求及区域 → 检查标准 |
| 感官评价标准 | 感官维度 → 感官评价准备 → 主观满意度分值 → 主观满意度描述 |
| 非标准 | 自由输入 |

### 3.6 功能效果与食谱

#### 3.6.1 食谱/功能管理

- 新增食谱：名称、食材、参数、效果描述
- 引用食谱库：搜索食谱库并引用已有步骤
- 食谱步骤：拖拽排序、编辑、删除
- 步骤问题点：每个步骤可标记问题点

#### 3.6.2 AI 效果评价

**四维评价体系：**

| 维度 | 评价内容 |
|------|----------|
| 质感 | 口感/触感等质地相关 |
| 透彻 | 通透度/清晰度 |
| 纯净 | 杂质/异味 |
| 恒定 | 稳定性/一致性 |

**对外展示：** 综合评分（满分 10 分）+ 总结评语（用户可编辑）

**内部存储：** 完整四维评价详情存储在 `effect_ai_result` 字段

#### 3.6.3 食谱库

- 独立存储，按品类-产品分类
- 名称全局唯一约束
- 步骤支持拖拽排序
- 任务中可搜索引用食谱库步骤

### 3.7 问题管理

#### 3.7.1 问题来源

| 来源 | 标识 | 说明 |
|------|------|------|
| 五感体验不合格 | `record_fail` | 检查记录评价为不合格时自动关联 |
| 功能效果问题 | `recipe_problem` | 食谱步骤标记的问题点 |

#### 3.7.2 问题生命周期

```
待整改 → 整改中 → 已验证
                 → 不整改
```

#### 3.7.3 复评估

仅功能效果来源的问题支持复评估：

- 新增复评估：描述 + 素材
- AI 评价：可编辑的评分和总结
- 复评估按时间倒序排列
- 更新检查记录时同步更新对应问题状态

### 3.8 报告中心

#### 3.8.1 报告内容

| 板块 | 包含内容 |
|------|----------|
| 任务信息 | 品类、产品、型号、项目类型、项目阶段、创建人 |
| 检查记录 | 按标准类型分组的检查结果 |
| 问题清单 | 等级 + 标题 + 状态/标准/来源/整改方案/验证结果，分行结构化呈现 |
| 食谱详情 | 名称、食材、参数、步骤、AI 评分、效果评价、问题点 |
| 素材附录 | 所有关联素材的缩略图（图片显示原文件，视频显示首帧） |

#### 3.8.2 报告合并

- 仅"自研"和"改型/降本/优化"类型的报告按 `product_model` 合并
- 合并后按时间排序展示
- 其他类型报告独立展示

#### 3.8.3 报告分享

| 有效期 | 说明 |
|--------|------|
| 7 天 | 临时分享 |
| 30 天 | 常规分享 |
| 永久 | 长期存档 |

分享页面无需登录，只读查看，支持照片放大和视频播放。

#### 3.8.4 PDF 导出

通过浏览器打印功能实现，打印页自动适配纸张格式。

### 3.9 数据分析

| 指标 | 说明 |
|------|------|
| 任务总数 | 按筛选条件统计 |
| 完成率 | 已完成任务/总任务 |
| 问题总数 | 一类/二类/三类分布 |
| 整改率 | 已验证/总问题数 |

**筛选维度：** 品类、项目类型、任务人、问题点分类、时间范围

**导出：** CSV 格式，仅管理员可导出

### 3.10 AI Agent 系统

#### 3.10.1 AI 模型配置

- 兼容 Chat Completions 接口（OpenAI/Claude/国产模型等）
- 支持配置：Provider、Model、Temperature、Max Tokens、API URL、API Key
- API Key 使用 AES-256 加密存储
- 支持 `AI_ALLOWED_HOSTS` 白名单限制外联地址
- 支持多配置，仅一个激活

#### 3.10.2 Agent Skill 模板

- 可配置的 Prompt 模板（system prompt + user prompt template）
- 版本管理（多版本切换）
- 审计日志（skill_key、action、actor、status）

#### 3.10.3 AI 应用场景

| 场景 | 调用方式 | 说明 |
|------|----------|------|
| 标准批量导入 | 服务端 API | PDF 文本提取后 AI 结构化解析 |
| 食谱效果评价 | 服务端 API | AI 四维评价 + 综合评分 |
| 食谱问题点识别 | 服务端 API | AI 两层分析（负面情绪 + 专业视角） |
| 任务摘要 | 服务端 API | AI 生成任务总结 |
| Agent 聊天 | 服务端 API | 基于 Skill 模板的上下文对话 |

---

## 4. 技术方案

### 4.1 技术架构

```
┌─────────────────────────────────────────────────────┐
│                   Next.js 16 App Router               │
│              React 19 + TypeScript 5                   │
│              shadcn/ui + Tailwind CSS 4                │
├──────────────┬──────────────┬────────────────────────┤
│   (auth)     │   (main)    │    reports/             │
│   登录/注册   │   工作台     │    打印/分享             │
│              │   标准/任务   │                         │
│              │   问题/分析   │                         │
├──────────────┴──────────────┴────────────────────────┤
│                    API Routes (75+)                    │
│         auth / standards / tasks / records /           │
│         materials / issues / recipes / reports /        │
│         settings / ai / analysis / security            │
├───────────────────────────────────────────────────────┤
│                  Service Layer                         │
│   auth.ts / ai.ts / rate-limit.ts / security-audit.ts │
├───────────────────────────────────────────────────────┤
│              Data Access Layer                         │
│        Drizzle ORM (schema.ts) + pg-db.ts             │
│        Supabase Client (auth/storage)                  │
├───────────────────────────────────────────────────────┤
│           PostgreSQL 14+ / S3 Compatible Storage       │
└───────────────────────────────────────────────────────┘
```

### 4.2 目录结构

```
src/
├── app/
│   ├── (auth)/                        # 认证路由组
│   │   └── login/                     # 登录页（含注册/忘记密码弹窗）
│   ├── (main)/                        # 主布局路由组（需认证）
│   │   ├── dashboard/                 # 工作台
│   │   ├── standards/                # 标准管理
│   │   │   └── [id]/                 # 标准详情/编辑
│   │   ├── tasks/                     # 体验计划
│   │   │   └── [id]/                 # 任务详情（4Tab）
│   │   ├── issues/                    # 问题管理
│   │   │   └── [id]/                 # 问题详情
│   │   ├── reports/                  # 报告中心
│   │   │   └── [id]/                 # 报告详情
│   │   └── analysis/                  # 数据分析
│   ├── reports/
│   │   ├── print/                     # 报告打印页
│   │   └── share/[token]/            # 报告分享页（公开）
│   └── api/                           # 后端 API 路由
│       ├── auth/                      # 认证（9 个端点）
│       ├── standards/                 # 标准（5 个端点）
│       ├── standard-items/           # 检查项（3 个端点）
│       ├── tasks/                     # 任务（6 个端点）
│       ├── records/                   # 检查记录（3 个端点）
│       ├── materials/                # 素材（6 个端点）
│       ├── issues/                    # 问题（4 个端点）
│       ├── recipes/                   # 食谱（5 个端点）
│       ├── recipe-steps/             # 食谱步骤（2 个端点）
│       ├── recipe-library/           # 食谱库（3 个端点）
│       ├── recipe-library-steps/     # 食谱库步骤（2 个端点）
│       ├── reports/                   # 报告（9 个端点）
│       ├── issue-re-evaluations/     # 复评估（4 个端点）
│       ├── settings/                  # 设置（2 个端点）
│       ├── categories/              # 品类产品（2 个端点）
│       ├── dashboard/                # 仪表盘（1 个端点）
│       ├── analysis/                  # 数据分析（2 个端点）
│       ├── ai/                       # AI 配置（4 个端点）
│       └── security/                 # 安全审计（1 个端点）
├── components/
│   ├── app/                          # 业务组件
│   │   ├── navigation.tsx           # 导航栏（桌面侧边栏 + 移动底部Tab）
│   │   ├── image-preview.tsx         # 图片预览
│   │   ├── material-picker.tsx       # 素材选择器
│   │   ├── media-capture-dialog.tsx  # 媒体采集对话框
│   │   └── ...                       # 其他业务组件
│   ├── ui/                           # shadcn UI 组件库
│   └── settings/                    # 设置页组件
├── lib/
│   └── server/                        # 服务端工具
│       ├── auth.ts                    # 认证鉴权（requireUser/requireAdmin/canAccess*）
│       ├── ai.ts                      # AI 调用（invokeConfiguredAI/resolveAIConfig）
│       ├── rate-limit.ts             # 限速
│       ├── security-audit.ts        # 安全审计
│       ├── secret-crypto.ts         # 加密解密
│       └── storage.ts               # 文件存储（local/S3）
└── storage/database/
    ├── supabase-client.ts           # Supabase 兼容层
    ├── pg-db.ts                     # Drizzle ORM 数据库连接
    └── shared/schema.ts             # 数据库 Schema 定义
```

### 4.3 数据库架构

#### 4.3.1 核心业务表

| 表名 | 说明 | 关键字段 |
|------|------|----------|
| `platform_users` | 用户账号 | id, account, password_hash, name, role(admin/user), status(pending/approved/rejected) |
| `platform_audit_requests` | 审核请求 | id, user_id, request_type, status, old_value, new_value |
| `platform_categories` | 品类配置 | id, name, sort_order |
| `platform_products` | 产品配置 | id, name, category_id, sort_order |
| `platform_settings` | 平台设置 | key, value(JSONB) |

#### 4.3.2 标准相关表

| 表名 | 说明 | 关键字段 |
|------|------|----------|
| `standards` | 标准库 | id, standard_name, category, product_category, product, version, is_active |
| `standard_items` | 检查项 | id, standard_id, sensory_dimension, test_phase, experience_flow, touch_point, check_item, experience_standard, check_standard, ... |

#### 4.3.3 体验任务相关表

| 表名 | 说明 | 关键字段 |
|------|------|----------|
| `experience_tasks` | 体验任务 | id, task_name, product_category, product, product_model, project_type, project_phase, status, created_by |
| `check_records` | 检查记录 | id, task_id, standard_item_id, standard_category, sensory_dimension, evaluation_result, problem_description |
| `materials` | 素材 | id, record_id, recipe_step_id, recipe_library_step_id, recipe_id, issue_id, re_evaluation_id, task_id, material_type, file_path |

#### 4.3.4 问题与评估表

| 表名 | 说明 | 关键字段 |
|------|------|----------|
| `issues` | 问题整改 | id, task_id, title, level, source, source_type, status, improve_plan |
| `issue_re_evaluations` | 复评估 | id, issue_id, description, ai_result(JSONB), created_by |

#### 4.3.5 食谱相关表

| 表名 | 说明 | 关键字段 |
|------|------|----------|
| `recipes` | 食谱/功能 | id, task_id, name, ingredients, recipe_type, effect_description, effect_score, effect_problem_point, effect_ai_result |
| `recipe_steps` | 食谱步骤 | id, recipe_id, step_number, operation, problem_point, problem_points(JSONB) |
| `recipe_library` | 食谱库 | id, name(UNIQUE), product_category, product, ingredients |
| `recipe_library_steps` | 食谱库步骤 | id, recipe_library_id, step_number, operation, problem_point |

#### 4.3.6 报告相关表

| 表名 | 说明 | 关键字段 |
|------|------|----------|
| `report_templates` | 报告模板 | id, template_name, content(JSONB), is_default |
| `reports` | 报告 | id, task_id, title, content(JSONB), product_model, status, version, created_by |
| `report_shares` | 报告分享 | id, report_id, share_token, expires_at, created_by |

#### 4.3.7 AI 与安全表

| 表名 | 说明 | 关键字段 |
|------|------|----------|
| `ai_model_configs` | AI 模型配置 | id, name, provider, model, temperature, max_tokens, custom_api_url, custom_api_key_encrypted, is_active |
| `agent_skill_templates` | Skill 模板 | id, skill_key, name, is_enabled, active_version_id, model_config_id |
| `agent_skill_versions` | Skill 版本 | id, template_id, version, system_prompt, user_prompt_template, output_schema |
| `agent_skill_audit_logs` | Agent 审计 | id, skill_key, action, actor_user_id, task_id, status |
| `security_audit_logs` | 安全审计 | id, action, actor_user_id, target_type, outcome, ip_address, metadata |
| `security_rate_limits` | 限速状态 | rate_key, count, reset_at |

### 4.4 API 设计规范

#### 4.4.1 统一响应格式

```typescript
// 成功响应
{ code: 0, message: "操作成功", data: {...} }

// 错误响应
{ code: 1, message: "错误描述" }
```

#### 4.4.2 权限中间件

| 中间件 | 用途 | 行为 |
|--------|------|------|
| `requireUser` | 登录验证 | 未登录返回 401 |
| `requireAdmin` | 管理员验证 | 非管理员返回 403 |
| `canAccessTask` | 任务归属验证 | 非创建者且非管理员返回 403 |
| `canAccessIssue` | 问题归属验证 | 非创建者且非管理员返回 403 |

#### 4.4.3 限速策略

| 作用域 | 限制 | 窗口 |
|--------|------|------|
| `standards-import` | 10 次/用户 | 1 小时 |
| `auth-login` | 5 次/IP | 15 分钟 |
| `auth-register` | 3 次/IP | 1 小时 |
| `auth-forgot-password` | 3 次/IP | 1 小时 |
| `ai-invoke` | 30 次/用户 | 1 小时 |
| `report-share` | 10 次/用户 | 1 小时 |
| `file-upload` | 20 次/用户 | 1 小时 |

### 4.5 文件存储方案

| 模式 | 配置 | 文件去向 | URL 生成 |
|------|------|----------|----------|
| **Local**（默认） | `STORAGE_DRIVER=local` | `public/uploads` | `/uploads/<key>` 或 `/api/materials/file/<key>` |
| **S3 兼容** | `STORAGE_DRIVER=s3` | S3/MinIO bucket | Presigned URL（86400 秒） |

**S3 兼容存储支持：** AWS S3、MinIO、火山引擎 TOS

### 4.6 AI 调用架构

```
┌──────────────┐     ┌──────────────────┐     ┌──────────────────┐
│  前端请求     │ ──→ │  API Route        │ ──→ │  invokeConfiguredAI │
│              │     │  (业务逻辑)        │     │  (lib/server/ai.ts) │
└──────────────┘     └──────────────────┘     └────────┬─────────┘
                                                        │
                                              ┌─────────▼─────────┐
                                              │  resolveAIConfig    │
                                              │  1. ai_model_configs│
                                              │  2. platform_settings│
                                              │  3. 环境变量回退     │
                                              └─────────┬─────────┘
                                                        │
                                              ┌─────────▼─────────┐
                                              │  Chat Completions   │
                                              │  Compatible API     │
                                              │  (可配置 URL/Key)   │
                                              └───────────────────┘
```

**关键设计：**
- AI 配置优先级：`ai_model_configs` 激活配置 > `platform_settings` > 环境变量
- API Key 加密：AES-256 加密存储，运行时解密
- 安全审计：每次 AI 调用记录审计日志（成功/失败）
- 超时可配置：默认 60 秒，PDF 导入使用 120 秒
- 主机白名单：`AI_ALLOWED_HOSTS` 环境变量限制外联地址

### 4.7 安全加固

#### 4.7.1 生产启动门禁

以下环境变量缺失或不合规时服务直接启动失败：

| 变量 | 说明 |
|------|------|
| `AUTH_SESSION_SECRET` | 生产会话签名密钥 |
| `AI_CONFIG_ENCRYPTION_KEY` | AI API Key 加密密钥 |
| `SECURITY_SCHEMA_VERIFIED=true` | 安全 schema 已验证标志 |
| `DATABASE_ACCESS_MODE` | 数据库访问模式 |

#### 4.7.2 数据库安全

- 生产环境禁止 `allow_all` RLS 策略
- 验证脚本：`scripts/verify-security-schema.sql`
- 管理员删除账号时级联清理 `report_shares.created_by` 和 `platform_audit_requests`

---

## 5. 权限矩阵

| 操作 | 管理员 (admin) | 使用者 (user) |
|------|:---:|:---:|
| 新建标准/批量导入/编辑标准信息 | ✅ | ❌ |
| 编辑/删除检查项/批量删除标准 | ✅ | ❌ |
| 查看标准 | ✅ | ✅ |
| 新增问题点/标准引用到五感体验 | ✅ | ✅ |
| 创建体验计划 | ✅ | ✅（仅自己的） |
| 查看所有体验计划 | ✅ | ❌（仅自己的） |
| 转移体验计划 | ✅ | ❌ |
| 审核账号注册/密码/名称 | ✅ | ❌ |
| 升级/降级用户角色/删除用户 | ✅ | ❌ |
| 查看报告中心全部报告 | ✅ | ✅（内部共享只读） |
| 编辑/分享报告 | ✅ | 仅自己任务生成的报告 |
| 数据分析导出 CSV | ✅ | ❌ |
| 数据分析浏览 | ✅ | ✅ |
| 配置 AI 模型 | ✅ | ❌ |
| 管理品类产品 | ✅ | ❌ |
| 查看安全审计日志 | ✅ | ❌ |

---

## 6. 关键设计决策

| # | 决策 | 理由 |
|---|------|------|
| 1 | 响应式布局：桌面侧边栏 + 移动底部 Tab | 体验工程师现场走查使用移动端，管理使用桌面端 |
| 2 | 素材删除仅解除关联，不删除文件 | 防止误操作导致素材丢失，素材可能被多处引用 |
| 3 | 问题在报告生成时自动创建（DB 去重） | 避免手动创建遗漏或重复 |
| 4 | 重新生成报告先删除旧数据 | 避免数据不一致，报告与问题保持一致 |
| 5 | 自研/改型降本优化报告按型号合并 | 同型号不同阶段的产品需要纵向对比 |
| 6 | 任务状态自动流转 | 减少用户手动操作，状态与内容自动同步 |
| 7 | 标准批量导入 PDF 走 AI 解析 | PDF 格式不统一，AI 结构化提取比规则解析更灵活 |
| 8 | 长文本 PDF 分块处理 | 避免 AI 超时和输出截断 |
| 9 | AI 配置支持多模型切换 | 不同场景可能需要不同模型能力 |
| 10 | 体验计划按用户隔离 | 数据隐私和安全要求 |
| 11 | 报告分享令牌机制 | 无需登录即可查看，但有有效期控制 |
| 12 | 品牌色 Golden Yellow 用于识别而非大面积铺色 | 避免视觉疲劳，保持专业感 |
| 13 | 非管理员修改信息走审核流程 | 安全合规要求 |
| 14 | AI Key 加密存储 + 审计日志 | 安全合规要求 |
| 15 | 食谱效果评价对外仅展示综合评分 | 内部保留四维详情，对外简洁呈现 |

---

## 7. 环境配置

### 7.1 必需环境变量

| 变量 | 说明 | 示例 |
|------|------|------|
| `DATABASE_ACCESS_MODE` | 数据库访问模式 | `self-hosted-postgres` / `supabase-service-role` |
| `DATABASE_URL` | PostgreSQL 连接字符串 | `postgresql://user:pass@host:port/db` |
| `AUTH_SESSION_SECRET` | 会话签名密钥 | 随机字符串 |
| `AI_CONFIG_ENCRYPTION_KEY` | AI Key 加密密钥 | 随机字符串 |
| `SECURITY_SCHEMA_VERIFIED` | 安全 schema 验证 | `true` |
| `PORT` | 服务端口 | `5000` |

### 7.2 可选环境变量

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `STORAGE_DRIVER` | 文件存储驱动 | `local` |
| `LOCAL_UPLOAD_DIR` | 本地上传目录 | `./public/uploads` |
| `LOCAL_PUBLIC_BASE_PATH` | 静态访问前缀 | `/uploads` |
| `LOCAL_UPLOAD_PUBLIC_ACCESS` | 访问模式 | `public` |
| `PUBLIC_MEDIA_BASE_URL` | 媒体基准地址 | `http://localhost:5000` |
| `AI_ALLOWED_HOSTS` | AI 外联白名单 | 空（不限制） |
| `INITIAL_ADMIN_ACCOUNT` | 初始管理员账号 | 首次部署后移除 |
| `INITIAL_ADMIN_PASSWORD` | 初始管理员密码 | 首次部署后移除 |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase URL | Supabase 模式 |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase 匿名密钥 | Supabase 模式 |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase Service Role | Supabase 模式 |
| `S3_ENDPOINT` / `S3_*` | S3 存储配置 | — |

### 7.3 本地开发

```bash
pnpm install
cp .env.example .env.local
# 配置 .env.local
pnpm dev  # http://localhost:5000
```

### 7.4 生产部署

```bash
pnpm install --frozen-lockfile
psql "$DATABASE_URL" -f database-schema.sql
psql "$DATABASE_URL" -f scripts/verify-security-schema.sql
# 设置 SECURITY_SCHEMA_VERIFIED=true
pnpm ts-check && pnpm build && pnpm audit --audit-level moderate
NODE_ENV=production PORT=5000 pnpm start
```

### 7.5 Docker 本地测试

```bash
docker compose -f docker-compose.local.yml up --build
# 访问 http://localhost:5000
# 管理员：dockeradmin / DockerLocal2026
```

---

## 8. 页面路由清单

| 路由 | 页面 | 认证 | 权限 |
|------|------|:---:|------|
| `/login` | 登录页 | ❌ | — |
| `/dashboard` | 工作台 | ✅ | 所有用户 |
| `/standards` | 标准管理 | ✅ | 查看：所有；编辑：管理员 |
| `/standards/[id]` | 标准详情/编辑 | ✅ | 查看：所有；编辑：管理员 |
| `/tasks` | 体验计划列表 | ✅ | 用户仅看自己；管理员看全部 |
| `/tasks/[id]` | 任务详情 | ✅ | 用户仅访问自己的；管理员全部 |
| `/issues` | 问题管理列表 | ✅ | 用户仅看自己；管理员看全部 |
| `/issues/[id]` | 问题详情 | ✅ | 用户仅访问自己的；管理员全部 |
| `/reports` | 报告中心 | ✅ | 所有用户可查看 |
| `/reports/[id]` | 报告详情 | ✅ | 编辑权限按归属 |
| `/analysis` | 数据分析 | ✅ | 浏览：所有；导出：管理员 |
| `/reports/print` | 报告打印 | ✅ | 按报告归属 |
| `/reports/share/[token]` | 报告分享 | ❌ | 公开只读 |

---

## 9. API 端点清单

### 9.1 认证（9 个端点）

| 方法 | 路径 | 说明 | 权限 |
|------|------|------|------|
| POST | `/api/auth/login` | 登录 | 公开 |
| POST | `/api/auth/register` | 注册 | 公开 |
| POST | `/api/auth/forgot-password` | 忘记密码 | 公开 |
| GET | `/api/auth/profile` | 获取用户信息 | 登录 |
| PUT | `/api/auth/profile` | 修改名称/密码 | 登录 |
| POST | `/api/auth/logout` | 登出 | 登录 |
| GET | `/api/auth/audit` | 获取审核请求 | 管理员 |
| PUT | `/api/auth/audit` | 审核操作 | 管理员 |
| GET/POST | `/api/auth/users` | 用户列表/角色管理 | 管理员 |

### 9.2 标准管理（8 个端点）

| 方法 | 路径 | 说明 | 权限 |
|------|------|------|------|
| GET | `/api/standards` | 标准列表 | 登录 |
| POST | `/api/standards` | 创建标准 | 管理员 |
| GET | `/api/standards/[id]` | 标准详情 | 登录 |
| PUT | `/api/standards/[id]` | 更新标准 | 管理员 |
| DELETE | `/api/standards/[id]` | 删除标准 | 管理员 |
| POST | `/api/standards/import` | 批量导入 | 管理员 |
| GET/POST | `/api/standard-items` | 检查项列表/创建 | 登录/管理员 |
| GET/PUT/DELETE | `/api/standard-items/[id]` | 检查项操作 | 登录/管理员 |
| GET | `/api/standard-items/search` | 跨标准搜索 | 登录 |

### 9.3 体验计划（6 个端点）

| 方法 | 路径 | 说明 | 权限 |
|------|------|------|------|
| GET | `/api/tasks` | 任务列表 | 登录 |
| POST | `/api/tasks` | 创建任务 | 登录 |
| GET | `/api/tasks/[id]` | 任务详情 | 归属验证 |
| PUT | `/api/tasks/[id]` | 更新任务 | 归属验证 |
| DELETE | `/api/tasks/[id]` | 删除任务 | 归属验证 |
| POST | `/api/tasks/[id]/transfer` | 转移任务 | 管理员 |
| POST | `/api/tasks/[id]/ai-summary` | AI 摘要 | 归属验证 |
| POST | `/api/tasks/[id]/agent-chat` | Agent 聊天 | 归属验证 |
| GET | `/api/tasks/[id]/agent-presets` | Agent 预设 | 归属验证 |

### 9.4 检查记录（3 个端点）

| 方法 | 路径 | 说明 | 权限 |
|------|------|------|------|
| GET | `/api/records` | 记录列表 | 登录 |
| POST | `/api/records` | 创建记录 | 登录 |
| PUT/DELETE | `/api/records/[id]` | 更新/删除 | 归属验证 |

### 9.5 素材管理（6 个端点）

| 方法 | 路径 | 说明 | 权限 |
|------|------|------|------|
| GET | `/api/materials` | 素材列表 | 登录 |
| POST | `/api/materials/upload` | 上传素材 | 登录 |
| PUT | `/api/materials` | 重命名/关联 | 归属验证 |
| DELETE | `/api/materials` | 删除素材 | 归属验证 |
| GET | `/api/materials/presign` | 预签名 URL | 登录 |
| GET | `/api/materials/file/[...key]` | 文件访问 | 登录 |

### 9.6 问题管理（4 个端点）

| 方法 | 路径 | 说明 | 权限 |
|------|------|------|------|
| GET | `/api/issues` | 问题列表 | 登录 |
| POST | `/api/issues` | 创建问题 | 登录 |
| GET | `/api/issues/[id]` | 问题详情 | 归属验证 |
| PUT/DELETE | `/api/issues/[id]` | 更新/删除 | 归属验证 |
| GET | `/api/issues/export` | 导出 CSV | 管理员 |

### 9.7 食谱/功能（7 个端点）

| 方法 | 路径 | 说明 | 权限 |
|------|------|------|------|
| GET/POST | `/api/recipes` | 食谱列表/创建 | 登录 |
| GET/PUT/DELETE | `/api/recipes/[id]` | 食谱操作 | 归属验证 |
| POST | `/api/recipes/[id]/ai-evaluate` | AI 效果评价 | 归属验证 |
| POST | `/api/recipes/[id]/ai-detect-problems` | AI 问题点识别 | 归属验证 |
| GET/POST | `/api/recipe-steps` | 步骤列表/创建 | 登录 |
| PUT/DELETE | `/api/recipe-steps/[id]` | 步骤操作 | 归属验证 |

### 9.8 食谱库（5 个端点）

| 方法 | 路径 | 说明 | 权限 |
|------|------|------|------|
| GET/POST | `/api/recipe-library` | 食谱库列表/创建 | 登录/管理员 |
| GET/PUT/DELETE | `/api/recipe-library/[id]` | 食谱库操作 | 登录/管理员 |
| GET/POST | `/api/recipe-library-steps` | 步骤列表/创建 | 登录/管理员 |
| PUT/DELETE | `/api/recipe-library-steps/[id]` | 步骤操作 | 登录/管理员 |

### 9.9 报告管理（9 个端点）

| 方法 | 路径 | 说明 | 权限 |
|------|------|------|------|
| GET/POST | `/api/reports` | 报告列表/生成 | 登录 |
| GET/PUT/DELETE | `/api/reports/[id]` | 报告操作 | 归属验证 |
| POST | `/api/reports/export-pdf` | PDF 导出 | 归属验证 |
| POST | `/api/reports/share` | 创建分享链接 | 归属验证 |
| GET | `/api/reports/share` | 验证分享令牌 | 公开 |
| GET | `/api/reports/share/list` | 分享链接列表 | 归属验证 |
| DELETE | `/api/reports/share/list` | 撤销分享 | 归属验证 |
| GET | `/api/reports/compare` | 报告对比 | 登录 |

### 9.10 复评估（4 个端点）

| 方法 | 路径 | 说明 | 权限 |
|------|------|------|------|
| GET/POST | `/api/issue-re-evaluations` | 复评估列表/创建 | 登录 |
| PUT/DELETE | `/api/issue-re-evaluations/[id]` | 复评估操作 | 归属验证 |
| POST | `/api/issue-re-evaluations/[id]/ai-evaluate` | AI 评价 | 归属验证 |

### 9.11 系统设置（8 个端点）

| 方法 | 路径 | 说明 | 权限 |
|------|------|------|------|
| GET/PUT | `/api/settings` | 平台设置 | 管理员 |
| GET/POST | `/api/categories` | 品类产品配置 | 管理员 |
| GET | `/api/dashboard` | 仪表盘数据 | 登录 |
| GET/POST | `/api/analysis` | 数据分析/导出 | 登录/管理员 |
| GET | `/api/security/audit-logs` | 安全审计日志 | 管理员 |
| GET/POST | `/api/ai/model-configs` | AI 模型配置 | 管理员 |
| GET/POST | `/api/ai/skill-templates` | Agent Skill 模板 | 管理员 |
| GET/POST | `/api/ai/skill-templates/[id]/versions` | Skill 版本管理 | 管理员 |

---

## 10. 非功能性需求

| 类别 | 要求 |
|------|------|
| **性能** | 首屏加载 < 3s（本地网络），列表页渲染 < 1s |
| **兼容性** | Chrome 90+、Safari 15+、移动端微信浏览器 |
| **响应式** | 桌面 1280px+ 全功能，移动 375px+ 核心流程可用 |
| **安全性** | 等保三级合规，会话加密，API Key 加密，审计日志 |
| **可用性** | 本地/内网部署，单实例运行，无外部服务依赖 |
| **数据保护** | 用户数据隔离，管理员可查看全部，报告分享有效期控制 |
| **国际化** | 当前仅支持中文，预留 i18n 架构 |

---

## 附录 A：术语表

| 术语 | 说明 |
|------|------|
| 体验标准 | 产品体验检查的标准检查项集合 |
| 五感体验 | 视觉/听觉/触觉/嗅觉/味觉维度的产品体验检查 |
| 功能效果 | 食谱/功能的效果评价 |
| 问题点 | 检查中发现的体验问题 |
| 检查记录 | 单次标准检查项的评价结果 |
| 复评估 | 对功能效果问题的再次评估 |
| 食谱库 | 预定义的食谱步骤模板，可被任务引用 |
| 品类标准 | 针对特定品类（如豆浆机）的检查标准 |
| 通用标准 | 适用于所有产品的通用体验检查标准 |
| 感官评价标准 | 主观感官评价维度的检查标准 |
| 项目类型 | ODM/OEM/竞品研究/自研/前期研究/改型降本优化/海外产品 |
| 项目阶段 | 自研产品的研发阶段：手板研究/试制/试产/量产 |
| 问题等级 | 一类（严重）/二类（一般）/三类（轻微） |
| 问题来源 | record_fail（五感体验）/ recipe_problem（功能效果） |

## 附录 B：版本历史

| 版本 | 日期 | 变更 |
|------|------|------|
| 1.0 | 2026-06-15 | 初始版本，基于代码库完整梳理 |