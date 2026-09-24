# 现成玻璃 UI 组件库候选核验

访问日期：2026-09-18。范围仅为 OpenGlass UI、Liqui Design、Liquefy UI 的作者官网、仓库及许可证；没有安装依赖或进行 Safari / iPhone 真机实测。

**建议用户先看 [Liqui Design 组件目录](https://liqui.design/docs/components)**：它把导航、工具栏、弹出面板等实际控件集中展示，最方便为「签」挑选参考。尤其可先打开 [Tab Bar](https://liqui.design/docs/components/tab-bar) 和 [Toolbar](https://liqui.design/docs/components/toolbar)。这是参考价值判断，不是成熟度或跨平台兼容认证。

## 1. Liqui Design

- 在线入口：[首页与可拖动材质面板](https://liqui.design/)、[组件目录](https://liqui.design/docs/components)、[完整媒体播放器示例](https://liqui.design/templates/media-player)。这些页面本轮均成功取得官网正文；未执行浏览器交互验收。
- 源码：[leefanv/liqui-design](https://github.com/leefanv/liqui-design)。作者以 Base UI 驱动控件，将组件源代码通过 shadcn registry 交给项目，折射内核单独作为依赖。
- 最适合「签」参考：Tab Bar、Toolbar、Popover、Dialog、Switch、Slider；组件目录同时包含表单、菜单和提示等常规 UI。[作者组件目录](https://liqui.design/docs/components)
- 渲染边界：作者明确说明折射当前仅在 Chromium 渲染；Safari 和 Firefox 自动退为毛玻璃。技术路线是 Canvas 生成位移图，再通过 SVG 滤镜作用到背景，不能称作“iPhone 也具备同样的真实背景折射”。[作者首页的 Degrades honestly](https://liqui.design/)、[仓库 Browser support](https://github.com/leefanv/liqui-design#browser-support)
- 许可证：实际读取根 [LICENSE](https://github.com/leefanv/liqui-design/blob/main/LICENSE)，为 MIT，版权署名为 2026 Fan Li。接入时需保留适用的版权和许可说明。

## 2. OpenGlass UI

- 在线入口：[作者展示站](https://moelueker.com/liquid-glass)。本轮成功取得首页及产品组合示例的正文。
- 源码：[moekoelueker/open-glass-ui](https://github.com/moekoelueker/open-glass-ui)。可参考 Toolbar、Dock、SegmentedControl、Popover、Dialog、SearchField；作者提供完整控件体系，而不是单个装饰滤镜。[组件说明](https://github.com/moekoelueker/open-glass-ui/blob/main/docs/COMPONENTS.md)
- 渲染边界：默认 `auto` 使用 CSS；SVG 和 WebGL 为主动选择的增强路径。作者明确承认 CSS 是折射观感近似，WebGL 针对自有图像 / 视频 / Canvas 输入，SVG 位移受浏览器实现影响。[README 的限制说明](https://github.com/moekoelueker/open-glass-ui#what-this-does-not-claim)
- Safari 不能从“作者 WebKit 测试通过”推导为“任意 DOM 背景真实折射可用”。其支持策略把 live backdrop URL filter 单列为可选增强；2026-07-24 的测试记录基于 macOS 上 Playwright 1.61 的浏览器，明确不承诺所有旧浏览器 / GPU。减少透明度还包含模拟测试。[作者 BROWSER-SUPPORT.md](https://github.com/moekoelueker/open-glass-ui/blob/main/docs/BROWSER-SUPPORT.md)
- 许可证：实际读取根 [LICENSE](https://github.com/moekoelueker/open-glass-ui/blob/main/LICENSE)，为 MIT，版权署名为 2026 Moe Luker。
- 项目判断：其 CSS 优先和主动增强的分层思路，适合「签」跨桌面 / 手机的基础材质参考；尚未验证能否直接接入本仓库。

## 3. Liquefy UI

- 在线入口：[演示首页](https://liquefy-ui.com/)、[组件目录](https://liquefy-ui.com/#/components)、[参数 Playground](https://liquefy-ui.com/#/playground)。站点返回需要 JavaScript 的前端外壳，本轮未渲染交互；路由与功能由作者 [README](https://github.com/liquefy-ui/liquefy-ui) 和 [文档索引](https://liquefy-ui.com/llms.txt) 交叉确认。
- 源码：[liquefy-ui/liquefy-ui](https://github.com/liquefy-ui/liquefy-ui)。可参考 GlassDock、LiquidSegmented、LiquidTabs、LiquidMenu、LiquidDrawer，以及按钮的弹性反馈。[作者组件列表](https://github.com/liquefy-ui/liquefy-ui#components)
- 渲染边界：作者用 WebGL 烘焙位移图，再把 SVG `feDisplacementMap` 放进 `backdrop-filter`；完整效果面向 Chromium，WebKit / Gecko 退为 CSS 模糊材质。它仍依赖 SVG 背景滤镜链路，不应因使用 WebGL 就推断解决了 Safari 折射限制。[作者 Design notes](https://github.com/liquefy-ui/liquefy-ui#design-notes)
- 接入注意：作者文档说明库默认不读取系统 `prefers-reduced-motion` 和 `prefers-reduced-transparency`，需要应用主动映射到 `motion` / `transparency` 参数。为「签」使用时应把现有清晰模式和减少动态效果策略接进去。[作者文档索引](https://liquefy-ui.com/llms.txt)
- 许可证：实际读取根 [LICENSE](https://github.com/liquefy-ui/liquefy-ui/blob/main/LICENSE)，为 MIT，版权署名为 2026 liquefy-ui contributors。

## 决策边界

这三项证明已经有人做了可复用的 React 玻璃 UI 和在线展示；本轮只核实它们公开发布的内容。下一步应先选喜欢的 Tab Bar / Toolbar / Popover 风格，用「签」真实文字背景做小样，再分别看桌面 Chromium 与 iPhone Safari 的结果。作者对兼容性、可访问性、测试数量和性能的描述，不等于本项目已经验收通过。
