# 前端视觉选型 · 2026-10-14

保留 Astro + 原生浏览器脚本。首页先用 HTML、CSS 与自绘 SVG 建立完整构图，再增强窗景，不让文章或功能依赖显卡。后台继续使用已有独立界面和 API。

## 2026-10-14 · 个人观测站

这一版把科研档案的秩序与私人博客的生活感融合：原创的 N 标记、带顺序编号的中文导航、直角观察窗与非交互边缘刻线、文章目录索引、方格记录日历。大块灰白与深炭色保持北京昼夜变化，四季仍留在植物和窗景里；少量橙色用于标记和强调线，浅底小字使用深橙或深灰。首页标题、日期、分类有清楚层级；长文仍以自然中文排版阅读。没有启动等待、假身份验证或虚构系统参数。

猫、茶、灯和信保留，信的文字仍是「这里没准会有好玩的东西哦（笑」。文章、日历、私人通信和专属书桌共享框线、字体与颜色；日照、天气缓存、匿名回执和服务端登录保护的逻辑不改。目录编号仅表示当前列表顺序，不是永久文章编号，也不代表访问权限。

参考资料只用于理解视觉语言，未下载或复制其 Logo、字体、模型、视频、音频、界面代码，也未安装其完整应用或主题：

- [LBEILC / RhineLabUI](https://github.com/LBEILC/RhineLabUI)：非官方的 PV 终端复刻，参考档案框架、细线、编号与灰白/深色层级。其身份验证画面属于演示，不能当作认证机制。仓库的 MIT 范围不替代原作品牌、PV 与其它第三方素材的授权。
- [ReLuckyLucy / dsh-Rhine-Lab-theme](https://github.com/ReLuckyLucy/dsh-Rhine-Lab-theme)：用于 DeepSeek Harness 的特定主题，参考暖白、深炭色、方形边缘与克制橙色；没有把其安装到 Astro，也没有沿用莱茵生命品牌。

NeonNexus 标识、文案、观察窗装饰和样式均在本项目自创。`window-journal.css` 保留天气与基础阅读样式，`observation-station.css` 是唯一的观测站视觉层，不把任何权限判定放到 CSS 中。Shaders 与 Lucide 的版本、许可和降级边界沿用下列记录；此次未新增依赖，也没有新增 GPU 层。

| 项目 | 本次决定 | 原因与来源 |
| --- | --- | --- |
| Shaders 4.0.4 | 采用：局部光 / 空气纹理 | `shaders/js` 无需 React；仅两层自创组合，动态导入。MIT 软件；官网 Free/Pro 内容另有条款，不使用成品预设。[源码](https://github.com/shader-effects-inc/shaders/tree/v4.0.4)、[许可](https://shaders.com/license) |
| Lucide Astro 1.56.0 | 采用：导航 / 日历 / 信件 / 登录图标 | Astro 原生 SVG，服务端渲染，按使用图标打包，没有图标 hydration。ISC，部分 Feather 衍生图标保留 MIT 通知。[Astro 指南](https://lucide.dev/guide/astro/getting-started)、[许可](https://lucide.dev/license) |
| Motion JS | 本次不增加 | MIT、支持原生 JS；现在细微交互使用 CSS 即可，后续复杂动作再考虑。Motion+ 成品另计。[官方指南](https://motion.dev/docs/quick-start)、[MIT](https://github.com/motiondivision/motion/blob/main/LICENSE.md) |
| Web Awesome Core | 以后复杂控件可选 | 有官方 Astro 指南，Core MIT；Shadow DOM、表单事件需额外联调，官网 date-picker 等部分为 Pro。本次保留原生按钮/表单。[Astro 指南](https://webawesome.com/docs/frameworks/astro/)、[许可](https://webawesome.com/license) |
| daisyUI | 本次不增加 | MIT，但 Astro 接入需要 Tailwind 配置；本项目当前未使用 Tailwind。[官方接入](https://daisyui.com/docs/install/astro/) |
| Radix Primitives | 本次不增加 | 主要 React API，当前原生 Astro 页面不需要新增运行时。[官方介绍](https://www.radix-ui.com/primitives/docs/overview/introduction) |

## 效果边界

- WebGPU-only，无 WebGL 替代；透明 canvas 后始终是完整 SVG。`navigator.gpu` 只代表 API 存在，还需适配器和创建设备成功。HTTPS 或可信本地上下文是前提。[支持契约](https://github.com/shader-effects-inc/shaders/blob/v4.0.4/packages/core/src/gpu/support.ts)、[MDN](https://developer.mozilla.org/en-US/docs/Web/API/Navigator/gpu)
- 手机默认不依赖鼠标；导航、日历、灯、信都有原生按钮/链接。减少动态效果优先于恢复按钮，不启动 GPU；手动暂停、离屏与隐藏页面也停止绘制。库的离屏约 1 FPS 节流不能代替宿主明确暂停。
- `disableTelemetry:true`；使用本地生成层，没有外部素材、账号连接、CLI 或 MCP。网站阅读与 API 完全独立。
- 这是色彩与空气感的设计表达，数据源仍是 Open-Meteo。库不会自动把北京天气变成真实物理模拟；玻璃/模糊也不能直接过滤画布外的 DOM。
- 暂未在微信真机实测。构建会记录 GPU 独立 chunk 大小；官网现代 GPU 的性能估计不能作为低端手机承诺。[性能指南](https://shaders.com/docs/guide/performance)
- 本轮实际 GPU chunk 为 2,564,666 bytes，gzip 707,375 bytes（约 691 KiB），保留构建的大模块警告。`createShader` 的完整注册表无法经公开选项关闭，不改包、不使用私有内部路径。首页 SVG 先显示，再在可见/运动开启/WebGPU 环境下通过空闲调度动态导入；其它页面与减少动态环境不请求模块。

## 验证约定

本地构建/类型检查、真实 WebGPU 初始化或明确设备失败、无 GPU 降级、暂停/隐藏/减少动态效果、桌面与手机昼夜，以及天气、日历、信件、公开阅读、登录门禁的定向回归。临时截图和测试数据不进 Git；本次不部署服务器。
