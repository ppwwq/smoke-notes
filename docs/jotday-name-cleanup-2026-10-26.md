# Jotday 名称补齐

2026-10-26，按用户要求补齐当前产品中遗漏的旧品牌显示。

- 网页预览工具的窗口、标题、页眉、图标、程序文件名与 Windows ProductName/FileDescription 统一为 Jotday。
- 桌面 Clear Preview 的产品、快捷方式、卸载名称及安装包文件名改为 Jotday；同步修改预览识别条件，仍使用原来的独立资料目录。
- 更新根包名、README、部署说明、预览使用说明和源码品牌注释。README 改用当前本地示例界面截图；旧截图与 GIF 留作历史资料，不再展示于主 README。
- `打开iPad网页预览.cmd` 现指向 `outputs/jotday-web-preview-20261026/win-unpacked/Jotday-Web-Preview.exe`。整个 `win-unpacked` 文件夹必须一起保留。

保留的旧标识：数据库、localStorage、同步事件、内部包名/类型名、应用安装身份、资料目录、GitHub/Pages 真实地址、Graphiti 固定范围以及历史发布证据。它们不作为当前产品品牌展示；直接替换可能造成数据无法读取、更新身份改变或链接失效。

验证：TypeScript、桌面主进程构建、网页 review 构建、3 个测试文件共 24 项测试、本次修改源码 ESLint、格式检查通过。最终 EXE 的标题、图标加载、Windows 产品信息及桌面/手机/iPad 横竖屏共四种尺寸检查通过，无捕获到的页面错误；截图已目视检查。结果位于 `outputs/jotday-brand-check-20261026/result.json`，可重复脚本在 `work/check-jotday-brand.cjs`。这些是品牌与渲染检查，不是全部交互或真机验收。

全仓库 ESLint 存在 22 项既有错误：Android 生成测试报告 2 项，组件归档验证脚本 20 项。此次未修改这些文件。未提交、推送、部署线上或替换用户已安装的正式客户端。

待保存摘要：2026-10-26，当前产品统一使用 Jotday；已补齐网页预览、Clear Preview 安装显示、当前说明及截图，并打包更新预览启动入口。24 项相关测试、类型检查和四尺寸品牌检查通过；线上与真机未验证。Graphiti 因 `scope_busy` 未保存，等待该项目服务可用后再保存并回读确认。
