# 产品体验管理平台 - AGENTS.md

## 项目概览

产品体验管理平台，覆盖体验计划、现场走查、报告输出、数据分析全流程。主要面向体验工程师使用，支持移动端操作。

## 技术栈

- **Framework**: Next.js 15.5.19 (App Router)
- **Core**: React 19
- **Language**: TypeScript 5
- **UI 组件**: shadcn/ui (基于 Radix UI)
- **Styling**: Tailwind CSS 4
- **Database**: 本轮生产仅支持自建 PostgreSQL；Supabase PostgreSQL 兼容代码保留，但 `supabase-service-role` 在生产为实验性禁用并 fail closed
- **File Storage**: 生产素材只允许写入服务器本地持久化目录 `public/uploads`；`STORAGE_DRIVER=local`、`NEW_UPLOAD_DRIVER=local`。不得启用 S3、Garage、MinIO 或任何对象存储作为上传、读取或回退路径。
- **AI/LLM**: 可配置的 Chat Completions 兼容接口；仓库文档不记录具体敏感连接信息
- **PDF解析**: pdf-parse (本地解析) + xlsx (Excel解析)
- **Theme**: Teal 主色 / Business 字体 / Cool 阴影

## 目录结构

```
├── src/
│   ├── app/
│   │   ├── (auth)/              # 认证路由组
│   │   │   └── login/           # 登录页（含注册/忘记密码弹窗）
│   │   ├── (main)/              # 主布局路由组（需认证）
│   │   │   ├── dashboard/       # 工作台
│   │   │   ├── standards/       # 标准管理（双板块：体验标准+食谱库，含 [id] 详情、批量导入）
│   │   │   ├── tasks/           # 体验计划（含 [id] 详情，五感体验关联标准项，步骤拖拽排序）
│   │   │   ├── issues/          # 问题管理（含 [id] 详情）
│   │   │   ├── reports/         # 报告中心（含 [id] 详情，北京时间格式化）
│   │   │   └── analysis/        # 数据分析
│   │   ├── reports/print/       # 报告打印/PDF导出页面
│   │   ├── reports/share/[token]/ # 报告分享公开页面（无需登录，只读）
│   │   ├── api/                 # 后端 API 路由
│   │   │   ├── auth/            # 认证相关 API
│   │   │   │   ├── login/       # 登录
│   │   │   │   ├── register/    # 注册（需管理员审核）
│   │   │   │   ├── forgot-password/ # 忘记密码（需管理员审核）
│   │   │   │   ├── profile/     # 个人信息查看/修改（名称/密码修改需审核）
│   │   │   │   ├── audit/       # 审核管理（管理员审核注册/密码/名称修改请求，参数：request_id）
│   │   │   │   └── users/       # 用户列表/角色管理（管理员升级/降级/删除）
│   │   │   ├── standards/       # 标准 CRUD
│   │   │   │   └── import/      # 标准批量导入（PDF/Excel，按分类不同LLM prompt）
│   │   │   ├── standard-items/  # 标准检查项 CRUD（含新字段：experience_flow, touch_point等）
│   │   │   │   └── search/      # 标准检查项跨标准搜索（支持standard_category/experience_flow筛选）
│   │   │   ├── tasks/           # 体验任务 CRUD
│   │   │   ├── records/         # 检查记录 CRUD（含standard_category等字段，编辑时同步更新对应issue状态）
│   │   │   ├── materials/       # 素材管理（上传/删除/重命名/关联，含 presign/file 访问接口）
│   │   │   ├── issues/          # 问题整改 CRUD
│   │   │   ├── reports/         # 报告生成/CRUD
│   │   │   │   ├── export-pdf/  # PDF导出API
│   │   │   │   └── share/       # 报告分享API（创建/验证/列表/撤销）
│   │   │   ├── recipes/         # 食谱/功能 CRUD（含effect_description/effect_score/effect_problem_point/effect_ai_result效果评价字段）
│   │   │   │   ├── [id]/ai-evaluate/ # AI效果评价（四维评价：质感/透彻/纯净/恒定，基于描述+图片生成评分）
│   │   │   │   └── [id]/ai-detect-problems/ # AI问题点识别（索引步骤+效果描述+AI评价结果，识别负面情绪/问题点）
│   │   │   ├── recipe-steps/    # 食谱步骤 CRUD
│   │   │   ├── recipe-library/  # 食谱库 CRUD（名称全局唯一，步骤级联删除）
│   │   │   ├── recipe-library-steps/ # 食谱库步骤 CRUD（含批量排序）
│   │   │   └── dashboard/       # 仪表盘数据
│   │   ├── layout.tsx           # 根布局（含 Toaster + AuthProvider + suppressHydrationWarning）
│   │   └── page.tsx             # 首页重定向到 /dashboard
│   ├── components/
│   │   ├── navigation.tsx       # 导航组件（桌面侧栏 + 移动端底部/顶部 + RoleSwitcher + AiConfigSettings）
│   │   ├── image-preview.tsx    # 共享图片预览组件
│   │   ├── image-editor-dialog.tsx # 图片在线编辑组件（裁剪/旋转/缩放，react-easy-crop）
│   │   ├── material-picker.tsx  # 素材选择器组件（引用/上传，支持initialMaterials预填充）
│   │   └── media-capture-dialog.tsx # 拍照/录像对话框（移动端原生相机，桌面端浏览器摄像头）
│   │   └── ui/                  # Shadcn UI 组件库
│   ├── storage/database/
│   │   ├── supabase-client.ts   # Supabase 客户端（双模式：云/本地）
│   │   ├── pg-db.ts             # PostgreSQL 直连（Drizzle ORM）
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
| `platform_users` | 用户账号（admin/user角色，pending/approved/rejected状态） |
| `platform_audit_requests` | 用户审核请求（注册/密码重置/名称修改/角色升级） |
| `platform_settings` | 平台全局设置（管理员配置，如五感体验默认选项，key-value JSONB） |
| `standards` | 体验标准库（通用标准/品类标准/感官评价标准/非标准/食谱功能标准） |
| `standard_items` | 标准检查项（含分类特定字段：experience_flow, touch_point, experience_standard, sub_check_dimension, check_standard, evaluation_prep, subjective_score, subjective_rating, reference_images） |
| `experience_tasks` | 体验任务（含 created_by 用户隔离字段, project_type: ODM/OEM/竞品研究/自研/前期研究/改型降本优化/海外产品, project_phase: 手板研究/试制阶段/试产阶段/量产阶段） |
| `check_records` | 检查记录（走查，含 standard_category, check_dimension, sub_check_dimension, check_standard, experience_flow, touch_point, experience_standard, check_tool, problem_level） |
| `materials` | 素材（图片/视频，含 AI 预留字段，可关联record或recipe_step或recipe_library_step或recipe或issue/re-evaluation，task_id可选） |
| `issues` | 问题整改（含 level: 一类/二类/三类, source, source_report_id, source_type: record_fail/recipe_problem, UNIQUE(title, source_type, task_id)） |
| `report_templates` | 报告模板 |
| `reports` | 报告（含 product_model 用于同型号合并） |
| `report_shares` | 报告分享（share_token, expires_at, created_by，支持7天/30天/永久有效期） |
| `issue_re_evaluations` | 问题复评估（功能效果问题多次复测，含描述+AI结果JSONB） |
| `recipe_library` | 食谱库（名称全局唯一约束，按品类-产品分类的全局食谱标准） |
| `recipe_library_steps` | 食谱库步骤 |
| `recipes` | 食谱/功能（含 effect_description 效果评价描述, effect_score AI评分, effect_problem_point 效果问题点, effect_ai_result AI四维评价完整结果JSONB） |
| `recipe_steps` | 食谱步骤 |
| `security_audit_logs` | 统一安全审计日志（登录、越权、上传、分享、AI调用、导出、配置变更等） |
| `security_rate_limits` | 多实例共享限速状态 |
| `ai_model_configs` | AI 模型配置（API Key 加密保存） |

**数据矩阵（V2 用户自设计模型，当前 UI 实际使用）** — 由迁移 `0003_task_matrix_model.sql` 建立：

| 表名 | 说明 |
|------|------|
| `task_matrices` | 任务级矩阵实例（一个任务一个矩阵），状态 designing/active/review_locked/completed/archived，含 comparability 字段与版本锁 |
| `matrix_design_versions` | 可确认的设计快照（draft/confirmed/superseded/retired），含 hash 校验 |
| `matrix_sections` | 字段分区（矩阵级或分组级） |
| `matrix_field_definitions` | 字段定义（kind/data_type/formula/result_status 映射/evidence 规则/移动端桌面端报告可见性） |
| `matrix_groups` | 矩阵内分组 |
| `matrix_rows` | 分组内行（completion_status、版本锁） |
| `matrix_field_values` | 单元格值（numeric/text/duration/enum 等，calc_mode、formula_version、乐观锁 version） |
| `matrix_narratives` | 分组/矩阵级叙述文本 |

**数据矩阵 schema 注册表（V1 schema-driven 模型，已保留但 UI 不再使用，预留给 Wave 2 复用设计库）** — 由迁移 `0002_matrix_input_tables.sql` 建立：

| 表名 | 说明 |
|------|------|
| `matrix_schemas` | 数据矩阵模式定义（schema_key 全局唯一，状态 draft/published；管理员发布，版本化，发布后不可变） |
| `matrix_schema_versions` | 模式版本（每个版本携带完整 schema_json 快照，发布后冻结，记录 checksum/published_by/effectiveFrom-To） |
| `matrix_dimension_bindings` | 模式维度绑定（列/行定义：dimension_key、column_group、value_kind、单位、必填/可编辑、校验规则） |
| `matrix_formula_definitions` | 模式公式定义（受限 DSL 计算维度：output_dimension_key、formula_dsl、compiled_ast、依赖、formula_version） |
| `matrix_calculation_runs` | 公式计算审计记录（每个矩阵实例的输入/公式哈希、触发类型、状态、错误码、trace_id） |

> V1 schema-driven 模型仍复用既有表并扩展字段：
> - `comparison_assemblies` 扩展 `matrix_role`（`data_matrix`/`comparison`）、`matrix_schema_version_id`、`comparability_status`，用于标记数据矩阵实例。
> - `comparison_item_nodes` 通过 section/item 节点类型承载分组与记录行。
> - `metric_evaluations` 扩展 typed-value 列（`numeric_value`/`text_value`/`duration_ms`/`unit_code`/`value_kind`/`input_state`/`calculation_mode`/`formula_definition_id`/`source_run_id`/`version`），区分原始输入与计算结果。
> - 素材与问题复用 `materials`/`issues` 表。
> - **注意**：上述 V1 复用方案在当前 V2 模型下不再用于运行时实例；V2 走独立的 `task_matrices` 等表。schema 注册表保留供未来 Wave 2「可复用设计库」使用。

## 标准分类体系

### 通用标准
字段：产品使用阶段(开箱/首次安装/产品使用/清洁收纳/其他) → 体验流程(级联) → 感官维度 → 触点 → 检验范围及具体要求 → 体验标准 → 测量工具 → 问题等级(一类/二类/三类)

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
| POST | `/api/auth/login` | 登录（返回用户信息） |
| POST | `/api/auth/register` | 注册（需管理员审核） |
| POST | `/api/auth/forgot-password` | 忘记密码（验证账号存在，需管理员审核） |
| GET | `/api/auth/profile` | 获取用户信息 |
| PUT | `/api/auth/profile` | 修改名称/密码（需管理员审核） |
| GET | `/api/auth/audit` | 获取审核请求（基于当前登录会话判断：管理员查全部，普通用户查自己的） |
| PUT | `/api/auth/audit` | 审核（approve/reject，管理员，参数 request_id）；取消申请（cancel，用户自己） |
| GET | `/api/auth/users` | 获取用户列表（管理员） |
| POST | `/api/auth/users` | 升级/降级用户角色、删除用户账号（管理员）；删除时级联清理report_shares和audit_requests） |
| GET/POST | `/api/standards` | 标准列表/创建 |
| GET/PUT/DELETE | `/api/standards/[id]` | 标准详情/更新/删除 |
| POST | `/api/standards/import` | 标准批量导入（PDF/Excel，按分类不同LLM prompt） |
| GET/POST | `/api/standard-items` | 检查项列表/创建（支持批量，含新字段） |
| GET | `/api/standard-items/search` | 跨标准检查项搜索（支持category/experience_flow/keyword多字段模糊筛选） |
| GET/POST | `/api/tasks` | 任务列表/创建（分页+筛选） |
| GET/PUT/DELETE | `/api/tasks/[id]` | 任务详情（含记录+问题）/更新/删除 |
| GET/POST | `/api/records` | 检查记录列表/创建（含standard_category等新字段） |
| PUT/DELETE | `/api/records/[id]` | 记录更新（含标准字段+检查结果+问题描述，更新时同步对应issue状态）/删除 |
| POST | `/api/materials/upload` | 素材上传（文件大小100MB限制，仅图片/视频，支持task_id或recipe_library_step_id或recipe_id） |
| PUT | `/api/materials` | 素材重命名/关联record_id/recipe_step_id/recipe_id |
| GET/DELETE | `/api/materials` | 素材列表/删除 |
| GET/POST | `/api/issues` | 问题列表/创建 |
| GET/PUT/DELETE | `/api/issues/[id]` | 问题详情/更新/删除 |
| GET/POST | `/api/reports` | 报告列表/生成（含食谱/素材数据） |
| GET/PUT/DELETE | `/api/reports/[id]` | 报告详情/更新/删除 |
| POST | `/api/reports/export-pdf` | PDF导出辅助API |
| POST | `/api/reports/share` | 创建分享链接（7天/30天/永久） |
| GET | `/api/reports/share?token=xxx` | 验证分享令牌并获取报告（公开接口） |
| GET | `/api/reports/share/list?report_id=xxx` | 获取报告的分享链接列表 |
| DELETE | `/api/reports/share/list?id=xxx` | 撤销分享链接 |
| GET/POST | `/api/recipes` | 食谱/功能列表/创建；GET 支持 library=1&keyword 跨任务搜索食谱库；含effect_description/effect_score/effect_problem_point/effect_ai_result |
| GET/PUT/DELETE | `/api/recipes/[id]` | 食谱详情/更新/删除（含effect_description/effect_score/effect_problem_point/effect_material_ids） |
| POST | `/api/recipes/[id]/ai-evaluate` | AI效果评价（四维评价：质感/透彻/纯净/恒定，基于描述+图片生成评分，使用内置或自定义AI模型） |
| POST | `/api/recipes/[id]/ai-detect-problems` | AI问题点识别（索引步骤+效果描述+AI评价结果，识别负面情绪/问题点表述，返回结构化问题列表） |
| GET/POST | `/api/recipe-steps` | 步骤列表/创建；PUT 批量更新步骤排序（steps 数组） |
| PUT/DELETE | `/api/recipe-steps/[id]` | 步骤更新/删除 |
| GET | `/api/dashboard` | 仪表盘统计数据（支持created_by按用户过滤） |
| GET | `/api/analysis` | 数据分析（支持product_category/project_type/organizer/issue_source_type/date_from/date_to筛选，非admin需传created_by） |
| POST | `/api/analysis` | 数据导出CSV（仅管理员，format=csv） |
| GET/POST | `/api/recipe-library` | 食谱库列表/创建（支持keyword搜索，按品类-产品分类，名称唯一约束） |
| GET/PUT | `/api/recipe-library/[id]` | 食谱库详情/更新（含名称唯一性检查） |
| DELETE | `/api/recipe-library/[id]` | 删除食谱库项（步骤级联删除，素材关联清理） |
| GET/POST | `/api/recipe-library-steps` | 食谱库步骤列表/创建；PUT 批量更新步骤排序 |
| PUT/DELETE | `/api/recipe-library-steps/[id]` | 食谱库步骤更新/删除（含素材关联清理） |
| GET/PUT | `/api/settings` | 平台设置读取/更新（管理员，key-value JSONB；ai_config含AI模型配置） |
| POST | `/api/tasks/[id]/transfer` | 转移体验计划到其他用户（管理员，含全部资料） |
| GET/POST | `/api/issue-re-evaluations` | 问题复评估列表/创建（支持issue_id和issue_ids参数）；GET返回含素材 |
| PUT/DELETE | `/api/issue-re-evaluations/[id]` | 复评估更新/删除 |
| POST | `/api/issue-re-evaluations/[id]/ai-evaluate` | AI效果评价（基于描述+图片，同食谱四维评价体系） |
| GET/POST | `/api/tasks/[id]/matrices` | **（V2，当前 UI 使用）** 任务矩阵列表 / 创建矩阵（status=designing） |
| GET/PATCH | `/api/matrices/[id]` | **（V2，当前 UI 使用）** 读取 MatrixReadProjectionV2（分组/行/值/证据/问题计数/摘要）/ 更新名称/描述/可对比性 |
| POST | `/api/matrices/[id]/design-versions` | 创建设计版本（含 sections & fields） |
| POST | `/api/matrix-design-versions/[id]` | 确认/发布设计版本 |
| GET/POST | `/api/matrices/[id]/groups` | 矩阵分组列表 / 新增分组 |
| PATCH | `/api/matrix-groups/[id]` | 更新分组 |
| GET/POST | `/api/matrix-groups/[id]/rows` | 分组行列表 / 新增行 |
| PATCH | `/api/matrix-rows/[id]` | 更新行元数据 |
| PATCH | `/api/matrix-rows/[id]/values/[fieldId]` | **（V2，当前 UI 使用）** 写字段值 + 触发依赖字段重算（乐观锁） |
| POST | `/api/matrices/[id]/validate` | 提交前校验（MX-V-001..010 阻断 / MX-W-001..006 警告） |
| GET/POST | `/api/matrix-schemas` | 可用模式库（已登录可读） |
| POST | `/api/matrix-schemas/[id]/versions` | 新建版本草稿（管理员） |
| POST | `/api/matrix-schema-versions/[id]/publish` | 编译+校验+发布模式（管理员；原子：先全量校验通过再落库） |
| GET | `/api/matrix-schema-versions/[id]` | 读取模式版本详情（含 dimensions + formulas，admin） |
| PUT | `/api/matrix-schema-versions/[id]/draft` | 保存模式版本草稿（dimensions + formulas，replace 策略幂等，admin，编译校验） |
| GET | `/api/task-matrices/[id]` | 窗口化 MatrixReadProjection（V1 schema 模型，分组/行/单元格/指标分页读取） |
| POST | `/api/task-matrices/[id]/groups` `/rows` `/validate` | V1 schema 模型新增分组/行、提交前校验 |
| PATCH | `/api/matrix-rows/[id]/slots` | V1 schema 模型三槽位（效果结论/过程记录；关联问题由问题模块管理） |
| PATCH | `/api/matrix-rows/[id]/metrics/[dimensionKey]` | V1 schema 模型写原始指标 + 服务端复核计算（同一引擎复核，返回 needs_recompute） |
| POST | `/api/task-matrices/[id]/batch-commands` | V1 schema 模型批量粘贴原始指标（≤500 单元格，部分成功+逐项错误，batch 末尾集中重算） |

> **数据矩阵 API 说明**：当前 UI（`src/app/(main)/tasks/[id]/components/matrix-tab.tsx`）实际调用的是 V2 路由（`/api/tasks/[id]/matrices`、`/api/matrices/[id]`、`/api/matrix-rows/[id]/values/[fieldId]`），对应任务级用户自设计模型。V1 schema-driven 路由（matrix-schemas / task-matrices / matrix-rows 的 slots/metrics）代码仍保留在仓库中，预留给后续「可复用设计库」使用。另有契约加固版 `/api/v1/*` 路由（带 `If-Match`/ETag 版本、幂等信封、`trace_id` 错误信封、`force-dynamic`），与 `/api/*` 路由共享同一套服务实现。

## 构建与运行

### 环境要求
- **Node.js**: 18.20+（本地/服务器环境需安装 Node.js 18.20+）
- **包管理器**: pnpm (禁止 npm / yarn)
- **数据库**: PostgreSQL 14+（本地 Docker 使用 postgres:16-alpine）
- **端口**: 5000（开发与生产统一读取 `PORT`，未设置时默认 5000）
- **Docker**: 仅用于本地测试模拟环境；实际上线仍按服务器 Node.js + PostgreSQL + 反向代理部署

### 环境变量

仓库提供 `.env.example` 作为本地部署模板；真实 `.env.local` 不提交到仓库。

| 变量名 | 说明 | 示例值 |
|--------|------|--------|
| `DATABASE_ACCESS_MODE` | 本轮唯一受支持的生产数据库访问模式；`supabase-service-role` 仅保留开发/测试兼容，生产启动会拒绝 | `self-hosted-postgres` |
| `DATABASE_URL` | PostgreSQL 连接字符串（本地模式） | `postgresql://<user>:<password>@<host>:<port>/<database>` |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase 项目 URL（云模式） | `<supabase-url>` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase 匿名密钥（云模式） | `<supabase-anon-key>` |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key，仅服务端保存 | `<service-role-key>` |
| `AUTH_SESSION_SECRET` | 生产会话签名密钥 | `<long-random-session-secret>` |
| `AI_CONFIG_ENCRYPTION_KEY` | AI API Key 加密密钥 | `<long-random-ai-config-key>` |
| `SECURITY_SCHEMA_VERIFIED` | 目标库执行并验证安全 schema 后才设为 true | `true` |
| `STORAGE_DRIVER` | 生产文件存储驱动，必须为 local | `local` |
| `NEW_UPLOAD_DRIVER` | 生产新上传驱动，必须为 local | `local` |
| `LOCAL_UPLOAD_DIR` | local 模式文件写入目录 | `./public/uploads` |
| `LOCAL_PUBLIC_BASE_PATH` | local 静态访问前缀 | `/uploads` |
| `LOCAL_UPLOAD_PUBLIC_ACCESS` | local 访问模式；生产必须为 protected，禁止公开 `/uploads/*` 直链 | `protected` |
| `PUBLIC_MEDIA_BASE_URL` | 平台可访问的完整媒体基准地址 | `http://<host>:5000` |
| `AI_ALLOWED_HOSTS` | 可选 AI 外联主机白名单 | `ai-gateway.internal` |
| `INITIAL_ADMIN_ACCOUNT` | 生产首次管理员账号，仅初始化时临时配置 | `<account>` |
| `INITIAL_ADMIN_PASSWORD` | 生产首次管理员强密码，仅初始化时临时配置 | `<strong-password>` |
| `PORT` | 服务监听端口 | `5000` |
| `NODE_ENV` | 运行环境 | `development` / `production` |

### 开发命令

```bash
# 安装依赖
pnpm install

# 开发模式（端口 5000，支持 HMR）
pnpm dev

# 类型检查
pnpm ts-check

# Lint
pnpm lint

# 构建生产版本
pnpm build

# 启动生产环境
pnpm start

# 数据矩阵（V1 schema 模型）：初始化/升级原汁机黄金样本模式
# 仅 V1 schema-driven 模型需要；V2 用户自设计模型不依赖此 seed
pnpm seed:matrix-schema

# 数据矩阵：公式引擎契约测试（受限 DSL 白名单/拒绝规则/语义引用，前后端共享同一份引擎）
pnpm check:matrix-formula
```

`pnpm dev` 仅用于本地开发。移动端或验收环境若出现左下角黑色 Next.js “N” 浮层，属于开发模式 Dev Indicator 暴露；应视为部署/环境问题处理。生产/验收必须先 `pnpm build`，再以 `NODE_ENV=production PORT=5000 pnpm start` 启动。`next.config.mjs` 已设置 `devIndicators: false` 隐藏开发期指示器，但不能替代生产构建。

### 服务器生产部署流程

> 实际上线不要求使用 Docker。推荐服务器上使用 Node.js + PostgreSQL + Nginx/Caddy 反向代理，Docker 只作为本地模拟生产环境。

```bash
# 1. 安装依赖
pnpm install --frozen-lockfile

# 2. 初始化/升级目标数据库
psql "$DATABASE_URL" -f database-schema.sql
psql "$DATABASE_URL" -f scripts/verify-security-schema.sql

# 3. 验证通过后设置 SECURITY_SCHEMA_VERIFIED=true，再执行检查和构建
pnpm ts-check
pnpm build
pnpm audit --audit-level moderate --registry https://registry.npmjs.org

# 4. 生产启动
NODE_ENV=production PORT=5000 pnpm start
```

> 部署数据矩阵特性需额外执行矩阵相关迁移（已登记进 drizzle journal）：
> - `0002_matrix_input_tables.sql`：建立 V1 schema 注册表 5 张表（`matrix_schemas`/`matrix_schema_versions`/`matrix_dimension_bindings`/`matrix_formula_definitions`/`matrix_calculation_runs`）+ `comparison_assemblies`/`metric_evaluations` 扩展列。
> - `0003_task_matrix_model.sql`：建立 V2 用户自设计模型 8 张表（`task_matrices`/`matrix_design_versions`/`matrix_sections`/`matrix_field_definitions`/`matrix_groups`/`matrix_rows`/`matrix_field_values`/`matrix_narratives`）。**当前 UI 实际使用 V2 模型，此迁移必须执行，否则矩阵 Tab 的 API 会 500。**
> - `pnpm seed:matrix-schema`：仅初始化 V1 原汁机黄金样本模式（schema 注册表），V2 模型不需要。未跑此 seed 只影响 V1 schema 库为空，不影响 V2 任务矩阵功能。

生产部署注意：

- 生产环境必须显式配置 `DATABASE_ACCESS_MODE`、`AUTH_SESSION_SECRET`、`AI_CONFIG_ENCRYPTION_KEY` 和 `SECURITY_SCHEMA_VERIFIED=true`。
- `SECURITY_SCHEMA_VERIFIED=true` 只能在目标库执行 `database-schema.sql` 和 `scripts/verify-security-schema.sql` 成功后设置。
- 自建 PostgreSQL 模式使用 `DATABASE_ACCESS_MODE=self-hosted-postgres`，生产环境不要同时暴露 `NEXT_PUBLIC_SUPABASE_URL` 或 `NEXT_PUBLIC_SUPABASE_ANON_KEY`。
- Supabase 兼容代码与配置字段继续保留，service role key 仍只允许服务端保存；但本轮 `DATABASE_ACCESS_MODE=supabase-service-role` 属于实验性禁用，生产启动必须 fail closed，待报告、矩阵、Agent 与分析能力等价后再单独启用。
- `SECURITY_SCHEMA_VERIFIED=true` 只是部署前置声明。生产启动还会只读探测核心表、列、FK/约束、索引和 Drizzle migration journal tag；任何缺失都拒绝启动，探针不会自动执行迁移，也不会输出数据库连接信息。
- 启动 schema provenance 有两条可信路径：存在 `drizzle.__drizzle_migrations` 时必须逐项匹配要求的 migration tag/timestamp/hash，缺失或过旧即拒绝启动且不得回退；不存在 journal 的 `database-schema.sql` 单体初始化仅在完整核心 manifest 全部通过后允许启动，并记录 `provenance=bootstrap-manifest`。
- 文件存储默认 local，上传写入 `public/uploads`；服务器部署必须将该目录挂载到持久化磁盘。
- local 素材目录必须挂载到持久化磁盘；生产使用 `LOCAL_UPLOAD_PUBLIC_ACCESS=protected`，Nginx 对外 `/uploads/*` 必须返回 404，素材只可经带时效签名的 `/api/materials/file/<key>` 访问。
- AI 内网、本机或 HTTP 地址不会默认拦截，便于内网优先部署；公网部署建议配置 `AI_ALLOWED_HOSTS` 并配合网络出口 ACL。
- **本地受保护媒体（2026-07-17）**：生产 `/home/ubuntu/product-experience-system/public/uploads` 是唯一素材位置。Nginx 的 `/_protected_uploads/` 为 `internal`，应用以 `X-Accel-Redirect` 转发本地文件；`/uploads/` 不得恢复外部 alias。`/api/materials/thumb`、`/api/materials/poster` 必须继承原始 `/api/materials/file` 的 `token` 与 `exp`。浏览器视频必须只用无扩展名的 `/api/materials/video/<base64url-key>?token=...&exp=...`，该入口移除 Range 后返回完整 `200` 单流；不得把带 `.mp4` 的 file 路由、裸 uploads 或 `206` 分段响应交给 `<video>`。
- **PM2 配置位置**：生产 PM2 用 `/home/ubuntu/product-experience-system/ecosystem.config.cjs` 启动（live 目录，不再依赖 backup-deploy 目录的旧文件）。env 全部写在该文件的 `env: {}` 块，重启用 `pm2 delete product-experience-system && pm2 start ecosystem.config.cjs && pm2 save`。
- **服务器内存与构建**：生产机仅 1.9G RAM，`next build` 会 OOM。每次服务器构建前必须临时加 4G swap：`sudo fallocate -l 4G /swap-build.img && sudo chmod 600 /swap-build.img && sudo mkswap /swap-build.img && sudo swapon /swap-build.img`，构建完成后再 `sudo swapoff /swap-build.img && sudo rm /swap-build.img`。构建还需带 DATABASE_URL 等 env（page-data 收集阶段会连库），从 PM2 env 导出 source 即可。
- **数据库在 Docker**：生产机没装 psql，PostgreSQL 跑在 Docker 容器（`172.17.0.1:5433`）。DB 相关操作需通过应用 node 脚本（用 `node_modules/pg`）或进容器执行，不能直接 `psql`。

### 当前生产实例与部署注意

截至 2026-06-29，当前生产实例：

- 主机：`118.25.178.78`
- 应用目录：`/home/ubuntu/product-experience-system`
- PM2 进程名：`product-experience-system`
- 外部访问入口：`http://118.25.178.78:5000`
- 当前 Node 应用端口：`PORT=5001`，生产环境变量来自 PM2 当前进程环境，不以仓库 `.env.local` 为准。
- 回滚包目录：`/home/ubuntu/deploy-backups/`

部署或排障时必须遵守：

- 不要把生产密码、API Key、AI 连接密钥写入 README、AGENTS、提交信息或脚本注释；文档只写变量名和操作原则。
- 远端非交互 shell 优先使用 `npx pnpm@9.0.0 ...`。
- 数据库迁移后要验证真实表，而不是只看脚本退出：至少检查 `project_phase_dict`、`issue_status_dict`、`report_view_configs`、`report_outline_sections`、`report_action_items`、`ai_runs`、`outbox_events`。
- V3.1.1/Wave 1 P0 回填在生产库 `reports=0` 时会得到 `report_outline_sections=0`、`report_action_items=0`，这是正常空库结果，不要误判为回填失败。
- 远端 `next build` 可能长时间卡住并导致 `.next/BUILD_ID` 缺失。此时不要重启 PM2 到半构建目录；先停止残留 build 进程，确认 `.next/BUILD_ID` 和 `dist/server.js` 存在，再重启。
- 如远端构建不可用，可在本地先通过 `pnpm build`，再上传运行时产物 `.next`（不含 cache）和 `dist/server.js` 恢复生产。上传后用 SHA256 对比关键文件。
- **Agent 发布数据隔离**：Agent 相关发布只能同步应用代码、DDL 迁移和已验证的构建产物；不得打包、导入、覆盖或回填 `agent_conversations`、对话消息、`agent_memory_namespaces`、`agent_binding_sessions`、企微/微信绑定或测试快照。任何 Agent migration 必须是幂等 DDL，禁止携带历史 Agent 问题或对话数据进入生产。
- 报告详情/打印页的素材问题不能只改 UI：问题点素材必须从 `/api/reports/[id]/issues` 的报告专用聚合链路读取，覆盖 `materials.issue_id`、`record_id`、`comparison_cell_id`、食谱步骤/效果 `material_ids`、`issue_re_evaluations.re_evaluation_id` 等 fallback。打印页应复用该聚合结果，并把问题点素材、整改素材、食谱上下文素材加入预签名与 base64 转换队列，避免冻结报告下载时裂图。
- **公网 HTTPS 阻塞记录（2026-07-17）**：服务器已监听 443 且证书配置有效，但从外部网络对 `https://px.abrdns.com:443` 的 TLS 握手仍被重置，8443 可用。未完成外部 443 握手前，不得将 5000 强制跳转 HTTPS，也不得将 `AUTH_COOKIE_SECURE` 设为 true，否则会破坏现有 30 天登录；云安全组/公网入口修复并通过外部握手验收后再统一切换。
- **任务录入布局回归边界（2026-07-11）**：任务顶部状态卡是唯一的任务内模块导航，不再恢复桌面/移动端第二套“录入目录”；顶部状态卡不放“问题管理”。食谱/功能问题点保存后直接同步问题管理，不得恢复独立“问题输出—确认”步骤。任务底部是唯一“素材证据”区，数据矩阵内不得再次显示“素材池”。
- **数据矩阵编辑回归边界（2026-07-11）**：文本/数值/问题点在本地草稿中编辑，只能在失焦或 Enter 后提交；保存不得切换整页 loading 或抢焦点。新增列必须按“层级→主素材→对比/输入→计算→效果素材→效果评价→问题点”分区插入，不能简单追加到末尾；新增三级细项不得让原三级细项输入控件消失。
- **报告矩阵与问题回归边界（2026-07-11）**：生成普通报告时必须在非归档矩阵中选择“最新且有实质内容”的矩阵，最新空矩阵不能遮蔽更早有效矩阵。数据矩阵问题进入报告问题 Tab，报告详情/打印统一呈现“问题点、可选问题详情、附录素材、整改”。分享令牌页保持匿名只读访问；打印预处理不得对 `data:` 占位图发起网络请求。
- **功能评价与复测收口边界（2026-07-13）**：功能/食谱只作整体“合格 / 不合格 / 待定”判断，默认待定；不合格与待定同步进入问题管理，问题一旦创建永久保留。移除效果与步骤问题点的录入、保存、AI 识别、徽标及写入口；描述/素材自动保存，AI 仅作为描述框内图标回填文字，不能改变判断。整改复测统一使用显式保存的三态结果、描述和素材；删除仅解除素材关联并按剩余最新记录回算状态。
- **问题状态与报告冻结边界（2026-07-13）**：问题可见状态仅为“待整改 / 整改中 / 整改完成 / 不整改”（存储值 `open / rectifying / verified_closed / waived`），不得新增“已重开”。报告的原始食谱/功能事实必须来自 `snapshot_id` 的 `snapshot_json.report_content`；实时数据只能叠加既有问题的状态、整改资料、最新复测和整改素材，不能倒灌后续原始判断或素材。详情、匿名分享、浏览器打印和服务端 PDF 必须消费同一冻结投影；步骤为 0 时不显示，步骤不展示问题点；复测 2 条及以上只显示最新一条和记录数。
- **报告生成问题所有权边界（2026-07-13）**：生成或再生成报告不得物理删除/重建既有 canonical issues，也不得从食谱步骤、效果旧问题点或矩阵快照再次制造问题；报告只冻结已有的整体判断问题。普通报告无论是否包含矩阵，都必须写完整 `report_content` 快照。新环境/部署迁移顺序为 `0013`、`0014`、`0015`、`0016`、`0017`。
- 报告中心具体报告列表必须按报告冻结/生成时间 `reports.created_at` 降序展示；不要让型号合并分组把较新的单份报告挤到后面。
- **冻结报告、合并与问题呈现边界（2026-07-14）**：报告列表的名称必须完整显示并自然换行；卡片采用稳定的单列信息流，不能因名称长度不同造成同列错位，也不能截断或隐藏名称。仅“前期研究 / 自研 / 改型降本优化”可按相同产品型号合并；ODM/OEM 永不合并。合并时每个任务只取最新冻结报告，成员按冻结/创建时间正序消费；详情、匿名分享、浏览器打印和下载视图都必须读取同一批冻结成员与顺序，不能用实时任务数据重建。
- **冻结报告问题 Tab 边界（2026-07-14）**：总结 Tab 不显示“管理问题”。问题行统一为“问题等级 + 来源类型 + 问题描述 + 整改状态”，文字与标签垂直居中，点击整行展开；来源类型只能是“食谱/功能”或“五感体验”，不得暴露“功能/食谱效果评价”等原始来源名。五感、单一食谱/功能、对比矩阵、数据矩阵问题必须都进入此统一列表；分享页只读，内部详情仅对已有 `liveIssueId` 的状态按钮打开问题管理的整改弹窗。
- **冻结问题详情边界（2026-07-14）**：五感体验优先按冻结检查记录归类，标准问题展示检验标准类型、检验要求及范围、检查标准、检查结果与附录素材；非标准只展示描述检查项内容、检查结果与素材。对比矩阵展示对象、项目、细项、问题、素材；数据矩阵展示一级大类、二/三级细项、对比维度、问题、素材；食谱/功能展示名称、食谱/食材或配方参数、默认折叠的步骤、效果评价和证据。历史步骤问题仅允许在冻结报告中阅读，不得恢复任务端步骤问题点的新建、编辑、同步或 AI 识别入口。状态为已整改时才展示整改效果评价和整改素材；复测记录达到 2 条只显示最新一条，并显示“整改复测记录数：N”。冻结快照仅提供问题事实和历史兜底；报告详情、分享、打印及 PDF 对已关联问题必须以实时复测列表为准，实时列表明确为空时不得显示已删除的冻结复测记录。
- **功能效果与下载排版边界（2026-07-14）**：功能/食谱整体判断只使用“合格 / 不合格 / 待定”，不得显示数值评分。保留效果预览卡片，下方必须用单食谱列表：食谱名称（步骤数、整体判断、问题数）→ 食谱/食材 → 效果评价及素材 → 默认折叠步骤 → 食谱效果评价及素材 → 问题点及素材。步骤数为 0 时不显示步骤行；打印/下载不得退回把步骤、步骤问题、效果问题和素材拆成多块的旧分割式视图。
- 部署完成的最小验证：PM2 在线、无残留 `next build` 进程、`curl http://127.0.0.1:5001/login` 返回 200、`curl http://127.0.0.1:5001/api/v1/dictionaries/project_phase_dict` 返回 200 且包含正常中文阶段值、`curl http://127.0.0.1:5001/reports` 返回 200。
- 外网验收以 `118.25.178.78:5000` 为入口；`5001` 是应用内层端口，不要求公网直接访问。

### Docker 本地测试模拟环境

```bash
docker compose -f docker-compose.local.yml up --build
```

默认访问：

```text
http://localhost:5000
```

默认 Docker 本地管理员：

| 角色 | 账号 | 密码 |
|------|------|------|
| 管理员 | dockeradmin | DockerLocal2026 |

停止本地 Docker 环境：

```bash
docker compose -f docker-compose.local.yml down
```

清空本地 Docker 测试数据和上传文件：

```bash
docker compose -f docker-compose.local.yml down -v
```

`down -v` 只用于本地测试，会删除 Docker volume 中的测试数据库和素材。

### 本地开发初始账号

系统不再内置硬编码默认管理员。本地开发首次初始化管理员时，也需要在 `.env.local` 中显式配置：

```bash
INITIAL_ADMIN_ACCOUNT=<account>
INITIAL_ADMIN_PASSWORD=<strong-password>
```

密码必须至少 10 位，并同时包含字母和数字，不能使用 `bear2026` 等弱口令。首次登录会按该配置创建管理员；创建完成后请移除这两个环境变量。注册新账号需管理员审核通过后可登录。

## 关键设计决策

1. **响应式布局**: 桌面端左侧导航 + 右侧内容；移动端顶部汉堡菜单 + 底部Tab导航
2. **任务详情页录入目录**: 当前一级入口为 AI方案 / 对比矩阵 / 数据矩阵 / 五感体验 / 功能效果 / 总结，顶部保留"报告生成"按钮
3. **素材引用**: 五感体验新增问题点和功能效果新增步骤时均可引用素材库图片（MaterialPicker组件）
4. **素材上传**: 100MB 限制，仅图片/视频；只上传至 local `public/uploads`，可关联record_id、recipe_step_id、recipe_library_step_id、recipe_id、issue_id、re_evaluation_id；选择素材弹窗支持粘贴图片直接上传。
5. **报告生成**: 包含任务信息+检查记录+问题清单+食谱/功能详细列表+素材附录
6. **PDF导出**: 通过打印页面(`/reports/print?id=xxx`)实现，浏览器原生打印为PDF，含照片/视频预览图
7. **数据库**: 本轮生产仅支持自建 PostgreSQL；Supabase service-role 保留兼容代码但生产实验性禁用。生产环境禁止 `allow_all`，必须执行 `database-schema.sql` 和 `scripts/verify-security-schema.sql` 后再设置 `SECURITY_SCHEMA_VERIFIED=true`，且真实启动探针仍须通过
8. **AI 预留**: materials 表预留 ai_analysis_status 和 ai_result 字段
9. **标准批量导入**: 支持 PDF（pdf-parse 本地提取文本 + AI 结构化解析）和 Excel（xlsx 直接解析），按标准分类使用不同 prompt，并调用当前启用的 AI 配置
10. **标准分类维度重构**: 四类标准（通用/品类/感官评价/食谱功能）有不同输入字段结构，创建和编辑时按分类展示不同表单
11. **五感体验-新增问题点重构**: 移除"从标准库引用"栏目，改为选择"标准类型"后按类型展示不同筛选/输入字段；通用标准选择产品使用阶段→体验流程→感官维度后自动带出触点和检验范围及具体要求
12. **权限控制**: 服务端以 `requireUser`、`requireAdmin` 和资源级 `canAccess*` 为可信边界；管理账号(admin)可编辑标准、导入、删除和管理账号；使用账号(user)可执行自身任务相关操作
13. **问题管理重构**: 问题点来源从手动创建改为自动从报告汇总（不合格检查项+食谱功能问题），按报告名称分组；等级合并为一类/二类/三类；状态可切换（待整改/整改中/不整改/已整改）
14. **报告中心重构**: 移除"生成报告"按钮，新增"报告对比"功能；前期研究/自研/改型降本优化报告按product_model在列表页分组，详情页/打印页/分享页内容级合并
15. **报告内容级合并**: 前期研究、自研和改型/降本/优化类型的报告，在报告详情页、打印页和分享页中，同product_model的所有报告按时间排序合并展示，每份报告连续完整，用分割线和阶段/时间标注区分
16. **体验计划项目类型**: 新建时选择项目类型（ODM/OEM/竞品研究/自研/前期研究/改型降本优化/海外产品），自研可选项目阶段（手板研究/试制阶段/试产阶段/量产阶段）
17. **检查记录编辑重构**: 点击问题点用现有记录数据预填充表单，复用新增问题点对话框（标准类型选择+级联字段+检查结果+素材管理），保存调用 PUT /api/records/[id]；编辑模式切换标准类型时自动从记录预填充共享字段（sensory_dimension/problem_description/evaluationResult等）
18. **数据隔离**: 体验计划和问题管理按用户隔离（experience_tasks.created_by字段），工作台数据按用户过滤；标准管理和报告中心保持平台共享（因同型号不同阶段可能不同账号承接）；报告中心支持“全部报告/个人报告”，普通登录用户可读取内部报告，编辑/分享按归属或管理员权限控制
19. **非管理员待申请**: 非管理员工作台"待审核"改为"待申请"，显示该账号的密码/名称修改待审核列表（排除注册记录），可用叉图标取消申请
20. **数据分析**: 所有账号可浏览数据分析页面，核心指标为任务数/完成率/问题总数/整改率；支持按品类/项目类型/任务人/问题点分类/时间范围多维筛选；保留任务状态分布/问题等级分布(一类/二类/三类)/问题整改进度(按状态×等级)；管理账号可导出数据
21. **报告分享**: 报告中心和报告详情页可生成分享链接，设置有效期（7天/30天/永久）；公开页面 `/reports/share/[token]` 无需登录，只读查看，支持导出PDF、图片放大、视频播放；分享创建、访问、撤销写入安全审计
22. **报告重新生成**: 同一任务重新生成报告时，先删除旧报告和旧问题，再创建新报告和新问题，确保每个任务始终只有一份最新报告
23. **问题自动创建**: 问题在报告生成时由后端自动创建（非前端同步），使用 `createdKeys` Set 去重确保每个唯一问题（按 title+source_type）只创建一条，与素材数量无关；前端仅做只读查询
24. **报告合并类型检查**: 报告详情页合并同型号报告时，仅合并"前期研究"、"自研"和"改型/降本/优化"类型的报告，其他类型（如"海外产品"）的同型号报告不参与合并
25. **视频素材缩略图**: 五感体验已选素材列表和PDF导出附录中，视频素材使用 `<video preload="metadata">` 显示首帧缩略图，覆盖半透明播放图标区分图片
26. **管理员删除账号**: 管理员可在账号权限管理中删除用户（不可删除自己和最后一个管理员）；删除时级联清理 `report_shares.created_by`（设null）和 `platform_audit_requests`；报告中的 organizer 名称字符串不受影响
27. **审核参数规范**: 前端审核请求统一使用 `request_id` 字段（非 `audit_id`），与后端 PUT /api/auth/audit 接口参数名保持一致
28. **五感体验描述匹配**: 新增问题点时支持输入关键词模糊搜索标准库，选择匹配项后自动反选使用阶段、体验流程、感官维度
29. **通用标准选项管理**: 管理员可在个人设置中管理通用标准检查项的选项值（产品使用阶段、体验流程、感官维度），存储在 platform_settings 表（key='standard_options'），UI 和实现形式参考"品类与产品设置"；标准管理详情页和体验计划五感体验页均从该设置动态读取选项（带默认值兜底）
30. **非标准检查类型**: 五感体验新增问题点的标准类型新增"非标准"选项，仅要求描述结果和检查结果，无需产品使用阶段/体验流程/感官维度
31. **体验计划基本信息编辑**: 任务详情页基本信息Tab支持点击编辑按钮进入编辑模式，修改后保存调用 PUT /api/tasks/[id]
32. **食谱内容积累与引用**: 食谱/功能支持点击编辑图标修改名称和参数；新增食谱时支持搜索食谱库并引用（含步骤复制）
33. **食谱步骤拖拽排序**: 食谱步骤和食谱库步骤支持 HTML5 原生拖拽排序（GripVertical拖拽手柄），体验计划步骤也采用同样的拖拽排序组件；调用 PUT /api/recipe-steps 批量更新 step_number
34. **食谱步骤跨食谱引用**: 新增步骤时支持搜索食谱库引用已有步骤的操作和问题点；新增食谱时支持引用已有食谱（含参数和步骤）
35. **食谱库按品类-产品分类**: 食谱库独立存储在 recipe_library 表，按品类-产品分类，整合显示在标准管理页面；报告生成时自动去重保存到食谱库（仅按食谱名称去重，不考虑品类和产品不同）；名称全局唯一约束
36. **任务状态自动流转**: 移除"待审核"状态，仅保留待执行/进行中/已完成；待执行→进行中（新增五感体验/食谱内容时自动触发）；进行中→已完成（生成报告时）；已完成→进行中（编辑已完成报告内容时）
37. **报告状态修正**: 报告生成后状态直接为"已完成"（非"草稿"）；旧"草稿"状态在列表中显示为"已完成"
38. **体验计划转移**: 管理员可将体验计划从用户A转移到用户B，转移后所有资料（素材、五感体验、食谱功能等）归属目标用户；仅管理员可操作；前端获取用户列表和转移操作均以当前登录会话鉴权，不再依赖前端传入 `admin_user_id`
39. **标准管理双板块**: 标准管理页面划分为"体验标准"和"食谱库"两大板块，通过顶部Tab切换；体验标准列表采用与食谱库一致的卡片样式
40. **问题去重增强**: 报告生成时问题创建增加 DB 级唯一约束 `UNIQUE(title, source_type, task_id)`，insert 失败时静默跳过；前端报告生成按钮增加防重复点击锁
41. **食谱库步骤管理**: 食谱库支持展开查看步骤详情；添加步骤时支持直接上传图片（先创建步骤获取ID再上传）；步骤支持编辑/删除/拖拽排序
42. **标准检查项问题等级**: 统一为一类/二类/三类，与问题管理保持一致（原一级/二级/三级已废弃）
43. **记录编辑同步问题**: PUT /api/records/[id] 更新检查记录时，同步更新对应问题状态（合格→已验证，不合格→待整改），通过 title+source_type+task_id 匹配
44. **编辑模式素材管理**: 编辑问题点时，通过 initialMaterialIds 追踪初始素材，保存时对比差异：新增素材关联 record_id，取消选择的素材设置 record_id=null 解除关联
45. **MaterialPicker 增强**: 新增 initialMaterials prop 支持预填充已有素材缩略图；支持 recipe_library_step_id 参数
46. **报告时间格式化**: 报告中心 created_at/updated_at 以北京时间（UTC+8）格式显示，隐藏 created_by 字段
47. **页面内边距统一**: 工作台/报告中心/问题管理等主页面统一使用 p-4 lg:p-6 内边距，与体验计划/标准管理/数据分析页面一致
48. **食谱效果评价**: 每个食谱/功能新增"效果/出品效果评价"板块（与步骤同等级），包含效果描述输入框+附件素材框+AI总结评分；AI通过视觉评估食物状态和功能效果，按美食评委评分制（满分10分）输出分数
49. **AI模型配置**: 管理员可在个人设置中配置 AI 接入信息，支持兼容 Chat Completions 的服务；具体敏感连接信息不写入仓库文档，配置存储在 `ai_model_configs` 表或平台设置中
50. **食谱效果素材关联**: materials表新增recipe_id字段，可关联食谱效果评价的附件素材；MaterialPicker组件支持recipe_id参数
51. **AI效果评价API**: POST /api/recipes/[id]/ai-evaluate 端点，接收食谱描述+图片素材，调用AI模型按四维评价体系（质感/透彻/纯净/恒定）生成评价，每维度0-10分+评语，综合评分自动保存到recipes.effect_score，完整结果保存到recipes.effect_ai_result(JSONB)
52. **效果评价问题点**: 效果/出品效果评价板块新增问题点输入框（effect_problem_point字段），与步骤的问题点格式一致；报告生成时效果问题点也会自动创建问题记录
53. **报告效果评价展示**: 报告详情页、打印页、分享页均展示效果评价板块（描述+问题点+素材+AI四维评价结果+综合评分），打印页base64转换包含效果素材图片；AI评价结果可随报告下载PDF
54. **AI四维评价框架**: AI评价内部采用固定四维评价体系作为方法论（质感/透彻/纯净/恒定），但对外仅展示综合评分和总结评语，不展示四维度细节；评价结果存储在recipes.effect_ai_result(JSONB)，格式为 { score, summary }
55. **AI评价结果持久化**: AI评价结果完整保存到数据库effect_ai_result字段，体验计划页面和报告中心均可查看历史评价结果；重新生成报告时effect_ai_result随食谱数据保存到报告content中
56. **效果评价素材去重**: 效果评价板块的素材仅通过MaterialPicker的initialMaterials展示，不再重复渲染预览区块
57. **产品型号条件必填**: 新建体验计划时，产品型号仅在项目类型为"自研"或"改型/降本/优化"时必填（Label动态显示*号），其他项目类型（ODM/OEM、竞品研究、前期研究、海外产品）产品型号可选
58. **步骤素材与问题点素材分离**: 食谱步骤中，步骤素材缩略图显示在"具体操作"文本下方，问题点素材缩略图显示在各自"问题点"文本下方；编辑步骤时通过 initialMaterials 预填充已有素材，保存时对比新旧素材列表进行关联/取消关联
59. **步骤编辑修复**: handleEditStep 直接使用 step.materials 访问素材数据（移除 as unknown 类型转换），编辑对话框 MaterialPicker 传入 initialMaterials 正确显示已选素材
60. **主界面固定视口滚动**: 主布局从 flex min-h-screen 改为 flex h-screen overflow-hidden，主内容区域 overflow-y-auto 实现内部滚动，侧边栏 h-full shrink-0 与视口高度保持一致，不再无限拉长页面
61. **报告生成食谱排序**: 生成报告时，如果用户没有拖动排序食谱（所有 sort_order 为 0），则按 AI 评分（effect_score）降序排列；如果用户有拖动排序（sort_order 有非 0 值），则按用户拖拽排序呈现；无 AI 评分的食谱排在有评分食谱之后
62. **食谱列表显示AI评分**: 任务详情页功能效果中食谱卡片新增评分显示（如"1 步骤 · 1 问题 · 8.3分"），报告详情页、打印页/PDF导出、报告分享页均同步显示 AI 评分
63. **报告食谱食材/参数展示**: 报告详情页、打印页、分享页的食谱卡片头部新增食材/参数(ingredients)展示，呈现形式与体验计划功能效果中食谱列表一致（类型Badge + 名称 + 食材/参数 + 步骤数/问题数/AI评分）
64. **素材删除保护**: 删除五感体验条目(check_record)、食谱步骤(recipe_step)、食谱(recipe)、食谱库步骤(recipe_library_step)、食谱库(recipe_library)时，仅解除素材关联（将record_id/recipe_step_id/recipe_id/recipe_library_step_id设为null），不删除素材本身；DB外键从onDelete("cascade")改为onDelete("set null")
65. **任务名称自动填充**: 新建体验计划时任务名称非必填；用户未填写时自动生成格式：品类产品名型号项目类型日期(YYYYMMDD)-组织者（无加号连接符，日期-组织者间用短横线）
66. **食谱问题点独立板块**: 功能效果中问题点从效果评价中分离，与"步骤"、"效果/出品效果评价"并列为第三板块；问题点改为结构化列表（文本框+上传素材），支持多条问题点增删；数据存储在 effect_problem_point 字段（JSON数组格式）；步骤中的问题点输入已移除，统一在问题点板块输入
67. **问题点AI识别**: 问题点板块新增AI识别功能，两层分析逻辑：(1)第一层从步骤描述和效果评价中识别负面情绪语言；(2)第二层以专业产品评价官视角，基于该食谱/功能在互联网中用户普遍期待状态对比实际体验，识别期待与实际的差距；API: POST /api/recipes/[id]/ai-detect-problems
68. **素材库原生相机**: 移动端拍照和录像调用设备原生相机（input capture="environment"），而非浏览器摄像头(getUserMedia)；桌面端仍使用浏览器摄像头
69. **素材库图片编辑**: 报告录入页及素材库原图预览可打开前端 Canvas 图片编辑器，支持画笔、箭头、马赛克、文字、裁剪、旋转、翻转、格式和尺寸控制（长边上限 1920px）。未冻结素材可覆盖或另存；被冻结报告引用的素材服务端必须拒绝覆盖并强制另存为新素材，保证历史报告不变。
70. **报告列表型号标签**: 报告中心列表中增加产品型号Badge显示（如有），与品类/项目类型Badge同行
71. **报告问题点清单分行呈现**: 报告详情页、打印页、分享页的问题清单优化为多行结构化呈现——第一行：等级+标题+状态；第二行：标准/分类（如有）；第三行：问题来源；第四行：整改方案（含责任人、计划完成日期）；第五行：验证结果（如有）
72. **素材预览放大**: MaterialPicker中已选素材缩略图支持点击放大查看（图片）或播放（视频），使用Dialog全屏预览
73. **问题点保存同步效果评价**: 问题点板块的"保存"按钮调用handleSaveEffect，同时保存效果描述和问题点数据
74. **AI模型切换**: 已迁移至统一的兼容接口调用方式；支持在 `ai_model_configs` 表配置当前启用的 AI 接入信息；移除 `forceBuiltInModel` 参数，统一走 fetch 调用
75. **Agent预设错误上报**: Agent预设API(agent-presets)不再静默吞掉AI调用失败错误；无结果且有错误时返回code:1和500状态码，部分失败时在warnings字段返回错误详情，前端toast显示失败原因
76. **标准建议过滤放宽**: normalizePresetSuggestions对standards的过滤条件从"必须有standardItemId"放宽为"有standardItemId或reason或focus"，使AI生成的新建议（无DB ID）也能展示
77. **（预留项）**
78. **功能效果食谱管理增强**: 功能效果中食谱列表支持删除（带确认弹窗）和拖拽排序（GripVertical手柄）；食谱步骤支持删除和拖拽排序
79. **问题点复评估闭环**: 功能效果来源(recipe_problem)的问题点支持多次复评估；新增issue_re_evaluations表存储复测记录（description+ai_result+materials）；素材通过materials.re_evaluation_id关联复评估记录；五感体验来源(record_fail)的问题点弹窗保持原样（整改方案/责任人/计划完成日期），功能效果来源显示复评估表单（描述评价+选择素材+AI总结）；复测结果按时间倒序排列（最新顶置），报告详情页/打印页/分享页问题清单下方附录复测结果（含素材图片）
80. **复评估AI总结可编辑**: 复评估记录中AI评分和AI总结文本支持点击编辑按钮进入编辑模式，修改后保存；描述评价也支持编辑
81. **数据矩阵录入视图定位**: 数据矩阵输入视图是任务工作台的一个录入组件（任务详情页新增“数据矩阵”Tab，仅当任务存在 data_matrix 装配时显示），与既有对比矩阵并列；它不是报告模板，也不是 Excel 复刻。详细规格见 `docs/superpowers/specs/2026-07-03-data-matrix-input-view-design.md`，实现计划见 `docs/superpowers/plans/2026-07-03-data-matrix-input-view-implementation.md`。
82. **Schema 驱动原则（核心）**: 列/行/单元格的全部内容由 `MatrixSchema` 决定（管理员发布、版本化、发布后不可变）。Excel 样本（`数据矩阵.xlsx`）仅作示意，平台绝不硬编码出汁率/食材重量等业务字段。不同 schema 渲染出不同矩阵；原汁机孔径模式是 `pnpm seed:matrix-schema` 初始化的黄金样本，不是平台默认。结果状态选项（达标/待观察/不达标/不适用）schema 可覆盖，缺省回退到平台四选项默认。
83. **受限 DSL 公式引擎**: 公式使用语义引用 `SELF("juice_weight")/SELF("ingredient_weight")`，不是 Excel 的 `=H3/G3` 坐标引用。白名单函数：IF/COALESCE/ROUND/MIN/MAX/ABS/SUM/AVG/UNIT/TO_SECONDS + 分组聚合 GROUP_AVG/SUM/MIN/MAX/COUNT。拒绝：前导 `=`、INDIRECT/OFFSET/WEBSERVICE/VBA/MACRO、`&` 拼接、动态坐标。前后端共享同一份引擎文件 `src/lib/matrix/formula-engine.ts`，避免双份实现漂移。
84. **乐观 + 权威计算**: 前端乐观计算即时回显，服务端用同一引擎复核（`recomputeAffected`），不使用异步队列。复核幂等于 `input_version_hash + formula_version_hash`，相同输入不重复计算。`matrix_calculation_runs` 记录每次复核的输入/公式哈希与状态作为审计链。
85. **三槽位规则**: 每行三个槽位——效果结论 / 过程记录 / 关联问题，无人工评分框。问题通过 `issues` 表关联（issues 的严重度一类/二类/三类是平台级语义，不是 schema 维度）。对应 V3.1.1 §27.2.3。
86. **复用既有表**: 不为数据矩阵新建独立实例表，而是复用 `comparison_assemblies`（打 `matrix_role='data_matrix'` 标记）、`comparison_item_nodes`（section/item 节点承载分组与行）、`metric_evaluations`（扩展 typed-value 列承载原始输入与计算结果）；素材/问题复用 `materials`/`issues`。仅新增 5 张 schema/版本/维度/公式/计算记录表。
87. **移动端响应式**: 数据矩阵在窄屏切换为分组卡片 + 维度抽屉布局，使用纯 CSS 响应式断点切换，不依赖 JS 媒体查询 hook。
88. **报告投影冻结**: 生成报告时将 data_matrix 投影完整冻结写入 `report_snapshots.snapshot_json.matrix_projection`，而不是仅存 instance_id，避免后续 schema 变更或数据修改导致报告内容漂移。
89. **已知限制**: (a) schema-publish 循环依赖检测存在自环缺口——自引用公式如 `juice_yield = SELF("juice_yield")+1` 会因 `dep !== from` 守卫跳过自身而漏检，待后续加固；(b) manual 指标写入 + recompute 之间无 DB 事务（pg-query 适配器限制），复核失败时保留手动值（有意），计算值可能短暂陈旧，API 返回 `needs_recompute: true`；(c) 并发计算单元格 upsert 仍存在窄读→守卫更新竞态窗口，比此前收窄但未完全原子（需 SELECT FOR UPDATE 才能彻底消除）。
90. **数据矩阵 Wave 映射**: Wave 0（schema/公式引擎/迁移）与 Wave 1（实例/CRUD/投影/移动端/报告）已完成；Wave 2（受限公式构建器、模式草稿/审批、批量粘贴增强）未做；RESERVED（任意 Excel 解析、A1 自由公式、宏/VBA、自由画布单元格格式）明确不做。
91. **批量粘贴增强 (Wave 2)**: 从 Excel 粘贴「原始指标区」到桌面 grid（移动端不开）；点选 observed+editable 单元格作错点 → Cmd/Ctrl+V → 服务端校验分两层：batch 级（anchor 存在/可观测、commands 非空、≤500 上限）失败则整批拒绝（422/400/429）；逐命令几何校验（同组、列序≥错点、行序≥错点）为 partial success——单个命令失败（如计算列 `MATRIX_CALCULATED_VALUE_READONLY`、跨组、跳列）只标记该命令，其余照常写入 → batch 末尾按行去重集中重算 → 返回逐命令成功/失败 + 权威计算结果。仅原始指标区（计算列/行标签/证据拒绝）；≤500 单元格/次（超出 429）；跨组截断到当前组末 + warning；失败格前端红色高亮 + 错误码 tooltip，可单格 PATCH 重试。复用 `upsertMetricEvaluation` + `recomputeAffected`，不新增表。幂等键 = `matrix_calculation_runs.trace_id = clientOperationId`（v1 不重放逐项结果，返回 warning 提示刷新投影）。paste 监听器只在多单元格（含 \t/\n）且目标在聚焦单元格内时触发，避免劫持 textarea/搜索框粘贴。
92. **受限公式构建器 (Wave 2-2)**: admin 在设置面板「数据矩阵模式管理」Dialog 里通过结构化点选表单（积木块：SELF/数字/算术运算符/ROUND）组装计算列公式 + 同表单创输出列 → 保存草稿 → 发布（复用 Wave 1 编译校验 + 循环检测）。最小能力集（SELF+算术+ROUND+数字字面量），不暴露 REF/GROUP_*/IF/COALESCE（DSL 引擎支持但 UI 不开放，后续可扩）；强制结构化点选（无文本框，避免手写非法 DSL）；语义化存储（`SELF("juice_weight")` 非 A1 坐标）；草稿保存走 replace 策略幂等；admin 直接发布无审批。token 流 → DSL 转换是纯函数 `tokensToDsl`，前端预览复用 `compileFormula`/`evaluate`。
93. **数据矩阵当前 UI 模型 = V2 用户自设计（重要）**: 上述笔记 81–92 描述的是 V1 schema-driven 模型（管理员发布模式 → 任务应用模式实例 → 复用 comparison_assemblies）。**当前任务详情页的「数据矩阵」Tab 实际运行的是 V2 用户自设计模型**（PRD V3.1 §3.4–3.8）：用户在任务内自建矩阵 → 5 步设计器定义基础结构/字段分区/字段与证据/公式与问题规则/预览确认 → 确认后进入录入。V2 使用独立表族（`task_matrices`/`matrix_design_versions`/`matrix_sections`/`matrix_field_definitions`/`matrix_groups`/`matrix_rows`/`matrix_field_values`/`matrix_narratives`，迁移 `0003_task_matrix_model.sql`），**不再复用 comparison_assemblies**。前端入口 `src/app/(main)/tasks/[id]/components/matrix-tab.tsx`，调 `/api/tasks/[id]/matrices` + `/api/matrices/[id]`；桌面端 `matrix-desktop-grid.tsx`、移动端 `matrix-mobile-v2.tsx`、设计器 `matrix-designer.tsx`。V1 schema 路由代码仍保留在仓库，预留给后续「可复用设计库」。功能开关在 `platform_settings.feature_flag_task_matrix`（默认全开：taskMatrixEnabled/matrixRuntimeDesignerEnabled/matrixFormulaEnabled/matrixMobileEnabled/matrixBatchPasteEnabled/matrixReportProjectionEnabled/matrixStructuralRevisionEnabled）。
94. **矩阵素材与报告/PDF投影**: 既有对比矩阵素材继续绑定 `comparison_matrix_cells.id`；V2 数据矩阵行级证据复用同一素材表与 `/api/comparison-cells/[id]/media`，该接口兼容 `matrix_rows.id` 并把素材写入 `materials.comparison_cell_id`。`projection-v2` 会把行级素材带入 `evidenceMaterials`，报告适配器转成 `evidence.media`；报告中心矩阵 Tab、报告详情模型、分享页和 PDF 导出都必须读取该字段，PDF 渲染前由 `presignReportMediaUrls` 统一签名，避免矩阵图片/视频裂图。
95. **对比矩阵大类插入边界**: `comparison_item_nodes` 的新增逻辑必须按 `parent_id` 计算插入点。给 A 大类新增条目时，应插入 A 大类已有 summary 之前；给 A 大类新增 summary 时，应追加在 A 大类末尾并仍位于 B 大类 section 之前。前端渲染也要按 parent 分组重排，避免 report snapshot 或任务页矩阵把“大类小结”漂移到最后。
96. **本地素材安全方案（当前生产）**: 生产使用 local-only：`STORAGE_DRIVER=local`、`NEW_UPLOAD_DRIVER=local`、`LOCAL_UPLOAD_PUBLIC_ACCESS=protected`。读取链路通过 `/api/materials/presign` 取得短时签名 `/api/materials/file` URL，并以 Nginx internal X-Accel 高效读取同一本地文件；缩略图/视频海报复用同一签名。历史数据无论 `file_path` 存裸 key 或 `/uploads/<key>` 前缀都必须可查，禁止引入 S3/对象存储回退。

