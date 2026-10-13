# NeonNexus · 一篇一篇，慢慢生长

北京窗边手帐：四季窗景、当天北京天气、随昼夜变化的白底与黑底、文章日历，还有一个私密的匿名留言箱。

- 博客：[回到窗边](https://39.96.71.56/neonnexus/)
- 自己的书桌：[写文章与读留言](https://39.96.71.56/neonnexus/admin/)
- 代码：[公开 GitHub 仓库](https://github.com/future-fullstack/NeonNexus)

本轮新增的专属登录页、服务端控制台访问保护和实时分屏预览**只在本地完成，尚未上线**。线上仍运行上一版。以下新的登录与预览说明，先用于本机体验。

## 自己发一篇文章

先打开专属登录页 `/neonnexus/login/`，输入单独交付给你的密码，登录后进入“自己的书桌”。未登录或会话过期时，服务器先检查登录状态，不会直接发送编辑器和私密留言面板的页面；内容服务仍独立保护每个私密接口。

点“写新文章”，填写标题、简介、日期和正文；可以直接粘贴 Markdown，也可以插入图片。文章网址会先给一个默认值，想改时展开“文章网址”，使用英文小写、数字和短横线。

电脑上左边写正文，右边的阅读预览会在你停笔片刻后自动更新；手机上用“编辑 / 预览”切换视图。标题和简介也会跟着更新。预览断网时会标明正在显示上一次结果，输入的文字仍留在编辑器里。**实时预览不会自动保存，更不会自动发布。**

“保存草稿”会留下草稿，只有你能看见。准备好后点“发布文章”，首页、文章架、日历、RSS 和 sitemap 随即更新。**不用先上传 GitHub，也不用重新构建网站。**

修改已公开的文章，也可以先“保存草稿”：公开版本保持原样，新的正文和图片先留给自己。“发布修改”才会更新网站上的文章；“收回为草稿”会把文章和附属图片一起收起来。删除文章会收起原网址，已经公开过的内容仍可能被别人保存。编辑时记得保存；登录过期后重新输入密码，当前页面中没保存的文字仍会保留。

网页后台不执行 Markdown 中的原始 HTML 或脚本。标题、引用、列表、表格、代码、链接和图片都可正常使用，预览和正式阅读共用同一个渲染器。图片目前支持 4 MB 以内的 PNG、JPEG、GIF 和 WebP。

第一次打开书桌后，可以在“更换书桌密码”里换成只有你自己知道的密码。密码不放进公开仓库，也不出现在网页地址里。访客导航不会出现管理入口；真正的访问保护由服务器验证密码和登录状态。

## 匿名留言与回执

首页、导航和文章末尾都有留言入口。访客不用注册或留下名字、邮箱，最多写 2000 字。留言只对站主和持有该对话回执的人可见，不在网站上公开展示。

提交后会得到一个私密回执链接，可以复制，也可以下载成文本文件。站主在书桌的留言箱中读信、定向回复；访客以后打开自己的回执就能查看回复并继续留言。**拿到回执链接的人就能读这段对话，请自己保存，不要公开分享。** 丢失后无法按姓名或邮箱找回。早期没有回执的旧留言仍会保留，但无法直接回复对方。

连接失败会保留输入；同一条留言重试沿用提交标识。新留言的邮件通知由服务器独立处理，邮件暂时没发出去不会丢掉已保存的留言。收件地址、邮件凭据和留言数据只在服务器，公开 GitHub 不保存这些信息。

## 前端与后端分别做什么

- `src/` + `astro.config.mjs`：Astro Node 前端。负责窗景、日历、文章阅读、写作界面和回执页面，只通过 JSON API 读写内容。
- `backend/`：独立内容服务。负责文章、图片、私密对话、登录验证和邮件通知，数据在私有服务器目录。
- `backend/contracts.md`：两边约定的 API。修改界面不需要改数据库结构；发布一篇文章不需要发布一版代码。
- `deploy/`：分别运行前端、内容服务和代理的配置。原协作文档地址和原站地址保留。

前端不直接读取数据库，后端不生成网页。公开文章、草稿与私密留言使用各自的接口；文章预览不会把草稿写进公开缓存。未来的解谜和密钥权限还没有实现，`clues/` 仍只保留空目录占位文件。

## 看懂代码的顺序

1. `src/pages/index.astro`：首页，文章列表和日历的数据入口。
2. `src/lib/content-api.ts` + `src/lib/contracts.ts`：前端如何读取公开文章，以及 JSON 数据长什么样。
3. `src/pages/blog/` + `src/layouts/BlogPost.astro`：文章架和阅读页。
4. `src/lib/markdown.ts`：阅读与预览共同使用的安全 Markdown 渲染。
5. `src/pages/login.astro` + `src/middleware.ts` + `src/lib/owner-session.ts`：专属登录与服务端会话检查；`src/pages/admin/` + `src/components/owner/` + `src/scripts/owner/`：自己的书桌，文章编辑、实时预览和留言回复分开。
6. `src/pages/messages.astro` + `src/pages/thread.astro` + 对应 `src/scripts/`：留言与私密回执。
7. `src/components/BeijingWindow.astro` + `src/scripts/window-journal.ts` + `src/lib/beijing.ts`：窗景、天气与日历；`src/styles/window-journal.css` 管昼夜与四季样式。

`src/consts.ts` 是站名与简介。`src/content/blog/first-signal.md` 保留初始首文，原模板说明、草稿写作素材和示例图片集中在 `docs/template/`，只作参考，**现在在线文章以内容服务里的数据为准**。初始首文迁移时保留了 `first-signal` 网址和 2026-10-11 日期。两个公开示例已删除，归档模板不会自动发布。不要把 Obsidian 库或私人材料复制到公开仓库。

## 本地开发

需要 Node.js 22.12+（生产使用 Node 24）和独立内容服务。只看前端时，服务暂未连接会明确显示文章架没连上，不会伪装成空内容。完整本地测试使用单独的测试数据库，不能连生产数据库。

```powershell
npm ci
$env:SITE_BASE = '/neonnexus/'
$env:NEONNEXUS_API_ORIGIN = 'http://127.0.0.1:8091'
npm run astro -- dev --background
```

打开 `http://localhost:4321/neonnexus/`；专属登录页在 `http://localhost:4321/neonnexus/login/`，登录后进入 `/neonnexus/admin/`。内容服务本地启动说明见 `backend/README.md`。

本次已准备独立的本机测试内容服务，临时账号说明保存在 `.astro/private-console-fixture/local-access.txt`，仅当前电脑用户可读，并被 Git 忽略。它与线上账号无关，测试数据库和线上数据分开，测试环境不发送邮件；不要用线上密码登录它，也不要把这些本地私密文件提交到仓库。

```powershell
npm run astro -- dev status
npm run astro -- dev logs
npm run astro -- dev stop
npm run check
```

`check` 做 Node 服务构建和 TypeScript 检查，不会部署。前端服务产物是 `dist/client/` 和 `dist/server/`，两者一起部署；不能再按旧静态页面上传方式更新文章。`deploy/frontend.Dockerfile` 构建独立前端镜像，部署与回滚说明见 `deploy/README.md`。旧模板说明留在 `docs/template/README-starter.md`，目前运行使用 Node 与 NGINX。

## 北京的天气和日子

日期、文章日期与日历统一使用 `Asia/Shanghai`。日历以周一开始，小圆点表示当天有公开文章；翻过去的月份只翻文章日历，窗外仍是今天的天气。

天气来自 [Open-Meteo Forecast API](https://open-meteo.com/en/docs)，固定北京市中心坐标 39.9042, 116.4074。`current` 是 15 分钟模型天气数据，页面显示它的北京有效时刻。全站按 API 给出的北京日出、日落切换白天白底、夜晚黑底，每分钟和回到页面时检查边界。正常每 30 分钟刷新天气，未连上时明确说明并允许重试，不显示虚构温度；没有有效日出日落数据时按北京时间 06:00–18:00 近似回退。

视觉约定：3–5 月春、6–8 月夏、9–11 月秋、12–2 月冬。晴、云、雾、雨、雪、雷雨影响窗景；暂停动态和系统减少动态设置都可以停止动画。天气来源与 [CC BY 4.0 许可](https://open-meteo.com/en/licence) 在页面注明。

参考：[Astro Node 运行](https://docs.astro.build/en/guides/integrations-guide/node/)、[动态路由](https://docs.astro.build/en/guides/routing/)、[Astro 组件](https://docs.astro.build/en/basics/astro-components/)、[样式](https://docs.astro.build/en/guides/styling/)。
