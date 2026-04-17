# 产品体验管理平台 - AGENTS.md

## 项目概览

产品体验管理平台，覆盖体验计划、现场走查、报告输出、数据分析全流程。主要面向体验工程师使用，支持移动端操作。

## 技术栈

- **Framework**: Next.js 16 (App Router)
- **Core**: React 19
- **Language**: TypeScript 5
- **UI 组件**: shadcn/ui (基于 Radix UI)
- **Styling**: Tailwind CSS 4
- **Database**: Supabase (PostgreSQL)
- **File Storage**: S3 兼容对象存储 (coze-coding-dev-sdk)
- **AI/LLM**: doubao-seed-2-0-pro-260215 (标准导入解析), doubao-seed-2-0-lite (其他场景)
- **PDF/Excel解析**: coze-coding-dev-sdk FetchClient + xlsx
- **Theme**: Teal 主色 / Business 字体 / Cool 阴影

## 目录结构

```
├── src/
│   ├── app/
│   │   ├── (main)/              # 主布局路由组
│   │   │   ├── dashboard/       # 工作台
│   │   │   ├── standards/       # 标准管理（含 [id] 详情、批量导入）
│   │   │   ├── tasks/           # 体验计划（含 [id] 详情，五感体验关联标准项）
│   │   │   ├── issues/          # 问题管理（含 [id] 详情）
│   │   │   ├── reports/         # 报告中心（含 [id] 详情）
│   │   │   └── analysis/        # 数据分析
│   │   ├── reports/print/       # 报告打印/PDF导出页面
│   │   ├── api/                 # 后端 API 路由
│   │   │   ├── standards/       # 标准 CRUD
│   │   │   │   └── import/      # 标准批量导入（PDF/Excel，按分类不同LLM prompt）
│   │   │   ├── standard-items/  # 标准检查项 CRUD（含新字段：experience_flow, touch_point等）
│   │   │   │   └── search/      # 标准检查项跨标准搜索（支持standard_category/experience_flow筛选）
│   │   │   ├── tasks/           # 体验任务 CRUD
│   │   │   ├── records/         # 检查记录 CRUD（含standard_category, experience_flow, touch_point, experience_standard）
│   │   │   ├── materials/       # 素材管理（上传/删除/重命名/关联）
│   │   │   ├── issues/          # 问题整改 CRUD
│   │   │   ├── reports/         # 报告生成/CRUD
│   │   │   │   └── export-pdf/  # PDF导出API
│   │   │   ├── recipes/         # 食谱/功能 CRUD
│   │   │   ├── recipe-steps/    # 食谱步骤 CRUD
│   │   │   └── dashboard/       # 仪表盘数据
│   │   ├── layout.tsx           # 根布局（含 Toaster + AuthProvider）
│   │   └── page.tsx             # 首页重定向到 /dashboard
│   ├── components/
│   │   ├── navigation.tsx       # 导航组件（桌面侧栏 + 移动端底部/顶部 + RoleSwitcher）
│   │   ├── image-preview.tsx    # 共享图片预览组件
│   │   ├── material-picker.tsx  # 素材选择器组件（引用/上传）
│   │   └── ui/                  # Shadcn UI 组件库
│   ├── storage/database/
│   │   ├── supabase-client.ts   # Supabase 客户端
│   │   └── shared/schema.ts     # Drizzle ORM Schema
│   └── lib/
│       ├── utils.ts
│       └── auth-context.tsx     # AuthContext + useAuth hook（admin/user角色）
├── package.json
└── tsconfig.json
```

## 数据库表结构

| 表名 | 说明 |
|------|------|
| `standards` | 体验标准库（通用标准/品类标准/感官评价标准/食谱功能标准） |
| `standard_items` | 标准检查项（含分类特定字段：experience_flow, touch_point, experience_standard, sub_check_dimension, check_standard, evaluation_prep, subjective_score, subjective_rating, reference_images） |
| `experience_tasks` | 体验任务 |
| `check_records` | 检查记录（走查，含 standard_category, experience_flow, touch_point, experience_standard） |
| `materials` | 素材（图片/视频，含 AI 预留字段，可关联record或recipe_step） |
| `issues` | 问题整改 |
| `report_templates` | 报告模板 |
| `reports` | 报告 |
| `recipes` | 食谱/功能 |
| `recipe_steps` | 食谱步骤 |

## 标准分类体系

### 通用标准
字段：产品使用阶段(开箱/首次安装/产品使用/清洁收纳/其他) → 体验流程(级联) → 感官维度 → 触点 → 检验范围及具体要求 → 体验标准 → 测量工具 → 问题等级(一级/二级/三级)

体验流程级联映射：
- 开箱 → 拿取外包装/拆开内包装
- 首次安装 → 配件梳理/外观美观/外观缺陷/标识文字/首次安装
- 产品使用 → 放置及组装/操作交互/产品运行
- 清洁收纳 → 冲水/擦拭/晾干/收纳
- 其他 → 其他

### 品类标准
字段：感官维度 → 检查维度 → 细分检查维度 → 具体检查条目 → 检查要求及区域 → 检查标准

### 感官评价标准
字段：感官维度 → 感官评价准备 → 主观满意度（分值+主观感受描述）

