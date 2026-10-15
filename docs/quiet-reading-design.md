# 安静阅读 · 独立分支体验

本轮只调整公开文章页，沿用窗边博客的纸张、墨色、宋体标题与昼夜配色。首页窗景、天气、后台、留言与登录不变；没有引入新依赖，也没有重新套用科研终端风格。分支 `codex/quiet-reading` 先供本地比较，尚未部署。

## 参考与取舍

- [Gwern 的网站设计](https://gwern.net/design)：借鉴读者自主、渐进增强与有层次的长文导航。保留普通锚点、文字选择、浏览器查找和历史；不复制其复杂弹出引用体系。
- [Calm Technology](https://calmtech.com/)：小工具待在注意力边缘，需要时再打开。不做积分、主动弹窗、自动滚动、大幅进度条或音效。
- [Astro 组件](https://docs.astro.build/en/basics/astro-components/)、[脚本与事件](https://docs.astro.build/en/guides/client-side-scripts/)、[样式](https://docs.astro.build/en/guides/styling/)：正文、目录由服务端输出，小工具用独立原生脚本渐进增强。
- [MDN dialog](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/dialog)：使用浏览器原生模态对话框；键盘 Escape 关闭、关闭后回到打开按钮。不支持 `showModal` 时隐藏设置入口，文章与书签仍可使用。
- [MDN localStorage](https://developer.mozilla.org/en-US/docs/Web/API/Window/localStorage)：读取、写入和移除都捕获异常。储存不可用时阅读设置仍作用于本次页面，书签明确提示保存失败。
- [MDN prefers-reduced-motion](https://developer.mozilla.org/en-US/docs/Web/CSS/@media/prefers-reduced-motion)：阅读工具不引入动画，目录定位和书签恢复使用即时原生滚动。

## 三件小事

1. **阅读设置**：适中或大字号、舒适或较宽版心、专注阅读。专注模式收起站点导航与页脚，文章架返回链接和阅读工具保持可用；可以随时恢复。手机宽度保持自然适配。
2. **文章目录**：只有正文真实存在二、三级标题时才显示。保持原生 `details` 折叠和锚点链接；滚动时仅静默标记当前小节，不改写网址或自动翻节。宽屏目录移到留白，较窄屏幕保留在正文上方；手机启用脚本时初次收起，点开再选小节。
3. **本机书签**：需要读者主动点击「留枚书签」。再次打开同一篇公开文章后显示「接着读」，由读者决定恢复；不会自动跳屏。可更新或移除本篇位置。

## 本机储存边界

- `neonnexus:reading:v1:preferences`：字号、版心、专注开关。恢复默认会删除此项；不删除读者主动留下的书签。
- `neonnexus:reading:v1:bookmarks`：最多 20 篇公开文章的 `slug`、正文内相对位置 `ratio`、可选标题编号 `heading`、更新时间 `updatedAt`。只在点击保存或移除时写入，不持续记录滚动。
- 不保存正文、标题、访客身份、邮箱、私密草稿、查询参数、完整网址或回执密钥。不向服务器发送这些设置或书签，站主看不到，也不跨设备同步。书签基于同一浏览器的当前站点 origin，不同端口的本地预览互不共享。
- 文章更新、字体或屏幕变化后，只能回到原位置附近；这不是精确跨版本标注。移除或清除浏览器网站数据后不可恢复。

## 验证

- `npm run check`（Astro 构建与 TypeScript）通过；既有 Shaders 大模块提示仍在，本轮未新增依赖。阅读工具没有导入 GPU 模块。
- `node --test src/lib/reading.test.ts`：3 项通过，验证异常偏好、书签字段白名单/敏感 URL 拒绝/多余内容剥除、最多 20 条位置。
- 使用实际生产编译的 `BlogPost` 组件，经 Astro Container 渲染自写的公开长短文，并加载实际编译 CSS/JS；普通 Chrome headless 自然交互 27 项通过，包含 1440 桌面、390 手机、原生对话框/字号/版心/专注/Escape 回焦、真实目录与锚点、手动书签及再次打开不主动跳屏、移除、无 JS 正文与目录可读、代码内部横向滚动和全页无横向溢出。没有覆写 `navigator` / `document`、没有 GPU 实验开关或后端代理。
- 独立验收另完成首轮 23 项及最终 7 项检查，包括 1280 / 1440 目录留白、320 触屏目录展开及对话框范围、关闭与 Escape 回焦。网络观察只发现继承的 Open-Meteo 天气请求，没有阅读数据上传。
- 临时长短文明确标成「本地阅读排版验收」，不是已发布文章；HTML、截图和测试产物位于忽略目录，未提交 Git，也不留在 `public/` 或最终构建产物里。
- **本轮未运行实际内容 API、真实文章、登录或后台集成测试**。本地内容服务未启动，实际文章路径仍可能返回 503；没有把静态组件测试说成完整网站集成成功。没有访问真实数据库、私信、回执或 SMTP。微信真机未验证。

书签按正文相对位置 `ratio` 近似恢复；可选 `heading` 仅作为受限的位置标记保留，当前不用于跨版本精确定位。
