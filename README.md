# 产品体验管理平台

覆盖体验计划、现场走查、报告输出、数据分析全流程的管理平台。主要面向体验工程师使用，支持移动端操作。

## 技术栈

| 类别 | 技术 |
|------|------|
| 框架 | Next.js 16 (App Router) |
| 语言 | TypeScript 5 |
| UI | React 19 + shadcn/ui (Radix UI) + Tailwind CSS 4 |
| 数据库 | PostgreSQL (Supabase / 自建) |
| 文件存储 | S3 兼容对象存储 (coze-coding-dev-sdk) |
| AI | doubao-seed-2-0-pro-260215 (视觉+文本) |
| 包管理 | pnpm |

---

## 本地部署

### 1. 环境要求

- **Node.js**: 24+ (推荐使用 [nvm](https://github.com/nvm-sh/nvm) 管理)
- **pnpm**: 9+ (`npm install -g pnpm`)
- **PostgreSQL**: 14+ (或使用 Supabase 云服务)
- **Git**: 2.30+

### 2. 克隆项目

```bash
git clone <your-repo-url>
cd <project-directory>
```

### 3. 安装依赖

```bash
pnpm install
```

### 4. 配置环境变量

在项目根目录创建 `.env.local` 文件：

```bash
# ===== 数据库 =====
# 方式一：使用 Supabase 云服务（推荐）
COZE_SUPABASE_URL=https://your-project.supabase.co
COZE_SUPABASE_ANON_KEY=eyJ...your-anon-key
COZE_SUPABASE_SERVICE_ROLE_KEY=eyJ...your-service-role-key

# 方式二：使用自建 PostgreSQL
# 需要修改 src/storage/database/pg-db.ts 中的连接配置
# PGDATABASE_URL=postgresql://user:password@localhost:5432/dbname

# ===== 对象存储 =====
# S3 兼容存储（如火山引擎 TOS、阿里云 OSS、MinIO 等）
COZE_BUCKET_ENDPOINT_URL=https://your-bucket.tos.your-region.volces.com
COZE_BUCKET_NAME=your-bucket-name

# 如果使用非 SDK 内置认证，可能还需要：
# OSS_ACCESS_KEY_ID=your-access-key
# OSS_ACCESS_KEY_SECRET=your-secret-key
# OSS_REGION=your-region
# OSS_ENDPOINT=https://your-endpoint

# ===== AI 模型 =====
# 默认使用豆包内置模型，无需额外配置
# 如需自定义 OpenAI 兼容 API，在平台设置中配置

# ===== 运行时（通常无需修改）=====
# DEPLOY_RUN_PORT=5000
# COZE_PROJECT_ENV=DEV
```

### 5. 初始化数据库

使用项目根目录下的 SQL 脚本初始化数据库结构：

```bash
# 使用 psql（自建 PostgreSQL）
psql -U your_user -d your_db -f database-schema.sql

# 使用 Supabase SQL Editor
# 登录 Supabase Dashboard → SQL Editor → 粘贴 database-schema.sql 内容执行
```

> 该脚本包含：24张数据表、索引、种子数据（品类/产品/管理员账号/默认设置）、RLS策略

**初始管理员账号**：

| 字段 | 值 |
|------|------|
| 账号 | bear2026 |
| 密码 | bear2026 |

> 注册新账号需管理员审核通过后可登录

### 6. 启动开发服务

```bash
# 开发模式（端口 5000，支持 HMR 热更新）
pnpm dev

# 或者使用 tsx watch 直接启动
pnpm tsx watch src/server.ts
```

访问 http://localhost:5000

### 7. 生产构建与部署

```bash
# 构建
pnpm build

# 启动生产环境
PORT=5000 node dist/server.js
```

---

## 项目结构

```
├── src/
│   ├── app/
│   │   ├── (auth)/              # 认证路由组
│   │   │   └── login/           # 登录页（含注册/忘记密码弹窗）
│   │   ├── (main)/              # 主布局路由组（需认证）
│   │   │   ├── dashboard/       # 工作台
│   │   │   ├── standards/       # 标准管理（体验标准 + 食谱库）
│   │   │   ├── tasks/           # 体验计划（五感体验 + 功能效果）
│   │   │   ├── issues/          # 问题管理
│   │   │   ├── reports/         # 报告中心
│   │   │   └── analysis/        # 数据分析
│   │   ├── reports/
│   │   │   ├── print/           # 报告打印/PDF导出
│   │   │   └── share/[token]/   # 报告分享（无需登录）
│   │   └── api/                 # 后端 API 路由
│   │       ├── auth/            # 认证（登录/注册/审核/用户管理）
│   │       ├── standards/       # 标准 CRUD + 批量导入
│   │       ├── standard-items/  # 检查项 CRUD + 搜索
│   │       ├── tasks/           # 任务 CRUD + AI总结 + Agent预设
│   │       ├── records/         # 检查记录 CRUD
│   │       ├── materials/       # 素材管理（上传/签名/关联）
│   │       ├── issues/          # 问题整改 CRUD
│   │       ├── issue-re-evaluations/ # 问题复评估 + AI评价
│   │       ├── reports/         # 报告生成/导出/分享
│   │       ├── recipes/         # 食谱/功能 + AI评价 + AI问题识别
│   │       ├── recipe-steps/    # 食谱步骤
│   │       ├── recipe-library/  # 食谱库
│   │       ├── recipe-library-steps/ # 食谱库步骤
│   │       ├── ai/              # AI技能模板管理
│   │       ├── analysis/        # 数据分析/导出
│   │       ├── dashboard/       # 仪表盘
│   │       └── settings/        # 平台设置
│   ├── components/
│   │   ├── navigation.tsx       # 导航（桌面侧栏 + 移动端Tab）
│   │   ├── image-preview.tsx    # 图片预览
│   │   ├── image-editor-dialog.tsx # 图片编辑（裁剪/旋转/马赛克）
│   │   ├── material-picker.tsx  # 素材选择器
│   │   ├── media-capture-dialog.tsx # 拍照/录像
│   │   ├── presigned-media.tsx  # 预签名媒体组件
│   │   ├── settings/            # 设置组件（AI模型/AI Agent/通用标准选项）
│   │   ├── app/                 # 业务组件（MediaGallery等）
│   │   └── ui/                  # Shadcn UI 组件库
│   ├── storage/database/
│   │   ├── supabase-client.ts   # Supabase 客户端
│   │   ├── pg-db.ts             # PostgreSQL 直连
│   │   └── shared/schema.ts     # Drizzle ORM Schema
│   └── lib/
│       ├── utils.ts             # 工具函数
│       ├── auth-context.tsx     # 认证上下文
│       ├── use-presigned-url.ts # 预签名URL Hook
│       ├── agent-skills.ts      # AI Agent Skill定义
│       └── server/
│           ├── ai.ts            # AI调用（签名URL/Prompt渲染）
│           └── agent-skills.ts  # 服务端Agent Skill读取
├── database-schema.sql          # 数据库初始化SQL
├── scripts/                     # 构建/启动脚本
├── AGENTS.md                    # 项目规范文档
├── DESIGN.md                    # 设计规范
└── package.json
```

---

## 数据库表结构

完整建表 SQL 见 `database-schema.sql`，共 24 张表：

| 表名 | 说明 |
|------|------|
| `platform_users` | 用户账号（admin/user角色） |
| `platform_audit_requests` | 用户审核请求（注册/密码/名称/角色） |
| `platform_categories` | 品类配置 |
| `platform_products` | 产品配置 |
| `platform_settings` | 平台全局设置（AI配置/标准选项） |
| `standards` | 体验标准库 |
| `standard_items` | 标准检查项 |
| `experience_tasks` | 体验任务（含数据隔离created_by） |
| `check_records` | 检查记录（走查） |
| `materials` | 素材（图片/视频，支持多种关联） |
| `issues` | 问题整改（UNIQUE约束去重） |
| `issue_re_evaluations` | 问题复评估 |
| `recipes` | 食谱/功能（含AI效果评价） |
| `recipe_steps` | 食谱步骤 |
| `recipe_library` | 食谱库（全局唯一名称） |
| `recipe_library_steps` | 食谱库步骤 |
| `report_templates` | 报告模板 |
| `reports` | 报告 |
| `report_shares` | 报告分享 |
| `health_check` | 健康检查 |
| `ai_model_configs` | AI模型配置 |
| `agent_skill_templates` | AI Agent Prompt模板 |
| `agent_skill_versions` | AI Agent Prompt版本 |
| `agent_skill_audit_logs` | AI Agent审计日志 |

---

## 权限体系

| 操作 | 管理账号(admin) | 使用账号(user) |
|------|:-:|:-:|
| 新建/编辑/删除/导入标准 | ✅ | ❌ |
| 新增问题点 | ✅ | ✅ |
| 审核账号/角色管理 | ✅ | ❌ |
| 查看所有数据 | ✅ | 仅自己的 |
| 数据分析导出 | ✅ | ❌ |
| 数据分析浏览 | ✅ | ✅ |

---

## 常用命令

```bash
# 安装依赖
pnpm install

# 开发模式（端口 5000）
pnpm dev

# 类型检查
pnpm ts-check

# Lint
pnpm lint

# 生产构建
pnpm build

# 启动生产服务
PORT=5000 node dist/server.js
```

---

## 注意事项

1. **文件存储**：上传的素材存储在 S3 兼容对象存储中，数据库仅存储 S3 Key，前端按需生成预签名URL
2. **AI 模型**：默认使用豆包内置模型，管理员可在设置中切换为自定义 OpenAI 兼容 API
3. **数据隔离**：体验计划和问题管理按 `created_by` 用户隔离，管理账号可查看所有
4. **报告合并**：自研和改型降本优化类型的报告按 `product_model` 自动合并展示
5. **移动端适配**：响应式布局，移动端使用底部Tab导航，支持原生相机拍照
