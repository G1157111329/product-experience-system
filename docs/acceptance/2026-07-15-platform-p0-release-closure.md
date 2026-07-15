# 平台 P0 发布收口验收

## 结论

- 本地发布门禁：PASS。
- 最新生产构建：PASS，Next.js 57 个页面构建完成，`dist/server.js` 生成成功。
- 本地生产运行：PASS，`http://127.0.0.1:5002`，启动 schema provenance 为 `bootstrap-manifest`。
- Docker 基线：应用与 PostgreSQL 均 healthy；按约定未在逐项修复后重复重建 Docker。
- 云端覆盖部署：BLOCKED。严格 known-host/key-only SSH 对 `ubuntu@118.25.178.78` 返回 `Permission denied`；未使用仓库外明文密码脚本或 `AutoAddPolicy`。

## 本轮阻断项收口

1. 生产 schema 启动与迁移 provenance fail-closed。
2. 外部接口、Agent、报告详情与普通用户 owner 隔离。
3. 公开分享令牌只授权其绑定的主报告，禁止推断并泄露同型号 sibling 报告。
4. 素材关联使用 authoritative `material_links`，并保留首次选择顺序。
5. 冻结报告素材、问题身份、打印/PDF 与历史缺字段兼容。
6. 任务/问题/食谱删除使用事务边界与删除影响确认。
7. 未保存草稿阻断报告生成、转移、编辑器切换、侧栏导航与浏览器 Back。
8. 移动端矩阵触控尺寸、无横向溢出与新增列分区。

## 验收证据

- `pnpm ts-check`：PASS。
- `pnpm lint`：PASS（0 errors，12 个既有 warnings）。
- `pnpm build`：PASS。
- 服务/视图契约：50/50 PASS。
- PostgreSQL 集成：内容删除、食谱评价、问题复测、对比矩阵停用，4/4 PASS。
- 冻结报告 Playwright：14/14 PASS。
- 平台冒烟 Playwright：7/7 PASS。
- 未保存导航 Task10 Playwright：5/5 PASS。
- 食谱素材顺序：`[C, B, C]` 持久化为 `C@1, B@2`，PASS。

## 云端部署解锁条件

将本机公钥授权给生产 `ubuntu` 用户，或提供另一把已授权私钥。解锁后必须按以下顺序执行：远端只读预检 → 应用与数据库备份 → schema provenance/Agent 数据计数 → 0026 迁移 → allowlist 运行包覆盖（保留 `.env`、`ecosystem.config.cjs`、`uploads`）→ PM2 切换 → 内外网、报告/PDF、分享、存储和 Agent 数据不变性验收。
