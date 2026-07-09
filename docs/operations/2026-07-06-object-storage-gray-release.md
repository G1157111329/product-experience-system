# 对象存储灰度迁移运维文档(Garage S3)

**部署日期**:2026-07-06
**部署人**:ZCode agent
**生产机**:118.25.178.78 (ubuntu)
**方案**:灰度切 Garage —— 新上传走 S3,旧 459 文件继续走 local

---

## 当前架构

```
┌─────────────────────────────────────────────────────────┐
│  应用 (PM2: product-experience-system, PORT=5001)        │
│  STORAGE_DRIVER=local (保护旧文件静态路径)               │
│  NEW_UPLOAD_DRIVER=s3  (新上传走 Garage)                 │
├─────────────────────────────────────────────────────────┤
│  读取链路(generatePresignedUrl):                         │
│    1. 检查 local /uploads/ 是否存在                       │
│       ├─ 存在 → 走 local 静态 URL(/uploads/...)          │
│       └─ 不存在 → fallback S3 presigned URL              │
│                                                          │
│  写入链路(uploadFile):                                   │
│    NEW_UPLOAD_DRIVER=s3 → 写 Garage S3                   │
└─────────────────────────────────────────────────────────┘
         │                              │
         ▼                              ▼
  ┌──────────────────┐         ┌──────────────────────┐
  │ public/uploads/  │         │ Garage S3            │
  │ 984M / 459 files │         │ 127.0.0.1:3900       │
  │ (legacy, 只读)   │         │ bucket: xp-experience│
  │                  │         │  -media               │
  └──────────────────┘         │ data: /var/lib/garage│
                               └──────────────────────┘
```

## 关键组件状态

### Garage 服务
- **二进制**:`/usr/local/bin/garage` (v2.1.0, x86_64-musl, static-pie)
- **配置**:`/etc/garage.toml` (perms 600, ubuntu:ubuntu)
- **密钥**:`/etc/garage/secrets.env` (perms 600, ubuntu:ubuntu) — 含 GARAGE_RPC_SECRET / GARAGE_ADMIN_TOKEN / GARAGE_METRICS_TOKEN
- **数据**:`/var/lib/garage/meta` (sqlite) + `/var/lib/garage/data` (对象数据)
- **systemd**:`/etc/systemd/system/garage.service` (enabled, auto-restart)
- **端口**(全部 127.0.0.1,**不公网暴露**):
  - 3900 = S3 API(应用上传/读取)
  - 3901 = RPC(Garage 内部)
  - 3903 = Admin API
- **集群**:单节点 `84b5dc5e89f81c6a` @ dc1, 20GB capacity, replication_factor=1
- **bucket**:`xp-experience-media` (id `0f4140bb...`)
- **key**:`product-experience-app`, Access Key `<redacted>`, RWO 权限

### 应用配置(ecosystem.config.cjs)
- **位置**:`/home/ubuntu/product-experience-system/ecosystem.config.cjs`
- **关键 env**:
  - `STORAGE_DRIVER=local` — 全局保持 local(保护旧文件)
  - `NEW_UPLOAD_DRIVER=s3` — 新上传走 S3
  - `S3_ENDPOINT=http://127.0.0.1:3900`
  - `S3_REGION=garage`
  - `S3_BUCKET=xp-experience-media`
  - `S3_ACCESS_KEY=<redacted>`
  - `S3_SECRET_KEY=<见 ecosystem 或 pm2 env>`

### 应用代码改动(7 个文件)
原文件备份在 `/home/ubuntu/storage-migration-backups/files-pre-gray-release/*.bak`:
1. `src/lib/server/storage.ts` — 新增 NEW_UPLOAD_DRIVER、isNewUploadS3、isS3FallbackAvailable、localFileExists;重构 uploadFile/generatePresignedUrl/deleteFile/readLocalImageAsDataUrl 为双路径
2. `src/app/api/materials/file/[...key]/route.ts` — 加 S3 流式读取(支持 Range)
3. `src/app/api/materials/poster/[...key]/route.ts` — 加 S3 源下载 + ffmpeg poster 生成
4. `src/app/api/materials/presign/route.ts` — 按 path 判断 local/S3 决定鉴权
5. `src/app/api/materials/upload/route.ts` — faststart 条件改用 isNewUploadS3
6. `src/lib/server/report-detail.ts` — 新增 presignReportMediaUrls
7. `src/app/api/reports/[id]/pdf/route.ts` — PDF 渲染前 presign media URL

