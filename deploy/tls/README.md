# 独立 HTTPS 入口

这层只负责证书和加密连接，不负责文章、留言或登录逻辑。

- 公网入口：`https://39.96.71.56/neonnexus/`。
- 官方 Caddy 2.11.7 镜像固定到已验证的 digest。
- 仅映射 TCP 443；不占用现有协作文档的 80，也不改动旧站的 8080 根路径。
- 将 `/neonnexus` 和 `/neonnexus/*` 原样交给 `neonnexus-blog:81`。81 是容器网络内的私有端口，不映射到宿主机。
- 博客 NGINX 的 80 入口负责将旧博客地址跳转到 HTTPS。私有 81 入口负责前端与后端路由，并明确重设可信的 HTTPS 请求头，不能信任旧 HTTP 请求自行提供的头。
- 没有启用整个 IP 的 HSTS，避免浏览器强制升级仍使用 HTTP 的协作文档地址。

## 证书与续期

显式使用 Let's Encrypt 公共 ACME 发行者与 `shortlived` profile，为公网 IP 申请约 160 小时的短期证书。TLS-ALPN-01 验证只需要公网 TCP 443，HTTP-01 已禁用。Caddy 保持运行并自动续期，无需手工更换证书。

`/opt/neonnexus-tls/data` 保存 ACME 账号、私钥和证书；`config` 保存运行配置。二者需要持久保存，目录权限为 700。它们不属于博客公共文件、Git 仓库或前端构建。备份时按私密数据处理。

不使用自签名证书，不让用户跳过浏览器证书检查。不应复制数据目录到 `public/`，也不应在其他公开日志中输出私钥或 ACME 账号内容。

## 部署与检查

将本目录的 `Caddyfile` 和 `compose.yml` 放到 `/opt/neonnexus-tls/` 后：

```sh
install -d -m 700 /opt/neonnexus-tls/data /opt/neonnexus-tls/config
docker compose -f /opt/neonnexus-tls/compose.yml up -d
docker exec neonnexus-tls caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
curl -I https://39.96.71.56/neonnexus/
```

检查必须保留系统证书校验；不要使用 `curl -k`。首个证书签发需要公网 443 可达，尚未签发时 TLS 握手失败，Caddy 会退避重试。配置调整后仅重建本入口容器，不重启 Docmost 或旧站容器：

```sh
docker compose -f /opt/neonnexus-tls/compose.yml up -d --force-recreate
docker logs --tail 80 neonnexus-tls
```

更新镜像时先确认官方发布与新 digest，再校验配置。长期运行应检查容器存活、自动续期日志和证书到期日；保留 443 的入站规则。恢复旧博客版本不需要删除证书目录。

官方依据：[Caddy TLS 配置](https://caddyserver.com/docs/caddyfile/directives/tls)、[Let's Encrypt 短期 IP 证书](https://letsencrypt.org/2026/01/15/6day-and-ip-general-availability/)。
