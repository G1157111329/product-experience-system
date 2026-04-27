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
- **AI/LLM**: doubao-seed-2-0-pro-260215 (标准导入解析), doubao-seed-1-6-vision-250815 (食谱效果评价, 可配置), doubao-seed-2-0-lite (其他场景)
- **PDF/Excel解析**: coze-coding-dev-sdk FetchClient + xlsx
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
│   │   │   ├── materials/       # 素材管理（上传/删除/重命名/关联，支持recipe_library_step_id）
│   │   │   ├── issues/          # 问题整改 CRUD
│   │   │   ├── reports/         # 报告生成/CRUD
│   │   │   │   ├── export-pdf/  # PDF导出API
│   │   │   │   └── share/       # 报告分享API（创建/验证/列表/撤销）
│   │   │   ├── recipes/         # 食谱/功能 CRUD（含effect_description/effect_score/effect_problem_point/effect_ai_result效果评价字段）
│   │   │   │   └── [id]/ai-evaluate/ # AI效果评价（四维评价：质感/透彻/纯净/恒定，基于描述+图片生成评分）
│   │   │   ├── recipe-steps/    # 食谱步骤 CRUD
│   │   │   ├── recipe-library/  # 食谱库 CRUD（名称全局唯一，步骤级联删除）
│   │   │   ├── recipe-library-steps/ # 食谱库步骤 CRUD（含批量排序）
│   │   │   └── dashboard/       # 仪表盘数据
│   │   ├── layout.tsx           # 根布局（含 Toaster + AuthProvider + suppressHydrationWarning）
│   │   └── page.tsx             # 首页重定向到 /dashboard
│   ├── components/
│   │   ├── navigation.tsx       # 导航组件（桌面侧栏 + 移动端底部/顶部 + RoleSwitcher + AiConfigSettings）
│   │   ├── image-preview.tsx    # 共享图片预览组件
│   │   ├── material-picker.tsx  # 素材选择器组件（引用/上传，支持initialMaterials预填充）
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
| `platform_users` | 用户账号（admin/user角色，pending/approved/rejected状态） |
| `platform_audit_requests` | 用户审核请求（注册/密码重置/名称修改/角色升级） |
| `platform_settings` | 平台全局设置（管理员配置，如五感体验默认选项，key-value JSONB） |
| `standards` | 体验标准库（通用标准/品类标准/感官评价标准/非标准/食谱功能标准） |
| `standard_items` | 标准检查项（含分类特定字段：experience_flow, touch_point, experience_standard, sub_check_dimension, check_standard, evaluation_prep, subjective_score, subjective_rating, reference_images） |
| `experience_tasks` | 体验任务（含 created_by 用户隔离字段, project_type: ODM/OEM/竞品研究/自研/前期研究/改型降本优化/海外产品, project_phase: 手板研究/试制阶段/试产阶段/量产阶段） |
| `check_records` | 检查记录（走查，含 standard_category, check_dimension, sub_check_dimension, check_standard, experience_flow, touch_point, experience_standard, check_tool, problem_level） |
| `materials` | 素材（图片/视频，含 AI 预留字段，可关联record或recipe_step或recipe_library_step或recipe，task_id可选） |
| `issues` | 问题整改（含 level: 一类/二类/三类, source, source_report_id, source_type: record_fail/recipe_problem, UNIQUE(title, source_type, task_id)） |
| `report_templates` | 报告模板 |
| `reports` | 报告（含 product_model 用于同型号合并） |
| `report_shares` | 报告分享（share_token, expires_at, created_by，支持7天/30天/永久有效期） |
| `recipe_library` | 食谱库（名称全局唯一约束，按品类-产品分类的全局食谱标准） |
| `recipe_library_steps` | 食谱库步骤 |
| `recipes` | 食谱/功能（含 effect_description 效果评价描述, effect_score AI评分, effect_problem_point 效果问题点, effect_ai_result AI四维评价完整结果JSONB） |
| `recipe_steps` | 食谱步骤 |

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
| GET | `/api/auth/audit` | 获取审核请求（admin_user_id: 管理员查所有; user_id: 普通用户查自己的） |
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