### 数据库备份
- `/home/ubuntu/storage-migration-backups/materials.20260706-storage-migration.json.gz` (454 条全量)
- `/home/ubuntu/storage-migration-backups/materials-paths.20260706-storage-migration.csv.gz` (file_path/file_url CSV)

---

## 日常运维命令

```bash
# Garage 状态
/usr/local/bin/garage status
/usr/local/bin/garage bucket info xp-experience-media
/usr/local/bin/garage key info product-experience-app

# 服务管理
sudo systemctl status garage
sudo systemctl restart garage
sudo journalctl -u garage -f

# 应用 env 查看(不显示 secret 值)
pm2 jlist | python3 -c 'import sys,json;e=json.load(sys.stdin)[0]["pm2_env"];[print(k) for k in sorted(e) if any(s in k for s in ["STORAGE","S3","NEW_UPLOAD"])]'

# 查看应用日志(关注 storage/S3 相关)
pm2 logs product-experience-system --lines 50 | grep -iE 'storage|s3|presign|material'

# 磁盘(系统盘 + Garage 数据)
df -h /
du -sh /var/lib/garage/
```

---

## 回滚预案

### 场景 A:新上传功能出问题,想退回纯 local(保留 Garage 服务)

```bash
# 1. 改 ecosystem:删掉 NEW_UPLOAD_DRIVER 和 S3_* 行,或把 NEW_UPLOAD_DRIVER 改 'local'
cd /home/ubuntu/product-experience-system
vi ecosystem.config.cjs  # 把 NEW_UPLOAD_DRIVER: 's3' 改成 'local'

# 2. 重启 PM2
pm2 delete product-experience-system
pm2 start ecosystem.config.cjs
pm2 save

# 3. 验证
curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:5000/login  # 应 200
```
效果:新上传回到 local `/uploads/`,S3 上已存的文件仍可读(双读链路)。Garage 服务保留运行。

### 场景 B:完全回滚(代码也恢复)

```bash
# 1. 恢复 7 个文件
cd /home/ubuntu/product-experience-system
BAK=/home/ubuntu/storage-migration-backups/files-pre-gray-release
cp "$BAK/src__lib__server__storage.ts.20260706.bak" src/lib/server/storage.ts
cp "$BAK/src__app__api__materials__file__[...key]__route.ts.20260706.bak" "src/app/api/materials/file/[...key]/route.ts"
cp "$BAK/src__app__api__materials__poster__[...key]__route.ts.20260706.bak" "src/app/api/materials/poster/[...key]/route.ts"
cp "$BAK/src__app__api__materials__presign__route.ts.20260706.bak" src/app/api/materials/presign/route.ts
cp "$BAK/src__app__api__materials__upload__route.ts.20260706.bak" src/app/api/materials/upload/route.ts
cp "$BAK/src__lib__server__report-detail.ts.20260706.bak" src/lib/server/report-detail.ts
cp "$BAK/src__app__api__reports__[id]__pdf__route.ts.20260706.bak" "src/app/api/reports/[id]/pdf/route.ts"

# 2. 移除 ecosystem 里的 S3 env + NEW_UPLOAD_DRIVER
vi ecosystem.config.cjs  # 删除 S3_* 和 NEW_UPLOAD_DRIVER 行

# 3. 重新 build + 重启(注意:服务器 build 需要先加 swap,见下)
sudo fallocate -l 4G /swap-build.img && sudo chmod 600 /swap-build.img && sudo mkswap /swap-build.img && sudo swapon /swap-build.img
set -a; source <(pm2 jlist 2>/dev/null | python3 -c 'import sys,json;e=json.load(sys.stdin)[0]["pm2_env"];[print("export "+k+"=\x27"+str(v).replace("\x27","\x27\\\x27\x27")+"\x27") for k,v in e.items() if k in {"DATABASE_URL","AUTH_SESSION_SECRET","AI_CONFIG_ENCRYPTION_KEY","SECURITY_SCHEMA_VERIFIED","DATABASE_ACCESS_MODE","NODE_ENV","PORT","STORAGE_DRIVER","LOCAL_UPLOAD_DIR","LOCAL_PUBLIC_BASE_PATH","LOCAL_UPLOAD_PUBLIC_ACCESS","PUBLIC_MEDIA_BASE_URL","AUTH_COOKIE_SECURE","DEPLOYMENT_NETWORK","AI_ALLOW_PRIVATE_ENDPOINTS"} and isinstance(v,str)]'); set +a
npx next build
node_modules/.bin/tsup src/server.ts --format cjs --platform node --target node20 --outDir dist --no-splitting --no-minify
sudo swapoff /swap-build.img && sudo rm /swap-build.img

pm2 delete product-experience-system
pm2 start ecosystem.config.cjs
pm2 save

# 4. 停 Garage(可选)
sudo systemctl stop garage
sudo systemctl disable garage
```

