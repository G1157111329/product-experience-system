# 产品体验管理平台 - AGENTS.md

## 项目概览

产品体验管理平台，覆盖体验计划、现场走查、报告输出、数据分析全流程。主要面向体验工程师使用，支持移动端操作。

## 技术栈

- **Framework**: Next.js 15.5.19 (App Router)
- **Core**: React 19
- **Language**: TypeScript 5
- **UI 组件**: shadcn/ui (基于 Radix UI)
- **Styling**: Tailwind CSS 4
- **Database**: 自建 PostgreSQL / Supabase PostgreSQL；服务端通过 Supabase 兼容层 + Drizzle ORM 访问
- **File Storage**: 默认 local 模式写入 `public/uploads`；可切换 S3 兼容对象存储 (MinIO / AWS S3 / 火山引擎 TOS / Garage)。生产已上线 **Garage 单节点灰度方案**：`STORAGE_DRIVER=local` 保护旧文件静态路径，`NEW_UPLOAD_DRIVER=s3` 让新上传走 Garage（127.0.0.1:3900），读取链路自动 local-then-S3 双路径 fallback
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
| `DATABASE_ACCESS_MODE` | 生产数据库访问模式：`self-hosted-postgres` 或 `supabase-service-role` | `self-hosted-postgres` |
| `DATABASE_URL` | PostgreSQL 连接字符串（本地模式） | `postgresql://<user>:<password>@<host>:<port>/<database>` |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase 项目 URL（云模式） | `<supabase-url>` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase 匿名密钥（云模式） | `<supabase-anon-key>` |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key，仅服务端保存 | `<service-role-key>` |
| `AUTH_SESSION_SECRET` | 生产会话签名密钥 | `<long-random-session-secret>` |
| `AI_CONFIG_ENCRYPTION_KEY` | AI API Key 加密密钥 | `<long-random-ai-config-key>` |
| `SECURITY_SCHEMA_VERIFIED` | 目标库执行并验证安全 schema 后才设为 true | `true` |
| `STORAGE_DRIVER` | 文件存储驱动（全局读/写控制），默认 local，可切换 s3 | `local` |
| `NEW_UPLOAD_DRIVER` | **新上传写入驱动（灰度开关）**，默认空=跟随 `STORAGE_DRIVER`；设为 `s3` 时新上传走 S3，旧文件继续从 local 读（双路径 fallback） | `s3` |
| `LOCAL_UPLOAD_DIR` | local 模式文件写入目录 | `./public/uploads` |
| `LOCAL_PUBLIC_BASE_PATH` | local 静态访问前缀 | `/uploads` |
| `LOCAL_UPLOAD_PUBLIC_ACCESS` | local 访问模式，默认 public；可显式 protected | `public` |
| `PUBLIC_MEDIA_BASE_URL` | 平台可访问的完整媒体基准地址 | `http://<host>:5000` |
| `S3_ENDPOINT` | S3 兼容存储端点 | `http://<s3-host>:<port>` |
| `S3_REGION` | S3 区域 | `<region>` |
| `S3_BUCKET` | 存储桶名称 | `<bucket-name>` |
| `S3_ACCESS_KEY` | 存储访问密钥 | `<access-key>` |
| `S3_SECRET_KEY` | 存储密钥 | `<secret-key>` |
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
- Supabase 模式使用 `DATABASE_ACCESS_MODE=supabase-service-role`，service role key 只允许服务端环境变量保存，不能下发到前端。
- 文件存储默认 local，上传写入 `public/uploads`；服务器部署必须将该目录挂载到持久化磁盘。
- local 默认保留 `/uploads/*` 静态直连，避免历史报告和分享页长期查看时裂图；更高安全要求环境可显式设置 `LOCAL_UPLOAD_PUBLIC_ACCESS=protected`。
- AI 内网、本机或 HTTP 地址不会默认拦截，便于内网优先部署；公网部署建议配置 `AI_ALLOWED_HOSTS` 并配合网络出口 ACL。
- **对象存储灰度方案（当前生产已上线 Garage 单节点）**：`STORAGE_DRIVER=local` 保持不变以保护旧文件静态路径，`NEW_UPLOAD_DRIVER=s3` 让新上传走 Garage S3（`127.0.0.1:3900`，仅本机绑定，不公网暴露）。读取链路自动 local-then-S3 双路径 fallback（旧 459 文件继续从 `/uploads/` 静态服务，新上传从 S3 presigned URL 读取）。运维文档见 `docs/operations/2026-07-06-object-storage-gray-release.md`。
- **Garage 部署位置**：二进制 `/usr/local/bin/garage`（v2.1.0），配置 `/etc/garage.toml`（含 inline rpc_secret/admin_token，perms 600 ubuntu:ubuntu），数据 `/var/lib/garage/{meta,data}`（系统盘，**单节点 replication_factor=1 无冗余，必须做每日备份**），systemd 单元 `/etc/systemd/system/garage.service`（enabled，auto-restart）。bucket `xp-experience-media`，key `product-experience-app`（RWO）。
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
4. **素材上传**: 100MB 限制，仅图片/视频；默认上传至 local `public/uploads`，可切换 S3 兼容对象存储；可关联record_id、recipe_step_id、recipe_library_step_id、recipe_id、issue_id、re_evaluation_id
5. **报告生成**: 包含任务信息+检查记录+问题清单+食谱/功能详细列表+素材附录
6. **PDF导出**: 通过打印页面(`/reports/print?id=xxx`)实现，浏览器原生打印为PDF，含照片/视频预览图
7. **数据库**: 自建 PostgreSQL / Supabase PostgreSQL 双模式；生产环境禁止 `allow_all`，必须执行 `database-schema.sql` 和 `scripts/verify-security-schema.sql` 后再设置 `SECURITY_SCHEMA_VERIFIED=true`
8. **AI 预留**: materials 表预留 ai_analysis_status 和 ai_result 字段
9. **标准批量导入**: 支持 PDF（pdf-parse 本地提取文本 + AI 结构化解析）和 Excel（xlsx 直接解析），按标准分类使用不同 prompt，并调用当前启用的 AI 配置
10. **标准分类维度重构**: 四类标准（通用/品类/感官评价/食谱功能）有不同输入字段结构，创建和编辑时按分类展示不同表单
11. **五感体验-新增问题点重构**: 移除"从标准库引用"栏目，改为选择"标准类型"后按类型展示不同筛选/输入字段；通用标准选择产品使用阶段→体验流程→感官维度后自动带出触点和检验范围及具体要求
12. **权限控制**: 服务端以 `requireUser`、`requireAdmin` 和资源级 `canAccess*` 为可信边界；管理账号(admin)可编辑标准、导入、删除和管理账号；使用账号(user)可执行自身任务相关操作
13. **问题管理重构**: 问题点来源从手动创建改为自动从报告汇总（不合格检查项+食谱功能问题），按报告名称分组；等级合并为一类/二类/三类；状态可切换（待整改/整改中/已验证/不整改）
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
69. **素材库图片编辑**: 素材仓库图片新增在线编辑功能，Canvas画布编辑器支持：画笔（颜色/粗细）、箭头（颜色/粗细）、马赛克（手动涂抹，块大小可调）、文字输入（颜色/大小）、裁剪（框选区域确认裁剪）、旋转（90°步进按钮+水平/垂直翻转）；编辑后保存为新素材替换原图
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
96. **对象存储灰度方案（当前生产已上线）**: 生产采用 Garage 单节点 S3 + local 双路径灰度，而非一刀切 `STORAGE_DRIVER=s3`。核心机制：`STORAGE_DRIVER=local` 保持不变（保护旧文件继续走 `/uploads/` 静态路径），新增 `NEW_UPLOAD_DRIVER=s3` 独立控制新上传写入目标；读取链路 `generatePresignedUrl` 先 stat 本地，存在走 local，不存在 fallback S3 presigned URL。这样旧 459 个文件零迁移、零回归，新上传逐步进 S3。涉及代码：`src/lib/server/storage.ts`（`isNewUploadS3`/`isS3FallbackAvailable`/`localFileExists` + uploadFile/generatePresignedUrl/deleteFile/readLocalImageAsDataUrl 双路径）、`src/app/api/materials/file/[...key]/route.ts`（S3 流式 + Range）、`src/app/api/materials/poster/[...key]/route.ts`（S3 源下载 + ffmpeg）、`src/app/api/materials/presign/route.ts`（按 path 判断鉴权）、`src/lib/server/report-detail.ts` + `reports/[id]/pdf/route.ts`（PDF 渲染前 presign media URL）。顺带修复 `readLocalImageAsDataUrl` 在 S3 模式返回 null 导致 AI 图片评价失效的 bug（改为 local-then-S3 fallback）。回滚只需把 `NEW_UPLOAD_DRIVER` 改回 `local`。详细运维见 `docs/operations/2026-07-06-object-storage-gray-release.md`。

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