## 代码风格

- 使用 shadcn/ui 语义化变量（bg-primary, text-muted-foreground 等），禁止硬编码颜色
- 使用 cn() 合并类名
- 所有 API 返回统一结构 `{ code, message, data }`
- React 组件使用 'use client' 标注客户端组件
- 禁止 Hydration 错误：不在 JSX 中使用 typeof window/Date.now() 等
- 权限系统：基于数据库 `platform_users.role` 字段和服务端 `requireUser` / `requireAdmin` / `canAccess*` 判断；管理账号(admin)可管理标准、账号和全局数据，使用账号(user)可维护自己归属的体验计划、素材、记录、问题与报告相关操作；`useAuth()` hook 仅用于前端显示状态，不作为安全边界
- **移动端溢出处理**: flex-1 元素必须添加 `min-w-0`；长文本使用 `break-all` 或 `truncate`；Badge 使用 `max-w-[Npx] truncate`；根 body 已设置 `overflow-x-hidden`
- **仓库目录骨架**: 可提交空目录占位文件（如 `public/uploads/.gitkeep`）以保留部署目录结构；真实上传素材、日志、构建产物和 `.env.local` 不提交。

## 权限说明

### 账号体系
- **本地开发初始管理账号**: 不再内置硬编码默认账号；通过 `INITIAL_ADMIN_ACCOUNT` 和 `INITIAL_ADMIN_PASSWORD` 显式临时配置
- **Docker 本地模拟账号**: dockeradmin / DockerLocal2026，仅用于 `docker-compose.local.yml`
- **生产首次管理员**: 通过 `INITIAL_ADMIN_ACCOUNT` 和 `INITIAL_ADMIN_PASSWORD` 显式临时配置，初始化后移除；生产不会自动创建 `bear2026`
- **注册流程**: 填写账号/密码/名称 → 提交审核 → 管理员审核通过后可登录
- **忘记密码**: 验证账号存在 → 填写新密码 → 提交审核 → 管理员审核通过后生效
- **修改信息**: 名称/密码修改需提交审核 → 管理员审核通过后生效
- **角色管理**: 管理员可将普通用户升级为管理账号，或降级管理账号为普通用户
- **删除账号**: 管理员可删除用户账号（不可删除自己，不可删除最后一个管理员）；删除后该账号不存在，但其创建的报告和组织者名称保留