### 场景 C:Garage 服务挂了

```bash
# Garage 单节点无冗余。如果 systemd 没自动拉起:
sudo systemctl start garage
sleep 5
/usr/local/bin/garage status  # 确认 HEALTHY

# 如果起不来,看日志
sudo journalctl -u garage -n 50 --no-pager
```
影响:新上传会失败(S3 不可达),但旧文件 + 已上传文件的**读取不受影响**(local 仍可用;S3 文件的 presigned URL 会失败,但已签发的 URL 在过期前有效)。

---

## ⚠️ 已知限制 & 注意事项

1. **无冗余**:单节点 replication_factor=1,Garage 数据盘故障会丢新上传文件。**必须做每日备份**:
   ```bash
   # 加入 crontab:每天凌晨备份 Garage 数据
   0 3 * * * tar czf /home/ubuntu/storage-migration-backups/garage-$(date +\%Y\%m\%d).tar.gz /var/lib/garage/data 2>/dev/null && find /home/ubuntu/storage-migration-backups -name 'garage-*.tar.gz' -mtime +7 -delete
   ```

2. **磁盘空间**:Garage 数据放系统盘 `/var/lib/garage`(无独立云盘)。当前 ~7G 空闲,建议监控到 < 2G 时告警。**长期应挂独立云盘到 /var/lib/garage 或迁移**。

3. **服务器 build 需临时 swap**:服务器只有 1.9G RAM,Next.js production build 需要 ~4G。每次 build 必须先加 4G swap,build 完删除(见回滚预案 B)。

4. **视频上传到 S3 不做 faststart remux**:`upload/route.ts` 的 faststart 条件已改为 `!isNewUploadS3()`,S3 上传的视频跳过 ffmpeg faststart 处理。如果浏览器播放 S3 视频时 metadata 加载慢,需在上传前做 faststart(后续优化)。

5. **测试残留**:bucket 里有 1 个测试对象(`experience-media/gray-release-test/`,44B),无害,可用 aws-sdk 删除:
   ```bash
   cd /home/ubuntu/product-experience-system
   node -e 'const {S3Client,DeleteObjectCommand}=require("@aws-sdk/client-s3");const c=new S3Client({region:"garage",endpoint:"http://127.0.0.1:3900",credentials:{accessKeyId:"<redacted>",secretAccessKey:"<redacted>"},forcePathStyle:true});c.send(new DeleteObjectCommand({Bucket:"xp-experience-media",Key:"experience-media/gray-release-test/s3-test-1783347482197.png"})).then(()=>console.log("deleted")).catch(e=>console.error(e.message))'
   ```

6. **PostgreSQL 在 Docker**:生产机没装 psql,数据库在 Docker 容器(172.17.0.1:5433)。DB 相关操作需通过应用 node 脚本或进容器执行。

7. **PM2 ecosystem 现在在 live 目录**:`/home/ubuntu/product-experience-system/ecosystem.config.cjs`(之前只在 backup-deploy 目录)。重启用 `pm2 start ecosystem.config.cjs`。

---

## 后续优化建议(未做)

- [ ] 把 Garage data 迁到独立云盘(`/data/garage`),避免吃系统盘
- [ ] 配置 Garage 每日自动备份(crontab)
- [ ] S3 上传视频前做 faststart remux(用临时文件处理后再上传)
- [ ] 考虑给 materials 表加 `storage_driver` 列,显式记录每个文件位置(替代当前"stat 本地判断"的启发式)
- [ ] 监控 Garage 磁盘 + 内存(可加 prometheus node_exporter)
- [ ] 旧 459 文件迁移到 S3(可选,迁移后可关掉 local static 路径,统一走 S3)