## 构建与运行

### 环境要求
- **Node.js**: 24+ (通过 .coze 配置 `requires = ["nodejs-24"]`)
- **包管理器**: pnpm (禁止 npm / yarn)
- **端口**: 5000 (开发与生产统一，`DEPLOY_RUN_PORT` 环境变量)

### 环境变量

| 变量名 | 说明 | 示例值 |
|--------|------|--------|
| `COZE_WORKSPACE_PATH` | 项目工作目录 | `/workspace/projects/` |
| `COZE_PROJECT_DOMAIN_DEFAULT` | 对外访问域名 | `https://abc123.dev.coze.site` |
| `DEPLOY_RUN_PORT` | 服务监听端口 | `5000` |
| `COZE_PROJECT_ENV` | 环境标识 | `DEV` / `PROD` |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase 项目 URL | `https://xxx.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase 匿名密钥 | `eyJ...` |
| `OSS_ACCESS_KEY_ID` | 对象存储 AccessKey | — |
| `OSS_ACCESS_KEY_SECRET` | 对象存储 SecretKey | — |
| `OSS_BUCKET` | 对象存储 Bucket | — |
| `OSS_REGION` | 对象存储 Region | — |
| `OSS_ENDPOINT` | 对象存储 Endpoint | — |

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
```

### Coze CLI 命令

```bash
# 初始化项目（仅首次）
coze init /workspace/projects --template nextjs

# 启动开发环境
coze dev

# 构建生产版本
coze build

# 启动生产环境
coze start
```

### 初始账号

| 角色 | 账号 | 密码 |
|------|------|------|
| 管理员 | bear2026 | bear2026 |