### 操作权限

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
| 审核账号注册/密码/名称 | ✅ | ❌ |
| 升级/降级用户角色 | ✅ | ❌ |
| 删除用户账号 | ✅ | ❌ |
| 查看所有体验计划/问题 | ✅ | ❌(仅自己的) |
| 查看报告中心全部报告 | ✅ | ✅(内部共享只读) |
| 编辑/分享报告 | ✅ | 仅自己任务生成的报告 |
| 数据分析导出 | ✅ | ❌ |
| 数据分析浏览 | ✅ | ✅ |

## 常见问题与修复

| 问题 | 根因 | 修复 |
|------|------|------|
| 审核请求点击通过报"参数不完整" | 前端发送 `audit_id`，后端期望 `request_id` | `dashboard/page.tsx` 中 `audit_id` 改为 `request_id` |
| 问题列表出现重复 | 前端 `syncReportIssues` 并发竞态 + 多素材每个生成一个issue | 移除前端同步，问题创建移至后端报告生成时，`createdKeys` Set 去重 |
| 重新生成报告产生重复 | POST /api/reports 始终 insert 新报告 | 生成前先删除同 task_id 的旧报告和旧问题 |
| 报告合并了不应合并的类型 | 合并逻辑未检查候选报告的 project_type | 添加 `rProjectType` 过滤，仅合并"前期研究"/"自研"/"改型降本优化" |
| 移动端长字段穿透屏幕 | flex-1 无 min-w-0、Badge 无 max-w | body 加 `overflow-x-hidden`，flex-1 加 `min-w-0`，长文本用 `break-all`，Badge 用 `max-w-[Npx] truncate` |
| 手机左下角出现黑色 Next.js “N” 浮层 | 访问了 Next.js 开发模式 Dev Indicator，常见于误用 `pnpm dev` 或非生产构建 | 生产/验收环境必须 `pnpm build` 后以 `NODE_ENV=production PORT=5000 pnpm start` 启动；保留 `next.config.mjs` 的 `devIndicators: false` 作为开发期隐藏兜底 |
| 视频素材不显示缩略图 | 五感体验和PDF附录过滤了 video 类型 | 移除 `material_type === 'image'` 过滤，视频用 `<video preload="metadata">` + 播放图标 |
| 转移功能提示目标用户异常 | 前端候选用户与任务当前归属判断不一致，或后端仅凭前端身份参数判断 | 用户列表和转移接口统一基于当前登录会话鉴权，前端按任务 `created_by` 排除当前归属用户 |
| 问题点偶发重复 | 报告生成并发或双击导致重复创建 | DB 唯一约束 `UNIQUE(title, source_type, task_id)`，insert 失败静默跳过 |
| 编辑问题点素材取消选择不生效 | 保存时只处理新增关联，未处理取消关联 | 保存时对比 `initialMaterialIds` 与 `selectedMaterialIds`，差异项设 `record_id=null` |
| 编辑问题点切换标准类型后表单为空 | `populateFormsFromRecord` 只填充原始类别表单 | 切换类别时从 `editRecordData` 自动预填充共享字段（sensory_dimension/evaluationResult等） |
| 食谱库步骤添加图片报"缺少必要参数" | upload API 要求 task_id 必填，食谱库步骤无 task_id | DB 将 materials.task_id 改为可选，新增 recipe_library_step_id 字段 |
| 食谱库删除图标报错 | 重写 route.ts 时丢失 DELETE handler | 重新添加 DELETE handler，含步骤和素材级联清理 |

