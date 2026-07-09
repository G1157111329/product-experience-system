# 产品体验管理平台

面向体验工程师的本地化产品体验管理平台，覆盖体验计划、素材采集、五感体验、功能效果、问题整改、报告输出和数据分析。当前项目按本地/单机内网部署优先维护：数据库使用本地 PostgreSQL，**文件存储默认采用 local 模式并写入 `public/uploads`**；如部署环境需要对象存储，可切换到 S3 兼容对象存储（MinIO / AWS S3 / 火山引擎 TOS）。AI 接入通过运行环境或应用设置配置。

## 技术栈

| 模块 | 技术 |
| --- | --- |
| Web | Next.js 15.5.19 App Router, React 19, TypeScript 5 |
| UI | shadcn/ui, Radix UI, Tailwind CSS 4 |
| 数据库 | PostgreSQL + Drizzle ORM，本地模式通过 Supabase 兼容层复用 API 写法 |
| 文件存储 | **默认 local 模式写入 `public/uploads`**；可切换 S3 兼容对象存储（MinIO / AWS S3 / 火山引擎 TOS / Garage）。生产支持 local + S3 **灰度共存**：`STORAGE_DRIVER=local` 保护旧文件，`NEW_UPLOAD_DRIVER=s3` 让新上传走 Garage，读取链路自动双路径 fallback |
| AI | 可配置的 Chat Completions 兼容接口 |
| 文档解析 | pdf-parse, xlsx |
| 包管理 | pnpm |

## 本地环境要求

- Node.js 18.20+
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
# 默认 local 模式：上传文件写入 public/uploads，默认保留 /uploads 静态直连
STORAGE_DRIVER=local
LOCAL_UPLOAD_DIR=./public/uploads
LOCAL_PUBLIC_BASE_PATH=/uploads
LOCAL_PROTECTED_BASE_PATH=/api/materials/file
LOCAL_UPLOAD_PUBLIC_ACCESS=public
LOCAL_UPLOAD_PUBLIC_ACCESS_ACCEPTED=
# 云服务器/内网部署时建议配置为平台可访问的完整站点地址
PUBLIC_MEDIA_BASE_URL=http://<host>:5000

# 灰度共存（可选）：STORAGE_DRIVER 保持 local 保护旧文件，
# 同时让「新上传」走 S3。读取链路会自动 local-then-S3 双路径 fallback。
# 不设置 NEW_UPLOAD_DRIVER 时默认跟随 STORAGE_DRIVER。
# NEW_UPLOAD_DRIVER=s3
# S3_ENDPOINT=http://127.0.0.1:3900   # Garage 默认端口
# S3_REGION=garage
# S3_BUCKET=xp-experience-media
# S3_ACCESS_KEY=<access-key>
# S3_SECRET_KEY=<secret-key>