> 注册新账号需管理员审核通过后可登录

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
13. **问题管理重构**: 问题点来源从手动创建改为自动从报告汇总（不合格检查项+食谱功能问题），按报告名称分组；等级合并为一类/二类/三类；状态可切换（待整改/整改中/已验证/不整改）
14. **报告中心重构**: 移除"生成报告"按钮，新增"报告对比"功能；自研/改型降本优化报告按product_model在列表页分组，详情页/打印页内容级合并
15. **报告内容级合并**: 自研和改型/降本/优化类型的报告，在报告详情页和打印页中，同product_model的所有报告按时间排序合并展示，每份报告连续完整，用分割线和阶段/时间标注区分
16. **体验计划项目类型**: 新建时选择项目类型（ODM/OEM/竞品研究/自研/前期研究/改型降本优化/海外产品），自研可选项目阶段（手板研究/试制阶段/试产阶段/量产阶段）
17. **检查记录编辑重构**: 点击问题点用现有记录数据预填充表单，复用新增问题点对话框（标准类型选择+级联字段+检查结果+素材管理），保存调用 PUT /api/records/[id]；编辑模式切换标准类型时自动从记录预填充共享字段（sensory_dimension/problem_description/evaluationResult等）
18. **数据隔离**: 体验计划和问题管理按用户隔离（experience_tasks.created_by字段），工作台数据按用户过滤；标准管理和报告中心保持平台共享（因同型号不同阶段可能不同账号承接）；管理账号(admin)可查看所有数据
19. **非管理员待申请**: 非管理员工作台"待审核"改为"待申请"，显示该账号的密码/名称修改待审核列表（排除注册记录），可用叉图标取消申请
20. **数据分析**: 所有账号可浏览数据分析页面，核心指标为任务数/完成率/问题总数/整改率；支持按品类/项目类型/任务人/问题点分类/时间范围多维筛选；保留任务状态分布/问题等级分布(一类/二类/三类)/问题整改进度(按状态×等级)；管理账号可导出数据
21. **报告分享**: 报告中心和报告详情页可生成分享链接，设置有效期（7天/30天/永久）；公开页面 `/reports/share/[token]` 无需登录，只读查看，支持导出PDF、图片放大、视频播放；可查看已创建的分享链接列表并撤销
22. **报告重新生成**: 同一任务重新生成报告时，先删除旧报告和旧问题，再创建新报告和新问题，确保每个任务始终只有一份最新报告
23. **问题自动创建**: 问题在报告生成时由后端自动创建（非前端同步），使用 `createdKeys` Set 去重确保每个唯一问题（按 title+source_type）只创建一条，与素材数量无关；前端仅做只读查询
24. **报告合并类型检查**: 报告详情页合并同型号报告时，仅合并"自研"和"改型/降本/优化"类型的报告，其他类型（如"海外产品"）的同型号报告不参与合并
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
38. **体验计划转移**: 管理员可将体验计划从用户A转移到用户B，转移后所有资料（素材、五感体验、食谱功能等）归属目标用户；仅管理员可操作；转移时需传递 admin_user_id 获取用户列表
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
49. **AI模型配置**: 管理员可在个人设置中配置AI模型和API信息，支持内置模型（doubao-seed-vision系列等）和自定义API（OpenAI兼容格式）；配置存储在platform_settings(ai_config)，包含provider/model/temperature/custom_api_url/custom_api_key
50. **食谱效果素材关联**: materials表新增recipe_id字段，可关联食谱效果评价的附件素材；MaterialPicker组件支持recipe_id参数
51. **AI效果评价API**: POST /api/recipes/[id]/ai-evaluate 端点，接收食谱描述+图片素材，调用AI模型按四维评价体系（质感/透彻/纯净/恒定）生成评价，每维度0-10分+评语，综合评分自动保存到recipes.effect_score，完整结果保存到recipes.effect_ai_result(JSONB)
52. **效果评价问题点**: 效果/出品效果评价板块新增问题点输入框（effect_problem_point字段），与步骤的问题点格式一致；报告生成时效果问题点也会自动创建问题记录
53. **报告效果评价展示**: 报告详情页、打印页、分享页均展示效果评价板块（描述+问题点+素材+AI四维评价结果+综合评分），打印页base64转换包含效果素材图片；AI评价结果可随报告下载PDF
54. **AI四维评价框架**: AI评价内部采用固定四维评价体系作为方法论（质感/透彻/纯净/恒定），但对外仅展示综合评分和总结评语，不展示四维度细节；评价结果存储在recipes.effect_ai_result(JSONB)，格式为 { score, summary }
55. **AI评价结果持久化**: AI评价结果完整保存到数据库effect_ai_result字段，体验计划页面和报告中心均可查看历史评价结果；重新生成报告时effect_ai_result随食谱数据保存到报告content中；AI总结内容可编辑，编辑后保存覆盖原AI结果；报告生成时优先使用AI评价结果（可能经过编辑），无AI评价则使用用户描述
56. **效果评价素材去重**: 效果评价板块的素材仅通过MaterialPicker的initialMaterials展示，不再重复渲染预览区块
57. **产品型号条件必填**: 新建体验计划时，产品型号仅在项目类型为"自研"或"改型/降本/优化"时必填（Label动态显示*号），其他项目类型（ODM/OEM、竞品研究、前期研究、海外产品）产品型号可选
58. **AI评价覆盖描述框**: AI生成评价后直接覆盖"评价描述"输入框内容，用户可在此基础上编辑；AI评价结果仅保留分值(effect_score)，总结内容不再单独存储为effect_ai_result
59. **报告效果评价逻辑**: 报告生成时优先使用AI评价结果（可能经过编辑后的描述），无AI评价则使用用户原始描述
60. **步骤编辑素材管理**: 编辑步骤时通过initialMaterials预填充已有素材，保存时对比初始素材ID与当前选中ID，取消选择的素材设置recipe_step_id=null解除关联

## 代码风格