## 2026-06-13 Codex hardening notes

- `pnpm smoke:e2e` runs Playwright smoke tests against `E2E_BASE_URL` or `http://127.0.0.1:5000`. Keep this suite focused on real click paths: login, standards recipe library, task detail navigation, report detail navigation, and app error-boundary checks.
- `GET /api/recipe-library` supports `limit`, `offset`, and `include_steps`. Existing UI requests `include_steps=1&limit=100`; new lightweight clients should use `include_steps=0` and page through results.
- `GET /api/reports` defaults to active reports only. Pass `include_archived=1` only for history/debug views. Keyword search is pushed into database filters and remains paginated.
- Report regeneration preserves history: previous reports are marked `status='archived'`, previous generated issues are marked with `_old` source types, and the new report gets an incremented `version`. Do not reintroduce physical delete-on-regenerate behavior without a product decision.
- Current issue lists and data analysis exclude `_old` issue source types by default so archived report history does not double-count active risk metrics.
- `POST /api/analysis` with `{ "format": "csv" }` streams one CSV response in batches instead of returning large JSON strings. Frontend export must read the response as a `Blob`.
- High-risk list/export endpoints use `[api.performance]` slow-request logging; tune thresholds in `src/lib/server/api-performance.ts` if production logs are too noisy.
| 效果评价图片重复出现 | MaterialPicker已有initialMaterials展示，下方又有独立预览区块 | 移除重复的素材预览区块，仅保留MaterialPicker |
| 产品型号所有项目类型都必填 | 表单验证未区分项目类型 | 仅"自研"和"改型/降本/优化"时必填，其他类型可选 |
| 生产库残留 `allow_all` 或 RLS 边界不清 | 旧策略会扩大匿名访问面，影响等保整改 | `database-schema.sql` 启用 RLS 并删除 `allow_all`，上线前必须执行 `scripts/verify-security-schema.sql` 并留存结果 |
| gen_random_uuid运行时错误 | schema.ts 中作为JS函数调用，改为 sql`gen_random_uuid()` 模板语法 | 所有 gen_random_uuid() 改为 sql`gen_random_uuid()`，导致所有API返回500 |
| AI配置无效 | 旧 AI 配置不可用或已过期 | 已迁移至统一的兼容接口调用方式，可在设置中配置当前启用的 AI 服务 |
| AI探索返回空内容 | platform_settings.ai_config 中模型配置过时 | 已迁移至 ai_model_configs 表；agent-presets API 无结果时返回错误信息而非空数据 |
| 步骤保存后无法编辑 | handleEditStep 使用 as unknown 类型转换导致素材数据丢失 | 直接使用 step.materials 访问，编辑对话框传入 initialMaterials |
| 侧边栏与内容长度不一致 | 主布局使用 min-h-screen 导致内容无限拉长 | 改为 h-screen overflow-hidden + overflow-y-auto 实现固定视口滚动 |
| 编辑任务空日期报错 | PUT /api/tasks/[id] 未处理空字符串日期 | test_date: body.test_date \|\| null 转换空字符串为 null |
| 删除五感体验/食谱/步骤导致素材被删除 | DB外键 onDelete("cascade") 级联删除素材 + API显式删除素材 | DB外键改为 onDelete("set null")，API改为 update({record_id/recipe_step_id/recipe_library_step_id: null}) 解除关联 |
| 食谱AI探索返回空内容 | platform_settings.ai_config 中模型配置过时 | 同上，已迁移至统一 API 调用方式 |
| 复评估素材无法关联 | 素材通过issue_id关联，无法区分同一问题下不同次复评估的素材 | materials表新增re_evaluation_id字段，素材通过复评估ID精确关联；DELETE时解除re_evaluation_id而非issue_id |

