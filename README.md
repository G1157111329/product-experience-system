# 产品体验管理平台 — 部署指南

覆盖体验计划、现场走查、报告输出、数据分析全流程的产品体验管理系统。面向体验工程师，支持移动端操作。

---

## 目录

- [1. 系统架构概览](#1-系统架构概览)
- [2. 所需环境与工具](#2-所需环境与工具)
- [3. 外部服务准备](#3-外部服务准备)
  - [3.1 Supabase (PostgreSQL)](#31-supabase-postgresql)
  - [3.2 S3 兼容对象存储](#32-s3-兼容对象存储)
  - [3.3 大语言模型 (LLM)](#33-大语言模型-llm)
- [4. 数据库初始化](#4-数据库初始化)
- [5. 环境变量配置](#5-环境变量配置)
- [6. 项目部署](#6-项目部署)
  - [6.1 获取源码](#61-获取源码)
  - [6.2 安装依赖](#62-安装依赖)
  - [6.3 构建生产版本](#63-构建生产版本)
  - [6.4 启动服务](#64-启动服务)
  - [6.5 使用 PM2 守护进程 (推荐)](#65-使用-pm2-守护进程-推荐)
  - [6.6 Nginx 反向代理配置](#66-nginx-反向代理配置)
- [7. Docker 部署 (可选)](#7-docker-部署-可选)
- [8. 初始管理员账号](#8-初始管理员账号)
- [9. 功能模块说明](#9-功能模块说明)
- [10. 数据库表结构参考](#10-数据库表结构参考)
- [11. API 接口清单](#11-api-接口清单)
- [12. 常见问题排查](#12-常见问题排查)

---

## 1. 系统架构概览

```
┌─────────────────────────────────────────────────────────────────┐
│                        用户浏览器                                │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐        │
│  │  工作台   │  │ 标准管理  │  │ 体验计划  │  │ 数据分析  │ ...   │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └────┬─────┘        │
└───────┼──────────────┼──────────────┼──────────────┼─────────────┘
        │              │              │              │
        ▼              ▼              ▼              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Next.js 16 (App Router)                       │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │                   前端页面 (React 19)                       │  │
│  │  shadcn/ui + Tailwind CSS 4 + TypeScript 5                 │  │
│  └──────────────────────┬─────────────────────────────────────┘  │
│  ┌──────────────────────┴─────────────────────────────────────┐  │
│  │                  后端 API Routes (/api/*)                   │  │
│  │  认证 · 标准 · 任务 · 记录 · 素材 · 问题 · 报告 · 分析     │  │
│  └──┬──────────┬──────────┬──────────┬────────────────────────┘  │
│     │          │          │          │                            │
└─────┼──────────┼──────────┼──────────┼────────────────────────────┘
      │          │          │          │
      ▼          ▼          ▼          ▼
┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐
│ Supabase │ │   S3     │ │   LLM    │ │ FetchURL │
│PostgreSQL│ │ 对象存储  │ │ 大模型   │ │  文档解析 │
└──────────┘ └──────────┘ └──────────┘ └──────────┘
```

**核心依赖关系**：

| 组件 | 用途 | 是否必须 |
|------|------|:--------:|
| Supabase PostgreSQL | 业务数据存储 | 是 |
| S3 兼容对象存储 | 图片/视频素材存储 | 是 |
| LLM 大模型 | 标准批量导入 (PDF/Excel 解析) | 否 (不使用导入功能可省略) |
| FetchURL 服务 | PDF 文档内容提取 | 否 (同上，与 LLM 配合使用) |

---

## 2. 所需环境与工具

### 服务器最低配置

| 项目 | 要求 |
|------|------|
| CPU | 2 核+ |
| 内存 | 4 GB+ (构建时需 2 GB+) |
| 磁盘 | 20 GB+ (含 Node.js + 项目依赖) |
| 操作系统 | Ubuntu 20.04+ / CentOS 8+ / Debian 11+ |
| 网络 | 可访问 Supabase / S3 / LLM 服务端点 |

### 必须软件

| 软件 | 版本要求 | 安装方式 |
|------|----------|----------|
| **Node.js** | 20.x+ (推荐 22.x) | `curl -fsSL https://deb.nodesource.com/setup_22.x \| sudo -E bash -` && `sudo apt install -y nodejs` |
| **pnpm** | 9.x+ | `npm install -g pnpm` |
| **PostgreSQL 客户端** | 14+ (仅远程 Supabase 不需要) | `sudo apt install -y postgresql-client` |

### 可选软件

| 软件 | 用途 | 安装方式 |
|------|------|----------|
| **PM2** | 进程守护与自动重启 | `npm install -g pm2` |
| **Nginx** | 反向代理 / HTTPS / 静态资源缓存 | `sudo apt install -y nginx` |
| **Docker** | 容器化部署 | 见 [Docker 部署](#7-docker-部署-可选) |
| **Git** | 源码拉取 | `sudo apt install -y git` |

---

## 3. 外部服务准备

### 3.1 Supabase (PostgreSQL)

本系统使用 [Supabase](https://supabase.com) 作为 PostgreSQL 数据库服务，也可以使用任何兼容 PostgreSQL 14+ 的数据库。

#### 方案 A: 使用 Supabase 云服务 (推荐)

1. 访问 [https://supabase.com](https://supabase.com) 注册账号
2. 创建新项目，选择离用户最近的区域
3. 进入项目 Settings → API，获取以下信息：
   - **Project URL** (`https://xxxx.supabase.co`)
   - **anon public key** (`eyJhbGci...`)
   - **service_role key** (`eyJhbGci...`) — 仅服务端使用，勿泄露
4. 进入 SQL Editor，执行 [第 4 节](#4-数据库初始化) 的建表 SQL

#### 方案 B: 自建 PostgreSQL

1. 安装 PostgreSQL 14+
   ```bash
   sudo apt install -y postgresql postgresql-contrib
   sudo systemctl enable postgresql
   sudo systemctl start postgresql
   ```
2. 创建数据库和用户
   ```bash
   sudo -u postgres psql
   CREATE USER xp_admin WITH PASSWORD 'your_secure_password';
   CREATE DATABASE xp_experience OWNER xp_admin;
   GRANT ALL PRIVILEGES ON DATABASE xp_experience TO xp_admin;
   ```
3. 如使用自建 PostgreSQL，需自行部署 Supabase 的 PostgREST API 或修改代码使用直连模式
4. 执行 [第 4 节](#4-数据库初始化) 的建表 SQL

> **注意**: 本项目当前使用 Supabase JS Client (`@supabase/supabase-js`) 连接数据库。如使用自建 PostgreSQL，需额外部署 PostgREST 或将代码改为使用 `pg` / `drizzle-orm` 直连。推荐直接使用 Supabase 云服务以降低部署复杂度。

### 3.2 S3 兼容对象存储

用于存储用户上传的图片和视频素材。支持任何 S3 兼容的对象存储服务。

#### 推荐服务商

| 服务商 | 说明 | Endpoint 示例 |
|--------|------|---------------|
| AWS S3 | 国际通用 | `https://s3.amazonaws.com` |
| 阿里云 OSS | 国内推荐 | `https://oss-cn-beijing.aliyuncs.com` |
| 腾讯云 COS | 国内备选 | `https://cos.ap-beijing.myqcloud.com` |
| MinIO | 自建私有 | `http://your-server:9000` |

#### 配置步骤

1. 创建一个 Bucket（如 `xp-experience-materials`）
2. 创建 Access Key 和 Secret Key（需要读写权限）
3. 设置 Bucket 的 CORS 策略，允许前端直接上传：
   ```json
   {
     "AllowedOrigins": ["https://your-domain.com"],
     "AllowedMethods": ["GET", "PUT", "POST", "DELETE"],
     "AllowedHeaders": ["*"],
     "ExposeHeaders": ["ETag"]
   }
   ```
4. 设置 Bucket 的访问策略（推荐: 私有 Bucket + 预签名 URL）

> **注意**: 当前代码中 `accessKey` 和 `secretKey` 通过 `coze-coding-dev-sdk` 的 S3Storage 自动从运行环境获取。如独立部署，需在环境变量中配置或修改代码中的 S3 初始化逻辑。

### 3.3 大语言模型 (LLM)

标准批量导入功能使用 LLM 将 PDF/Excel 文档中的非结构化文本解析为标准检查项。该功能通过 `coze-coding-dev-sdk` 的 `LLMClient` 调用豆包系列模型。

- **导入标准时使用**: `doubao-seed-2-0-pro-260215` (高精度)
- **其他场景预留**: `doubao-seed-2-0-lite-260215` (轻量级)

> **注意**: LLM 功能为可选依赖。如不使用"标准批量导入"功能，可以不配置 LLM。`coze-coding-dev-sdk` 的 LLMClient 会自动从运行环境获取认证信息，独立部署时需配置对应的认证环境变量或替换为 OpenAI 兼容接口。

---

## 4. 数据库初始化

在 Supabase SQL Editor 或 PostgreSQL 客户端中，按顺序执行以下 SQL：

### 4.1 创建业务表

```sql
-- ============================================================
-- 1. 用户账号表
-- ============================================================
CREATE TABLE IF NOT EXISTS platform_users (
  id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  account VARCHAR(50) NOT NULL UNIQUE,
  password_hash VARCHAR(200) NOT NULL,
  name VARCHAR(50),
  role VARCHAR(20) NOT NULL DEFAULT 'user',    -- admin / user
  status VARCHAR(20) NOT NULL DEFAULT 'pending', -- pending / approved / rejected
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS platform_users_account_idx ON platform_users(account);
CREATE INDEX IF NOT EXISTS platform_users_status_idx ON platform_users(status);

-- ============================================================
-- 2. 用户审核请求表
-- ============================================================
CREATE TABLE IF NOT EXISTS platform_audit_requests (
  id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id VARCHAR(36) NOT NULL REFERENCES platform_users(id) ON DELETE CASCADE,
  request_type VARCHAR(30) NOT NULL,           -- register / password_reset / name_change / role_upgrade
  status VARCHAR(20) NOT NULL DEFAULT 'pending', -- pending / approved / rejected
  old_value TEXT,
  new_value TEXT,
  target_user_id VARCHAR(36),
  reviewed_by VARCHAR(36) REFERENCES platform_users(id),
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS platform_audit_requests_user_id_idx ON platform_audit_requests(user_id);
CREATE INDEX IF NOT EXISTS platform_audit_requests_status_idx ON platform_audit_requests(status);

-- ============================================================
-- 3. 品类配置表
-- ============================================================
CREATE TABLE IF NOT EXISTS platform_categories (
  id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL UNIQUE,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- 4. 产品配置表
-- ============================================================
CREATE TABLE IF NOT EXISTS platform_products (
  id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL,
  category_id VARCHAR(36) NOT NULL,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS platform_products_category_id_idx ON platform_products(category_id);

-- ============================================================
-- 5. 标准库表
-- ============================================================
CREATE TABLE IF NOT EXISTS standards (
  id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  standard_name VARCHAR(200) NOT NULL,
  category VARCHAR(50) NOT NULL,               -- 通用标准/品类标准/感官评价标准/食谱功能标准
  product_category VARCHAR(50),                 -- 关联品类
  product VARCHAR(200),                         -- 关联产品
  version VARCHAR(20) DEFAULT 'V1.0',
  is_active BOOLEAN NOT NULL DEFAULT true,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS standards_category_idx ON standards(category);
CREATE INDEX IF NOT EXISTS standards_product_category_idx ON standards(product_category);

-- ============================================================
-- 6. 标准检查项表
-- ============================================================
CREATE TABLE IF NOT EXISTS standard_items (
  id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  standard_id VARCHAR(36) NOT NULL REFERENCES standards(id) ON DELETE CASCADE,
  sort_order INTEGER DEFAULT 0,
  sensory_dimension VARCHAR(20),                -- 视觉/听觉/触觉/嗅觉/味觉
  test_phase VARCHAR(50),                       -- 开箱/首次安装/产品使用/清洁收纳
  experience_flow VARCHAR(100),                 -- 体验流程（通用标准）
  touch_point VARCHAR(200),                     -- 触点（通用标准）
  check_dimension VARCHAR(50),                  -- 检查维度（品类标准）
  sub_check_dimension VARCHAR(100),             -- 细分检查维度（品类标准）
  check_item VARCHAR(200) NOT NULL,             -- 具体检查条目
  check_requirement TEXT,                       -- 检验范围及具体要求
  experience_standard TEXT,                     -- 体验标准（通用标准）
  check_standard TEXT,                          -- 检查标准（品类标准）
  measurement_position VARCHAR(200),            -- 测量位置
  check_tool VARCHAR(100),                     -- 测量工具
  standard_a VARCHAR(200),
  standard_b VARCHAR(200),
  standard_c VARCHAR(200),
  problem_level VARCHAR(20),                    -- 一级/二级/三级
  evaluation_prep TEXT,                         -- 感官评价准备（感官评价标准）
  subjective_score INTEGER,                     -- 主观满意度分值（感官评价标准）
  subjective_rating TEXT,                       -- 主观满意度描述（感官评价标准）
  reference_images JSONB,                       -- 参考图片
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS standard_items_standard_id_idx ON standard_items(standard_id);
CREATE INDEX IF NOT EXISTS standard_items_sensory_idx ON standard_items(sensory_dimension);

-- ============================================================
-- 7. 体验任务表
-- ============================================================
CREATE TABLE IF NOT EXISTS experience_tasks (
  id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  task_name VARCHAR(200) NOT NULL,
  product_category VARCHAR(50) NOT NULL,        -- 品类
  product VARCHAR(200),                         -- 产品
  product_model VARCHAR(50),                    -- 产品型号（自研/改型降本优化时必填）
  project_type VARCHAR(50),                     -- ODM/OEM/竞品研究/自研/前期研究/改型降本优化/海外产品
  project_phase VARCHAR(50),                    -- 手板研究/试制阶段/试产阶段/量产阶段
  test_date DATE,
  organizer VARCHAR(50),
  created_by VARCHAR(36),                       -- 创建者用户ID
  target_user TEXT,
  test_purpose TEXT,
  test_method TEXT,
  status VARCHAR(20) NOT NULL DEFAULT '待执行',  -- 待执行/进行中/已完成
  assigned_to VARCHAR(200),                     -- 指派工程师，逗号分隔
  selected_standards JSONB,                     -- 已选标准ID列表
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS experience_tasks_status_idx ON experience_tasks(status);
CREATE INDEX IF NOT EXISTS experience_tasks_product_category_idx ON experience_tasks(product_category);
CREATE INDEX IF NOT EXISTS experience_tasks_created_at_idx ON experience_tasks(created_at);

-- ============================================================
-- 8. 检查记录表
-- ============================================================
CREATE TABLE IF NOT EXISTS check_records (
  id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id VARCHAR(36) NOT NULL REFERENCES experience_tasks(id) ON DELETE CASCADE,
  standard_item_id VARCHAR(36),
  standard_category VARCHAR(50),                -- 通用标准/品类标准/感官评价标准
  sensory_dimension VARCHAR(20),
  test_phase VARCHAR(50),
  experience_flow VARCHAR(100),
  touch_point VARCHAR(200),
  check_dimension VARCHAR(50),
  sub_check_dimension VARCHAR(100),
  check_item VARCHAR(200) NOT NULL,
  check_requirement TEXT,
  check_standard TEXT,
  experience_standard TEXT,
  evaluation_result VARCHAR(20),                -- 合格/不合格/待定
  problem_description TEXT,
  measurement_position VARCHAR(200),
  measurement_value VARCHAR(100),
  tester VARCHAR(50),
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS check_records_task_id_idx ON check_records(task_id);
CREATE INDEX IF NOT EXISTS check_records_standard_item_id_idx ON check_records(standard_item_id);

-- ============================================================
-- 9. 素材表
-- ============================================================
CREATE TABLE IF NOT EXISTS materials (
  id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  record_id VARCHAR(36) REFERENCES check_records(id) ON DELETE CASCADE,
  recipe_step_id VARCHAR(36),
  recipe_library_step_id VARCHAR(36),
  recipe_id VARCHAR(36),
  task_id VARCHAR(36) REFERENCES experience_tasks(id) ON DELETE CASCADE,
  material_type VARCHAR(10) NOT NULL,           -- image / video
  file_name VARCHAR(200),
  file_path VARCHAR(500),
  file_size INTEGER,                            -- bytes
  file_url TEXT,                                -- 访问URL
  duration_sec INTEGER,                         -- 视频时长（秒）
  thumbnail_url TEXT,                           -- 缩略图URL
  ai_analysis_status VARCHAR(20) DEFAULT 'pending', -- pending / done
  ai_result JSONB,                              -- AI识别结果预留
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS materials_record_id_idx ON materials(record_id);
CREATE INDEX IF NOT EXISTS materials_task_id_idx ON materials(task_id);
CREATE INDEX IF NOT EXISTS materials_type_idx ON materials(material_type);
CREATE INDEX IF NOT EXISTS materials_recipe_step_id_idx ON materials(recipe_step_id);
CREATE INDEX IF NOT EXISTS materials_recipe_library_step_id_idx ON materials(recipe_library_step_id);
CREATE INDEX IF NOT EXISTS materials_recipe_id_idx ON materials(recipe_id);

-- ============================================================
-- 10. 食谱/功能表
-- ============================================================
CREATE TABLE IF NOT EXISTS recipes (
  id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id VARCHAR(36) NOT NULL REFERENCES experience_tasks(id) ON DELETE CASCADE,
  name VARCHAR(200) NOT NULL,
  ingredients TEXT,
  recipe_type VARCHAR(20) DEFAULT '食谱',       -- 食谱 / 功能
  problem_count INTEGER DEFAULT 0,
  sort_order INTEGER DEFAULT 0,                  -- 拖拽排序顺序
  effect_description TEXT,                        -- 效果评价描述
  effect_score DECIMAL(3,1),                      -- AI评分（综合）
  effect_problem_point TEXT,                      -- 效果问题点
  effect_ai_result JSONB,                         -- AI四维评价完整结果
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS recipes_task_id_idx ON recipes(task_id);

-- ============================================================
-- 11. 食谱步骤表
-- ============================================================
CREATE TABLE IF NOT EXISTS recipe_steps (
  id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  recipe_id VARCHAR(36) NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  step_number INTEGER NOT NULL DEFAULT 1,
  operation TEXT NOT NULL,
  problem_point TEXT,
  problem_points JSONB DEFAULT '[]',
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS recipe_steps_recipe_id_idx ON recipe_steps(recipe_id);

-- ============================================================
-- 12. 问题整改表
-- ============================================================
CREATE TABLE IF NOT EXISTS issues (
  id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id VARCHAR(36) NOT NULL REFERENCES experience_tasks(id) ON DELETE CASCADE,
  record_id VARCHAR(36) REFERENCES check_records(id) ON DELETE SET NULL,
  title VARCHAR(200) NOT NULL,
  product_model VARCHAR(50),
  category VARCHAR(50),
  sub_category VARCHAR(50),
  severity VARCHAR(20),                         -- 兼容旧数据
  priority VARCHAR(20),                         -- 兼容旧数据
  level VARCHAR(20),                            -- 一类/二类/三类（替代severity+priority）
  source VARCHAR(50),
  source_report_id VARCHAR(36),
  source_type VARCHAR(20),                      -- record_fail / recipe_problem
  description TEXT,
  is_improve BOOLEAN,
  no_improve_reason TEXT,
  improve_plan TEXT,
  responsible_dept VARCHAR(50),
  responsible_person VARCHAR(50),
  plan_complete_date DATE,
  actual_complete_date DATE,
  is_closed BOOLEAN DEFAULT false,
  status VARCHAR(20) NOT NULL DEFAULT '待整改',  -- 待整改/整改中/已验证/不整改
  verification_note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(title, source_type, task_id)
);
CREATE INDEX IF NOT EXISTS issues_task_id_idx ON issues(task_id);
CREATE INDEX IF NOT EXISTS issues_status_idx ON issues(status);
CREATE INDEX IF NOT EXISTS issues_severity_idx ON issues(severity);
CREATE INDEX IF NOT EXISTS issues_created_at_idx ON issues(created_at);

-- ============================================================
-- 13. 报告模板表
-- ============================================================
CREATE TABLE IF NOT EXISTS report_templates (
  id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  template_name VARCHAR(200) NOT NULL,
  template_type VARCHAR(50),
  content JSONB,
  is_default BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- 14. 报告表
-- ============================================================
CREATE TABLE IF NOT EXISTS reports (
  id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id VARCHAR(36) NOT NULL REFERENCES experience_tasks(id) ON DELETE CASCADE,
  template_id VARCHAR(36) REFERENCES report_templates(id),
  title VARCHAR(200),
  content JSONB,
  product_model VARCHAR(50),
  organizer VARCHAR(50),
  project_type VARCHAR(50),
  project_phase VARCHAR(50),
  status VARCHAR(20) NOT NULL DEFAULT '已完成',
  version INTEGER DEFAULT 1,
  created_by VARCHAR(36),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS reports_task_id_idx ON reports(task_id);

-- ============================================================
-- 15. 健康检查表（系统内部使用）
-- ============================================================
CREATE TABLE IF NOT EXISTS health_check (
  id SERIAL NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- 16. 平台设置表
-- ============================================================
CREATE TABLE IF NOT EXISTS platform_settings (
  id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  key VARCHAR(100) NOT NULL UNIQUE,
  value JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- 17. 报告分享表
-- ============================================================
CREATE TABLE IF NOT EXISTS report_shares (
  id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id VARCHAR(36) NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
  share_token VARCHAR(100) NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ,
  created_by VARCHAR(36),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS report_shares_report_id_idx ON report_shares(report_id);
CREATE INDEX IF NOT EXISTS report_shares_token_idx ON report_shares(share_token);

-- ============================================================
-- 18. 食谱库表
-- ============================================================
CREATE TABLE IF NOT EXISTS recipe_library (
  id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(200) NOT NULL UNIQUE,
  product_category VARCHAR(50),
  product VARCHAR(200),
  ingredients TEXT,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- 19. 食谱库步骤表
-- ============================================================
CREATE TABLE IF NOT EXISTS recipe_library_steps (
  id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  recipe_library_id VARCHAR(36) NOT NULL REFERENCES recipe_library(id) ON DELETE CASCADE,
  step_number INTEGER NOT NULL DEFAULT 1,
  operation TEXT NOT NULL,
  problem_point TEXT,
  problem_points JSONB DEFAULT '[]',
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS recipe_library_steps_library_id_idx ON recipe_library_steps(recipe_library_id);
```

### 4.2 插入种子数据（品类 + 产品）

```sql
-- 品类默认数据
INSERT INTO platform_categories (id, name, sort_order) VALUES
  ('cat-dian dong', '电动', 1),
  ('cat-hu lei', '壶类', 2),
  ('cat-yin shui', '饮水', 3),
  ('cat-zhong shi', '中式', 4),
  ('cat-xi shi', '西式', 5),
  ('cat-sheng huo', '生活', 6),
  ('cat-ge hu', '个护', 7),
  ('cat-jian kang', '健康', 8),
  ('cat-mu ying', '母婴', 9),
  ('cat-jia ju', '家居', 10),
  ('cat-chong wu', '宠物', 11)
ON CONFLICT (name) DO NOTHING;

-- 产品默认数据
INSERT INTO platform_products (name, category_id, sort_order) VALUES
  ('破壁机', 'cat-dian dong', 1),
  ('电水壶', 'cat-hu lei', 1),
  ('电饭煲', 'cat-zhong shi', 1),
  ('电火锅', 'cat-zhong shi', 2),
  ('空气炸锅', 'cat-xi shi', 1),
  ('挂烫机', 'cat-sheng huo', 1),
  ('电动牙刷', 'cat-ge hu', 1),
  ('电动按摩器', 'cat-jian kang', 1),
  ('吸奶器', 'cat-mu ying', 1),
  ('菜刀', 'cat-jia ju', 1),
  ('喂食机', 'cat-chong wu', 1)
ON CONFLICT DO NOTHING;
```

### 4.3 配置 RLS 策略（Supabase 必需）

```sql
-- 对所有表启用 RLS 并设置为公开读写（服务端使用 service_role_key 绕过 RLS）
DO $$
DECLARE
  tbl TEXT;
BEGIN
  FOR tbl IN
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public'
      AND tablename IN (
        'platform_users', 'platform_audit_requests', 'platform_categories', 'platform_products',
        'platform_settings', 'standards', 'standard_items', 'experience_tasks', 'check_records',
        'materials', 'issues', 'report_templates', 'reports', 'report_shares',
        'recipes', 'recipe_steps', 'recipe_library', 'recipe_library_steps',
        'health_check'
      )
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', tbl);

    -- 删除可能存在的旧策略
    EXECUTE format('DROP POLICY IF EXISTS allow_all ON %I', tbl);

    -- 创建允许所有操作的策略
    EXECUTE format('CREATE POLICY allow_all ON %I FOR ALL USING (true) WITH CHECK (true)', tbl);
  END LOOP;
END $$;
```

---

## 5. 环境变量配置

在项目根目录创建 `.env` 文件（开发环境）或在服务器环境变量中设置（生产环境）：

```bash
# ==================== 必须配置 ====================

# Supabase 数据库连接
COZE_SUPABASE_URL=https://your-project.supabase.co
COZE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
COZE_SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

# S3 对象存储 (素材上传)
COZE_BUCKET_ENDPOINT_URL=https://oss-cn-beijing.aliyuncs.com
COZE_BUCKET_NAME=xp-experience-materials

# ==================== 可选配置 ====================

# 运行环境 (DEV / PROD)
COZE_PROJECT_ENV=PROD

# 服务端口 (默认 5000)
PORT=5000

# 域名 (用于构造回调 URL 等)
COZE_PROJECT_DOMAIN_DEFAULT=https://your-domain.com
```

### 环境变量说明

| 变量名 | 必须 | 说明 | 示例 |
|--------|:----:|------|------|
| `COZE_SUPABASE_URL` | 是 | Supabase 项目 URL | `https://abc123.supabase.co` |
| `COZE_SUPABASE_ANON_KEY` | 是 | Supabase 匿名密钥 | `eyJhbG...` |
| `COZE_SUPABASE_SERVICE_ROLE_KEY` | 是 | Supabase 服务端密钥（绕过 RLS） | `eyJhbG...` |
| `COZE_BUCKET_ENDPOINT_URL` | 是 | S3 兼容存储端点 | `https://oss-cn-beijing.aliyuncs.com` |
| `COZE_BUCKET_NAME` | 是 | S3 Bucket 名称 | `xp-materials` |
| `COZE_PROJECT_ENV` | 否 | 运行环境标识 | `PROD` |
| `PORT` | 否 | 服务监听端口 | `5000` |
| `COZE_PROJECT_DOMAIN_DEFAULT` | 否 | 对外访问域名 | `https://xp.example.com` |

---

## 6. 项目部署

### 6.1 获取源码

```bash
# 方式 1: Git 克隆
cd /opt
git clone https://github.com/your-org/xp-experience-platform.git
cd xp-experience-platform

# 方式 2: 直接上传源码包
# scp -r ./xp-experience-platform user@server:/opt/
```

### 6.2 安装依赖

```bash
# 必须使用 pnpm
pnpm install
```

### 6.3 构建生产版本

```bash
pnpm build
```

构建过程包含两步：
1. Next.js 构建（生成 `.next/` 目录）
2. 自定义 Server 构建（`src/server.ts` → `dist/server.js`）

### 6.4 启动服务

```bash
# 直接启动
COZE_PROJECT_ENV=PROD PORT=5000 node dist/server.js

# 或使用环境变量文件
export $(cat .env | xargs) && node dist/server.js
```

启动后访问 `http://your-server:5000` 即可使用。

### 6.5 使用 PM2 守护进程 (推荐)

```bash
# 安装 PM2
npm install -g pm2

# 启动服务
COZE_PROJECT_ENV=PROD PORT=5000 pm2 start dist/server.js --name xp-platform

# 查看状态
pm2 status

# 查看日志
pm2 logs xp-platform

# 设置开机自启
pm2 startup
pm2 save
```

**PM2 生态系统文件** (`ecosystem.config.js`)：

```javascript
module.exports = {
  apps: [{
    name: 'xp-platform',
    script: 'dist/server.js',
    env: {
      COZE_PROJECT_ENV: 'PROD',
      PORT: 5000,
      NODE_ENV: 'production',
    },
    instances: 1,
    autorestart: true,
    max_memory_restart: '1G',
    error_file: '/var/log/xp-platform/error.log',
    out_file: '/var/log/xp-platform/out.log',
    merge_logs: true,
    log_date_format: 'YYYY-MM-DD HH:mm:ss',
  }]
};
```

```bash
# 使用生态系统文件启动
pm2 start ecosystem.config.js
```

### 6.6 Nginx 反向代理配置

```nginx
server {
    listen 80;
    server_name xp.example.com;

    # 限制上传大小 (匹配应用层100MB限制)
    client_max_body_size 100M;

    location / {
        proxy_pass http://127.0.0.1:5000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;

        # 长连接超时
        proxy_read_timeout 300s;
        proxy_send_timeout 300s;
    }
}
```

**启用 HTTPS (推荐)**：

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d xp.example.com
```

---

## 7. Docker 部署 (可选)

### Dockerfile

```dockerfile
FROM node:22-alpine AS builder

WORKDIR /app

# 安装 pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

# 复制依赖文件
COPY package.json pnpm-lock.yaml ./

# 安装依赖
RUN pnpm install --frozen-lockfile

# 复制源码
COPY . .

# 构建
RUN pnpm build

# 生产镜像
FROM node:22-alpine AS runner

WORKDIR /app

# 复制构建产物
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/public ./public
COPY --from=builder /app/src/app/globals.css ./src/app/globals.css

# 环境变量 (敏感信息通过 docker run -e 传入)
ENV COZE_PROJECT_ENV=PROD
ENV PORT=5000

EXPOSE 5000

CMD ["node", "dist/server.js"]
```

### docker-compose.yml

```yaml
version: '3.8'

services:
  app:
    build: .
    container_name: xp-platform
    restart: always
    ports:
      - "5000:5000"
    environment:
      - COZE_PROJECT_ENV=PROD
      - PORT=5000
      - COZE_SUPABASE_URL=${COZE_SUPABASE_URL}
      - COZE_SUPABASE_ANON_KEY=${COZE_SUPABASE_ANON_KEY}
      - COZE_SUPABASE_SERVICE_ROLE_KEY=${COZE_SUPABASE_SERVICE_ROLE_KEY}
      - COZE_BUCKET_ENDPOINT_URL=${COZE_BUCKET_ENDPOINT_URL}
      - COZE_BUCKET_NAME=${COZE_BUCKET_NAME}
    env_file:
      - .env
```

### 构建与运行

```bash
# 构建镜像
docker compose build

# 启动
docker compose up -d

# 查看日志
docker compose logs -f

# 停止
docker compose down
```

---

## 8. 初始管理员账号

系统首次登录时会自动创建初始管理员账号：

| 字段 | 值 |
|------|----|
| 账号 | `bear2026` |
| 密码 | `bear2026` |
| 角色 | 管理账号 (admin) |
| 状态 | 已审核 (approved) |

> **安全提示**: 部署后请立即登录并修改默认密码！

密码哈希方式：`SHA-256(salt + password)`，其中 salt 为 `xp_experience_platform`。

---

## 9. 功能模块说明

| 模块 | 路径 | 说明 |
|------|------|------|
| 登录 | `/login` | 账号密码登录，支持注册/忘记密码（需管理员审核） |
| 工作台 | `/dashboard` | 核心指标概览，管理员审核入口，非管理员待申请列表 |
| 标准管理 | `/standards` | 双板块（体验标准+食谱库），四类标准（通用/品类/感官评价/食谱功能），支持批量导入 PDF/Excel |
| 体验计划 | `/tasks` | 创建体验任务，品类-产品级联选择，项目类型/阶段选择 |
| 任务详情 | `/tasks/[id]` | 基本信息/素材仓库/五感体验/功能效果 四Tab，步骤/食谱拖拽排序，AI效果评价 |
| 问题管理 | `/issues` | 从报告自动汇总，等级分一类/二类/三类，状态流转 |
| 报告中心 | `/reports` | 报告生成/查看/打印，同型号内容级合并，报告对比，报告分享 |
| 报告分享 | `/reports/share/[token]` | 无需登录，只读查看，支持导出PDF、图片放大、视频播放 |
| 数据分析 | `/analysis` | 多维筛选，核心指标，图表分布，管理账号可导出CSV |
| 品类设置 | 个人信息→设置 | 管理账号专属：品类/产品增删管理，通用标准选项管理，AI模型配置 |

### 权限体系

| 操作 | 管理账号 (admin) | 使用账号 (user) |
|------|:---:|:---:|
| 编辑/导入/删除标准 | ✅ | ❌ |
| 新增问题点 | ✅ | ✅ |
| 标准引用到五感体验 | ✅ | ✅ |
| 审核账号注册/密码/名称 | ✅ | ❌ |
| 品类/产品设置 | ✅ | ❌ |
| 查看所有体验计划/问题/报告 | ✅ | 仅自己的 |
| 数据分析浏览 | ✅ | ✅ |
| 数据分析导出 | ✅ | ❌ |

---

## 10. 数据库表结构参考

| 表名 | 说明 | 关键字段 |
|------|------|----------|
| `platform_users` | 用户账号 | account, role(admin/user), status(pending/approved/rejected) |
| `platform_audit_requests` | 审核请求 | request_type(register/password_reset/name_change/role_upgrade) |
| `platform_categories` | 品类配置 | name, sort_order |
| `platform_products` | 产品配置 | name, category_id, sort_order |
| `platform_settings` | 平台设置 | key(unique), value(JSONB)，含 standard_options, ai_config 等 |
| `standards` | 标准库 | category(通用/品类/感官评价/食谱功能), product_category, product |
| `standard_items` | 检查项 | standard_id, sensory_dimension, check_item 等 |
| `experience_tasks` | 体验任务 | product_category, product, project_type, created_by |
| `check_records` | 检查记录 | task_id, standard_category, evaluation_result |
| `materials` | 素材 | task_id(可选), material_type(image/video), file_url, 可关联record/recipe_step/recipe_library_step/recipe |
| `issues` | 问题整改 | level(一类/二类/三类), status, source_report_id |
| `report_templates` | 报告模板 | template_type |
| `reports` | 报告 | task_id, product_model, content(JSONB) |
| `report_shares` | 报告分享 | report_id, share_token(unique), expires_at, created_by |
| `recipes` | 食谱/功能 | task_id, recipe_type(食谱/功能), effect_score, effect_ai_result(JSONB), sort_order |
| `recipe_steps` | 食谱步骤 | recipe_id, operation, problem_points(JSONB) |
| `recipe_library` | 食谱库 | name(unique), product_category, product |
| `recipe_library_steps` | 食谱库步骤 | recipe_library_id, operation, problem_points(JSONB) |

---

## 11. API 接口清单

所有 API 返回统一结构 `{ code: number, message: string, data: any }`

### 认证相关

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/auth/login` | 登录 |
| POST | `/api/auth/register` | 注册（需管理员审核） |
| POST | `/api/auth/forgot-password` | 忘记密码（需管理员审核） |
| GET | `/api/auth/profile` | 获取用户信息 |
| PUT | `/api/auth/profile` | 修改名称/密码（需管理员审核） |
| GET | `/api/auth/audit` | 获取审核请求 |
| PUT | `/api/auth/audit` | 审核操作（approve/reject/cancel） |
| GET | `/api/auth/users` | 获取用户列表（管理员） |
| POST | `/api/auth/users` | 升级/降级用户角色 |

### 业务相关

| 方法 | 路径 | 说明 |
|------|------|------|
| GET/POST | `/api/standards` | 标准列表/创建 |
| GET/PUT/DELETE | `/api/standards/[id]` | 标准详情/更新/删除 |
| POST | `/api/standards/import` | 标准批量导入 (PDF/Excel) |
| GET/POST | `/api/standard-items` | 检查项列表/创建 |
| GET | `/api/standard-items/search` | 跨标准检查项搜索 |
| GET/POST | `/api/tasks` | 任务列表/创建 |
| GET/PUT/DELETE | `/api/tasks/[id]` | 任务详情/更新/删除 |
| POST | `/api/tasks/[id]/transfer` | 转移体验计划到其他用户（管理员） |
| GET/POST | `/api/records` | 检查记录列表/创建 |
| PUT/DELETE | `/api/records/[id]` | 记录更新/删除 |
| POST | `/api/materials/upload` | 素材上传 (100MB限制) |
| GET/PUT/DELETE | `/api/materials` | 素材列表/重命名/删除 |
| GET/POST | `/api/issues` | 问题列表/创建 |
| GET/PUT/DELETE | `/api/issues/[id]` | 问题详情/更新/删除 |
| GET/POST | `/api/reports` | 报告列表/生成 |
| GET/PUT/DELETE | `/api/reports/[id]` | 报告详情/更新/删除 |
| POST | `/api/reports/export-pdf` | PDF导出辅助 |
| POST | `/api/reports/share` | 创建分享链接（7天/30天/永久） |
| GET | `/api/reports/share?token=xxx` | 验证分享令牌并获取报告（公开接口） |
| GET | `/api/reports/share/list?report_id=xxx` | 获取报告的分享链接列表 |
| DELETE | `/api/reports/share/list?id=xxx` | 撤销分享链接 |
| GET/POST | `/api/recipes` | 食谱/功能列表/创建 |
| GET/PUT/DELETE | `/api/recipes/[id]` | 食谱详情/更新/删除 |
| POST | `/api/recipes/[id]/ai-evaluate` | AI效果评价（四维评价：质感/透彻/纯净/恒定） |
| GET/POST | `/api/recipe-steps` | 步骤列表/创建 |
| PUT/DELETE | `/api/recipe-steps/[id]` | 步骤更新/删除 |
| GET/POST | `/api/recipe-library` | 食谱库列表/创建 |
| GET/PUT | `/api/recipe-library/[id]` | 食谱库详情/更新 |
| DELETE | `/api/recipe-library/[id]` | 删除食谱库项（步骤级联删除） |
| GET/POST | `/api/recipe-library-steps` | 食谱库步骤列表/创建 |
| PUT/DELETE | `/api/recipe-library-steps/[id]` | 食谱库步骤更新/删除 |
| GET/POST | `/api/categories` | 品类/产品配置 (GET/POST/DELETE) |
| GET | `/api/dashboard` | 工作台统计 |
| GET/POST | `/api/analysis` | 数据分析/导出CSV |
| GET/PUT | `/api/settings` | 平台设置读取/更新（管理员） |

---

## 12. 常见问题排查

### Q: 启动后页面白屏

1. 检查端口是否正确监听：`curl -I http://localhost:5000`
2. 检查环境变量是否设置：`echo $COZE_SUPABASE_URL`
3. 检查构建产物是否存在：`ls -la .next/ dist/`

### Q: 登录提示"登录失败"

1. 确认数据库中存在 `platform_users` 表
2. 确认 `COZE_SUPABASE_SERVICE_ROLE_KEY` 已正确设置
3. 检查 Supabase 项目是否暂停（免费版会自动暂停）

### Q: 素材上传失败

1. 确认 S3 存储服务可达：`curl -I $COZE_BUCKET_ENDPOINT_URL`
2. 确认 Bucket 存在且有写权限
3. 检查文件大小是否超过 100MB 限制

### Q: 标准批量导入失败

1. 确认 LLM 服务认证信息已配置
2. 检查 PDF/Excel 文件是否可正常访问
3. 查看 API 返回的具体错误信息

### Q: 数据库连接超时

1. 确认 Supabase 项目区域与服务器网络可达
2. 检查防火墙是否放行出站 HTTPS (443) 端口
3. 确认 `COZE_SUPABASE_URL` 格式正确（需包含 `https://`）

### Q: 如何重置管理员密码

在 Supabase SQL Editor 中执行：

```sql
-- 密码 bear2026 对应的 hash
UPDATE platform_users
SET password_hash = '替换为新的hash值'
WHERE account = 'bear2026';
```

密码 hash 生成方式：`echo -n "xp_experience_platform新密码" | sha256sum`

### Q: 如何添加新的品类/产品

1. 以管理账号登录
2. 点击侧栏底部用户头像 → 个人信息
3. 点击"品类与产品设置"按钮
4. 在品类区域输入名称后点击新增；选择品类后在产品区域新增产品

或者直接在数据库中插入：

```sql
INSERT INTO platform_categories (name, sort_order) VALUES ('新品类', 99);
INSERT INTO platform_products (name, category_id, sort_order)
VALUES ('新产品', '品类ID', 1);
```

### Q: 注册/登录提示失败

1. 确认 `platform_users`、`platform_settings` 表已启用 RLS 并创建了公开读写策略
2. 在 Supabase SQL Editor 中执行：`CREATE POLICY allow_all ON platform_users FOR ALL USING (true) WITH CHECK (true);`
3. 同样检查 `platform_settings`、`report_shares`、`recipe_library`、`recipe_library_steps` 表的 RLS 策略

### Q: API 返回 500 错误（所有接口）

1. 检查 `schema.ts` 中 `gen_random_uuid()` 是否使用了 `sql\`gen_random_uuid()\`` 模板语法（不能作为 JS 函数调用）
2. 检查 Supabase 连接是否正常
3. 查看 `/app/work/logs/bypass/app.log` 日志

### Q: 报告对比显示 "model not found"

1. 确认 AI 模型名包含日期后缀（如 `doubao-seed-2-0-lite-260215`，而非 `doubao-seed-2-0-lite`）
2. 管理员可在个人设置中检查 AI 模型配置

### Q: 侧边栏与内容区域长度不一致

1. 主布局应使用 `flex h-screen overflow-hidden`，主内容区域使用 `overflow-y-auto`
2. 侧边栏使用 `h-full shrink-0` 固定高度
3. 内容通过内部滚动加载，不再无限拉长页面
