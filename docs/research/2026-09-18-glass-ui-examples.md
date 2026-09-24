# 液态玻璃与毛玻璃 UI 案例索引

核查日期：2026-09-18。面向烟笺 Windows 桌面版＋手机网页版。以下链接来自作者官网或项目仓库；本轮没有安装这些库，也没有做 iPhone 真机验收。

## 优先看这四个

| 案例                | 直接看效果                                                                                                                                                       | 最值得参考                                   | 对烟笺的判断                                                     |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- | ---------------------------------------------------------------- |
| Liqui Design        | [组件目录](https://liqui.design/docs/components)；[导航栏](https://liqui.design/docs/components/tab-bar)；[工具栏](https://liqui.design/docs/components/toolbar) | 导航、工具栏、弹窗、开关与滑块，完整交互控件 | 首选视觉参考。作者明确 Chromium 折射、Safari/Firefox 毛玻璃降级  |
| OpenGlass UI        | [展示站](https://moelueker.com/liquid-glass)                                                                                                                     | Dock、搜索、分段选择、卡片与对话框           | CSS 优先，适合参考跨端基础材质；SVG/WebGL 是主动增强             |
| Liquid Glass React  | [可调参数演示](https://liquid-glass.maxrovensky.com/)                                                                                                            | 液态按钮、卡片、边缘弯曲、彩色折射与弹性     | 适合桌面局部效果实验；作者说明 Safari/Firefox 不显示位移折射     |
| Liquid Glass Studio | [材质实验台](https://liquid-glass-studio.vercel.app/)                                                                                                            | 折射、色散、反光、玻璃形状融合和实时调参     | 适合确定想要的光学观感，属于效果实验项目；不能当作完整笔记控件库 |

“首选”“适合”是本次设计判断，不是对稳定性或性能的认证。

## 作者源码与可复用边界

### Liqui Design / OpenGlass UI

- [Liqui Design 源码](https://github.com/leefanv/liqui-design)
- [OpenGlass UI 源码](https://github.com/moekoelueker/open-glass-ui)
- 许可证、实现说明和作者兼容性策略详见[组件库核验记录](./2026-09-18-glass-ui-library-candidates.md)。

### Liquid Glass React

- [源码及作者说明](https://github.com/rdev/liquid-glass-react)
- 作者提供卡片、按钮和指针交互示例，可调磨砂、色散、圆角和弹性；仓库标注 MIT。
- 作者 README 明确 Safari 与 Firefox 仅部分支持，位移效果不可见。
- 与当前 React 项目接近，但接入前仍需检查渲染开销、键盘焦点、减少动态效果和实际内容背景；本轮没有完成这些验收。

作者提供的卡片示例：

![Liquid Glass React 作者卡片示例](https://github.com/rdev/liquid-glass-react/raw/master/assets/card.png)

### Liquid Glass Studio

- [源码及作者说明](https://github.com/iyinchao/liquid-glass-studio)
- 作者展示 WebGL2/WebGPU、图片/视频背景、弹簧形变、色散和形状融合；仓库标注 MIT。
- 当前 README 将“UI Content inside of shape”与“Glass Text Rendering”列为尚未完成，因此这里把它作为材质实验台，而非可直接承载笔记编辑器的成熟组件。
- 在线站点需要 JavaScript，本轮取得站点响应和仓库内容，但没有渲染交互验收。

## 另外两个参考

- [Liquefy UI 演示](https://liquefy-ui.com/)／[源码](https://github.com/liquefy-ui/liquefy-ui)：包含 Dock、标签、菜单和抽屉，适合参考弹性反馈。作者的实现仍依赖 SVG 背景滤镜，WebKit/Gecko 降级为 CSS 模糊；详细记录见[组件库核验](./2026-09-18-glass-ui-library-candidates.md)。
- [shuding/liquid-glass](https://github.com/shuding/liquid-glass)：MIT 的小型 SVG shader 实验，适合理解折射原理；仓库不是完整 UI 库。作者列出的 [v0 示例](https://v0.dev/chat/dynamic-frame-layout-1VUCCecq7Uy) 本轮未验证其交互可用性。

## 对实施计划的补充

先用 Liqui 的 Tab Bar / Toolbar 确定视觉方向，再参考 OpenGlass 的 CSS 优先策略做烟笺的小样；rdev 用来比较桌面端局部折射收益，Studio 用来调节观感目标。

这些现成实现支持“优先复用成熟思路”的方向，但暂不决定引入哪个依赖。先在烟笺实际的文字、清单、纸面和手机软键盘场景中验证，再做依赖选型。Chrome 中的折射演示与 iPhone Safari 中的实际效果应分开记录。