## 2026-06-03 Codex 交接进度：UI 规格统一与布局巡检

### 本轮已完成

- **页面级控件规格统一**：新增 `src/components/app/control-styles.ts`，集中定义页面操作按钮、筛选控件、列表项的共享规格，并在 `src/components/app/index.ts` 导出。
- **按钮/筛选控件统一范围**：
  - `src/app/(main)/reports/page.tsx`：报告中心”显示全部/显示个人”、报告对比按钮、品类筛选下拉统一页面级尺寸。
  - `src/app/(main)/issues/page.tsx`：问题管理”导出数据”按钮、状态/等级筛选统一尺寸；移动端头部改为上下排列，避免按钮挤压标题。
  - `src/app/(main)/analysis/page.tsx`：数据分析”导出项目列表””重置”和所有筛选输入统一尺寸。
  - `src/app/(main)/standards/components/experience-standards-section.tsx` 与 `recipe-library-section.tsx`：标准管理/食谱库头部按钮和筛选控件统一尺寸，筛选条改为 `sticky={false}`，避免移动端轻微横向溢出。
- **列表项规格统一**：
  - `src/components/app/entity-list-item.tsx` 已接入共享列表样式，作为全局列表项基准。
  - `src/app/(main)/standards/components/experience-standards-section.tsx` 的标准列表改为标题、描述、meta 三层结构。
  - `src/app/(main)/standards/components/recipe-library-section.tsx` 的食谱库顶层列表也改为同样结构，展开后的步骤详情保持原信息密度。
  - `pageListCardClass` 已覆盖 shadcn `Card` 默认 `py-4 sm:py-6`，避免首页 `EntityListItem` 被额外撑高。

### 已验证

- `pnpm ts-check` 已通过。
- `pnpm build` 已通过（含列表规格调整后的完整构建复验）。
- `next-env.d.ts` 已恢复为 dev 引用（`./.next/dev/types/routes.d.ts`），避免构建副作用影响开发模式。
- 报告中心和问题管理页面**不适用** `pageList*` 简单列表规格——这两个页面使用 CardHeader+统计网格+子项目的复杂卡片结构，强行套用 `pageListCardClass`（含 `py-0 gap-0`）会破坏布局。它们保持原有 `overflow-hidden transition-colors hover:border-primary/30` 卡片样式。

### 建议后续继续统一的方向

- 体验计划列表页已使用 `EntityListItem`，标准管理和食谱库已使用 `pageList*`，这三个列表是统一的。
- 报告中心和问题管理因结构复杂（统计网格+子项目），保持独立卡片样式，不套用简单列表规格。
- 对”页面级操作按钮””行内小图标按钮””弹窗主按钮””筛选输入”保持不同规格，不要全部强行同高；目前的原则是页面级按钮桌面 `32px`、移动 `36px`，筛选控件移动优先 `36px`，搜索框保留较大触控高度。

### 标准管理页面布局优化

- **移除冗余标题**：体验标准和食谱库的 Tab 切换器下方不再重复显示板块标题（与 Tab 文字重复），改为仅在 PageHeader 显示”标准管理”总标题。
- **操作按钮移至 PageHeader**：批量导入、新建标准、删除、添加食谱等操作按钮从板块内部移到 PageHeader 的 `actions` 区域（右上角），与”体验计划”页面的”新建任务”按钮位置一致；通过 `forwardRef` + `useImperativeHandle` 让页面组件调用板块内部的对话框方法。
- **间距收紧**：PageShell 间距从 `space-y-4` 调整为 `space-y-3`，板块内部也从 `space-y-4` 调为 `space-y-3`，Tab 切换器与内容之间的垂直空间更紧凑。
- **食谱库标签对齐**：食谱列表中”5步骤”StatusBadge 与旁边的食材/参数文本使用 `items-center` + `leading-none` 垂直居中对齐。

### 存储模块重构

- **本地受保护存储**：`src/lib/server/storage.ts` 的生产运行模式只允许 local，文件写入 `LOCAL_UPLOAD_DIR`（默认 `public/uploads`），公开静态路径不得作为读取接口。
- **presigned URL 兼容**：`src/lib/use-presigned-url.ts` 必须正确处理裸 key、`/uploads/...`、`/api/materials/file/...`（保留 `token` / `exp`）和完整同源 URL；缩略图、海报和视频播放均继承签名，不得清洗 token。
- **环境变量**：生产只使用 `STORAGE_DRIVER=local`、`NEW_UPLOAD_DRIVER=local`、`LOCAL_UPLOAD_DIR`、`LOCAL_UPLOAD_PUBLIC_ACCESS=protected`、`NGINX_UPLOADS_INTERNAL=/_protected_uploads` 与 `PUBLIC_MEDIA_BASE_URL`。
- **缺失素材兜底**：本地模式文件不存在时返回 SVG 占位图（”素材文件缺失”），前端加载中时显示”正在加载素材”占位。

### 问题管理导出

- **问题数据导出**：新增 `src/app/api/issues/export/route.ts`，支持按筛选条件导出问题列表为 CSV。

### AI 配置更新

- **移除“内置模型”选项**：AI 接入服务只保留用户配置方式，避免在仓库文档中固化具体服务信息。
- **敏感信息脱敏**：README 和 AGENTS 不记录具体敏感连接信息；此类信息仅通过运行环境或应用设置维护。
- **模型列表删除**：已保存配置列表中每个配置增加删除按钮，删除后清除该配置数据。
- **配置字段统一展示**：设置页保持必要的连接配置字段可编辑，但文档只描述配置原则，不写真实值。
- **数据库默认值**：`ai_model_configs.provider` 默认值从 `builtin` 改为 `custom`。

## 2026-07-09 报告、矩阵与素材回归防护

### 已修复问题与根因

| 问题 | 根因 | 修复与禁止回归规则 |
|------|------|-------------------|
| 对比矩阵/冻结报告附录超过 50 张后无法显示 | `/api/materials/presign` 单次上限 50，前端一次提交全部路径 | `resolvePresignBatches` 必须按 50 条分批、去重并允许部分批次失败后继续；不得重新改成单次请求 |
| 大素材报告服务端 PDF 超时或只嵌入部分图片 | Playwright 使用 `networkidle`，且服务器经公网入口回环加载自身素材 | PDF 使用 `domcontentloaded` + 有界图片就绪等待；服务端素材 URL 必须走 `127.0.0.1:${PORT}`，浏览器页面仍走公开地址 |
| 冻结对比报告缺少“过程记录”，或“效果结论”替代过程记录 | 报告消费者把 `effect_summary` 当作通用文本，打印页遗漏 `processNotes` | 快照保留 `process_notes`；报告详情和 `/reports/print` 必须分别读取并标注“过程记录”“效果结论”，不得互相 fallback |
| 功能效果报告显示 AI 评价而不是人工采纳评价 | 多个报告消费者各自选择文案且优先级不一致 | 统一使用 `selectEffectEvaluationText`：非空 `effect_description` 优先，只有人工评价为空才使用 AI summary |
| AI 评价无法删除 | 删除动作只清部分 UI 状态或只清评分 | DELETE/清除操作必须同时清除 `effect_ai_result` 与 `effect_score`，且不得清除人工 `effect_description` |
| AI 总结弹窗拆成多个输入框 | UI 直接绑定结构化字段 | 总结编辑使用一个分行文本框，固定包含“总结/满意度/主要优势/主要风险/历史表现/后续建议”，保存时由 `parseAiSummaryText` 还原结构 |
| 下载报告的问题列表没有素材 | 只按直接 `issue_id` 找素材，遗漏 record、矩阵 cell、食谱步骤和效果问题点关联 | 使用 `issueMaterialRows` / `recipeIssueMaterialRows` 汇总全部来源；报告详情和 PDF 不得再对问题素材做数量截断 |
| 报告中心素材只能看缩略图 | 专用报告 Tab 直接渲染静态 `PresignedImage/Video` | 报告矩阵、功能效果、问题及整改素材统一使用 `ReportMediaPreview`；图片点击看原图，视频点击进入带 controls 的播放器 |
| 报告原图弹窗首次打开短暂请求错误路径 | 签名 URL 尚未返回时直接把对象 key 当作页面相对 URL，产生 `/reports/<id>/experience-media/...` 404 | `ImagePreview` 必须等待 `usePresignedUrl` 返回可访问 URL，不得以原始对象 key 作为 `src` fallback |
| 功能效果问题点首次输入后已有列表消失 | 渲染回退服务器列表，但输入 handler 从空本地数组开始更新 | 本地状态必须先由 `initializeEffectProblemPoints` 初始化；更新必须通过 `updateEffectProblemPoints` 以服务器列表为 fallback |
| 功能效果问题点/素材依赖手动保存 | 评价描述已自动保存，但问题点与素材仍走独立按钮 | 问题点和效果素材按 recipe 进行 800ms 防抖、串行自动保存；失败保留草稿并显示错误，AI 评价前必须 flush |
| 全仓 ESLint 存在 11 个 error | JSX 文案使用未转义英文引号、可用 `const` 的变量使用 `let`、旧 API/素材适配使用显式 `any` | 文案改用中文引号、不可变请求体使用 `const`、通用行类型使用 `Record<string, unknown>`、旧素材兼容字段使用 `LegacyMaterial` 显式类型；后续提交不得新增 ESLint error |
| 全仓 ESLint 存在 66 个 warning | 旧矩阵/报告模块残留未使用 import、变量与参数，打印页 Hook 依赖不完整，MaterialPicker 上传函数每次渲染重建 | 清理确定无引用的代码；保留旧流程时显式标记；补齐打印依赖；`resetFileInputs`/`uploadFiles` 使用 `useCallback` 稳定引用。全仓 ESLint 基线为 0 error / 0 warning |

