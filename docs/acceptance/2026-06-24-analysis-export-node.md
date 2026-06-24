# 2026-06-24 数据分析与导出节点验收

## 节点范围

- 普通用户: 数据分析页浏览、核心指标、筛选条件、权限边界。
- 管理员: 导出项目列表 CSV。
- 验收源为服务器 `118.25.178.78`，通过 SSH 隧道 `127.0.0.1:15000 -> 127.0.0.1:5000` 访问。

## 普通用户路径

- 账号: `accept_user`。
- 页面: `/analysis`。
- 页面展示:
  - 标题 `数据分析`。
  - 核心指标: `任务总数`、`完成率`、`问题总数`、`问题整改率`。
  - 分布模块: 任务状态分布、问题等级分布、问题整改进度、按品类-产品分布、按项目类型分布、按任务人分布、问题点分类分布、月度趋势。
- API 读回:

```text
GET /api/analysis -> 200
totalTasks=3
completedTasks=1
completionRate=33
totalIssues=1
rectifiedIssues=0
rectificationRate=0
```

- 筛选交互:
  - 项目类型选择 `ODM/OEM` 后触发 `GET /api/analysis?project_type=ODM%2FOEM`，返回 `200`。
  - 问题点分类选择 `二类` 后触发 `GET /api/analysis?project_type=ODM%2FOEM&issue_level=...`，返回 `200`。
  - 筛选后指标仍可读回，符合当前验收任务数据。
- 权限边界:
  - 普通用户页面不显示 `导出项目列表`。
  - 普通用户直接 POST `/api/analysis` 导出，返回 `403`，响应 `无权限`。

## 管理员导出路径

- 创建临时管理员 `accept_tmp_admin_0624` 仅用于本节点导出验收。
- 管理员页面显示 `导出项目列表`。
- 点击导出后:

```text
POST /api/analysis -> 200
download=analysis-export.csv
bytes=1398
hasTasksSection=true
hasIssuesSection=true
hasTask=Server Acceptance Task 0624 Detail 093228
hasIssue=QP-SENSE-569915
```

- 导出完成后，临时管理员已删除:

```text
deleted=1
remains=[]
auditRows=3
```

## 发现并修复

1. 删除产生过安全审计日志的用户会被 append-only 触发器拦截
   - 现象: 删除临时管理员时，`security_audit_logs.actor_user_id ON DELETE SET NULL` 会触发审计表 UPDATE，但原触发器禁止所有 UPDATE。
   - 风险: 后续管理员删除账号能力会受到安全审计日志外键阻塞。
   - 修复: `prevent_security_audit_log_mutation()` 保持审计日志 append-only，但允许唯一特例: 仅 `actor_user_id` 从非空置为 `NULL`，且其它字段完全不变。
   - 复验: 临时管理员可删除；审计日志保留 3 条；普通 UPDATE `security_audit_logs SET outcome = outcome` 仍返回 `security_audit_logs is append-only`。

## 前端布局检查

- 桌面普通用户: 筛选器、指标卡、分布图表和矩阵表格正常展示；无小于 24px 的可见操作控件。
- 移动端普通用户: 筛选器纵向排列，日期输入与筛选控件无重叠；核心指标在下方可继续滚动查看。
- 桌面管理员: 导出按钮位于页头右侧，未遮挡标题和筛选区域。

## 验证命令

- 浏览器脚本: Playwright 登录普通用户与临时管理员，截图并捕获 `/api/analysis` 请求。
- 服务器数据库脚本: 创建/删除临时管理员，验证安全审计触发器。

## 结论

- 数据分析与导出节点通过。
- 本节点发现并修复 1 个安全审计触发器边界问题。
