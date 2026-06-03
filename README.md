# 产品体验管理平台

面向体验工程师的本地化产品体验管理平台，覆盖体验计划、素材采集、五感体验、功能效果、问题整改、报告输出和数据分析。当前项目按本地/单机内网部署优先维护：数据库使用本地 PostgreSQL，文件存储默认写入项目指定静态资源目录，保留 S3 兼容对象存储切换能力，AI 接入通过运行环境或应用设置配置。

## 技术栈

| 模块 | 技术 |
| --- | --- |
| Web | Next.js 16 App Router, React 19, TypeScript 5 |
| UI | shadcn/ui, Radix UI, Tailwind CSS 4 |
| 数据库 | PostgreSQL + Drizzle ORM，本地模式通过 Supabase 兼容层复用 API 写法 |
| 文件存储 | 默认 local 模式写入 `public/uploads`；可切换 S3 兼容对象存储（MinIO / AWS S3 / 火山引擎 TOS） |
| AI | 可配置的 Chat Completions 兼容接口 |
| 文档解析 | pdf-parse, xlsx |
| 包管理 | pnpm |

## 本地环境要求

- Node.js 24+
- pnpm 9+
- PostgreSQL 14+
- 可选：Docker，用于启动 PostgreSQL，或在 S3 模式下启动 MinIO

项目默认端口为 `5000`。开发和生产启动都读取 `PORT`，未设置时使用 `5000`。

## 快速启动

1. 安装依赖

```bash
pnpm install
```

2. 创建 `.env.local`

```bash
cp .env.example .env.local
```

然后按本机或服务器环境修改 `.env.local`：

```bash
DATABASE_URL=postgresql://<user>:<password>@<host>:<port>/<database>

# ── 文件存储 ──
# 默认 local 模式：上传文件写入本地目录，通过静态路径访问
STORAGE_DRIVER=local
LOCAL_UPLOAD_DIR=./public/uploads
LOCAL_PUBLIC_BASE_PATH=/uploads
# 云服务器/内网部署时建议配置为平台可访问的完整站点地址
PUBLIC_MEDIA_BASE_URL=http://<host>:5000

# 如需切回 S3/MinIO，将 STORAGE_DRIVER 改为 s3 并取消以下注释
# S3_ENDPOINT=http://<s3-host>:<port>
# S3_REGION=<region>
# S3_BUCKET=<bucket-name>
# S3_ACCESS_KEY=<access-key>
# S3_SECRET_KEY=<secret-key>

PORT=5000
NODE_ENV=development
```

3. 初始化数据库

先创建数据库和用户，再执行根目录的初始化脚本：

```bash
psql -U xp_admin -d xp_experience -f database-schema.sql
```

初始化脚本会创建业务表、索引、默认品类/产品、默认平台设置和初始管理员账号。

4. 准备素材静态目录

```bash
mkdir -p public/uploads
```

本地模式会把上传素材写入 `public/uploads`，数据库仅记录相对对象 key（如 `materials/xxx.jpg`）。`LOCAL_UPLOAD_DIR` 指向文件系统目录，`LOCAL_PUBLIC_BASE_PATH` 是 Web 静态路径前缀，`PUBLIC_MEDIA_BASE_URL` 是平台可访问的完整地址。缺失文件会返回 SVG 占位图而非 404。

Docker 或云服务器部署时必须把 `public/uploads` 目录挂载到持久化 volume，否则重建容器后图片和视频会丢失。

如果使用 S3/MinIO 模式，可启动 MinIO：

```bash
docker run -p 9000:9000 -p 9001:9001 minio/minio server /data --console-address ":9001"
```

启动后在 `http://127.0.0.1:9001` 创建 bucket：`xp-experience-media`，并将 `STORAGE_DRIVER=s3`。

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

AI 服务通过应用内的“AI Agent / Prompt 模板”设置或运行环境进行配置。仓库文档不写入具体敏感连接信息。

管理员可以在设置页新增、切换和测试兼容 Chat Completions 的 AI 配置。敏感字段由后端持久化保存，设置页不会回显原始值；留空保存会沿用已保存值。

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

- `DATABASE_URL` 指向本地 PostgreSQL，提交到仓库前不要写入真实账号和密码。
- 不设置 `NEXT_PUBLIC_SUPABASE_URL` 和 `NEXT_PUBLIC_SUPABASE_ANON_KEY` 时，系统走本地 PostgreSQL 模式。
- local 模式下 `public/uploads` 已创建，并在 Docker/云服务器中挂载为持久化目录。
- S3 模式下 MinIO bucket 已创建，且 `.env.local` 中的 S3 配置一致。
- `pnpm ts-check` 通过。
- `pnpm build` 通过。
- 浏览器访问 `http://localhost:5000`，使用 `bear2026 / bear2026` 登录。
- 在“AI Agent / Prompt 模板”中确认当前启用的 AI 配置可访问。

## 存储模式说明

| 模式 | `STORAGE_DRIVER` | 文件去向 | URL 生成 |
| --- | --- | --- | --- |
| 本地（默认） | `local` | 写入 `LOCAL_UPLOAD_DIR`（默认 `./public/uploads`） | `PUBLIC_MEDIA_BASE_URL` + `LOCAL_PUBLIC_BASE_PATH` + key |
| S3 兼容 | `s3` | 上传到 S3/MinIO bucket | presigned URL（86400 秒有效期） |

- **local 模式**：文件直接写入磁盘，Next.js 通过静态路径提供访问；如需让外部服务读取素材，`PUBLIC_MEDIA_BASE_URL` 需指向平台可访问的地址。
- **S3 模式**：使用 AWS SDK 上传文件到 S3 兼容存储，访问时生成 presigned URL；素材删除调用 `DeleteObjectCommand`。
- **缺失素材兜底**：local 模式下文件不存在时返回 SVG 占位图；presign API 对已缺失的 key 也返回占位图。
- **前端兼容**：`usePresignedUrl` hook 自动识别本地路径（`/uploads/...`）、data URL、完整 HTTP URL，仅对 S3 对象 key 调用 presign 接口。

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
    server/ai.ts                   AI 调用封装
    server/storage.ts              local 静态目录 + S3 兼容存储封装
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

仓库会保留必要的目录骨架，例如 `public/uploads/.gitkeep`，方便 clone 后直接看到静态资源目录。以下运行数据和敏感配置不应提交到仓库：

- `.env.local`
- `.next/`
- `dist/`
- `node_modules/`
- `.codex-logs/`
- `public/uploads/` 中除 `.gitkeep` 之外的实际上传文件
- `*.log`
- `*.tsbuildinfo`

## 关键行为说明

- 标准管理和报告中心是平台共享数据。
- 体验计划和问题管理按 `created_by` 做用户隔离，管理员可查看全部。
- 报告生成会重新汇总五感体验问题和功能效果问题，并自动创建问题记录。
- 自研和改型/降本/优化类型报告会按 `product_model` 做列表和详情合并展示。
- AI Agent 的五感体验预设只使用标准候选上下文；功能效果/食谱预设只使用食谱库上下文，避免两类建议相互污染。
