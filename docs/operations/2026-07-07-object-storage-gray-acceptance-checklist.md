# 对象存储灰度生产验收清单

**验收日期**: 2026-07-07  
**生产入口**: `http://118.25.178.78:5000`  
**验收范围**: 新上传素材走 Garage S3，旧素材继续走 local；任务、报告、分享页、PDF 均应可读。

## 验收对象

- 任务: `7778e971-7709-452e-958e-c91124bcc364`
- 报告: `5f374d81-e035-4749-80fd-7b78bda8862c`
- 记录: `282c2ef0-846a-467d-b181-f80e1c36f6a7`
- 产品型号: `GARAGE-ISSUE-20260706235452`
- 图片对象: `experience-media/7778e971-7709-452e-958e-c91124bcc364/image/2026070707545201.png`
- 视频对象: `experience-media/7778e971-7709-452e-958e-c91124bcc364/video/2026070707545301.mp4`

## 核心链路结果

| 步骤 | 验收项 | 结果 | 证据 |
|---|---|---|---|
| 1 | 上传 1 张图片 | PASS | `tmp/codex-prod-gray/issue-acceptance-result.json` |
| 2 | 上传 1 个视频 | PASS | `tmp/codex-prod-gray/issue-acceptance-result.json` |
| 3 | 新素材只在 S3，不在 local | PASS | 远端 S3 HeadObject 与 local exists 检查 |
| 4 | 建问题点记录 | PASS | 记录 ID `282c2ef0-846a-467d-b181-f80e1c36f6a7`，报告问题数 `1` |
| 5 | 生成报告 | PASS | 报告 ID `5f374d81-e035-4749-80fd-7b78bda8862c` |
| 6 | 创建分享页 | PASS | `tmp/codex-prod-gray/issue-browser-checks-deduped.json` |
| 7 | PDF 下载 | PASS | `tmp/codex-prod-gray/issue-browser-checks-deduped.json` |
| 8 | 刷新重进 | PASS | `issue-screenshots-deduped/*-reload.png` |

## 接口验收

- 图片代理读取: `200 image/png`
- 视频 Range 读取: `206 video/mp4`
- 视频 poster: `200 image/jpeg`
- PDF preflight: `ok=true`
- PDF 下载: `200 application/pdf`
- PDF 文本: 包含报告标题、产品型号、问题点、产品名称

## 浏览器截图

- 任务详情: `tmp/codex-prod-gray/issue-screenshots/01-task-detail.png`
- 任务详情刷新: `tmp/codex-prod-gray/issue-screenshots/01-task-detail-reload.png`
- 报告中心: `tmp/codex-prod-gray/issue-screenshots/02-report-center.png`
- 报告中心刷新: `tmp/codex-prod-gray/issue-screenshots/02-report-center-reload.png`
- 报告详情: `tmp/codex-prod-gray/issue-screenshots/03-report-detail.png`
- 报告详情刷新: `tmp/codex-prod-gray/issue-screenshots/03-report-detail-reload.png`
- 分享页: `tmp/codex-prod-gray/issue-screenshots-deduped/04-share-page.png`
- 分享页刷新: `tmp/codex-prod-gray/issue-screenshots-deduped/04-share-page-reload.png`
- 打印页: `tmp/codex-prod-gray/issue-screenshots-deduped/05-print-page.png`
- 打印页刷新: `tmp/codex-prod-gray/issue-screenshots-deduped/05-print-page-reload.png`

## 独立复核结论

- Garage S3 服务在线，S3 smoke test 可写、可读、可删。
- PM2 环境为 `STORAGE_DRIVER=local` + `NEW_UPLOAD_DRIVER=s3`，符合灰度策略。
- 新上传文件不落 local，S3 对象存在且大小、Content-Type 正常。
- 浏览器分享页问题详情区显示 1 张图片 + 1 个视频，素材归档区显示 1 张图片 + 1 个视频；无 `/uploads` 裂图请求。
- PDF 导出可生成正式 PDF，4 页，文本包含报告核心信息。

## 修复项

- S3 浏览器 URL 不再暴露 `127.0.0.1:3900`，统一走 `/api/materials/file/...` 应用代理。
- S3 视频 poster 生成改为按需下载、缓存命中不再下载整视频，并清理临时文件。
- 报告素材在快照与实时 materials 同时存在时去重，优先保留实时材料记录。
- 报告区块在预签名前显示加载占位，不再先请求 `/uploads/<object-key>` 导致裂图。
- 运维文档中的 Garage/S3 访问凭据已脱敏。

## 后续关注

- 单节点 Garage 仍无冗余，必须补每日备份和独立云盘。
- 大视频上传到 S3 仍未做 faststart 预处理，如企业微信 WebView 加载首帧慢，应新增上传前 remux。
- 验收账号和测试任务为本次灰度验证数据，可保留用于回归，也可后续清理。