# 如需整体切到 S3/MinIO（一刀切，无 local 兜底），将 STORAGE_DRIVER 改为 s3 并配置 S3_*
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
psql "postgresql://xp_user:xp_password_local_only@127.0.0.1:5433/xp_experience" -f database-schema.sql
```

初始化脚本会创建业务表、索引、默认品类/产品、默认平台设置、安全审计表和共享限速表。初始管理员不由 SQL 固定写入，也不再使用硬编码默认凭证自动创建；本地或生产首次引导管理员时，都应显式配置 `INITIAL_ADMIN_ACCOUNT` 和 `INITIAL_ADMIN_PASSWORD`，初始化后移除相关环境变量。

4. 准备素材静态目录

```bash
mkdir -p public/uploads
```

本地模式会把上传素材写入 `public/uploads`，数据库仅记录相对对象 key（如 `materials/xxx.jpg`）。`LOCAL_UPLOAD_DIR` 指向文件系统目录，`LOCAL_PUBLIC_BASE_PATH` 是默认静态访问前缀，默认业务访问保留 `/uploads/<key>` 稳定 URL；如显式设置 `LOCAL_UPLOAD_PUBLIC_ACCESS=protected`，才会改由 `LOCAL_PROTECTED_BASE_PATH=/api/materials/file` 签名接口提供短期访问。`PUBLIC_MEDIA_BASE_URL` 是平台可访问的完整地址。缺失文件会返回 SVG 占位图而非 404。

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

系统不再内置硬编码默认管理员。首次初始化管理员请在 `.env.local` 中临时配置：

```bash
INITIAL_ADMIN_ACCOUNT=<account>
INITIAL_ADMIN_PASSWORD=<strong-password>
```

密码必须至少 10 位，并同时包含字母和数字，不能使用 `bear2026` 等弱口令。首次登录会按该配置创建管理员；创建完成后请移除这两个环境变量。注册新账号后需要管理员审核通过才能登录。

## AI 配置

AI 服务通过应用内的“AI Agent / Prompt 模板”设置或运行环境进行配置。仓库文档不写入具体敏感连接信息。

管理员可以在设置页新增、切换和测试兼容 Chat Completions 的 AI 配置。敏感字段由后端持久化保存，设置页不会回显原始值；留空保存会沿用已保存值。

内网部署和公网部署都可以使用内网 AI 网关、本机模型服务或 HTTP 内网地址；系统不会默认拦截内网 AI 地址。推荐在 `.env.local` 中标记部署网络，方便运维识别：

```bash
DEPLOYMENT_NETWORK=intranet
AI_ALLOW_PRIVATE_ENDPOINTS=true
```

`DEPLOYMENT_NETWORK` 和 `AI_ALLOW_PRIVATE_ENDPOINTS` 用于表达部署口径和运维意图；实际限制 AI 外联范围时，应显式配置 `AI_ALLOWED_HOSTS=10.0.0.10,ai-gateway.internal`。配置后，只有白名单中的主机可被调用。

## 常用命令

| 命令 | 说明 |
| --- | --- |
| `pnpm dev` | 启动本地开发服务，默认 `http://localhost:5000` |
| `pnpm ts-check` | TypeScript 类型检查 |
| `pnpm lint` | ESLint 检查 |
| `pnpm build` | 构建 Next.js 和自定义 Node server |
| `pnpm clean:next` | 清理 `.next` 缓存；从 `pnpm build` 切回 `pnpm dev` 前建议执行 |
| `pnpm start` | 启动 `dist/server.js` 生产服务 |

`pnpm dev` 仅用于本地开发。手机端或验收环境如果出现左下角黑色 Next.js “N” 浮层，说明当前访问的是开发模式指示器；生产/验收环境必须使用 `pnpm build` 后的 `pnpm start` 启动。项目已在 `next.config.mjs` 设置 `devIndicators: false`，用于隐藏开发期指示器，但不能替代生产构建。

生产启动示例：

```bash
pnpm build
NODE_ENV=production PORT=5000 pnpm start
```

## 服务器生产部署建议流程

实际服务器上线不要求使用 Docker。推荐使用 Node.js + PostgreSQL + 反向代理部署，Docker 仅作为本地测试模拟环境。

1. 安装 Node.js 18.20+、pnpm 9+、PostgreSQL 14+。
2. 拉取代码并执行 `pnpm install --frozen-lockfile`。
3. 创建并保护 `.env.local`，按生产环境配置 `NODE_ENV=production`、`PORT=5000`、`DATABASE_ACCESS_MODE`、`DATABASE_URL`、`AUTH_SESSION_SECRET`、`AI_CONFIG_ENCRYPTION_KEY`、存储模式和 AI 配置。
4. 在目标数据库执行 `database-schema.sql` 和 `scripts/verify-security-schema.sql`，留存执行结果。
5. 验证通过后设置 `SECURITY_SCHEMA_VERIFIED=true`。
6. 执行 `pnpm ts-check`、`pnpm build`、`pnpm audit --audit-level moderate --registry https://registry.npmjs.org`。
   - **低内存服务器（≤2G RAM）构建必读**：`next build` 会因 OOM 失败。构建前临时加 swap：`sudo fallocate -l 4G /swap-build.img && sudo chmod 600 /swap-build.img && sudo mkswap /swap-build.img && sudo swapon /swap-build.img`，构建完成后再 `sudo swapoff /swap-build.img && sudo rm /swap-build.img`。
   - **构建需要 DATABASE_URL**：Next.js 的 page-data 收集阶段会连库，需把运行时 env（DATABASE_URL、AUTH_SESSION_SECRET、AI_CONFIG_ENCRYPTION_KEY、SECURITY_SCHEMA_VERIFIED 等）source 进构建环境。
