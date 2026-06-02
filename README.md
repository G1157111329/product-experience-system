# 产品体验管理平台

面向体验工程师的本地化产品体验管理平台，覆盖体验计划、素材采集、五感体验、功能效果、问题整改、报告输出和数据分析。当前项目按本地部署优先维护：数据库使用本地 PostgreSQL，文件存储使用 S3 兼容服务，AI 使用 OpenAI 兼容接口。

## 技术栈

| 模块 | 技术 |
| --- | --- |
| Web | Next.js 16 App Router, React 19, TypeScript 5 |
| UI | shadcn/ui, Radix UI, Tailwind CSS 4 |
| 数据库 | PostgreSQL + Drizzle ORM，本地模式通过 Supabase 兼容层复用 API 写法 |
| 文件存储 | S3 兼容对象存储，推荐本地 MinIO |
| AI | OpenAI 兼容 Chat Completions API，默认 Bear-Model-VL |
| 文档解析 | pdf-parse, xlsx |
| 包管理 | pnpm |

## 本地环境要求

- Node.js 24+
- pnpm 9+
- PostgreSQL 14+
- 可选：Docker，用于启动 MinIO 或 PostgreSQL

项目默认端口为 `5000`。开发和生产启动都读取 `PORT`，未设置时使用 `5000`。

## 快速启动

1. 安装依赖

```bash
pnpm install
```

2. 创建 `.env.local`

```bash
DATABASE_URL=postgresql://xp_admin:password@127.0.0.1:5432/xp_experience

S3_ENDPOINT=http://127.0.0.1:9000
S3_REGION=us-east-1
S3_BUCKET=xp-experience-media
S3_ACCESS_KEY=minioadmin
S3_SECRET_KEY=minioadmin

PORT=5000
NODE_ENV=development
```

3. 初始化数据库

先创建数据库和用户，再执行根目录的初始化脚本：

```bash
psql -U xp_admin -d xp_experience -f database-schema.sql
```

初始化脚本会创建业务表、索引、默认品类/产品、默认平台设置和初始管理员账号。

4. 启动 MinIO

```bash
docker run -p 9000:9000 -p 9001:9001 minio/minio server /data --console-address ":9001"
```

启动后在 `http://127.0.0.1:9001` 创建 bucket：`xp-experience-media`。

5. 启动开发服务

```bash
pnpm dev
```

访问 `http://localhost:5000`。

## 初始账号

| 角色 | 账号 | 密码 |
| --- | --- | --- |
| 管理员 | `bear2026` | `bear2026` |

注册新账号后需要管理员审核通过才能登录。

## AI 配置

默认模型配置：

| 字段 | 默认值 |
| --- | --- |
| API 地址 | `http://ds.bears.com.cn:8000/v1/chat/completions` |
| 模型 | `Bear-Model-VL` |
| API Key | `local` |

管理员可以在应用内的“AI Agent / Prompt 模板”设置中新增或切换 OpenAI 兼容模型。API Key 存储在 `ai_model_configs.custom_api_key_encrypted` 字段；设置页不会回显原始 Key，留空保存会沿用已保存 Key。

## 常用命令

| 命令 | 说明 |
| --- | --- |
| `pnpm dev` | 启动本地开发服务，默认 `http://localhost:5000` |
| `pnpm ts-check` | TypeScript 类型检查 |
| `pnpm lint` | ESLint 检查 |
| `pnpm build` | 构建 Next.js 和自定义 Node server |
| `pnpm start` | 启动 `dist/server.js` 生产服务 |

生产启动示例：

```bash
pnpm build
PORT=5000 pnpm start
```

## 本地部署检查清单

- `DATABASE_URL` 指向本地 PostgreSQL。
- 不设置 `NEXT_PUBLIC_SUPABASE_URL` 和 `NEXT_PUBLIC_SUPABASE_ANON_KEY` 时，系统走本地 PostgreSQL 模式。
- MinIO bucket 已创建，且 `.env.local` 中的 S3 配置一致。
- `pnpm ts-check` 通过。
- `pnpm build` 通过。
- 浏览器访问 `http://localhost:5000`，使用 `bear2026 / bear2026` 登录。
- 在“AI Agent / Prompt 模板”中确认当前启用模型可访问。

## 主要目录

```text
src/
  app/
    (auth)/login/                  登录页
    (main)/dashboard/              工作台
    (main)/standards/              标准管理：体验标准、食谱库
    (main)/tasks/                  体验计划：素材、五感体验、功能效果
    (main)/issues/                 问题管理
    (main)/reports/                报告中心
    (main)/analysis/               数据分析
    reports/print/                 报告打印和 PDF 导出页面
    reports/share/[token]/         报告公开分享页
    api/                           后端 API 路由
  components/                      通用组件和设置组件
  lib/
    server/ai.ts                   OpenAI 兼容 AI 调用
    server/storage.ts              S3 兼容存储封装
    agent-skills.ts                Agent Skill 默认定义
  storage/database/
    supabase-client.ts             云/本地双模式入口
    pg-query.ts                    本地 PostgreSQL 的 Supabase 兼容查询层
    pg-db.ts                       Drizzle PostgreSQL 连接
    shared/schema.ts               Drizzle schema
scripts/                           辅助脚本
database-schema.sql                 本地数据库初始化 SQL
```

## 日志和临时文件

运行和调试日志统一放在 `.codex-logs/` 下。历史散落在根目录的日志已归档到 `.codex-logs/root-archive/`。

以下内容不应提交到仓库：

- `.env.local`
- `.next/`
- `dist/`
- `node_modules/`
- `.codex-logs/`
- `*.log`
- `*.tsbuildinfo`

## 关键行为说明

- 标准管理和报告中心是平台共享数据。
- 体验计划和问题管理按 `created_by` 做用户隔离，管理员可查看全部。
- 报告生成会重新汇总五感体验问题和功能效果问题，并自动创建问题记录。
- 自研和改型/降本/优化类型报告会按 `product_model` 做列表和详情合并展示。
- AI Agent 的五感体验预设只使用标准候选上下文；功能效果/食谱预设只使用食谱库上下文，避免两类建议相互污染。