### 数据与素材稳定性约束

- 报告修复不得修改素材外键、删除素材实体或改变本地受保护读取策略。
- 删除记录、食谱、步骤和问题时只能按既有规则解除素材关联；除非用户明确删除素材，不得级联删除物理文件。
- 报告快照是冻结数据源。报告中心、分享页、打印页和服务端 PDF 必须消费同一语义字段，不能分别发明 fallback。
- 附录素材不得使用 `.slice(0, N)` 静默截断。若 UI 需要折叠，必须提供可展开全部素材的入口。
- 保存请求必须避免并发旧响应覆盖新草稿；功能效果自动保存使用 recipe 级串行队列。
- 文档、测试、日志和提交信息禁止记录生产密码、API Key、对象存储密钥或会话令牌。

### 修改后最小回归验证

```bash
# 类型与生产构建
pnpm ts-check
pnpm build

# 报告/素材专项回归
node_modules/.bin/tsx src/lib/presign-batches.test.ts
node_modules/.bin/tsx src/lib/report-comparison-fields.test.ts
node_modules/.bin/tsx src/lib/report-content-rules.test.ts
node_modules/.bin/tsx src/lib/report-issue-media.test.ts
node_modules/.bin/tsx src/lib/report-pdf-loading.test.ts
node_modules/.bin/tsx src/lib/effect-problem-points.test.ts
node_modules/.bin/tsx src/lib/report-media-preview.test.ts
node_modules/.bin/tsx src/lib/report-print-matrix.test.ts
```

生产验收至少覆盖：

- 指定对比报告的矩阵 API 中 `process_notes` 非空，报告中心与打印预览均显示过程记录。
- 报告详情中的全部图片可打开原图，全部视频可点击播放。
- 功能效果已有多条问题点时，编辑任意一条不会让其他条目消失；停止输入后状态变为“已保存”，刷新仍存在。
- 实际下载 PDF 返回 `application/pdf`、文件头为 `%PDF-`，图片对象数与报告展示位一致。

### V3.1.2.4 交互冻结规则（2026-07-10）

- 问题状态在所有可见页面统一为四态：`待整改`（黑色字体）、`整改中`（黄色字体）、`不整改`（灰色字体）、`已整改`（绿色字体）。报告生成的问题默认保存为 `open`/待整改。
- `已整理`一律视为`已整改`的旧文案；设置`已整改`不强制要求已有复测或复评估记录。复测记录仍可选填，不得重新设为状态流转前置条件。
- 报告详情页与公开分享页继续使用冻结版 `ReportSummaryTab + ReportMatrixTab`；不得恢复 `ReportDetailCanvasPage` 或为分享页另造报告结构。
- 报告详情右上角分享必须先选择 7 天、30 天或永久，再创建公开分享令牌；不得复制内部鉴权地址作为分享链接。
- 报告导出与下载文件统一使用报告名称命名；浏览器打印页必须同步设置文档标题，文件名仅替换操作系统非法字符，不得回退为 report-id 或固定通用名称。
- 数据矩阵创建后直接进入可录入矩阵并包含默认一级/二级结构；不显示空白引导视图。三级细项仅在用户主动新增后显示，桌面矩阵不得用横向冻结列遮挡后续列。
- 对比矩阵对象名、大类名和细项名采用失焦自动保存，不显示勾/叉保存按钮；大类和细项默认可折叠，新建大类使用`大类N`默认名且不弹出阻断对话框。
- 前端统一展示`AI助手`，不得出现 Hermes 品牌字样。模型输出入库、SSE 和渲染三层均需过滤 `<think>` 推理内容。
- AI助手可创建或编辑业务数据、上传及绑定素材，但不得执行任何删除、设置、配置或用户管理动作；服务端动作策略必须独立校验，不能只依赖模型提示词。
- AI助手的平台操作界面必须调用可返回结构化 `actions` 的任务操作接口，并在用户确认后调用独立执行接口；不得仅接入普通对话接口造成操作清单永远不可达。素材上传可先直传并把真实 `material_id` 交给操作清单。
- 微信/企微扫码绑定必须使用一次性签名会话和 OAuth 回调原子消费；不得伪造扫码成功，也不得把 OAuth 应用密钥写入仓库。管理员可在平台设置中保存 AppId/CorpId、AgentId 与 Secret，Secret 必须使用 `AI_CONFIG_ENCRYPTION_KEY` 加密入库，读取接口只返回 `secretConfigured`，环境变量完整配置时优先覆盖平台配置。
- 所有图片/视频渲染必须经过统一媒体源策略或预签名组件。允许同源 HTTP、HTTPS、`blob:`、`data:` 与平台相对路径；禁止把跨域 HTTP URL（尤其企业网络重定向到 `172.* /disable/disable.htm` 的拦截页）写入 `img/video src`。
- 共享黄金数据的 Playwright 套件必须使用 `--workers=1` 串行执行，或为每个用例创建并清理独立夹具；不得让矩阵、素材或分享用例并发修改同一黄金任务后误报产品回归。

### 2026-07-14 任务录入与冻结报告补充边界

- 任务“报告信息”使用逐字段点击编辑与自动保存，不得恢复整块“编辑/保存”模式；`report_summary` inline writer 需覆盖该面板的全部任务字段。
- 食谱/功能新增与编辑均使用单一“食材/配方或功能参数”文本输入；功能评价状态按钮保持紧凑。功能侧栏可略宽于五感侧栏，但两者保持同一视觉尺度。
- V3 矩阵行显示顺序必须按一级/二级/三级层级排序，而非叶子行创建顺序；同父级同层级重名返回 409 及可读提示，不得透出 Drizzle SQL。
- 数据矩阵和对比矩阵小结均通过输入框右下角 AI 图标回填到当前草稿；不额外打开独立小结编辑面板。数据矩阵仅在存在实质输入、结论、问题或素材时进入冻结报告 Tab，报告阅读器不允许横向拖动。
- 对比报告生成不得提前返回只含对比矩阵的空快照；快照必须同时冻结报告正文、问题、功能效果、可用数据矩阵和对比矩阵。详情、匿名分享、浏览器打印与服务端 PDF 继续以同一快照为真源。

### 2026-07-14 手机视频播放兼容规则

- 手机上传的 `.mov` / `.m4v` 在创建 `materials` 记录前，必须规范为带 `faststart` 的 MP4；H.264/AAC 可无损 remux，其他视频或音频编码转为 H.264/AAC、`yuv420p`。不得只移动 moov atom 后继续把 `video/quicktime` 交给 Chromium。
- 运行时使用 `FFMPEG_BIN`（默认 `ffmpeg`）；本地 Docker 复用 Playwright 镜像已有的 ffmpeg 二进制。不得移除该运行时依赖或将视频规范化改成后台任务，否则浏览器可能先读到未就绪素材。
- 迁移存量 MOV 时保留原文件作回退，更新 `materials.file_name/file_path/file_url/file_size` 到 MP4，并仅替换冻结快照中的同一素材 key；不得删除素材实体或改变其他冻结内容。
- 视频验收至少同时验证：`ffprobe` 输出 H.264/AAC；浏览器播放 URL 必须是无扩展名的同源 `/api/materials/video/<base64url-key>?token=...&exp=...`，返回 `200`、`Content-Type: video/mp4` 和 `X-XP-Video-Transport: single-stream`。底层 `/api/materials/file` 可保留 Range 能力供非视频读取使用，但浏览器 `<video>` 不得走带 `.mp4` 的 URL 或 `206` 分段链路。

### 2026-07-15 Agent、素材关联、感官量表与批量验收规则

本节是 2026-07-11 至 2026-07-14 任务录入、冻结报告、矩阵和素材规则的增量交接。后续智能体必须明确区分“已实现并需保留”与“已确认但仍待修复”，不得把浏览器标记或设计决定误写成已完成。

#### 已实现并需保留

- AI 模型接入必须保持 Chat Completions 兼容的通用实现；能力差异通过配置化 request options 和响应解析兼容处理，不得按 MiniMax、M3 或任何具体模型名称写分支。AI 输出以中文为准，入库、SSE 与渲染层统一清理 `<think>`、乱码和转义残片；一条用户消息在界面中只能出现一次。
- 任务内 AI 助手必须先生成结构化操作清单，由用户确认后调用独立执行接口真实写入；可执行范围覆盖五感记录、食谱/功能、食谱步骤、对比矩阵、数据矩阵、问题以及素材关联。冻结报告只读，修改必须回到任务源数据后重新生成。
- Agent 素材重命名使用 `material_rename` + `naming_mode:"context"`，模型不得自行拼文件名。命名规则固定为：五感相关标准描述、食谱/功能名称、`对比对象*大类*细项`、`数据矩阵一级大类_二级细项`，同名按 `名称1 / 名称2 / ...` 顺序追加数字；只修改展示名，不修改对象 key、文件路径或物理文件。
- 手机素材上传以文件签名判断真实媒体类型，不能只信任 MIME 或后缀；错误双后缀、空 MIME 和 `application/octet-stream` 必须在真实签名可识别时兼容。视频规范化后仍须通过本地共享存储层写入；冻结数据矩阵必须保存稳定 `filePath`，展示 URL 只能运行时重新签名。

#### 素材唯一性与多处绑定决策

- **唯一的是素材实体和物理文件，不是素材的业务归属。** 同一图片/视频允许同时作为多个五感记录、食谱效果、食谱步骤、对比矩阵单元格、数据矩阵单元格和问题整改的证据。不得因为后一次绑定而把前一次绑定“转移”或覆盖。
- 绑定关系采用多对多语义：一个素材可绑定多个目标，一个目标也可绑定多个素材；唯一约束只能是 `(material_id, target_type, target_id)`，用于防止同一目标重复绑定，不能对 `material_id` 单独唯一。
- `materials.record_id / recipe_id / recipe_step_id / comparison_cell_id / issue_id` 等单值外键属于历史兼容字段，不能继续作为跨模块绑定的唯一真源。新增和编辑绑定应收敛到 `material_links`（或各矩阵已有的专用关联表），解绑时只删除指定目标的关联，不得清空其他目标、不得删除素材实体或物理文件。
- “已绑定”“N 个证据”和素材缩略图必须来自当前真实关联查询，不能来自旧前端选中状态或过期外键。关联被解除后原位置要立即变为未绑定；采用多处绑定后，绑定到新位置不得让旧位置消失。
- 任务录入、问题管理、报告生成校验、冻结快照、报告详情、分享、打印和 PDF 必须复用同一素材聚合规则。禁止出现任务页显示“已绑定证据”，生成检查却提示“未绑定素材”，或冻结报告中素材消失的双重事实源。

#### 当前待排队问题（尚未验收，不得标记为完成）

- **P0 — 五感证据不可见**：任务 `0e21916b-f73d-47d0-9841-51267a6f16df` 中“外包装”“盖子间隙”等记录显示“已绑定证据”或证据数量，但展开区没有图片/视频缩略图；必须展示附录素材并支持图片预览、视频播放。
- **P0 — 单值外键覆盖造成假绑定**：当前五感/食谱绑定仍存在直接改写 `materials.record_id / recipe_id / recipe_step_id` 的路径，后绑定可能覆盖前绑定，导致原记录仍显示旧状态而报告生成判定未绑定。需迁移到非排他的关联写入，并修正未关联/已关联筛选与刷新同步。
- **P0 — 食谱效果素材保存失败**：在效果/出品评价中从任务素材库选择已存在视频时出现“所选素材不可用于当前食谱，请刷新后重试”，页面显示“保存失败”。合法的任务内素材即使已经绑定其他位置，也应允许复用到该食谱效果；保存失败不得清空用户的评价描述、三态判断或已选素材草稿。
- **P0 — 报告生成素材校验不一致**：生成检查反馈“外包装”“盖子间隙”未绑定素材，与任务页“已绑定证据”冲突。修复后校验必须查询真实关联表与兼容旧数据聚合结果，并确保冻结快照把所有有效关联写入报告。
- **P1 — 感官评价量表改造**：标准管理的感官评价标准应像问卷评分题一样配置 5 分制、7 分制或 10 分制，并逐分设置代表意义。任务录入不是逐个受访者选项题，体验人员只填写线下回收评分的平均分（允许小数，范围受所选量表约束），同时只读展示量表说明；冻结报告保存平均分及当时量表定义。旧 `subjective_score + subjective_rating` 数据需兼容读取，不能因升级丢失。

#### 素材关联专项验收

- 用同一素材依次绑定记录 A、记录 B、食谱效果、对比矩阵单元格和数据矩阵单元格；刷新后五处都可见，任一处解绑不影响其他四处。
- 每个绑定位置都显示真实缩略图；图片可打开原图，视频通过无扩展名同源单流入口播放，避免企业网关将 `.mp4` + Range 识别为下载工具。素材库“未关联/已关联”筛选按“是否存在任一关联”计算，多处绑定不重复显示素材实体。
- 生成报告前检查不得误报已关联项；生成后报告问题 Tab、功能效果、对比矩阵、数据矩阵、分享页和打印/PDF均能看到相同素材。重新命名素材不能破坏任何关联或历史冻结路径。
- 只有用户明确执行“删除素材”才允许删除素材实体；解绑、删除记录或修改食谱不得误删被其他目标复用的物理文件。

#### 待办批次与本地部署流程

- 浏览器标记的问题先进入本轮待办队列。每个问题完成代码修改后只运行对应的快速单元/契约测试，不得为每个问题反复执行 Docker 构建、重启本地服务或全量浏览器回归。
- 可独立修改的待办允许分派多个子智能体并行处理；主智能体负责冲突控制、语义统一、代码集成和最终结论。子智能体不得自行部署、修改共享黄金数据或把局部测试通过宣称为整批完成。
- 只有用户确认本轮没有继续排队的问题，或主智能体确认当前待办队列已清空后，才统一执行 `pnpm ts-check`、专项测试、`pnpm build`、本地 Docker/生产模式重启。随后按本节及此前每条浏览器评论逐项回归，并记录 PASS/BLOCKED；不得只验证最后一个问题。

## 2026-07-15 本对话最终冻结合同：报告、矩阵、问题、素材与 P0 治理

本节固定 2026-07-15 本轮对话中用户确认的全部产品规则、开发边界和验收口径。后续智能体修改任务录入、冻结报告、匿名分享、打印/PDF、问题管理、素材绑定、AI 设置或部署流程时必须先阅读本节。

若本节与更早的“待排队”“尚未验收”描述冲突，以本节的最终决策和状态为准；不得因为旧章节仍保留历史记录而恢复已删除的交互。详细设计与实施基线仍以以下文件为准：

- `docs/superpowers/specs/2026-07-15-frozen-report-matrix-and-issue-design.md`
- `docs/superpowers/plans/2026-07-15-frozen-report-matrix-and-issue-implementation.md`

### 一、协作、开发和部署纪律

- 大型独立问题允许并应分派子智能体并行开发；主智能体负责需求语义、冲突控制、代码集成、最终验收和结论。子智能体不得自行部署，也不得把局部测试通过宣称为整批完成。
- 每个问题修改后只运行对应快速测试。不得每完成一个问题就重新构建或重启 Docker。
- 必须先清空全部待办队列，集中运行专项测试、`pnpm ts-check`、相关 ESLint、`pnpm build`，再统一做本地 Docker 部署。
- 部署后的验收必须逐项覆盖本轮全部规则，至少包含任务录入、报告详情、匿名分享、浏览器打印/下载；不能只验证最后一个修改点。
- 如果最终部署验收发现阻断缺陷，可修复后做一次纠正性整体重建，但仍不得退化为逐问题部署。
- 本地验收必须使用生产构建，不得用开发模式的页面结果替代。Docker 应用和 PostgreSQL 必须均为 `healthy`。
- 工作区可能同时存在用户和其他智能体修改；不得 reset、checkout 或覆盖无关改动。未得到用户明确指示时不得自动提交或推送。

### 二、不可变的产品命名与交互边界

- 顶部导航和任务页统一使用“食谱/功能”，不得再显示“单一食谱功能”或“功能/食谱”。
- AI 助手浮窗沿用已确认设计：打开时位于视口中心，并可拖动。不得改成固定侧栏、角落弹窗或不可拖动对话框。
- 任务顶部状态卡是唯一任务内模块导航；不得恢复第二套录入目录，不在顶部状态卡加入“问题管理”。
- 报告详情和分享页只允许：总结、问题、对比矩阵、数据矩阵、功能效果。**禁止新增附录 Tab。**
- 所有证据素材必须呈现在对应原文、问题、步骤、效果评价或矩阵单元格位置；不得集中挪到独立附录视图。
- 详情页中的可折叠内容必须保持可折叠；打印/PDF才按完整展开后的阅读合同输出。

### 三、素材实体、绑定关系和视频预览