7. 使用 PM2、systemd 或同类进程管理器执行 `pnpm start`，并由 Nginx/Caddy 等反向代理提供 HTTPS。
   - PM2 推荐用 `ecosystem.config.cjs` 管理进程，所有 env 写在 `env: {}` 块；重启用 `pm2 delete <name> && pm2 start ecosystem.config.cjs && pm2 save`。
8. 将 `public/uploads` 挂载到持久化磁盘目录；使用 S3 模式时确认 bucket、访问密钥和生命周期策略。
   - **灰度共存（推荐）**：保持 `STORAGE_DRIVER=local`，加 `NEW_UPLOAD_DRIVER=s3` + S3_* env，旧文件零迁移、新上传走 S3。详见 `docs/operations/2026-07-06-object-storage-gray-release.md`。
9. 部署数据矩阵特性需额外执行矩阵迁移（已登记进 drizzle journal）：
   - `psql "$DATABASE_URL" -f src/storage/database/shared/migrations/0002_matrix_input_tables.sql`（V1 schema 注册表 5 张表 + comparison_assemblies/metric_evaluations 扩展列）
   - `psql "$DATABASE_URL" -f src/storage/database/shared/migrations/0003_task_matrix_model.sql`（**V2 用户自设计模型 8 张表，当前 UI 实际使用，必须执行**）
   - `pnpm seed:matrix-schema`（仅 V1 黄金样本，V2 模型不需要）
10. 完成登录、素材上传、报告生成、分享、导出和审计日志查询回归。

### 当前生产实例备注

截至 2026-06-29，当前生产实例部署在 `118.25.178.78`，应用目录为 `/home/ubuntu/product-experience-system`，由 PM2 进程 `product-experience-system` 管理。外部访问入口为 `http://118.25.178.78:5000`；当前 Node 应用进程监听 `PORT=5001`，由服务器本机的 5000 入口转发访问。生产环境变量以 PM2 当前进程环境为准，不依赖仓库中的 `.env.local`。

本次 V3.1.1/Wave 1 增量部署已验证：

- `pnpm ts-check` 和 `pnpm build` 在本地通过。
- 生产 PM2 进程重启后在线。
- `http://127.0.0.1:5001/login`、`/reports`、`/dashboard` 返回 200。
- `http://127.0.0.1:5001/api/v1/dictionaries/project_phase_dict` 返回 200，且字典值为正常中文。
- `project_phase_dict`、`issue_status_dict`、`task_status_dict`、`report_status_dict`、`issue_severity_dict`、`sla_policy_dict`、`report_view_configs`、`report_outline_sections`、`report_action_items`、`ai_runs`、`outbox_events` 等 V3/Wave1 表已存在。
- 生产库当前 `reports` 为 0 条，因此 `report_outline_sections` 和 `report_action_items` 回填为 0 条属于正常结果。

部署注意：

- 远端非交互 shell 中优先使用 `npx pnpm@9.0.0 ...`，避免 `pnpm` 不在 PATH。
- 生产构建必须有 `.next/BUILD_ID` 和 `dist/server.js`。如果远端 `next build` 长时间卡住，不要重启 PM2 到缺失 `.next/BUILD_ID` 的目录；可先在本地完成 `pnpm build`，再上传 `.next` 运行产物和 `dist/server.js` 做恢复。
- 每次替换运行产物前保留 `/home/ubuntu/deploy-backups/` 下的回滚包，并完成 `curl` 健康检查后再声明部署完成。

