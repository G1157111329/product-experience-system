# 2026-06-24 Server Acceptance Log

## L2 注册弹窗填写

- 状态: 已发现并修复
- 服务器路径: 登录页注册新账号弹窗
- 现象: 注册弹窗填写后，登录页背景内容透出并与弹窗表单重叠，影响用户确认输入内容。
- 处理: 调整全局 Dialog 遮罩与内容层级，弹窗内容改用不透底的卡片背景 token。

## L3 提交注册

- 状态: 已通过
- 服务器路径: 登录页注册新账号弹窗
- 现象: 首次通过 Nginx 提交时，后端安全中间件返回 `Cross-site request rejected`。
- 原因: Nginx 使用 `$host` 转发 Host，端口被去掉，导致 Origin/Referer 与 Host 比对失败。
- 处理: 服务器 Nginx 配置改为转发完整 `$http_host`，并补充 `X-Forwarded-Host`。
- 结果: 注册接口返回 `注册成功，请等待管理员审核`。

## L6 提交忘记密码审核

- 状态: 已通过
- 服务器路径: 登录页忘记密码弹窗
- 负向边界: 未审核账号 `acceptance0624` 提交时返回 `该账号尚未通过审核`，未生成密码重置审核。
- 正向结果: 已审核账号 `admin` 提交时返回 `密码重置申请已提交，请等待管理员审核`。
- 数据确认: `platform_audit_requests` 生成 `password_reset / admin / pending`。

## L7 已审核用户登录

- 状态: 已通过
- 验收账号: `accept_user` / 普通用户 / approved
- 登录结果: `/api/auth/login` 返回 `code=0`，用户角色为 `user`。
- 跳转结果: 登录后进入 `/dashboard`。
- 状态确认: `/api/auth/profile` 返回 `accept_user / 验收普通用户 / user / approved`。
- 页面确认: 工作台显示普通用户导航、快捷新建项目入口、空态体验计划和问题点。

## L8 工作台快速新建项目

- 状态: 已通过
- 入口: 工作台最近体验计划模块中的 `快速新建项目`。
- 点击结果: 从 `/dashboard` 跳转到 `/tasks`，并自动打开 `创建体验任务` 弹窗。
- 接口确认: `/api/tasks` 返回空列表成功响应。
- 页面确认: 弹窗展示任务名称、产品品类、产品、产品型号、项目单号、项目类型、体验时间、组织者和体验目的，组织者默认填入 `验收普通用户`。

## T5 五感体验完整操作节点

- 状态: 已通过
- 服务器任务: `ef6811c9-cfb4-46c9-b83f-38ae3a80813e`
- 覆盖操作: 拍照弹窗、录像弹窗、相册图片上传、非标准记录新增、素材按钮绑定、素材拖拽绑定、完整编辑、素材选择器打开、素材删除、记录删除。
- 接口确认: POST `/api/materials/upload`、POST `/api/records`、PUT `/api/materials`、PUT `/api/records/[id]`、DELETE `/api/materials`、DELETE `/api/records/[id]` 均返回成功。
- 数据确认: 临时记录和测试素材均已清理；既有记录 `QP-SENSE-569915` 保持 `不合格 / 非标准`，且 `check_requirement` 未丢失。
- 发现并修复: 素材证据栏上传按钮在桌面窄栏被压缩，导致 `相册图片 / 相册视频` 图标与文字挤压；已调整为两列布局并部署到服务器。
- 详情证据: `docs/acceptance/2026-06-24-senses-all-ops-node.md`

## T6 功能效果完整操作节点

- 状态: 已通过
- 服务器任务: `ef6811c9-cfb4-46c9-b83f-38ae3a80813e`
- 覆盖操作: 功能新增/编辑/删除、步骤新增/编辑/删除、功能排序、步骤排序、素材按钮绑定、素材拖拽绑定到效果评价、效果评价保存、效果问题点保存、素材选择器、AI总结评分、AI识别问题点。
- 接口确认: POST `/api/recipes`、PUT `/api/recipes/[id]`、DELETE `/api/recipes/[id]`、POST/PUT/DELETE `/api/recipe-steps`、PUT/DELETE `/api/materials` 均返回成功。
- AI状态: AI按钮请求均已触发，返回 `AI服务连接失败: fetch failed`，按当前验收规则归为外部 AI 网络失败。
- 数据确认: 临时功能、临时步骤和测试素材均已清理；既有功能 `QP-RECIPE-569915` 保留 2 个原始步骤，任务素材数为 0。
- 发现并修复: 移动端功能/步骤编辑删除入口依赖 hover 不可发现，拖拽手柄触控区过小；已改为移动端常显操作按钮并扩大触控区。
- 详情证据: `docs/acceptance/2026-06-24-functions-full-ops-node.md`

## T7 AI总结与报告生成节点

- 状态: 已通过
- 服务器任务: `ef6811c9-cfb4-46c9-b83f-38ae3a80813e`
- 覆盖操作: AI总结触发、报告生成确认弹窗、确认生成报告、跳转报告中心、任务状态流转、报告快照、问题点自动创建、桌面/移动端布局检查。
- AI状态: POST `/api/tasks/[id]/ai-summary` 已触发，返回 `AI服务连接失败: fetch failed`，按当前验收规则归为外部 AI 网络失败。
- 接口确认: POST `/api/reports` 返回成功，随后 PUT `/api/tasks/[id]` 返回成功，页面跳转 `/reports` 并展示新报告。
- 数据确认: 任务状态为 `已完成`；报告数为 `1`；最新报告 `00b82421-ef26-4ca0-84d5-12225ce15d46` 状态为 `已完成`，内容包含 `task/records/recipes/materials`；问题数为 `1`，由不合格五感记录 `QP-SENSE-569915` 自动生成。
- 前端检查: 桌面端和移动端均无文案重叠；移动端 `生成AI总结` 与 `生成报告` 为整行按钮，无遮挡、无挤压。
- 详情证据: `docs/acceptance/2026-06-24-ai-summary-report-generation-node.md`

## T8 问题管理节点

- 状态: 已通过
- 服务器问题: `5b8ce8a6-f17e-4477-9ceb-b058850a39ba`
- 覆盖操作: 问题列表、报告分组、状态快捷切换、详情弹窗、等级切换、整改字段填写、验证说明、导出 CSV、移动端布局、异常状态请求校验。
- 接口确认: GET `/api/issues`、PUT `/api/issues/[id]`、GET `/api/issues/[id]`、GET `/api/issues/export` 均返回预期状态；导出文件名为 `问题点数据.csv`。
- 数据确认: 验收中可读回 `三类/已验证/整改方案/责任人/计划完成日期/验证说明`；节点结束前已恢复为 `二类/待整改`，并清空临时整改字段。
- 发现并修复: 后端 `status/level` 缺少枚举校验；问题详情弹窗状态按钮存在换行风险。已部署到服务器并复验。
- 详情证据: `docs/acceptance/2026-06-24-issues-management-node.md`
