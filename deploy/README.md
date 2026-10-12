# NGINX 发布记录

博客：https://github.com/future-fullstack/NeonNexus  
线上：http://39.96.71.56:8080/neonnexus/

## 生产构建

本机预览默认使用根路径。正式服务器使用 `/neonnexus/`，构建时必须同时设置真实站点和前缀：

```powershell
$env:SITE_URL = 'http://39.96.71.56:8080'
$env:SITE_BASE = '/neonnexus/'
npm run check
Remove-Item Env:SITE_URL, Env:SITE_BASE
```

带上述前缀构建后，公开网页位于 `dist/client/neonnexus/`，上传包保留这一层 `neonnexus/`，解包到版本目录后应是 `<版本>/neonnexus/index.html`。NGINX 仅接收这些公开静态文件；不要再额外套一层 `neonnexus/`，也不要上传 `dist/server/`、源码、`.env`、Git 历史或 Obsidian 文件。Cloudflare 的 `wrangler.json`、`_headers`、`.assetsignore`、`_worker.js` 不参与此部署，需要从上传包中剔除。

## 服务器结构

- `/opt/neonnexus/releases/<版本>/neonnexus/`：一次完整的静态构建。
- `/opt/neonnexus/current`：指向当前版本的符号链接。
- `/opt/neonnexus/nginx.conf` 与 `compose.yml`：独立博客 NGINX。
- `/opt/neonnexus/backups/`：上线前的前置代理配置及原站校验值。

新容器 `neonnexus-blog` 只加入已有 `docmost_default` 网络，没有新增公网端口。前置代理仍是 `docmost-nginx-1`，`/opt/docmost/nginx.conf` 的原根站配置保留，只增加博客专属 location。反代保留 `/neonnexus/` 前缀，博客发布目录也使用这个前缀。

协作文档 `http://39.96.71.56/` 的容器、端口和配置没有修改。原站 `http://39.96.71.56:8080/` 的文件和原根路由没有修改。

## 更新与回滚

先在新版本目录解包并检查首页、文章、字体及 RSS，然后用新符号链接原子替换 `current`。两个版本目录都保留；后续文章更新只替换静态版本，不必重启协作文档或前置代理。源码提交与线上版本编号应对应。

```sh
# 更新前记下旧版本目录，替换链接只发生在 /opt/neonnexus。
readlink /opt/neonnexus/current
ln -s releases/<新版本> /opt/neonnexus/current.next
mv -Tf /opt/neonnexus/current.next /opt/neonnexus/current
docker exec neonnexus-blog nginx -t
```

文章更新出现问题时，把上述新版本换成旧版本即可。首次上线没有更早的博客版本；要撤销整个首次上线，恢复 `/opt/neonnexus/backups/front-nginx-before-neonnexus.conf` 到 `/opt/docmost/nginx.conf`，先运行 `docker exec docmost-nginx-1 nginx -t` 再 reload，然后停止 `neonnexus-blog`。只操作本博客新增的容器，不删除现有文档或原站。

每次更新后检查博客首页、文章深链、RSS、未知文章 404，并复查原来的两个地址。公开 GitHub 中的 draft 源文仍可被阅读，真正私密的文章不能提交到此仓库。

## 私人留言箱发布顺序

这部分是新增服务的部署步骤，不表示它已上线。服务源码与操作说明在 `backend/`。

1. 先保存两个现有站点的响应校验值，并备份当前前置配置和博客配置。不要用首次上线前的旧备份覆盖现在的原站配置。
2. 创建 `/opt/neonnexus-messages`，复制 `backend/` 与 `messages.compose.yml`。把真实 SMTP 设置、固定站主收件人和 `ALLOWED_ORIGINS=http://39.96.71.56:8080` 只写入服务器 `service.env`，权限 600。目录权限 700；数据目录归容器用户 `10001:10001`，权限 700。SMTP 通道只能使用 SSL 或 STARTTLS。已有协作文档 SMTP 设置可以读取复用，不能修改原服务的环境或密码。Compose 使用 `env_file.format: raw` 保留密码中的特殊字符，需 Compose 2.30 或更新版本（部署机已验证 5.4）。
3. 用 `docker compose -f /opt/neonnexus-messages/messages.compose.yml up -d --build` 启动服务，先确认数据可写、后台工作正常。它加入 `docmost_default` 网络，不增加公网端口。
4. 服务存在后，把本仓库 `nginx.conf` 应用到独立博客 NGINX；把 `front-proxy-location.conf` 的精确 API location 加入当前前置配置，保留现有博客路由和根站路由。先 `nginx -t`，通过才 reload；失败恢复本次备份。代理 API 的内外两层都关闭访问日志并限制请求体到 12k；外层重新设置真实地址，内层才将该地址交给内存限流。
5. 最后切换通过检查的静态版本，让留言按钮与接口同时可用。验证真实网站提交、相同回执重试、非法来源、超长内容，以及 GET 私人数据路径均不可读取。真实验收留言需明确标注测试且只发站主配置邮箱；只检查回执、保存数量、通知状态，避免读取已有私人正文。

SMTP 接受表示服务器成功交给邮件服务商，不等于站主收件箱已收到。发信异常时留言仍保留，`manage.py status` 可查看待重试数量。回滚静态页面或 API 配置时保留留言数据；不要删除数据目录或恢复旧数据库覆盖新留言。
