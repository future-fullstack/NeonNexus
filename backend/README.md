# 独立内容与匿名对话服务

前端负责页面与 Markdown 安全渲染，Python 服务只负责数据、权限、图片和邮件。协议在 `contracts.md`。日常写作保存在服务器数据库中，发布只更新数据，不写 Git、也不重建前端。

模块分工：`storage.py` 负责幂等、事务化迁移；`auth.py` 负责 scrypt 密码、会话和 CSRF；`articles.py` 保存工作稿与已发布快照；`media.py` 负责图片格式/尺寸校验和发布权限；`threads.py` 负责匿名取信凭证与私密对话；`mailer.py` 负责持久 SMTP 通知队列；`http_api.py` 负责明确的 API 路由；`app.py` 是启动入口。`legacy.py` 保留旧数据与留言验证兼容。

## 写作与发布

`保存草稿` 只保存工作副本。已经公开的文章也保留原来的已发布标题、地址、日期和正文，直到点击 `发布修改`；预览读取私有工作副本。新上传图片在首次关联发布前也只有站主可读，旧已发布图片保持可用。撤回或删除会立即停止公开读取；删除采用私有软删除，避免误删后无法恢复。

只有 public 快照进入公开列表、详情、RSS 和日历。网页后台密码、草稿、留言、对话凭证、环境文件和数据库都不能进入源码仓库或公开静态目录。

## 认证与匿名回执

管理员只有一个固定站主账号，不需要访客注册。初始密码随机生成，私有文件保存 scrypt N32768/r8/p3 哈希，验证并发最多 2；每地址 10 分钟最多 5 次登录尝试。会话 cookie 为 HttpOnly、Secure、SameSite=Strict，随机令牌只以哈希存储，12 小时过期。所有写操作同时检查 Origin 和 CSRF。改密码或重设会让原会话失效。

访客首次投递前由浏览器生成 256 位取信凭证，相同内容失败后使用同一提交标识和凭证重试。服务器只保存凭证哈希。回执 UUID 只是定位符，不是读取权限；旧没有凭证的留言仍保留给站主，不能凭 UUID 读取。取信网址把凭证放在 fragment，API 用 Authorization header，代理不记录 API 访问日志。丢失凭证且没有保存取信链接，就无法证明对话所有权。

## 私有服务器文件与运维

真实 SMTP 设置只在 `/opt/neonnexus-messages/service.env`（权限 600），数据在 `/opt/neonnexus-messages/data`（权限 700，归容器用户 10001）。`owner-auth.json`、SQLite 与媒体文件均在此私有数据目录，不挂载到公开目录。服务无公网映射端口；HTTPS 入口由独立 Caddy 和内部 NGINX 81 网关提供。HTTP 网关 80 将博客整站重定向到 HTTPS，不接受登录密码或取信凭证。`--local-dev` 只用于本机隔离测试，强制绑定 127.0.0.1，生产不使用。

本地检查：`python -m unittest discover -s backend -v`。测试仅使用临时数据库、假邮箱和假 SMTP 函数。

```sh
# 只显示数量和失败类型，不读私人正文。
docker exec neonnexus-messages python manage.py status
# 使用 SQLite 在线备份，不能只复制运行中的主数据库。
docker exec neonnexus-messages python manage.py backup /data/backups/<新文件名>.sqlite3
# 忘记密码时，服务器重设并直接保存到私有文件，不能打印到聊天或日志。
umask 077
docker exec neonnexus-messages python owner_cli.py reset > /root/neonnexus-owner-access.json
```

站主初始登录信息交接到本机 `%LOCALAPPDATA%/NeonNexus/owner-access.txt`，只允许当前 Windows 用户访问；该文件不在项目或公开仓库中。后台自行改密码后，应自行保管新密码。

## 邮件与迁移

访客新留言及继续留言会建立持久邮件任务；站主回复留在该访客对话里，不再给站主自己发邮件。邮件只包含留言文字、北京时间、回执和后台入口，不含访客取信凭证。SMTP 失败保留内容并重试，间隔从 30 秒增至一小时；SMTP 接受后进程崩溃可能重发，不能承诺严格一次。

上线前必须在线备份旧 SQLite。迁移不覆盖旧留言、outbox 或未来新增数据；旧格式迁移与重复启动有测试。回滚前端可直接使用上一镜像；数据库迁移后不能直接恢复旧数据库覆盖新留言，也不能未经兼容检查运行旧后端镜像。应保留当前数据并做前向修复，必要时先导出迁移后的新增数据再进行人工恢复。