## Docker 本地测试模拟环境

Docker 仅用于本地模拟生产运行环境，方便验证构建、PostgreSQL 初始化、持久化上传目录和生产环境变量门禁。实际服务器上线仍可继续使用现有的 Node.js + PostgreSQL + 反向代理部署方式，不要求改成 Docker。

启动本地 Docker 环境：

```bash
docker compose -f docker-compose.local.yml up --build
```

访问：

```text
http://localhost:5000
```

默认 Docker 本地管理员：

| 账号 | 密码 |
| --- | --- |
| `dockeradmin` | `DockerLocal2026` |

如需自定义 Docker 本地管理员，可在启动前设置：

```powershell
$env:LOCAL_DOCKER_ADMIN_ACCOUNT="<account>"
$env:LOCAL_DOCKER_ADMIN_PASSWORD="<strong-password>"
docker compose -f docker-compose.local.yml up --build
```

Docker 本地环境说明：

- 应用容器使用生产构建产物运行，端口映射为 `5000:5000`。
- PostgreSQL 容器使用 `postgres:16-alpine`，宿主机调试端口为 `5433`。
- 首次初始化数据库时会执行 `database-schema.sql` 和 `scripts/verify-security-schema.sql`。
- 素材目录挂载到 Docker volume：`product_experience_uploads`，容器重建不会丢失上传文件。
- local 存储默认保留 `/uploads/*` 静态直连，避免报告长期查看时裂图。
- Docker 本地环境通过 `AUTH_COOKIE_SECURE=false` 兼容 `http://localhost:5000` 登录测试；正式 HTTPS 生产环境不要设置该值。

停止环境：

```bash
docker compose -f docker-compose.local.yml down
```

如需清空 Docker 本地测试数据库和上传文件，可删除 volume：

```bash
docker compose -f docker-compose.local.yml down -v
```

`down -v` 只用于本地 Docker 测试环境，会删除 Docker volume 中的测试数据。

## 本地部署检查清单

- `DATABASE_URL` 指向本地 PostgreSQL，提交到仓库前不要写入真实账号和密码。
- 不设置 `NEXT_PUBLIC_SUPABASE_URL` 和 `NEXT_PUBLIC_SUPABASE_ANON_KEY` 时，系统走本地 PostgreSQL 模式。
- 生产环境必须显式设置 `DATABASE_ACCESS_MODE`；自建 PostgreSQL 使用 `self-hosted-postgres`。
- local 模式下 `public/uploads` 已创建，并在 Docker/云服务器中挂载为持久化目录。
- S3 模式下 MinIO bucket 已创建，且 `.env.local` 中的 S3 配置一致。
- `pnpm ts-check` 通过。
- `pnpm build` 通过。
- 手机端访问验收/生产地址时，左下角不应出现黑色 Next.js “N” 浮层；如出现，优先检查是否误用 `pnpm dev` 或未以 `NODE_ENV=production pnpm start` 运行生产构建。
- 生产发布前使用官方 npm registry 执行依赖审计：`pnpm audit --audit-level moderate --registry https://registry.npmjs.org`。
- 本地开发访问 `http://localhost:5000`；首次管理员需通过 `INITIAL_ADMIN_ACCOUNT` 和 `INITIAL_ADMIN_PASSWORD` 显式引导创建，或使用数据库中已有的已审核管理员账号。
- 在“AI Agent / Prompt 模板”中确认当前启用的 AI 配置可访问。

## 存储模式说明

默认文件存储模式是 **local**：上传文件写入 `public/uploads`，数据库仅保存相对对象 key。S3 兼容对象存储是可选切换模式，适用于需要 MinIO、AWS S3、Garage、火山引擎 TOS 等统一对象存储的部署环境。

