# Liquid Glass 与毛玻璃：Web / PWA 调研

访问日期：2026-09-18（香港时间）。

范围：为「签 / Smoke Notes」桌面版与手机网页版确定共同的网页材质策略。本文件聚焦 Apple 设计原则、CSS / SVG / WebGL 和 Safari；Windows 桌面窗口材质由综合计划另行处理。本轮仅调研和规划，未修改产品界面，未执行浏览器或真机验收。

## 建议结论

建议以**可读的毛玻璃为共同基线，给少量导航和操作控件加入 Liquid Glass 风格的边缘高光、层次和轻量反馈**。正文、笔记列表等长时间阅读区域保留稳定底色。强折射只列为独立实验，不作为首版跨平台交付条件。

这是基于下面来源作出的项目设计判断，不是 Apple 为本项目指定的方案，也不代表 CSS 能调用 Apple 原生 Liquid Glass。

## 1. 两种效果的区别

| 维度         | 毛玻璃基线                     | Apple Liquid Glass                     |
| ------------ | ------------------------------ | -------------------------------------- |
| 核心视觉     | 半透明表面、背后模糊、柔和边界 | 背景透镜形变、动态高光、阴影和材质变化 |
| 交互         | 可以是静态材质                 | 光学表现与交互运动共同设计             |
| 项目实现目标 | CSS 可实现的网页背景模糊       | 借鉴其视觉与层级原则；不宣称原生等效   |

