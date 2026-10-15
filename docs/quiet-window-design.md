# 窗边小互动 · 2026-10-15

这一版延续原来的柔和窗景、圆形日历与中文标题。没有引入已回退的科研框架，没有新增依赖、声音、GPU 层或启动动画；变化只发生在访客主动操作时。

## 选了什么

- **猫和茶**：插画上有可见的“摸摸猫”“喝口茶”原生按钮，触摸、鼠标和键盘都能触发一句短回应；回应留在窗景下面的 polite status，不弹窗、不计时催促、不自动消失。按钮不是权限或谜题验证。手机上的灯、信移到图下，与插画点击区错开。
- **日历**：原有点击日期、今日定位与翻月保留。日期上可用左右键换一天、上下键换一周；Home / End 到周一 / 周日；Page Up / Down 翻月，按住 Shift 翻年，月底日期收敛到目标月最后一天。移动会选择该日期并更新文章区，焦点跟随新日期；所有日期仍是普通 Tab 可达按钮，没有假称 ARIA grid。
- **文章话题**：从服务返回的公开文章标签生成单选筛选，显示匹配数量，可回到全部文章。没有 JS 时筛选工具隐藏，所有服务器生成的文章链接仍可读。没有标签就不出现工具；没有文章与服务故障各有原来的真实说明，未知数量不写成零篇。文章仍来自公开 API，筛选不修改数据库、不读取私稿。

顺便修正 320px 信件纸条关闭按钮超出图框的问题：纸条限制高度并允许内部滚动，关闭按钮留在顶端；保留原文“这里没准会有好玩的东西哦（笑”、Escape 和关闭后返回焦点。天气未知或等待时手机气象卡改为单列，不把日期挤成竖排。

## 资料与取舍

- [Calm Technology](https://calmtech.com/)：把回应留在外围，不通过声音或持续动画抢注意力；失败时仍能使用。
- [Maggie Appleton 的数字花园](https://maggieappleton.com/garden)：按真实话题轻轻探索，内容可以慢慢长大；未复制其插画或代码。
- [WAI 日期选择器键盘示例](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/examples/datepicker-dialog/)：参考日期方向键与翻月约定。本项目不是模态日期选择器，继续用简单按钮组。
- [MDN 原生按钮](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/button)与 [status 角色](https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA/Reference/Roles/status_role)：保持原生键盘触发，回应通过非打断状态区传达。
- Astro 官方 [组件](https://docs.astro.build/en/basics/astro-components/)、[样式](https://docs.astro.build/en/guides/styling/)与[客户端脚本](https://docs.astro.build/en/guides/client-side-scripts/)：保留 SSR 链接，渐进增强交互。文章架拆为接收公开文章 props 的组件，路由仍负责数据获取与错误状态。

无需引入完整组件库；原生按钮加少量 CSS / TypeScript 已覆盖这些交互。猫茶回应没有动画，所以不会绕过手动暂停、减少动态效果或隐藏页面的既有约束。北京日照、天气缓存、四季及 shader 生命周期原样保留。

## 本地验证与边界

- `SITE_BASE=/neonnexus/` 下 `npm run check`（Astro Node SSR 构建与 TypeScript）通过。原有 shader 大模块构建提示仍存在，本轮没有新增或修改依赖。
- 实际 Edge 1440 / 390 / 320px：猫茶鼠标及 Enter / Space、灯、信正常点击关闭与焦点返回、日历方向键跨月，无横向溢出和脚本异常。
- 真实编译的 ArchiveShelf / PostCard 用 AstroContainer 渲染本地公开样本：生活和学习各匹配两篇，全部恢复三篇；三个宽度无溢出；关闭 JS 三篇全部可读，筛选工具隐藏。样本仅用于临时静态页面，不是已发布文章；验收后从 public 精确移除，保留 ignored 测试记录，最终产物不含样本。
- 本轮不启动任何 API 服务、SMTP、账号或数据库。文章服务目前未运行，因此实际首页 / 文章路由显示诚实的 503 未连上状态。认证、编辑与匿名回执不在本轮复测范围；未访问线上。
- 独立验收另有 28 项通过，覆盖 320 / 390px 触控、信件关闭与回焦、月底 31 日翻月收敛、跨年、话题键盘筛选和无 JS；临时 public 样本已删除，重建产物确认没有 fixture。
- 未声称完成屏幕阅读器、微信内置浏览器或真实手机验证；键盘和移动尺寸用本机浏览器验证。
