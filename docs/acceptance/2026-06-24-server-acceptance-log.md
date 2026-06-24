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