Apple 在 WWDC25 说明 Liquid Glass 的特征包括透镜形变（lensing）、背景适应、光影及形变反馈；它超出了单一模糊效果。演讲同时要求避免玻璃叠玻璃。[Apple：Meet Liquid Glass，Dynamics / Adaptivity / Principles](https://developer.apple.com/videos/play/wwdc2025/219/)

HIG 将 Liquid Glass 放在内容上方的导航和控件层；内容层则使用标准材质。`regular` 通过背景模糊和亮度处理保障可读性，`clear` 主要服务照片、视频等丰富背景。自定义玻璃效果应克制使用。[Apple HIG：Materials](https://developer.apple.com/design/human-interface-guidelines/materials)

对「签」的推导：设置、搜索、导航和浮动操作区适合作为试点；笔记正文及列表条目不应全部透明化。笔记工具以文字为主，默认更接近 `regular` 的可读性目标。这里的 `regular` 只是设计参照，不作为网页端实际调用的 API 名称。

Apple 的自定义实现文档使用 SwiftUI `glassEffect` 与 `GlassEffectContainer`；这是 Apple 原生框架接口，不能作为 CSS 用法直接套进现有网页。[Apple：Applying Liquid Glass to custom views](https://developer.apple.com/documentation/swiftui/applying-liquid-glass-to-custom-views)

## 2. Web 能实现到什么程度

| 路线                                           | 能力及边界                                                                                                                                                                                           | 本项目建议                         |
| ---------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- |
| CSS `backdrop-filter: blur(...) saturate(...)` | 处理元素背后的网页内容；表面需透明或半透明才能看见结果。MDN 标为 Baseline 2024，不代表所有旧设备均可用。[MDN](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/backdrop-filter) | 跨平台主路线，配合底色、边界和阴影 |
| CSS 渐变高光、内阴影、轻微缩放                 | 可组合为玻璃观感；本身不等于对背景像素进行折射                                                                                                                                                       | 作为近似视觉增强，保持文本稳定     |
| SVG `feDisplacementMap`                        | 以另一幅图像的通道值移动输入像素，可构造透镜般形变；该原语可用不等于浏览器支持把它用作背景滤镜。[MDN](https://developer.mozilla.org/en-US/docs/Web/SVG/Reference/Element/feDisplacementMap)          | 小范围实验，独立降级               |
| WebGL 着色器                                   | 可以处理传入的纹理；纹理输入包括图像、视频、Canvas 等，没有直接把任意 DOM 元素作为 `texImage2D` 输入的接口。[MDN](https://developer.mozilla.org/en-US/docs/Web/API/WebGLRenderingContext/texImage2D) | 不作为首版正文背景方案             |

WebGL 的项目判断：要让正在编辑、滚动的笔记实时成为折射背景，需要额外的内容捕获或重绘链路；这会增加同步和维护成本。若只处理固定图片背景则容易控制，但那不能证明真实笔记内容也会被折射。SVG 像素位移和 WebGL 光学模拟也不自动具备 Apple 的自适应对比度、原生控件或系统动画。

### Safari 的关键边界

- 普通背景模糊：WebKit 自 Safari 9 支持带前缀形式；Safari 18 开始无需 `-webkit-` 前缀。若计划支持旧 iOS，保留前缀和标准属性两种声明。[WebKit：Safari 18 的 Backdrop Filter](https://webkit.org/blog/15443/news-from-wwdc24-webkit-in-safari-18-beta/#backdrop-filter)
- SVG 引用背景滤镜：截至访问日，WebKit 缺陷 #245510 仍为 `NEW`；候选修复 #68614 仍为 `Open`。因此不能把 `backdrop-filter: url(#svgFilter)` 的折射效果承诺给 iPhone Safari / PWA。[WebKit 缺陷 #245510](https://bugs.webkit.org/show_bug.cgi?id=245510)、[WebKit PR #68614](https://github.com/WebKit/WebKit/pull/68614)
- 上述问题不是“Safari 不支持所有毛玻璃”，也不能从 SVG 原语的兼容性推导出 SVG 背景滤镜兼容。候选修复存在不等于已在正式 Safari 发布。

### 图层边界与性能

父级 `opacity` 小于 1、滤镜等条件可能限制背景滤镜采样范围；MDN 特别说明父级整体透明可能导致子级模糊看不到父级背后的内容。因此设计上优先调整**表面底色的透明度**，避免用整组 `opacity` 同时削弱文本和控件。[MDN：backdrop-filter 的 Backdrop root](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/backdrop-filter#description)

CSSWG 的 Filter Effects Level 2 草案解释了背景采样、图层边界与重复渲染之间的关系；其中 Backdrop Root 的定义仍有未达成共识的说明，不能当作所有浏览器已经完全一致的行为。由此提出的工程约束是减少嵌套模糊、限制滤镜面积、通过实测确定参数，而不是承诺固定性能成本。[CSSWG：Filter Effects Level 2](https://drafts.csswg.org/filter-effects-2/)

## 3. 可访问性与降级

`prefers-reduced-motion` 已广泛可用，可据用户偏好减弱或移除非必要动画。`prefers-reduced-transparency` 尚非 Baseline；访问日 MDN 兼容数据中 Safari 为不支持，不能假设 iPhone 系统“降低透明度”会自动传到网页。[MDN：减少动态效果](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/At-rules/@media/prefers-reduced-motion)、[MDN：减少透明度](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/At-rules/@media/prefers-reduced-transparency)、[MDN 兼容数据：media.json](https://github.com/mdn/browser-compat-data/blob/main/css/at-rules/media.json)

因此建议：

1. 保留清晰、不透明的基本表面；浏览器支持普通背景滤镜时再增强。
2. 支持减少动态效果；去掉装饰性的弹性变形、指针跟随光斑和持续动画。
3. 当前代码检查确认网页已有本地保存的全局纸面模式，可作为网页端现成的手动清晰方案。综合计划进一步建议共享“减少透明效果”开关，因为桌面没有纸面模式，而网页用户也可能希望保留深色配色；该开关与纸面使用同一套实底降级规则。
4. 对无法使用背景滤镜的环境回到足够不透明的底色，保证文字和操作仍可辨认。
5. 针对亮、暗、花纹和密集文字背景逐一检验。普通文字以 4.5:1 为验收目标；大字可按 3:1；识别必要控件及其状态的非文本视觉信息按适用条件检查 3:1。透明表面必须看实际合成后的背景，不能只检查设计变量的两个颜色值。[W3C：WCAG 2.2，1.4.3 / 1.4.11](https://www.w3.org/TR/WCAG22/)

以上为项目验收目标；本轮没有进行对比度测量，也未声称通过 WCAG 验收。

## 4. 建议的网页端实施顺序

以下均是待执行计划，最终组件和文件映射应结合主计划中的当前代码检查。

| 阶段          | 产物                                                     | 放行条件                                             |
| ------------- | -------------------------------------------------------- | ---------------------------------------------------- |
| A：同屏对照   | 同一真实笔记场景中的“毛玻璃”与“轻量液态玻璃风格”两种方案 | 可以对照阅读清晰度、边缘层次和按钮状态               |
| B：共用材质   | 颜色、透明度、模糊、边缘、阴影、圆角和动效的统一参数     | 先通过手机 Safari 和桌面网页容器的静态对照           |
| C：小范围接入 | 一处导航/操作栏和一处弹出面板                            | 正文选择、编辑、滚动、菜单操作正常，避免多层模糊     |
| D：适配与降级 | 减少动态效果、手动清晰模式、无滤镜回退                   | 不支持特效时仍能完整阅读和操作                       |
| E：实机验收   | 记录设备、系统、浏览器/容器版本和结果                    | 浏览器标签页与独立 PWA 分别测试                      |
| 可选实验      | 小控件 SVG 或 WebGL 折射样机                             | 仅在确有视觉收益、实际渲染通过且性能可接受时考虑接入 |

首轮参数应作为可调候选，而非苹果官方数值。建议先比较少量固定档位，依据文字可读性和实机滚动表现选择；不通过首轮观察就扩大到整个界面。

## 5. 待验证事项

- 用户实际 iPhone 型号、iOS / Safari 版本，及最低兼容范围。
- 普通标签页与添加到主屏幕后的 PWA：地址栏收放、安全区、横竖屏、软键盘弹出、文本选区和工具栏。
- 浅色/深色模式下，白底、黑底、照片、花纹、密集文字背景的可读性。
- 滚动、连续输入和菜单打开时的合成开销、卡顿及设备温度；本轮没有帧率或功耗数据。
- `prefers-reduced-motion` 的实际响应；手动清晰模式是否完整覆盖玻璃表面。
- CSS 父级整体透明、裁剪和嵌套滤镜是否影响现有窗口/页面的可见背景。
- SVG 引用背景滤镜若未来重新评估，必须核实正式 Safari 发布状态，并测试实际滤镜图；仅靠语法支持检测不能替代视觉验收。

本文件的网页能力判断不证明 Windows 桌面后方的其他应用或壁纸会被模糊；那属于窗口合成器和 Electron 的单独能力边界。

## 6. 来源核验记录

所有上文链接均在 2026-09-18 访问。Apple HIG 和 SwiftUI 文档的网页外壳依赖 JavaScript，本次同时读取 Apple 同站发布的结构化正文，以避免只依据搜索摘要：

- [Apple HIG Materials 结构化正文](https://developer.apple.com/tutorials/data/design/human-interface-guidelines/materials.json)
- [Apple SwiftUI Liquid Glass 结构化正文](https://developer.apple.com/tutorials/data/documentation/swiftui/applying-liquid-glass-to-custom-views.json)

兼容性结论来自访问时的官方文档、MDN 数据和 WebKit 原始缺陷/候选修复状态；没有安装第三方液态玻璃库，也没有以第三方展示视频证明本项目的兼容性。