| 模式 | `STORAGE_DRIVER` | 文件去向 | URL 生成 |
| --- | --- | --- | --- |
| 本地（默认） | `local` | 写入 `LOCAL_UPLOAD_DIR`（默认 `./public/uploads`） | 默认 `/uploads/<key>` 稳定静态 URL；显式加固时可切换为 `/api/materials/file/<key>` 短期签名 URL |
| S3 兼容 | `s3` | 上传到 S3/MinIO/Garage bucket | presigned URL（86400 秒有效期） |
| **灰度共存（生产已上线）** | `local` + `NEW_UPLOAD_DRIVER=s3` | 新上传走 S3，旧文件留 local | 读取时先 stat 本地，存在走 local，不存在 fallback S3 presigned URL |

- **local 模式**：文件直接写入磁盘，Next.js 通过静态路径提供访问；如需让外部服务读取素材，`PUBLIC_MEDIA_BASE_URL` 需指向平台可访问的地址。
- **S3 模式**：使用 AWS SDK 上传文件到 S3 兼容存储，访问时生成 presigned URL；素材删除调用 `DeleteObjectCommand`。
- **灰度共存模式**：`STORAGE_DRIVER=local` 不变（保护旧文件静态路径），`NEW_UPLOAD_DRIVER=s3` 让新上传走 S3。读取链路自动双路径 fallback，无需迁移旧文件。当前生产用 Garage 单节点（`127.0.0.1:3900`，仅本机绑定），运维细节见 `docs/operations/2026-07-06-object-storage-gray-release.md`。
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

## 安全固化部署说明

### 生产启动门禁

生产环境启动时会执行安全配置检查。以下变量缺失或不合规时，服务会直接启动失败：

- `AUTH_SESSION_SECRET`：生产会话签名密钥。
- `AI_CONFIG_ENCRYPTION_KEY`：AI API Key 加密密钥，生产环境必须独立配置。
- `SECURITY_SCHEMA_VERIFIED=true`：仅在目标数据库已执行 `database-schema.sql`，并保存 `scripts/verify-security-schema.sql` 成功结果后设置。
- `DATABASE_ACCESS_MODE`：必须明确为 `self-hosted-postgres` 或 `supabase-service-role`。

### 数据库访问模式

- `DATABASE_ACCESS_MODE=self-hosted-postgres`：服务端只使用 `DATABASE_URL` 连接自建 PostgreSQL；生产环境不允许同时暴露 `NEXT_PUBLIC_SUPABASE_URL` 或 `NEXT_PUBLIC_SUPABASE_ANON_KEY`。
- `DATABASE_ACCESS_MODE=supabase-service-role`：服务端使用 `NEXT_PUBLIC_SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`；生产环境要求 Supabase URL 为 HTTPS，且 service role key 不得复用 anon key。

上线前必须在目标库执行并留存：

```bash
psql "$DATABASE_URL" -f database-schema.sql
psql "$DATABASE_URL" -f scripts/verify-security-schema.sql
```

验证通过后再设置：

```bash
SECURITY_SCHEMA_VERIFIED=true
```

### Nginx 反向代理与静态文件优化

生产环境建议使用 Nginx/Caddy 反向代理。默认情况下 Node.js 通过 `fs.createReadStream` 直接发送 `/uploads/*` 下的静态文件，在大文件和高并发场景下会占用 Node 进程 I/O。

设置 `NGINX_UPLOADS_INTERNAL` 后，Node.js 改为返回 `X-Accel-Redirect` 头，由 Nginx 直接用 sendfile 发送文件体，Node 进程立即释放：

```bash
NGINX_UPLOADS_INTERNAL=/internal-uploads
```

对应 Nginx 配置片段：

```nginx
server {
    listen 80;
    server_name your-domain.com;
    charset utf-8;                         # 支持中文文件名

    location / {
        proxy_pass http://127.0.0.1:5000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location /internal-uploads/ {
        internal;                          # 仅接受 X-Accel-Redirect 内部请求
        alias /app/public/uploads/;        # 对应 LOCAL_UPLOAD_DIR
    }
}
```

