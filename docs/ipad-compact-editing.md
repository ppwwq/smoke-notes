# 设置位置、全局纸面模式与横屏编辑

实施日期：2026-09-16。代码已在当前工作区实现，保留此前未提交改动；网页已于同日发布并完成线上检查；本次未生成或安装新版安装包。

## 行为

- 设置固定在侧栏左下角，便签本列表独立滚动；窄屏展开侧栏后保持相同位置。
- 网页纸面模式覆盖页面根背景、安全区域、侧栏、列表、待办、设置、同步弹窗、菜单和遮罩。横线仅用于正文，保留便签颜色差异与字体/荧光标注的显示映射。偏好继续仅存于当前浏览器，不修改内容与同步数据。
- 触控设备横屏，编辑区域聚焦，可视高度不超过 500px 且比布局高度小至少 150px 时进入精简布局。双指缩放不更新布局；外接键盘未压缩视口时保持常规布局。没有 VisualViewport 时沿用 CSS 布局。
- 精简时顶部保留返回、保存状态、格式、保存和更多；删除放入更多菜单。标题及颜色条与正文共同滚动，格式工具浮层不占布局高度。
- 粗体、斜体、下划线、删除线、清单、字体颜色、荧光标注均可使用。应用格式后关闭浮层并保留选区；点击外部、再次点击入口或 Escape 可关闭。更多菜单的 Escape 返回触发按钮焦点。
- 布局切换不重建编辑器，保持草稿、编辑选区和滚动进度。键盘收起或横屏条件不再成立后恢复常规布局。标题聚焦时滚动到顶部，避免此前正文滚动位置把标题带出视野。

## 接口

- useWebViewport 返回 style 与 compactEditing，启用范围仍限定网页便签编辑。
- RichNoteEditor 增加可选 compact、formatOpen、onFormatClose。默认使用常规布局与原有命令聚焦行为。
- useWebBackground 负责同步及清理文档根元素的主题标记，让页面边缘与应用主题一致；桌面不启用此偏好。

## 已完成验证

- 191 个自动测试通过；类型检查、ESLint、网页构建、桌面渲染器及 Electron 构建通过。构建仍提示主包超过 500 kB，未在本次进行拆包。
- 网页在 1194×834、834×1194、900×400、390×844、320×700 验证设置固定与列表独立滚动；桌面主界面夹具验证 1000×680、900×400、560×380 的空列表及长列表。
- 350px 模拟可视高度中，正文滚动区域为 301px；进入和退出精简模式均保持 500px 滚动进度。实际浏览器选择文字后执行粗体、颜色命令，选区不丢失。
- 纸面列表、待办、设置、同步二维码、菜单及默认主题恢复已检查；五种常规编辑尺寸无横向溢出，长文仍可滚动。
- 测试使用隔离样例数据库，网页验收阻断云端请求；同步二维码来自本地夹具，不建立真实配对。

## 验证文件与边界

- work/verify-compact-paper.cjs 与 outputs/compact-paper-verification.json：网页、精简编辑、选区、滚动和标题聚焦。
- work/verify-compact-additional.cjs 与 outputs/compact-additional-verification.json：桌面侧栏、纸面同步弹窗和常规编辑尺寸。
- 截图：outputs/global-paper-board.png、outputs/global-paper-settings.png、outputs/global-paper-todos.png、outputs/global-paper-pairing.png、outputs/ipad-compact-paper.png、outputs/ipad-compact-format.png。
- iPad Safari 和主屏幕 PWA 的真实软键盘、候选词栏、中文输入法与旋转仍需真机验收。自动测试和桌面浏览器模拟不证明这些系统行为。Windows 真实窗口与安装也未在本次操作。

## 网页发布结果（2026-09-16）

- 正式站点：https://smoke-notes-philip.pages.dev 。
- 本次生产部署：https://5069a4ac.smoke-notes-philip.pages.dev 。Cloudflare Pages 项目 smoke-notes-philip，生产分支标记 main；通过直接上传已验证的 apps/web/dist 发布，未修改 Git 分支或提交既有改动。
- 正式域名的入口 HTML、Service Worker、清单、注册脚本、主 JS 和 CSS 共六项 SHA-256 与本次本地构建一致。记录：outputs/web-deployment-2026-09-16-compact.json。
- 正式网页在隔离浏览器中检查了全局纸面配色、左下角设置、本地新建与保存，以及 350px 模拟可视高度下的精简格式浮层；正文为 301px，键盘收起后恢复常规工具栏，无页面脚本错误。
- 线上界面检查阻断所有 Supabase 请求，未修改用户云端便签。报告：outputs/web-live-2026-09-16-compact.json；截图：outputs/ipad-compact-live-2026-09-16.png。
- 真实 iPad Safari/PWA 软键盘体验仍待真机验收。
