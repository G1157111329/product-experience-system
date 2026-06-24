# 2026-06-24 问题管理节点验收

## 节点范围

- 以报告生成后自动创建的问题 `QP-SENSE-569915` 为验收对象。
- 覆盖问题列表呈现、报告分组、状态快捷切换、详情弹窗、等级切换、整改字段填写、验证说明、导出数据、后端状态校验和移动端布局。
- 验收对象为服务器问题 `5b8ce8a6-f17e-4477-9ceb-b058850a39ba`。

## 初始状态

```text
id=5b8ce8a6-f17e-4477-9ceb-b058850a39ba
title=QP-SENSE-569915
level=二类
status=待整改
source_type=record_fail
source_report_id=00b82421-ef26-4ca0-84d5-12225ce15d46
description=Mock AI suggestion for quick preset sensory 569915
```

## 浏览器交互与状态确认

- 进入 `/issues` 后，页面显示 `问题管理`、问题总数 `1`、报告分组 `Server Acceptance Task 0624 Detail 093228报告`、问题 `QP-SENSE-569915`。
- 列表快捷点击 `整改中`，PUT `/api/issues/[id]` 返回 `200`，统计卡同步显示整改中数量。
- 点击问题标题打开详情弹窗，可见问题点等级、整改状态、来源、问题描述、整改方案、责任人、计划完成日期。
- 在详情弹窗点击 `三类`，PUT `/api/issues/[id]` 返回 `200`。
- 在详情弹窗点击 `已验证`，PUT `/api/issues/[id]` 返回 `200`，页面出现 `验证说明` 字段。
- 填写整改方案、责任人、计划完成日期和验证说明后，通过 GET `/api/issues/[id]` 读回:

```text
level=三类
status=已验证
improve_plan=Acceptance remediation plan 0624
responsible_person=acceptance-owner
plan_complete_date=2026-06-30
verification_note=Acceptance verification note 0624
```

- 点击 `导出数据` 后，GET `/api/issues/export` 返回 `200`，浏览器下载 `问题点数据.csv`。
- 节点结束前已恢复基线状态:

```text
level=二类
status=待整改
improve_plan=null
responsible_person=null
plan_complete_date=null
verification_note=null
```

## 发现并修复

1. 后端问题状态与等级缺少枚举校验
   - 现象: `PUT /api/issues/[id]` 可写入异常字符串，可能造成列表统计和筛选异常。
   - 修复: 增加 `status` 白名单 `待整改/整改中/已验证/不整改`，`level` 白名单 `一类/二类/三类`。
   - 复验: 非法状态 `__bad_status__` 返回 `400`，响应 `无效的问题状态`，数据未被污染。

2. 问题详情弹窗状态按钮存在换行风险
   - 现象: 桌面窄弹窗中 `待整改/已验证/不整改` 等按钮容易拆成两行。
   - 修复: 详情弹窗等级/状态区域改为上下排列，状态按钮保持四列，并加 `whitespace-nowrap`。
   - 复验: 自动布局检查 `badWrap=[]`；截图确认按钮文字不再拆行。

## 前端布局检查

- 桌面列表: 报告分组、问题卡片、等级徽标和四个状态按钮显示正常，无小于 24px 的可见操作控件。
- 桌面详情弹窗: 等级按钮和状态按钮不换行；来源、描述、整改方案、责任人、计划完成日期正常展示。
- 移动端列表: 统计卡、筛选器、报告分组、问题卡片和四个状态按钮正常展示，未发现文字重叠或按钮挤压。

## 验证命令

- 本地: `pnpm ts-check`
- 服务器: `corepack pnpm next build`
- 服务器: `pm2 restart product-experience-system --update-env`

## 结论

- 问题管理节点通过。
- 本节点发现并修复 2 个问题: 后端状态/等级枚举缺失、详情弹窗状态按钮换行风险。
