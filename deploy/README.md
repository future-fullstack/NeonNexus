# 独立前端、数据服务与 HTTPS 发布

正式入口：https://39.96.71.56/neonnexus/ 。旧 `http://39.96.71.56:8080/neonnexus/` 重定向到 HTTPS；协作文档 `http://39.96.71.56/` 与原站 `http://39.96.71.56:8080/` 保持。

## 组件

- `neonnexus-web`：Astro Node SSR，内部 4321；从内容 API 即时读取已发布快照，网页后台与匿名回执也是前端页面。
- `neonnexus-messages`：Python JSON API，内部 8091；私有 SQLite、图片、认证文件和 SMTP outbox 位于 `/opt/neonnexus-messages/data`。
- `neonnexus-blog`：NGINX 内部网关。80 只把博客 HTTP 重定向到 HTTPS；81 接受 Caddy 的 HTTPS 流量，硬编码可信 HTTPS 标识后代理 API、媒体与前端，不映射到公网。
- `neonnexus-tls`：独立 Caddy 443，CA 信任的短期 IP 证书与自动续期，详细配置在 `tls/`；不监听 80，不添加可能影响同 IP 协作文档的 HSTS。

所有应用服务加入已有 `docmost_default`，不修改协作文档容器。前置 `docmost-nginx-1` 的原根路由保持。API 禁止访问日志，private auth/media 数据不挂载到公开网页目录。

## 构建与服务更新

前端源代码构建使用 `deploy/frontend.Dockerfile`。构建参数 `SITE_URL=https://39.96.71.56`、`SITE_BASE=/neonnexus/`；将检查通过的 `dist/`、package 与 lock 冻结上传到 `/opt/neonnexus-web`，把 `deploy/frontend-runtime.Dockerfile` 保存为该目录的 `Dockerfile`，Compose 只打包这个正式产物。程序目录权限 755、文件 644，镜像复制时显式归 Node 运行用户，避免私有备份的 umask 077 让程序无法读取；这些权限只用于程序包，不用于凭证、媒体或数据库。运行环境 `NEONNEXUS_API_ORIGIN=http://neonnexus-messages:8091`。打包时排除 `.git`、`.astro`、`node_modules`、backend、数据库、凭证与环境文件。

Python build context 在 `/opt/neonnexus-messages/backend`，仅复制程序文件；真实环境文件 `/opt/neonnexus-messages/service.env` 权限 600，唯一允许的生产 Origin 是 `https://39.96.71.56`。Compose 使用 `env_file.format: raw`，避免改变密码中的特殊字符。

发布文章不执行这些部署操作：点击网页后台发布后，公开文章、RSS、日历和媒体权限读取同一发布快照。部署只用于修改前端或后端程序。

## 首次 CMS 迁移

1. 在线备份原 SQLite，并保存现有 NGINX 配置、Compose 与镜像标识；不要读取或输出来访者正文、SMTP 配置、密码或回执凭证。
2. 新后端以事务执行幂等迁移，旧消息与 outbox 保留。只从已经公开的 `first-signal.md` 一次性导入真实首文；不导入草稿模板或已删除示例。重复导入保留现有文章。
3. 初始化随机站主密码，将输出直接重定向到私有文件，再通过 SSH 交接到本机受限登录信息文件。不能把初始密码写到 Git、正文、URL 或聊天。
4. 新 API/SSR 在 Docker 网络内部通过检查后，替换网关配置，先 `nginx -t` 再 reload。内部 81 不映射 host，旧 80 博客路径全部 HTTPS redirect，包含旧精确留言 API 路由。
5. 公网使用系统正常 CA 校验访问 HTTPS，检查后台登录、保存/预览/发布/撤回/删除、私密图片、匿名取信与回复，同时复查原来的两个站点。正式投递只使用明确标注的验收文字，不读取其他访客留言。

## 备份与回滚

SQLite 使用 `manage.py backup` 在线备份，同时单独保存媒体目录与 `owner-auth.json`；全部备份位于私有目录。前端更新出错可以恢复上一前端镜像，但旧静态站只适合作为临时展示，不能作为新文章数据库的真实来源。

数据库迁移后优先前向修复；不能直接把旧 SQLite 覆盖当前数据而丢失新留言，也不能盲目切回未适配新 schema 的后端。配置失败先恢复本次配置备份并重新 `nginx -t`；原协作文档与原站容器不重启、不删数据、不换地址。短期 TLS 证书数据持久保留，由 Caddy 自动续期，不手动删除或重新签发代替故障修复。
