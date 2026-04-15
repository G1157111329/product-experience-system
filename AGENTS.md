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
- **AI/LLM**: doubao-seed-2-0-lite (coze-coding-dev-sdk)
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
│   │   │   │   └── import/      # 标准批量导入（PDF/Excel）
│   │   │   ├── standard-items/  # 标准检查项 CRUD
│   │   │   │   └── search/      # 标准检查项跨标准搜索（感官/阶段/维度筛选）
│   │   │   ├── tasks/           # 体验任务 CRUD
│   │   │   ├── records/         # 检查记录 CRUD
│   │   │   ├── materials/       # 素材管理（上传/删除/重命名/关联）
│   │   │   ├── issues/          # 问题整改 CRUD
│   │   │   ├── reports/         # 报告生成/CRUD
│   │   │   │   └── export-pdf/  # PDF导出API
│   │   │   ├── recipes/         # 食谱/功能 CRUD
│   │   │   ├── recipe-steps/    # 食谱步骤 CRUD
│   │   │   └── dashboard/       # 仪表盘数据
│   │   ├── layout.tsx           # 根布局（含 Toaster）
│   │   └── page.tsx             # 首页重定向到 /dashboard
│   ├── components/
│   │   ├── navigation.tsx       # 导航组件（桌面侧栏 + 移动端底部/顶部）
│   │   ├── image-preview.tsx    # 共享图片预览组件
│   │   ├── material-picker.tsx  # 素材选择器组件（引用/上传）
│   │   └── ui/                  # Shadcn UI 组件库
│   ├── storage/database/
│   │   ├── supabase-client.ts   # Supabase 客户端
│   │   └── shared/schema.ts     # Drizzle ORM Schema
│   └── lib/utils.ts
├── package.json
└── tsconfig.json
```

## 数据库表结构

| 表名 | 说明 |
|------|------|
| `standards` | 体验标准库（通用/品类专用/感官评价） |
| `standard_items` | 标准检查项 |
| `experience_tasks` | 体验任务 |
| `check_records` | 检查记录（走查） |
| `materials` | 素材（图片/视频，含 AI 预留字段，可关联record或recipe_step） |
| `issues` | 问题整改 |
| `report_templates` | 报告模板 |
| `reports` | 报告 |
| `recipes` | 食谱/功能 |
| `recipe_steps` | 食谱步骤 |

## API 接口

| 方法 | 路径 | 说明 |
|------|------|------|
| GET/POST | `/api/standards` | 标准列表/创建 |
| GET/PUT/DELETE | `/api/standards/[id]` | 标准详情/更新/删除 |
| POST | `/api/standards/import` | 标准批量导入（PDF/Excel，LLM解析） |
| GET/POST | `/api/standard-items` | 检查项列表/创建（支持批量） |
| GET | `/api/standard-items/search` | 跨标准检查项搜索（感官维度/阶段/维度筛选） |
| GET/POST | `/api/tasks` | 任务列表/创建（分页+筛选） |
| GET/PUT/DELETE | `/api/tasks/[id]` | 任务详情（含记录+问题）/更新/删除 |
| GET/POST | `/api/records` | 检查记录列表/创建（支持批量） |
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
9. **标准批量导入**: 支持 PDF（fetch-url提取+LLM结构化解析）和 Excel（xlsx直接解析）格式
10. **标准关联五感体验**: 新增问题点时可从标准库引用检查项，支持按感官维度/体验阶段/检查维度筛选

## 代码风格

- 使用 shadcn/ui 语义化变量（bg-primary, text-muted-foreground 等），禁止硬编码颜色
- 使用 cn() 合并类名
- 所有 API 返回统一结构 `{ code, message, data }`
- React 组件使用 'use client' 标注客户端组件
- 禁止 Hydration 错误：不在 JSX 中使用 typeof window/Date.now() 等