该机制同时作用于：
- `server.ts` 中的公共 `/uploads/*` 静态文件服务
- `/api/materials/file/[...key]` 受保护签名 URL 文件服务

不设置 `NGINX_UPLOADS_INTERNAL` 时行为完全不变，向后兼容。

### local 文件存储与访问控制

文件存储模式仍然默认是 local，上传文件仍写入 `public/uploads`，不改变本地或内网部署方式。为保证历史报告、导出页面、分享页面和长期留存材料不裂图，默认保留 `/uploads/*` 静态直连：

```bash
LOCAL_UPLOAD_PUBLIC_ACCESS=public
```

在更高安全要求环境中，可以显式切换为受保护访问：

```bash
LOCAL_UPLOAD_PUBLIC_ACCESS=protected
LOCAL_MEDIA_SIGNING_SECRET=<long-random-local-media-signing-secret>
```

开启 protected 后，业务页面通过 `/api/materials/presign` 获取短期签名 URL，local 模式下签名 URL 指向 `/api/materials/file/<key>?exp=...&token=...`，并由 `/api/materials/file` 校验签名或当前登录用户的素材所属任务访问权；生产环境才会拦截 `/uploads/*` 直连。

该开关只影响访问路径，不影响上传写入路径。上传仍写入 `public/uploads`，S3 兼容对象存储仍通过 `STORAGE_DRIVER=s3` 单独切换。

### AI 内网地址

系统不会默认拦截内网、本机或 HTTP AI 服务地址，便于本地调试和内网优先部署。需要收紧出网范围时，配置 `AI_ALLOWED_HOSTS` 并配合网络出口 ACL。

## 关键行为说明

- 标准管理和报告中心是平台共享数据。
- 体验计划和问题管理按 `created_by` 做用户隔离，管理员可查看全部。
- 报告生成会重新汇总五感体验问题和功能效果问题，并自动创建问题记录。
- 前期研究、自研和改型/降本/优化类型报告会按 `product_model` 做列表、详情、打印页和分享页合并展示。
- AI Agent 的五感体验预设只使用标准候选上下文；功能效果/食谱预设只使用食谱库上下文，避免两类建议相互污染。
- 任务详情录入目录当前为一级入口：AI方案 / 对比矩阵 / 数据矩阵 / 五感体验 / 功能效果 / 总结。数据矩阵入口始终并列展示，进入后先显示矩阵列表卡片，再进入具体矩阵录入网格。
- 对比矩阵的大类、条目、小结按 `comparison_item_nodes.parent_id + sort_order` 维护层级顺序；在某个大类内新增条目时插入该大类小结之前，新增小结时追加到该大类末尾且仍位于下一大类之前，避免“大类小结”在报告矩阵中漂移或丢失。
- 数据矩阵是任务详情页的可选 Tab（与五感体验、功能效果、对比矩阵并列）。当前运行的是 **V2 用户自设计模型**：用户在任务内自建矩阵 → 5 步设计器（基础结构 / 字段分区 / 字段与证据 / 公式与问题规则 / 预览确认）→ 确认后进入录入（桌面端表格 grid、移动端分组卡片）。矩阵结构、字段、公式全部由本次任务自行设计，不依赖平台预设 schema。数据存独立表族（`task_matrices` 等，迁移 `0003_task_matrix_model.sql`）。仓库另保留 V1 schema-driven 模型代码（管理员发布模式 → 任务应用），预留给后续「可复用设计库」使用，当前 UI 不调用。功能开关在 `platform_settings.feature_flag_task_matrix`，默认全开。
- 数据矩阵行级证据复用素材表，`/api/comparison-cells/[id]/media` 同时兼容既有对比矩阵 cell id 和 V2 `matrix_rows.id`；报告中心矩阵 Tab、报告详情模型、分享页和 PDF 导出都会读取 `evidence.media` 并在服务端导出前 presign，防止图片/视频在报告和 PDF 中裂图。