- 唯一的是素材实体与物理文件，不是素材业务归属。同一素材允许复用于五感记录、食谱效果、食谱步骤、对比矩阵、数据矩阵、问题与整改。
- 绑定必须是多对多关系，唯一键只能是 `(material_id, target_type, target_id)`；不得把 `material_id` 设为全局唯一，也不得因新绑定覆盖旧绑定。
- 绑定到新位置后，旧位置的绑定状态、缩略图和报告证据必须继续存在；解绑一个目标不得影响其他目标，更不能删除素材实体或物理文件。
- `materials.record_id/recipe_id/recipe_step_id/comparison_cell_id/issue_id` 等单值字段只用于旧数据兼容；新增写入以 `material_links` 或矩阵专用关联表为真源。
- 食谱/功能重复选择已在其他位置使用的视频属于合法复用，不得弹出“所选素材不可用于当前食谱，请刷新后重试”。若真正冲突，错误信息必须直接说明冲突目标和解决方式。
- “已绑定”“证据 N 条”、生成前检查、冻结快照、详情、分享、打印与 PDF 必须使用同一聚合规则，不允许任务页显示已绑定但报告生成检查判定未绑定。
- 图片必须可预览原图；视频在详情、分享、对比矩阵、数据矩阵、功能效果、问题、打印和 PDF 中都必须有首帧 poster。不得以“视频预览不可用”作为正常展示。
- 视频在交互页面保持 16:9，不强制裁成方形；主证据至少 112px，附属证据 64–80px。打印/PDF可按纸张缩放，但必须保留可识别 poster 与 VIDEO 标识。
- 本地存储必须通过持久化 volume 挂载到 `/app/public/uploads`；应用启动时若 `LOCAL_UPLOAD_DIR` 不可写，必须拒绝启动并给出明确错误。

### 四、数据矩阵录入与冻结合同

- 数据矩阵最多允许一级大类和二级细项；不得新增或恢复三级细项。读取旧三级数据时可兼容展示，但新的编辑模型不再创建三级结构。
- 一级大类、二级细项以及“一级对比类目”等所有可见表头文字都允许点击编辑；失焦或 Enter 后自动保存，不显示勾/叉按钮。
- `二级细项` 与首个输入/对比列之间必须有清晰、完整的单元格边线。
- 数字列遵循用户设置的小数位数；设置为 0 时，计算列也必须显示 0 位小数，不得重新出现默认 5 位小数。
- 计算列结果必须写入冻结投影，并在报告详情、匿名分享、打印和 PDF 中一致出现。
- 冻结报告的数据矩阵不允许横向滚动或卡片拆分；必须一次性冻结并展示完整表格。
- 冻结矩阵表头只呈现一行列定义，不显示额外的分区标题行或截图绿色框对应的冗余行。
- 冻结布局固定为：`一级大类 → 二级细项 → 对比/输入列 → 计算列 → 效果素材 → 效果评价 → 问题点`。
- 一级大类作为第一列，连续相同一级大类必须使用合并单元格；不能使用横跨全表的独立分组条替代该列。
- 数据矩阵底部必须保留冻结矩阵小结；详情、分享、打印/PDF使用相同布局和内容。
- 数据矩阵存在保存内容后，任务顶部状态立即显示“已创建”；不得等到生成或冻结报告后才显示。

### 五、对比矩阵冻结合同

- 对比矩阵按横向完整表格冻结；不同对象列必须等宽，避免同一对比对象因文字或素材数量而改变列宽。
- 视频预览与图片使用一致的视觉槽位和尺寸比例；新增 poster 只是派生预览，不得改变素材实体、绑定关系或冻结稳定性。
- “本大类小结”必须在详情、分享、浏览器打印和 PDF 中保留，不得在打印投影中丢失。
- 同一对比单元格内完全相同的问题文本只呈现一次；不同对象或不同单元格即使文字相同仍分别保留。
- 对比矩阵问题属于“食谱/功能”来源类型，但展开内容仍按对比矩阵规则展示对象、项目、细项、问题和原位素材。
- 已关联 live issue 的对比矩阵问题必须提供可理解的整改状态和“查看整改”入口；不得只显示问题文本而无法进入整改闭环。

### 六、问题 Tab 的统一列表与展开规则

- 所有五感体验、单一食谱/功能、对比矩阵、数据矩阵问题统一汇总到问题 Tab。
- 列表行固定为：`等级标签 + 来源类型 + 问题描述 + 整改状态`，整行可点击展开并支持键盘操作。
- 来源类型只使用：`五感体验`、`食谱/功能`、`食谱/功能-对比矩阵`、`数据矩阵`。
- 每行整改状态只能显示一次；有管理权限时右侧操作文案为“查看整改”，不能再次显示“待整改”。
- 问题状态最终保留四态：`open/待整改`、`rectifying/整改中`、`verified_closed/已整改`、`waived/不整改`。列表、详情、分析、分享、打印和导出必须使用同一套语义。
- 问题状态转换由服务端状态机校验；非法转换返回 422。不能只靠前端禁用按钮。
- 问题列表允许折叠；打印/PDF按展开后的完整内容呈现。
- 不得按问题标题全局去重。问题身份优先级固定为：live/linked issue id → matrix issue-point/cell id → record id → recipe id → comparison cell + problem index。

#### 单一食谱/功能问题展开

- 列表描述格式为“{用户命名的食谱/功能}食谱效果不合格”，并显示等级、来源和整改状态。
- 展开顺序：食谱名称；食谱配方/参数；食谱步骤；食谱效果评价及素材；已整改时显示整改效果评价与整改素材。
- 食谱步骤默认折叠，仅显示“食谱步骤：N步”；N=0 时不显示步骤行。进一步展开后显示步骤详情、步骤问题点和步骤证据。
- 不再额外显示一行名为“问题”的重复字段；不合格判断和问题描述仍必须保留在列表及相应效果评价中。

#### 对比矩阵问题展开

- 分行显示：对象、项目、细项、问题、素材。
- 已整改时追加整改效果评价和整改素材；复测记录数大于等于 2 时只显示最新一条，并显示“整改复测记录数：N”。

#### 数据矩阵问题展开

- 分行显示：一级大类、二级细项、对比维度、问题、素材。
- 两个同名问题若属于不同一级大类或不同 issue-point，必须分别保留；同一 issue-point 的显式 issue 与冻结 fact 必须合并成一条。
- 已整改与多次复测展示规则同对比矩阵。

#### 五感体验问题展开

- 标准类问题依次显示：检验标准类型、检验要求及范围、检查标准、检查结果、附录素材。
- 非标准问题不显示检验标准类型和检查标准，改为显示“描述检查项内容”。
- 已整改与多次复测展示规则同上。

### 七、功能效果 Tab 与打印列表

- 保留功能效果清单的效果预览卡，但下方每个食谱/功能按单一列表展开，不能恢复步骤、步骤问题、步骤证据、效果问题和素材相互割裂的多栏视图。
- 每条标题显示食谱名称，并以小标签显示步骤数、整体判断/效果评分和问题数量。
- 内容顺序：食谱/食材或功能参数 → 效果评价及证据 → 默认折叠的食谱步骤 → 食谱效果评价及素材。
- 0 步时不显示步骤行。打印/下载页必须遵循相同单食谱列表合同。
- 功能效果区域不重复单独列出问题清单；问题统一由问题 Tab 管理。

### 八、冻结报告、分享和打印的真源合同

- 发布报告后，`reports.snapshot_id` 是唯一冻结锚点。报告详情、匿名分享、浏览器打印和服务端 PDF 必须读取同一 snapshot，不得调用 latest snapshot 静默漂移。
- 有锚点但快照缺失时返回 409 完整性错误；不得退回最新任务数据或旧 `reports.content`。
- 分享页与详情页消费同一只读 `FrozenReportViewModel` 和同一可见性配置，不得分别维护内容合同。
- 报告详情、分享和打印必须同时包含可用的总结、问题、功能效果、对比矩阵和数据矩阵；最新空矩阵不能遮蔽更早有效矩阵。
- 打印/下载存在任一矩阵时使用 A4 横向布局；完整表格不得横向滚动或拆成卡片。
- 打印标题只显示完整报告名一次；产品型号只在产品信息字段中出现，不得在标题下再重复一行小字。
- 打印/PDF视觉使用与详情/分享同一 Golden Yellow token；禁止恢复硬编码 teal。警告使用 amber/orange + 图标，错误使用 red + 图标，不能只靠颜色表达。
- 所有素材必须原位呈现；禁止附录 Tab、禁止静默截断素材、禁止对 `data:` 占位图发网络请求。

### 九、报告状态、标题编码和可追溯性

- 报告列表状态必须与数据库字段一一对应：草稿、待审、已发布、已归档、已完成不得互相冒充；未知/损坏状态必须明确显示异常，不能静默标成已完成。
- 中文标题必须在数据库、快照、API 和前端全链路使用 UTF-8 无损处理。新报告不得生成 `????`。
- 已经以 `????` 或 `??` 写入数据库的历史标题/问题描述属于不可逆存量损坏；不得猜测并自动覆盖，应依据原始资料人工回填。
- 问题详情应展示可用的所属任务、来源检查项和关联报告，并支持跳转；不存在真实关联时不得伪造。

### 十、通用 UX、移动端和保存反馈

- 所有交互目标最小 44×44px；图标可以保持小尺寸，但点击区域必须通过 padding 扩展。
- 禁止 `text-[10px]`；状态标签至少 12px，移动端正文至少 14px，底部导航不得低于 11px且必须满足对比度。
- 可点击列表行使用 button，或完整实现 `role/tabIndex/onKeyDown`；图标按钮必须有 `aria-label`。
- 移动端进入录入页后，首屏第一可见内容必须是当前录入项或快捷入口；任务摘要折叠到辅助区。
- 移动端对比矩阵使用“紧凑概览 + 单对象聚焦编辑”，不得把桌面宽表直接搬到 390px 屏幕。
- 选中食谱/功能后，标题区必须显示食材数量、功能数量和问题数量摘要（最多三个，超出可折叠）；问题保存后在录入区显示“已创建 N 个问题，点击查看”，让问题同步闭环可见。
- 主动保存：按钮 loading → Toast 成功/失败。自动保存：显示“已保存 HH:mm”；错误必须有可理解文字。
- 自动保存统一复用可 flush 的保存机制；组件卸载时提交 pending save，不能 cancel 导致最后一次输入丢失。
- 搜索 debounce 300ms，使用 AbortController 取消旧请求；请求期间保留上一批结果并显示加载指示，不得每次击键清空列表。
- 加载规范：列表/表格使用骨架屏，inline 操作使用带 `role="status"` 的 spinner，整页跳转使用顶部进度；不得用假空态代替加载。

### 十一、后台 P0 安全与数据完整性规则

- AI 配置保存前必须对最终合并后的配置做真实连通性测试；空 API Key 表示保留旧密钥。HTML、204、空 choices、非 assistant、空白 content 都视为失败并阻断保存。
- 若管理员已存在且环境仍配置 `INITIAL_ADMIN_ACCOUNT/INITIAL_ADMIN_PASSWORD`，启动日志和管理后台必须显示安全提醒；文档不得记录真实密码。
- `SECURITY_SCHEMA_VERIFIED` 不能只作为布尔开关。启动时必须实际验证安全审计表、限速表、关键列、主键、索引和危险 `allow_all` 策略；失败则拒绝启动。
- 问题删除必须在一个数据库事务内清理问题、复测、关联和素材绑定状态；任何一步失败整体回滚。
- `reports.snapshot_id` 必须具有指向 `report_snapshots(id)` 的外键约束；API只能按该锚点读取。
- 问题四态必须在数据库和 API 双层约束；数据库拒绝枚举外值，API状态机拒绝非法跨态写入。
- V2 数据矩阵迁移必须登记在 Drizzle migration journal，并在主初始化/自动迁移链中明确为必需步骤，不能依赖人工遗漏风险较高的额外命令。
- Dockerfile 不依赖远程 `docker/dockerfile` frontend 才能解析当前标准指令，避免镜像代理限流阻断本地验收构建。

### 十二、已完成验收基线（不得回归）

本轮使用任务 `0e21916b-f73d-47d0-9841-51267a6f16df` 和报告 `e32375e5-779a-4a4d-bf13-38bf398d1f25` 完成真实 Docker 验收。该 ID 仅用于本地黄金样本，不代表生产永久数据。

- 报告详情问题数从错误的 15 条收敛为 10 条真实来源问题；每条只有一个状态字段，管理操作显示“查看整改”。
- 两个“有问题1”分别属于测试大类1和测试大类2，正确保留；其重复食谱/功能投影已消除。
- 同一对比单元格四条相同“测试下”合并为一条，不同对象仍各自保留。
- 数据矩阵为 9 行、8 列，一级大类合并、单行表头、完整小结；详情、分享和打印列顺序一致。
- 打印页 14 个视频全部具有 poster，`视频预览不可用` 为 0；无附录标题，报告标题不重复型号。
- 匿名分享页与详情均为 10 条问题，Tab 合同一致，数据矩阵视频使用 `/api/materials/poster/...`，无附录 Tab。
- 对比矩阵对象列等宽，功能效果步骤默认折叠，0 步不显示步骤行，AI 助手居中且可拖动。
- 聚焦测试、`pnpm ts-check`、生产构建通过；本地 Docker 应用与 PostgreSQL 均为 healthy。

### 十三、明确暂缓但后续必须完成的高风险迁移

用户已确认以下项目不与本轮 UI/冻结报告修复混做，必须在后续独立、可回滚、带生产数据审计的批次实施，不能被永久遗忘：

- BE-05：既有 VARCHAR(36) 主键与外键迁移为 PostgreSQL UUID。
- BE-06：`check_records` 宽表范式化，保留快照时点投影。
- BE-07：AI 配置密钥版本与轮换/重加密机制。
- BE-09：任务、问题、标准列表改为游标分页并补复合索引。
- BE-11：`issues.severity/priority/level` 字段合并与兼容迁移。

执行上述任一迁移前必须：盘点真实生产数据 → 编写前置审计与映射报告 → 准备幂等迁移和回滚脚本 → 在隔离副本演练 → 验证所有外键与 API → 单独获得用户确认后部署。

### 十四、本节最小验收命令与浏览器断言

```bash
pnpm ts-check
pnpm build
docker compose -f docker-compose.local.yml up -d --build
docker compose -f docker-compose.local.yml ps
```

专项测试至少覆盖：冻结快照完整性、问题状态机与权限、问题身份合并、矩阵问题同步、报告媒体语义、数据矩阵布局、打印渲染、AI 连通性门禁、启动安全探针、上传目录可写性、自动保存 flush、搜索请求取消和移动端对比布局。

浏览器最终断言至少包括：

- 任务页“食谱/功能”命名正确，创建过的矩阵显示“已创建”，AI 助手居中并可拖动。
- 问题列表每行一个状态；同源问题不重复，同名不同矩阵来源不误合并；展开字段遵循来源规则。
- 详情与匿名分享拥有相同五个 Tab，均无附录；全部素材原位、全部视频有 poster。
- 对比矩阵对象等宽且有本大类小结；数据矩阵无横向滚动、一级大类合并、表头一行、计算列和小结完整。
- 打印页标题不重复，A4 横向，数据矩阵列序正确，视频 poster placeholder 数量为 0，问题条数与详情一致。
- 容器日志包含生产监听成功；安全提醒只在真实触发条件下出现；应用和数据库最终均为 healthy。

### 2026-07-15 报告详情矩阵与素材视觉纠偏（最新规则，覆盖同日旧表述）

- 报告内容 Tab 的选中态必须使用清晰的 Golden Yellow 实底、前景高对比文字和可辨识边界，不能只靠白底或轻微阴影表达选中。
- 问题 Tab 列表头固定为“等级标签 + 来源类型 + 问题描述 + 右侧整改状态”。状态只显示一次；右侧直接显示四态文案，缺省为“待整改”，有管理权限时点击该状态进入整改。不得再额外显示“查看整改”文字按钮。
- 问题行的标签、描述和状态必须垂直居中且基线协调，长描述可换行但不得挤压、错位或覆盖右侧状态。
- 食谱/功能效果以及问题展开区的原位素材使用紧凑证据尺寸，图片/视频缩略图约 64-80px；视频保持 16:9。不得用占满内容栏的大图替代证据缩略图。
- 对比矩阵与数据矩阵统一采用紧凑横向表格语言：固定表格布局、清晰单元格线、稳定列宽、无横向滚动、无卡片拆分。对比对象列等宽；数据矩阵首列为合并的一级大类，次列为二级细项，随后依次为输入/对比、计算、效果素材、效果评价、问题点。
- 矩阵素材固定为约 64px 的横向缩略图，按行从左到右排列并在单元格内整齐换行；必须全部原位呈现，不显示 `+N` 折叠入口，不允许纵向单列堆叠、撑高整表或越出单元格。
- 图片使用裁切缩略图但点击仍可查看原图；视频必须优先显示 poster，poster 生成失败时使用视频首帧兜底，不能长期显示纯灰播放块或“视频预览不可用”。
- 本节视觉基准以 `C:/Users/G1157/Desktop/数据矩阵.png` 的紧凑矩阵比例为准；不得另行发明大图瀑布、纵向素材墙或宽松卡片式矩阵。
- 打印/下载的功能效果版式参考 `C:/Users/G1157/Desktop/中式-ZDQ-D12S1蒸蛋器产品体验.pdf`：A4 横向、紧凑正文、扁平信息区、单食谱整体成块、步骤与素材保持原位、约 60-80px 横向缩略图。
- 打印/下载的对比矩阵版式参考 `C:/Users/G1157/Desktop/快炖防溢电炖锅体验报告.pdf`：对比对象等宽、矩阵横向铺满纸张、文字与素材同单元格组织、缩略图横向排列、表格可自然分页但不得拆成卡片。
- 打印/下载不得重复呈现同一食谱效果素材或同一问题素材；所有素材仍需完整原位呈现，不得用 `+N` 截断。无 live issue 的冻结问题在输出中也显示默认“待整改”。