- **双模式存储**：`src/lib/server/storage.ts` 从纯 S3 模式重构为 local 静态目录 + S3 兼容存储双模式；默认 `STORAGE_DRIVER=local`，文件写入 `LOCAL_UPLOAD_DIR`（默认 `public/uploads`），通过 `LOCAL_PUBLIC_BASE_PATH` 暴露静态路径。
- **presigned URL 兼容**：`src/lib/use-presigned-url.ts` 新增 `isDirectMediaUrl` / `getStorageKey` 工具函数，正确处理本地路径（`/uploads/...`）、data URL、完整 HTTP URL 三种情况；local public 模式直接使用静态路径，local protected 或 S3 模式按需通过 presign/file 接口获取可访问 URL。
- **环境变量**：新增 `STORAGE_DRIVER`（local/s3）、`LOCAL_UPLOAD_DIR`、`LOCAL_PUBLIC_BASE_PATH`、`PUBLIC_MEDIA_BASE_URL`；S3 变量保持不变，仅在 S3 模式下使用。
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
| 功能效果问题点首次输入后已有列表消失 | 渲染回退服务器列表，但输入 handler 从空本地数组开始更新 | 本地状态必须先由 `initializeEffectProblemPoints` 初始化；更新必须通过 `updateEffectProblemPoints` 以服务器列表为 fallback |
| 功能效果问题点/素材依赖手动保存 | 评价描述已自动保存，但问题点与素材仍走独立按钮 | 问题点和效果素材按 recipe 进行 800ms 防抖、串行自动保存；失败保留草稿并显示错误，AI 评价前必须 flush |
| 全仓 ESLint 存在 11 个 error | JSX 文案使用未转义英文引号、可用 `const` 的变量使用 `let`、旧 API/素材适配使用显式 `any` | 文案改用中文引号、不可变请求体使用 `const`、通用行类型使用 `Record<string, unknown>`、旧素材兼容字段使用 `LegacyMaterial` 显式类型；后续提交不得新增 ESLint error |

### 数据与素材稳定性约束

- 报告修复不得修改素材外键、删除素材实体或改变 local-then-S3 读取策略。
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
