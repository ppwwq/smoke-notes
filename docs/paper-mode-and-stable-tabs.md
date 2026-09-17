# 网页纸面模式与桌面固定侧签

## 行为

- 网页「设置与同步 → 外观 → 背景」提供默认模式、纸面模式。纸面应用于整个网页界面：米黄色 `#F4ECD8`，正文每 32px 一条横线，侧栏、列表、待办、标题、工具栏和弹窗使用协调的纯色纸底。2026-09-16 的扩展与验收见 [横屏编辑优化记录](./ipad-compact-editing.md)。
- 背景作为浏览器偏好保存；刷新后保留。存储写入受限时立即应用，并说明本次有效。
- 纸面以显示样式调整已有字体色、荧光标注的明暗，不改写便签内容或同步数据。
- 桌面浮动便签的侧签宽度为普通 30px、选中 42px、悬停或键盘聚焦 100px。
- 每个窗口使用自己的 sessionStorage 记住四个侧签的顺序。切换及页面重载保留位置；新窗口按当前便签与最近记录初始化。应用退出后重新创建的窗口会重新初始化。
- 删除成员时过滤失效便签并在末尾补位；外部打开的便签不在已满的侧签列表中时，替换最后一个，保留前三个的位置。

## 实现位置

- `packages/ui/src/useWebBackground.ts`：网页显示偏好与存储失败提示。
- `packages/ui/src/components/SettingsPanel.tsx`、`SmokeNotesApp.tsx`：设置入口和网页样式标记。
- `apps/web/src/web.css`：纸面、横线、显示配色和背景选项预览。
- `packages/ui/src/useNoteTabs.ts`：窗口侧签顺序、成员过滤及数据更新。
- `packages/ui/src/NoteWindowApp.tsx`、`styles.css`：侧签选择状态和三档宽度。

## 验证

- 回归测试覆盖背景选择与刷新保留、桌面隔离、存储受限；侧签跨重载固定、删除补位、外部打开、异常存储恢复；现有保存失败和鼠标穿透测试继续执行。
- 浏览器检查使用独立的样例数据，阻断云端请求。检查 834×1194、1194×834、507×900、390×844、320×700 的纸面排版、长文滚动及字体与荧光标注显示。
- 模拟 350px 可视高度验证软键盘区域及色板边界；真实浏览器页面重载四次验证侧签顺序、垂直位置和 30/42/100px 宽度。
- 浏览器截图与检查结果保存在 `outputs/paper-mode-*.png`、`outputs/stable-note-tabs.png`、`outputs/paper-tabs-verification.json`。验证脚本为 `work/verify-paper-tabs.cjs`，使用本地预览端口 4187。
- iPad Safari 真机输入与 Windows 透明窗口鼠标穿透仍须真机验收；浏览器夹具不替代系统级检查。

## 发布结果（2026-09-15）

- 网页已部署至 https://smoke-notes-philip.pages.dev ，本次部署地址为 https://f96888f3.smoke-notes-philip.pages.dev 。
- 已比对正式站点的入口 HTML、Service Worker、清单、注册脚本、主 JS 和 CSS，六项文件 SHA-256 均与本次构建相同。记录：`outputs/web-deployment-0.1.7.json`。
- 在正式网页使用隔离浏览器验证纸面选项、新建便签、本地保存与米黄色背景，无页面脚本错误。已阻断验证浏览器的云端写入。截图：`outputs/paper-mode-live-0.1.7.png`。
- Windows x64 安装包：`apps/desktop/release-0.1.7/SmokeNotes-Setup-0.1.7.exe`，113176524 字节。
- SHA-256：`6F4C18A56E1D9099857CA02C024A50503DD0D483E9EC8C4EABA684C58E658290`。
- 直接从安装包解出应用载荷，确认版本为 0.1.7，六个应用构建文件全部与本地构建一致。记录：`outputs/installer-0.1.7-verification.json`。
- 保留 0.1.6 安装包；本次未运行新安装程序。
