# 私人留言服务

只有 POST `/neonnexus/api/messages`，没有网页端的留言列表、管理页或查询接口。JSON 字段是 `message`（去除首尾空白后 1–2000 字）和 `website`（留空的反垃圾字段），请求需要站点 Origin 与 `Idempotency-Key`。同一个标识、同一段文字重复投递返回同一回执，不重复保存；内容变化则返回 409。

服务先把留言与通知任务一起写入 SQLite，再返回成功。后台通过 SSL 或 STARTTLS 向服务端配置的唯一收件人发纯文本邮件，失败会保留并重试，间隔从 30 秒逐步增加至一小时。通知属于持久重试队列：SMTP 接受后服务崩溃可能产生重发，不能承诺严格一次或邮件必定到达收件箱。

环境设置参考 `service.env.example`，真实值只放服务器 `/opt/neonnexus-messages/service.env`（权限 600），不要提交到公开仓库。数据目录在 `/opt/neonnexus-messages/data`，与公开静态目录隔离。`messages.compose.yml` 不映射公网端口；只允许通过两个 NGINX 代理提交。API 路由关闭访问日志，服务不记录正文、凭据或访客地址；限流只在内存里保留加盐地址摘要，重启即清空。

本地检查：在本目录运行 `python -m unittest -v`。仅使用临时数据库、假邮箱、假发送函数，不发送真实邮件。

服务端排查：

```sh
docker exec neonnexus-messages python manage.py status
docker exec neonnexus-messages python manage.py list
docker exec neonnexus-messages python manage.py read <回执>
docker exec neonnexus-messages python manage.py backup /data/backups/<新文件名>.sqlite3
```

`status` 只显示数量和失败类型；`list` 只显示回执和时间；`read` 会显示私人正文，只有站主明确需要读取时才执行。备份使用 SQLite 在线备份接口，不要仅复制运行中的主数据库文件。数据备份和真实环境文件都不属于博客发布包。
