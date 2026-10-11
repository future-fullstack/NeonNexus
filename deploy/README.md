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

新容器 `neonnexus-blog` 只加入已有 `docmost_default` 网络，没有新增公网端口。前置代理仍是 `docmost-nginx-1`，`/opt/docmost/nginx.conf` 的原根站配置保留，仅增加 `front-proxy-location.conf` 中的两个 location。反代保留 `/neonnexus/` 前缀，博客发布目录也使用这个前缀。

协作文档 `http://39.96.71.56/` 的容器、端口和配置没有修改。原站 `http://39.96.71.56:8080/` 的文件和原根路由没有修改。

## 更新与回滚

先在新版本目录解包并检查首页、文章、字体及 RSS，然后用新符号链接原子替换 `current`。两个版本目录都保留；后续文章更新只替换静态版本，不必重启协作文档或前置代理。源码提交与线上版本编号应对应。

```sh
# 更新前记下旧版本目录，替换链接只发生在 /opt/neonnexus。
readlink /opt/neonnexus/current
ln -s /opt/neonnexus/releases/<新版本> /opt/neonnexus/current.next
mv -Tf /opt/neonnexus/current.next /opt/neonnexus/current
docker exec neonnexus-blog nginx -t
```

文章更新出现问题时，把上述新版本换成旧版本即可。首次上线没有更早的博客版本；要撤销整个首次上线，恢复 `/opt/neonnexus/backups/front-nginx-before-neonnexus.conf` 到 `/opt/docmost/nginx.conf`，先运行 `docker exec docmost-nginx-1 nginx -t` 再 reload，然后停止 `neonnexus-blog`。只操作本博客新增的容器，不删除现有文档或原站。

每次更新后检查博客首页、文章深链、RSS、未知文章 404，并复查原来的两个地址。公开 GitHub 中的 draft 源文仍可被阅读，真正私密的文章不能提交到此仓库。
