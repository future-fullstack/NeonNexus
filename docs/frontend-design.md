# 前端视觉选型 · 2026-10-13

这次保留 Astro + 原生浏览器脚本。首页先用 HTML、CSS 与自绘 SVG 建立完整构图，再增强窗景，不让文章或功能依赖显卡。公开界面统一留白、宋体标题、细线图标与柔和昼夜颜色；后台继续使用已有独立界面和 API。

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
