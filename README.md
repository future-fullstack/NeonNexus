# NeonNexus · 从一篇文章开始

这是一个可以慢慢长大的初版：Astro + Markdown + CSS。首页、文章列表、阅读页和关于页已准备好；没有数据库、登录或真实密钥权限。原始模板说明保留在 `README-starter.md`。

## 写第一篇

在 `E:\桌面\NeonNexus` 打开终端：

```powershell
Copy-Item src/content/blog/my-first-post.md src/content/blog/hello-world.md
npm run astro -- dev --background
```

用文本编辑器打开 `src/content/blog/hello-world.md`，改标题、简介、日期和正文，将 `visibility: draft` 改为 `visibility: public`，保存后打开 http://localhost:4321/blog/hello-world/ 。文件名决定网址，建议用英文小写和短横线；换文件名会换网址。浏览文章入口是 http://localhost:4321/blog/ 。

```yaml
---
title: "文章标题"
description: "一句话简介"
pubDate: "2026-10-11"
tags: ["随想"]
visibility: public
example: false
---
这里写正文。
```

必填：`title`、`description`、`pubDate`。可选：`tags`（默认空）、`updatedDate`（更新日期）、`heroImage`（例如 `/images/photo.jpg`，文件放 `public/images/`）、`example`（是否示例，默认 false）。`visibility` 缺省为 draft；只有明确 public 才发布。三篇中文示例均有示例标识，旧英文模板仍在但已设为 draft。

## 预览和检查

```powershell
npm run astro -- dev status
npm run astro -- dev logs
npm run astro -- dev stop
npm run build
npm run check
```

`check` 沿用模板：构建、TypeScript 检查、Cloudflare 打包 dry-run，不会部署。预览服务器仅用于自己的本机，不要把 dev 端口暴露到公网。启动命令支持后台模式，没有弹出的终端窗口。

## 看懂骨架的顺序

1. `src/content/blog/my-first-post.md`：文章就是文本和页头字段。
2. `src/content.config.ts` + `src/lib/posts.ts`：字段检查和统一公开规则。
3. `src/pages/index.astro` + `src/pages/blog/`：首页、列表、文件名到网址。
4. `src/layouts/BlogPost.astro` + `src/components/SiteLayout.astro`：文章/整站外壳。
5. `src/styles/global.css`：颜色、字体与页面样式；`src/consts.ts` 是站名和简介。

站名和简介在 `src/consts.ts`；首页介绍与窗边便签在 `src/pages/index.astro`，详细个人介绍在 `src/pages/about.astro`。原创招牌在 `src/components/PixelSign.astro`，窗边夜景在 `src/components/NightWindow.astro`；颜色与雨景样式在 `src/styles/global.css`，分享图在 `public/social-card.svg`。首页可暂停动态，窗灯与信封只是公开的小交互。不要把 Obsidian 库或私人材料直接复制到项目。

## 北京窗边手帐

首页的窗景由当天北京天气与季节一起决定。日期、日历与文章的日期统一使用 `Asia/Shanghai`；日历以周一开始，小圆点表示该日有公开文章，点日期可打开对应文章。翻过去的月份只翻文章日历，窗外仍是今天的天气。

天气用 [Open-Meteo Forecast API](https://open-meteo.com/en/docs)，固定北京市中心坐标 39.9042, 116.4074。`current` 是 15 分钟模型天气数据，不是气象站实测；页面显示 API 的北京有效时刻。同一次请求带上当天 `daily.sunrise/sunset`，全站按北京当地的日出/日落自动白天白、夜晚黑，每分钟与回到网页时核对边界，避免 30 分钟缓存让日落后的网页继续保持白色。数据未连上时，短时沿用有效 `is_day`，再按北京时间 06:00–18:00 的近似区间回退；这不是天文日出计算，不会伪造天气或温度。

浏览器正常每 30 分钟刷新，失败或过期不展示虚假温度，首页点击 ↻ 可重试。免费 API 用于目前非商业个人小站；来源与 [CC BY 4.0 许可](https://open-meteo.com/en/licence) 已在页面注明。

视觉约定：3–5 月春、6–8 月夏、9–11 月秋、12–2 月冬，不表示专业节气划分。季节与日历跨北京午夜自动刷新，真实天气控制晴/云/雾/雨/雪/雷雨与白昼/夜晚。没有有效天气时只保留季节场景，明确提示未连上。暂停动态和系统减少动态设置都可停止动画。

编辑位置：`src/components/BeijingWindow.astro` 是原创像素窗景；`src/styles/window-journal.css` 管手帐与四季配色；`src/scripts/window-journal.ts` 连接天气和日历；`src/lib/beijing.ts` 放日期、天气码与日历计算。写文章方式和公开规则沿用原骨架。

## 慢慢生长

draft 会从公开内容库、页面、详情、RSS 和 sitemap 排除；它是写作状态，**不是加密或访问权限**。本地源文件、Git 仓库历史、备份仍可能包含正文，所以真正私密的心里话先留在自己的私人库里；`public/` 文件会原样公开，不能放秘密。彩蛋也只是公开的小交互。

将来做权限时，先设计服务端验证/授权与私密内容存储，再接上解谜、密钥和推送。不要通过前端隐藏来保护文章。

## 在线地址和更新

博客地址：[北京窗边手帐](http://39.96.71.56:8080/neonnexus/)。代码在 [公开 GitHub 仓库](https://github.com/future-fullstack/NeonNexus)，`clues/` 是预留的空线索目录；`.gitkeep` 只是让 Git 保存这个目录，没有谜题内容。

线上使用独立 NGINX 容器托管构建后的静态文件，现有协作文档地址 `http://39.96.71.56/` 和原站 `http://39.96.71.56:8080/` 保留。`deploy/README.md` 记录生产构建、服务器目录和回滚方式。日常本地写作仍用上面的本地预览命令；写完需要重新构建、上传，线上不会自动读取本地改动。

生产构建设置真实 `SITE_URL` 与 `SITE_BASE`，启用正确的 canonical/OG、RSS 和 sitemap。原 Cloudflare 配置/部署脚本保留，当前上线使用 NGINX，不需要执行 `npm run deploy`。

参考：[内容集合](https://docs.astro.build/en/guides/content-collections/)、[文件路由](https://docs.astro.build/en/guides/routing/)、[Astro 组件](https://docs.astro.build/en/basics/astro-components/)、[样式](https://docs.astro.build/en/guides/styling/)。

