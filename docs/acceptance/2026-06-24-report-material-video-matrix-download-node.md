# 2026-06-24 报告中心素材、视频、矩阵与下载验收节点

## 验收范围

- 服务器: `118.25.178.78`
- 普通报告: `d579f3c2-40ab-4047-9bbe-8665a97f4857`
- 对比矩阵报告: `ef1bdbfc-d194-4abb-a216-b4132eb45d16`
- 覆盖模块:
  - 五感体验: 记录素材图片 + 视频
  - 功能效果: 步骤素材图片 + 视频、效果评价素材图片 + 视频
  - 对比矩阵: 单元格图片/视频区、文本输入区、评分/问题点
  - 报告中心: 列表、详情、公开分享、移动端、打印下载

## 新增验收素材

- 五感体验记录视频: `7ab8e52b-96f8-46e7-9576-1f49a756b2dd`
- 功能步骤视频: `9405790a-0e02-4d21-a040-033d27fefed1`
- 功能效果视频: `54ac0892-967a-4e19-9b3b-fc4fea075298`
- 矩阵单元格视频: `ddc349f3-d8b7-43b7-b277-bdb64da018fd`
- 矩阵单元格图片: `2ae9b26d-8d8f-4d1b-8ebd-7379623df923`

## 发现并修复

1. 普通报告详情/分享页的部分素材使用 `experience-media/...` 相对路径，浏览器请求 404。
   - 修复: `ReportSectionBlockRenderer` 对普通报告块、打印块、矩阵单元格媒体统一解析签名 URL，并在 local storage 下兜底到 `/uploads/...`。

2. 对比矩阵报告分享页进入打印下载时显示“报告不存在或内容为空”。
   - 原因: 打印页只允许 `report.content` 存在的普通报告进入打印；对比矩阵报告为 snapshot/detailModel 型，`content=null`。
   - 修复: 打印页允许 `content` 或 `detailModel` 任一存在即可打印，并为对比报告使用创建时间作为生成时间兜底。

3. 视频素材等待签名 URL 时，临时图片占位被写入 `<video src>`，导致 console 报错。
   - 修复: 签名 URL 未就绪时使用可渲染原始媒体地址兜底，避免把 data:image 占位图作为视频源。

## 最终复验结果

### 普通报告

- 详情页: `imgCount=15`, `videoCount=11`, `loadedVideoCount=11`, `brokenImgCount=0`, `rawRelativeMediaCount=0`, `overflowX=false`, `videoPreview=true`, `consoleCount=0`
- 公开分享页: `imgCount=13`, `videoCount=11`, `loadedVideoCount=11`, `brokenImgCount=0`, `rawRelativeMediaCount=0`, `overflowX=false`, `videoPreview=true`, `consoleCount=0`
- 打印页: `profile=single_a4_portrait`, `printInlineMedia=2`, `printSectionMedia=16`, `brokenImgCount=0`, `rawRelativeMediaCount=0`, `browserPdf.bytes=162632`, `consoleCount=0`

### 对比矩阵报告

- 详情页: `imgCount=5`, `videoCount=3`, `loadedVideoCount=3`, `brokenImgCount=0`, `rawRelativeMediaCount=0`, `overflowX=false`, `videoPreview=true`, `consoleCount=0`, `hasQuestionRuns=false`
- 公开分享页: `imgCount=4`, `videoCount=4`, `loadedVideoCount=4`, `brokenImgCount=0`, `rawRelativeMediaCount=0`, `overflowX=false`, `videoPreview=true`, `consoleCount=0`, `hasQuestionRuns=false`
- 移动端公开页: `width=390`, `overflowX=false`
- 打印页: `profile=comparison_image_matrix_a3_landscape`, `printInlineMedia=6`, `imgCount=3`, `loadedImgCount=3`, `brokenImgCount=0`, `rawRelativeMediaCount=0`, `browserPdf.bytes=105130`, `consoleCount=0`, `hasQuestionRuns=false`

## 下载结论

- 浏览器打印下载路径可用:
  - 普通报告生成 A4 PDF 成功。
  - 对比矩阵报告生成 A3 横向 PDF 成功。
- 正式交付预检仍为 `Blocked`，这是产品治理状态，不是网络失败:
  - 普通报告: `ai_unconfirmed`, `video_cover_missing`, `matrix_over_wide`, `content_json_fallback`
  - 对比矩阵报告: `ai_unconfirmed`, `video_cover_missing`
- 影响: 用户可通过浏览器打印导出当前验收 PDF；正式 PDF 交付前仍需确认 AI 结论，并为视频证据补封面或调整为附录证据。

## 截图与证据文件

- `output/playwright/media-video-matrix-verification-after-fix.json`
- `output/playwright/media-video-matrix-console-final.json`
- `output/playwright/media-video-matrix-print-final.json`
- `output/playwright/comparison-clean-final.json`
- `output/playwright/normal-print-final.pdf`
- `output/playwright/comparison-print-final.pdf`
- `output/playwright/comparison-clean-print-final.pdf`
- `output/playwright/normal-media-video-public-mobile-after-fix.png`
- `output/playwright/comparison-matrix-media-public-mobile-after-fix.png`
- `output/playwright/normal-print-final.png`
- `output/playwright/comparison-print-final.png`