### 2026-07-15 打印/下载最终版式合同（覆盖同日旧打印实现）

- 数据矩阵以 `docs/数据矩阵.pdf` 为直接版式基准：整张矩阵必须在 A4 横向可打印区内按比例自适应铺满，不允许内部横向滚动、拆卡或依靠裁切隐藏列；一级大类跨明细行合并，所有素材在对应单元格内横向紧凑排列。
- 对比矩阵不得把“大类 / 细项”压成一个路径单元格。打印投影必须保留冻结快照中的 `section` 与 `summary` 节点，输出顺序固定为“大类横跨整表行 → 细项比较行 → 本大类小结横跨行”；小结缺失属于冻结完整性回归。
- 功能效果打印按单食谱成块：标题行左侧为“食谱 + 名称”，右侧为步骤数、判断、问题点数；下方依次为食谱/食材、食谱效果评价及原位素材、食谱步骤数、逐步骤明细与步骤素材。不得退化为问题卡片，不得重复评价或重复素材。
- 浏览器打印组件与服务端 PDF HTML 必须消费同一个 `PrintReportViewModel` 行语义和同一版式合同；修复后同时验证 `/reports/print` 与下载生成的真实 PDF，禁止只验证 DOM 或接口状态码。

### 2026-07-15 在线冻结数据矩阵最终合同（详情页 / 分享页）

- 报告详情与匿名分享必须继续复用同一个 `FrozenReportReader` 和 `ReportDataMatrixReadView`；不得为分享页复制或硬编码另一套矩阵 DOM、列宽或素材规则。
- 在线冻结数据矩阵以 `docs/数据矩阵.xlsx` 与 `docs/数据矩阵.pdf` 为直接结构基准：整张矩阵在当前内容栏内自适应铺满，保持单张横向表格，不得改成卡片、内部横向滚动或截断列。
- 一级大类按连续明细行使用 `rowSpan` 纵向合并；二级细项独立成列；其后按冻结列顺序完整呈现输入/对比、计算、效果素材、效果评价和问题点。表头只保留一行列定义。
- 一级大类分组使用克制的交替底色和清晰单元格线；小结/备注保留为表尾横跨行，不能移到附录或丢失。
- 效果素材必须在原单元格内全部呈现，使用从左到右的自适应缩略图网格：桌面约 48-52px，窄容器可降至约 32px，并保持图片 4:3、视频 16:9；不得显示 `+N`、单列纵向素材墙或越出单元格。
- 在线矩阵正文仍遵守最小 12px 字号；窄屏通过收紧单元格 padding、素材尺寸和文本换行适配，不得用 `text-[10px]` 或整体缩放牺牲可读性。
- 验收必须同时覆盖登录后的报告详情与匿名分享，在桌面和窄屏断言表格右边界不越出视口、页面无水平滚动、一级大类合并、素材数量完整且视频 poster 可见。

### 2026-07-15 列表与素材稳定升序合同

- 除已经存在并明确由用户维护的人工顺序（例如食谱/功能 `sort_order`、矩阵行列显示顺序）外，所有新建列表统一按 `created_at ASC`，时间相同时按稳定 `id ASC`；更早创建的内容靠左或靠上。
- 五感体验记录必须按创建时间升序显示；任务 API 与前端工作区都必须执行同一稳定排序兜底，不得继续依赖历史 `sort_order` 或数据库未声明顺序。
- 问题 Tab 固定按来源分组：`五感体验 → 食谱/功能 → 食谱/功能-对比矩阵 → 数据矩阵`；每组内部按问题 `created_at ASC → issue id ASC`。来源记录、食谱或矩阵单元的创建时间不得覆盖真正的问题创建时间。
- 多素材以 `material_links.binding_order ASC` 为首要顺序；缺失或并列时依次使用 `bound_at/关联时间 ASC → material.created_at ASC → material.id ASC`。初次选择更早的素材靠左，换行后从上到下。
- 历史 legacy 外键素材没有绑定元数据时按素材 `created_at ASC → id ASC`；新绑定必须保留已有 `binding_order`，不得因重复读取、预签名或冻结转换打乱。
- **素材库与选择素材弹窗排序（2026-07-17）**：可复用任务素材库一律按 `materials.created_at DESC → id DESC` 展示，最新上传素材位于最左/最前；上传成功后当前已打开的素材选择弹窗也必须立即置顶。该素材库排序不得覆盖业务绑定顺序：绑定后仍按用户点选顺序写入并按 `material_links.binding_order ASC` 展示，越先选择越靠左。
- 报告生成必须把上述问题顺序和素材顺序冻结进同一快照；详情、匿名分享、浏览器打印与服务端 PDF 只消费同一 `FrozenReportViewModel`/打印投影，不得在各入口分别重新排序。

### 2026-07-16 报告问题、录入删除、移动端媒体与打印合同（最新规则，覆盖冲突旧规则）

- 问题 Tab 固定来源顺序为：`五感体验 → 食谱/功能 → 对比矩阵 → 数据矩阵`；每组内部继续执行 `created_at ASC → issue id ASC`。对比矩阵不得再标记为“食谱/功能”或“食谱/功能-对比矩阵”。
- 五感体验列表标题固定为“问题描述：{检查项内容}”；展开后的“描述检查项内容”固定展示原始描述/检查记录结果，“检查结果”单独展示。标准类继续展示标准类型、要求范围和检查标准；非标准类不显示这些标准字段。
- 问题统计必须按最终 `sourceKind` 计算：五感=`sensory`、食谱/功能=`function`、对比矩阵=`comparison`、数据矩阵=`matrix`。未录入食谱/功能问题时，其数量必须为 0；不得仅凭 `source_type=recipe_problem` 将矩阵问题误计为功能问题。
- 对比矩阵问题按“对象 + 细项/单元格”聚合计数：同一对象同一细项无论问题框内有多少行，只计 1 个问题；不同对象或不同细项分别计数。
- 对比矩阵列表标题固定为“问题描述：{对象}：{大类}的{细项}效果不合格”。展开按行展示：对象、项目、细项、问题1..问题N、素材；已整改时追加整改效果评价、整改素材；复测记录数大于等于 2 时只展示最新一条，并显示“整改复测记录数：N”。
- 冻结快照中历史食谱/功能问题只有在当前冻结事实确实存在且可整改时才显示；已被删除、被矩阵事实取代或没有可追溯来源的旧问题不得残留，也不得显示无法点击的整改状态。
- 对比矩阵存在冻结 `cells` 时，单元格当前 `problem_points` 是唯一问题真源；问题点已清空的单元格不得再由历史 `explicit_issue` 或旧报告实时问题兜底恢复。列表不得出现缺少对象/项目/细项、无整改入口或以 `[对比]` 开头的旧行。
- 整改弹窗内任意输入、自动保存或状态更新不得改变底层报告当前 Tab；报告 Tab 状态由稳定 report id 与用户操作控制，不得因详情对象刷新或 React key 改变回到“总结”。
- 报告录入页打开具体食谱/功能时，“整改复测”默认折叠，仅显示“整改复测”和复测次数标签；用户主动展开后才显示新增、编辑、删除及全部复测记录。问题管理整改弹窗仍保持原完整展示。
- 素材删除只有服务端真实删除数据库记录、绑定关系和本地文件后才能提示成功；失败必须返回错误并保留 UI 项。禁止“先 Toast 成功、后端实际失败”。
- 若素材被冻结报告引用，录入页确认删除必须从任务、项目、记录、食谱、问题、复测、矩阵及 `material_links` 中彻底解除并从当前素材库消失，同时将素材标记为 `frozen_retained`，仅为不可变冻结报告保留文件；不得返回 `material_has_frozen_snapshot_reference` 409，也不得物理删除导致历史报告裂图。
- 删除五感体验记录时必须在同一事务内清理/解除素材、问题、复测及其它关联；存在素材绑定不能成为记录无法删除的理由，任一步失败则整体回滚并明确报错。
- 手机上传/播放视频必须使用同源平台媒体访问链路，不得依赖裸 `/uploads/*.mp4`；生产继续只使用本地文件夹，不启用 S3。
- 图片、缩略图和海报统一使用有效签名的 `/api/materials/file/<key>?token=...&exp=...` 或其派生接口；任务素材栏、食谱库、报告预览等任何 `<video>` 只能接收有效签名的无扩展名 `/api/materials/video/<base64url-key>?token=...&exp=...`。该路由在服务端解析原始 key、移除 Range 并强制返回完整 `200` 单流；不得直接接收裸 `/uploads/*.mp4`、带 `.mp4` 的 `/api/materials/file/...` 或移除有效 token。企业网关若仍拦截该同源无扩展名单流入口，先保留浏览器错误证据再针对网关规则处理。
- 视频稳定性验收必须覆盖任务录入、素材库、冻结详情、匿名分享、打印/PDF：同一有效视频 key 的无扩展名单流响应必须为 `200`、`Content-Type: video/mp4`、`X-XP-Video-Transport: single-stream`，且浏览器网络记录中不得出现企业网关的 `172.* /disable/disable.htm` 重定向。不得以恢复公开 `/uploads`、移除签名或改回 Range 播放作为临时“修复”。
- 报告录入页的 AI 总结不得生成、保存或展示满意度、评分、得分、分数、分级或 `/10` 等评分事项；即使管理员保留了旧自定义 Prompt，服务端硬性输出约束和解析清洗仍须覆盖。总结编辑框只输出实际内容：总结/历史内容按段分行，优势、风险、建议按 `•` 分点；不得自动插入“总结、主要优势、主要风险、历史表现、后续建议”等空标题。保存时仍兼容历史“标题：内容”格式。
- 冻结报告的食谱/功能 Tab 中，效果素材与步骤素材使用专用 `function-evidence` 网格：缩略图为 96px，素材不超过 10 张时全部展示，第 11 张起才允许展开/收起；右侧结果标签固定为合格绿色、不合格红色、待定灰色。浏览器打印页和服务端 PDF 必须复用相同状态颜色，且功能效果/步骤素材使用与问题点相同的常规预览尺寸，不得回退为 compact 缩略图。
- **跨端素材归属与变更门槛**：修改冻结报告、打印/PDF、预签名或素材去重逻辑前，必须追踪“冻结模型 → 浏览器打印模型 → 服务端 PDF 模型 → 预签名清单”四段链路并明确影响面。功能效果卡和步骤卡始终保留各自冻结素材；即使问题栏引用同一食谱素材，也只能在预签名请求清单层按素材 identity 去重，禁止为了页面去重而从 `functionEffects` 或步骤证据中剔除素材。任何跨端素材修改必须同时验证冻结详情、浏览器打印和 PDF 三个呈现面。
- `mode=fast` 打印页同样必须把所有 `/uploads/*` 素材发送到报告范围的 `/api/materials/presign`，不得以本地直链绕过签名；生产受保护 `/uploads/*` 为 404 是预期安全边界，任何裸文件名或 `/uploads/*` 的图片请求都视为打印裂图回归。
- **打印加载时限（2026-07-17）**：默认 `mode=fast` 只完成报告和素材预签名，不得等待图片下载、Canvas 转码或 data URL 转换；仅 `mode=high` 可执行可选转码。报告详情、问题投影、预签名和高质量素材请求都必须有有限超时，单个素材超时/失败只能降级该素材，不能让页面无限停留在“正在准备打印报告”。
- 任务录入和冻结报告的 Tab 必须持久化到 URL `?tab=` 并以 `window.history.replaceState` 更新；刷新、整改自动保存、问题投影刷新或冻结模型重载只能保留当前有效 Tab，不能跳回“总结”。
- 问题管理只能排除真正缺少 `task_id` 的孤儿数据；不得因为关联对象延迟、空 join 或展示上下文暂缺而过滤已有 `task_id` 的项目问题。生产问题排查先核对 `issues.task_id` 与 `experience_tasks.id`，不得先清库或隐匿全部问题。
- 报告中心的整张报告卡片必须可点击进入详情；分享、打印、删除和对比勾选控件必须 `stopPropagation`，不得因扩大点击区域误触跳转。报告合并仍只限前期研究、自研、改型/降本/优化，同型号每任务取最新冻结报告，详情与打印/PDF按成员创建时间正序消费。
- 体验计划和报告列表的移动端状态筛选、搜索框应随页面内容自然滚动；不得固定或 sticky 在手机视口中。桌面端可按单独断点规则布局。
- 全平台自动保存文本框不得在用户持续输入过程中按键级、定时或短 debounce 高频提交；字段值先保存在本地草稿，只能在用户完成当前文本框后触发保存。完成信号包括失焦、Enter、关闭编辑态、切换字段/模块；旧请求不得覆盖用户后续输入。新建五感问题在未输入任何字段且未改变素材选择时关闭，必须直接关闭且不得发起自动保存或提示失败。
- 对比矩阵严格执行“完成单元格编辑后保存”，不得在文字尚未录完时生成自动报告或提交半成品。五感体验新增/编辑弹窗取消显式保存键：关闭弹窗、完成字段或选择/上传图片视频后自动保存；保存失败必须保留弹窗与草稿并明确提示。
- 浏览器下载页与服务端 PDF 的总结、问题、矩阵和素材必须与冻结详情/分享页来自同一冻结模型；冻结页/分享页是内容真源，不得从最新任务数据重新计算总结。
- 打印/PDF 的素材缩略图不显示文件名或素材命名；仅保留图片/视频 poster 本身和必要的语义分组标题。
- 打印/PDF 使用清晰的层级字号：报告标题、一级章节、二级区块、字段标签、正文/说明依次递减；正文不得小于可读打印基线，避免整页同字号、信息层级不清。
- 上述合同最终验收必须覆盖生产报告 `8a421115-fb1c-411e-b8a3-1ac07d992be9` 与 `98b72299-ca21-4e62-89a6-64f4150b8803`，并同时检查冻结详情、分享、打印/PDF、整改弹窗、移动端任务/报告列表和手机视频链路。

### 2026-07-16 整改闭环与 Hermes 外部会话补充合同（最新规则）

- 问题整改状态命令必须原子提交；提交成功后，任何可选的来源/报告溯源查询失败都不得把成功写入伪装为 `500`。客户端以服务端返回的主问题记录为准。
- 整改弹窗只保留当前整改方案、责任人、计划完成时间与当前复测结果；不展示或加载整改历史时间线。审计与复测数据仍按服务端合规要求留存。
- 打印/PDF 的问题展开统一显示“整改方案、责任人、整改时间、复测结果”；整改方案非空即显示，不以是否“已整改”为前提；展示时只使用最新整改/复测内容。
- **问题管理统一统计与快照选择（2026-07-17）**：问题管理必须请求服务端 canonical 投影，由服务端完成权限范围、任务全量和来源去重；禁止前端先分页拉任务 ID 再 `task_ids` 过滤，避免超过分页上限后遗漏项目。某任务存在多个报告时，必须按真实时间戳（兼容 PostgreSQL `Date`）选择最新冻结报告，禁止把 `Date.toString()` 的星期文本做字典序比较。
- **问题点计数真源（2026-07-17）**：最新冻结报告存在 `cells` 时，五感按冻结不合格/待定检查记录每条计 1；对比矩阵按当前快照中“对象 + 细项/单元格”的有问题单元格计 1，不按 `problem_points` 的行数、旧 `issues` 行数或历史报告行数计。快照 `report_content.issues` 仅作历史审计兼容，不得重新激活旧对比单元格；问题管理、冻结详情、分享、打印和 PDF 必须一致。
- **删除复测后的打印合同（2026-07-17）**：打印/PDF 的实时问题投影只要明确给出 `latestReEvaluation: null` 或 `reEvaluationCount: 0`，就必须清空冻结复测历史、复测素材和“复测通过”文案；不得以 `verification_note` 或冻结记录回退生成复测结果。只有当前仍存在的最新复测可显示。
- Hermes 是平台内嵌运行时：任务上下文指令必须走“结构化计划 → 用户确认 → 平台执行”闭环，不得回退为只会解释、不能执行的普通聊天；执行完成后留在当前 Hermes 会话。
- 企业微信官方文本回调在验签、防重放和已绑定身份校验后，必须写入对应 Hermes 会话并保存助手回复；媒体回调继续走既有媒体队列。
- 个人微信仅支持官方 OAuth 身份绑定及 App ID/App Secret 的加密配置；禁止使用非官方协议监听个人号私聊、伪造机器人或自动收发个人微信消息。