### 食谱功能标准
暂留空，后续开发

## API 接口

| 方法 | 路径 | 说明 |
|------|------|------|
| GET/POST | `/api/standards` | 标准列表/创建 |
| GET/PUT/DELETE | `/api/standards/[id]` | 标准详情/更新/删除 |
| POST | `/api/standards/import` | 标准批量导入（PDF/Excel，按分类不同LLM prompt） |
| GET/POST | `/api/standard-items` | 检查项列表/创建（支持批量，含新字段） |
| GET | `/api/standard-items/search` | 跨标准检查项搜索（支持category/experience_flow筛选，product_category自动包含null标准） |
| GET/POST | `/api/tasks` | 任务列表/创建（分页+筛选） |
| GET/PUT/DELETE | `/api/tasks/[id]` | 任务详情（含记录+问题）/更新/删除 |
| GET/POST | `/api/records` | 检查记录列表/创建（含standard_category等新字段） |
| PUT/DELETE | `/api/records/[id]` | 记录更新/删除 |
| POST | `/api/materials/upload` | 素材上传（文件大小100MB限制，仅图片/视频） |
| PUT | `/api/materials` | 素材重命名/关联record_id/recipe_step_id |
| GET/DELETE | `/api/materials` | 素材列表/删除 |
| GET/POST | `/api/issues` | 问题列表/创建 |
| GET/PUT/DELETE | `/api/issues/[id]` | 问题详情/更新/删除 |
| GET/POST | `/api/reports` | 报告列表/生成（含食谱/素材数据） |
| GET/PUT/DELETE | `/api/reports/[id]` | 报告详情/更新/删除 |
| POST | `/api/reports/export-pdf` | PDF导出辅助API |
| GET/POST | `/api/recipes` | 食谱/功能列表/创建 |
| GET/PUT/DELETE | `/api/recipes/[id]` | 食谱详情/更新/删除 |
| GET/POST | `/api/recipe-steps` | 步骤列表/创建 |
| PUT/DELETE | `/api/recipe-steps/[id]` | 步骤更新/删除 |
| GET | `/api/dashboard` | 仪表盘统计数据 |

## 构建与运行

```bash
# 安装依赖
pnpm install

# 开发模式
pnpm dev

# 类型检查
pnpm ts-check

# Lint
pnpm lint

# 构建
pnpm build
```

## 关键设计决策

1. **响应式布局**: 桌面端左侧导航 + 右侧内容；移动端顶部汉堡菜单 + 底部Tab导航
2. **任务详情页四Tab**: 基本信息 / 素材仓库 / 五感体验 / 功能效果，顶部"报告生成"按钮
3. **素材引用**: 五感体验新增问题点和功能效果新增步骤时均可引用素材库图片（MaterialPicker组件）
4. **素材上传**: 100MB 限制，仅图片/视频，上传至 S3 对象存储，可关联record_id或recipe_step_id
5. **报告生成**: 包含任务信息+检查记录+问题清单+食谱/功能详细列表+素材附录
6. **PDF导出**: 通过打印页面(`/reports/print?id=xxx`)实现，浏览器原生打印为PDF，含照片/视频预览图
7. **数据库**: Supabase PostgreSQL，Drizzle ORM，RLS 公开读写
8. **AI 预留**: materials 表预留 ai_analysis_status 和 ai_result 字段
9. **标准批量导入**: 支持 PDF（fetch-url提取+LLM结构化解析）和 Excel（xlsx直接解析），使用 doubao-seed-2-0-pro 模型，按标准分类使用不同LLM prompt
10. **标准分类维度重构**: 四类标准（通用/品类/感官评价/食谱功能）有不同输入字段结构，创建和编辑时按分类展示不同表单
11. **五感体验-新增问题点重构**: 移除"从标准库引用"栏目，改为选择"标准类型"后按类型展示不同筛选/输入字段；通用标准选择产品使用阶段→体验流程→感官维度后自动带出触点和检验范围及具体要求
12. **权限控制**: 管理账号(admin)可编辑标准、导入、删除；使用账号(user)只读，侧边栏底部切换角色

## 代码风格

- 使用 shadcn/ui 语义化变量（bg-primary, text-muted-foreground 等），禁止硬编码颜色
- 使用 cn() 合并类名
- 所有 API 返回统一结构 `{ code, message, data }`
- React 组件使用 'use client' 标注客户端组件
- 禁止 Hydration 错误：不在 JSX 中使用 typeof window/Date.now() 等
- 权限系统：管理账号(admin)可编辑标准、批量导入/删除；使用账号(user)只读
- 侧边栏底部有角色切换按钮，角色存储在 localStorage('user_role')

## 权限说明

| 操作 | 管理账号(admin) | 使用账号(user) |
|------|:-:|:-:|
| 新建标准 | ✅ | ❌ |
| 批量导入标准 | ✅ | ❌ |
| 编辑标准信息 | ✅ | ❌ |
| 编辑/删除检查项 | ✅ | ❌ |
| 批量删除标准 | ✅ | ❌ |
| 查看标准 | ✅ | ✅ |
| 新增问题点（选择标准类型） | ✅ | ✅ |
| 标准引用到五感体验 | ✅ | ✅ |