- 使用 shadcn/ui 语义化变量（bg-primary, text-muted-foreground 等），禁止硬编码颜色
- 使用 cn() 合并类名
- 所有 API 返回统一结构 `{ code, message, data }`
- React 组件使用 'use client' 标注客户端组件
- 禁止 Hydration 错误：不在 JSX 中使用 typeof window/Date.now() 等
- 权限系统：基于数据库 `platform_users.role` 字段，管理账号(admin)可编辑标准、批量导入/删除、审核账号；使用账号(user)只读；`useAuth()` hook 获取当前用户信息
- **移动端溢出处理**: flex-1 元素必须添加 `min-w-0`；长文本使用 `break-all` 或 `truncate`；Badge 使用 `max-w-[Npx] truncate`；根 body 已设置 `overflow-x-hidden`

## 权限说明

### 账号体系
- **初始管理账号**: bear2026 / bear2026
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
| 查看所有体验计划/问题/报告 | ✅ | ❌(仅自己的) |
| 数据分析导出 | ✅ | ❌ |
| 数据分析浏览 | ✅ | ✅ |

## 常见问题与修复

| 问题 | 根因 | 修复 |
|------|------|------|
| 审核请求点击通过报"参数不完整" | 前端发送 `audit_id`，后端期望 `request_id` | `dashboard/page.tsx` 中 `audit_id` 改为 `request_id` |
| 问题列表出现重复 | 前端 `syncReportIssues` 并发竞态 + 多素材每个生成一个issue | 移除前端同步，问题创建移至后端报告生成时，`createdKeys` Set 去重 |
| 重新生成报告产生重复 | POST /api/reports 始终 insert 新报告 | 生成前先删除同 task_id 的旧报告和旧问题 |
| 报告合并了不应合并的类型 | 合并逻辑未检查候选报告的 project_type | 添加 `rProjectType` 过滤，仅合并"自研"/"改型降本优化" |
| 移动端长字段穿透屏幕 | flex-1 无 min-w-0、Badge 无 max-w | body 加 `overflow-x-hidden`，flex-1 加 `min-w-0`，长文本用 `break-all`，Badge 用 `max-w-[Npx] truncate` |
| 视频素材不显示缩略图 | 五感体验和PDF附录过滤了 video 类型 | 移除 `material_type === 'image'` 过滤，视频用 `<video preload="metadata">` + 播放图标 |
| 转移功能无反应 | 前端调用 `/api/auth/users` 未传 `admin_user_id` | 添加 `admin_user_id` 参数：`/api/auth/users?admin_user_id=${user?.id}` |
| 问题点偶发重复 | 报告生成并发或双击导致重复创建 | DB 唯一约束 `UNIQUE(title, source_type, task_id)`，insert 失败静默跳过 |
| 编辑问题点素材取消选择不生效 | 保存时只处理新增关联，未处理取消关联 | 保存时对比 `initialMaterialIds` 与 `selectedMaterialIds`，差异项设 `record_id=null` |
| 编辑问题点切换标准类型后表单为空 | `populateFormsFromRecord` 只填充原始类别表单 | 切换类别时从 `editRecordData` 自动预填充共享字段（sensory_dimension/evaluationResult等） |
| 食谱库步骤添加图片报"缺少必要参数" | upload API 要求 task_id 必填，食谱库步骤无 task_id | DB 将 materials.task_id 改为可选，新增 recipe_library_step_id 字段 |
| 食谱库删除图标报错 | 重写 route.ts 时丢失 DELETE handler | 重新添加 DELETE handler，含步骤和素材级联清理 |
| 效果评价图片重复出现 | MaterialPicker已有initialMaterials展示，下方又有独立预览区块 | 移除重复的素材预览区块，仅保留MaterialPicker |
| 产品型号所有项目类型都必填 | 表单验证未区分项目类型 | 仅"自研"和"改型/降本/优化"时必填，其他类型可选 |
| 步骤编辑无法删除已关联素材 | 保存时只处理新增关联，未处理取消关联 | 对比editStepInitialMaterialIds与当前选中，取消选择设recipe_step_id=null |
| 视频上传打开相机而非录像 | accept="video/*"缺少capture属性 | 视频input添加capture属性，移动端直接打开视频录制 |
