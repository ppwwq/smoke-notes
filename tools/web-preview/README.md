# Jotday iPad 网页预览

2026-10-26 更新：当前入口为根目录 `打开iPad网页预览.cmd`，指向 `outputs/jotday-calendar-clean-20261026/win-unpacked/Jotday-Web-Preview.exe`。新增日历窗口改为右上浮窗，点击日期时间摘要展开编辑；保留行程与每日待办的现有功能。窗口标题、页眉、图标和程序名统一为 Jotday。下方 2026-10-22 的验收记录只代表当时版本。

电脑直接运行的独立预览程序，不需要安装、启动开发服务器或部署云端。

## 使用

打开 `outputs/jotday-calendar-clean-20261026/win-unpacked/Jotday-Web-Preview.exe`。移动到其他电脑时复制整个 `win-unpacked` 文件夹，不能只复制 EXE。

- 默认：本地新版、iPad 横屏（1180 × 820）。
- 可切换 iPad 竖屏（820 × 1180）、手机竖屏及桌面；没有手机横屏。
- 旋转按钮切换 iPad 横竖屏，自动缩放到窗口可见区域。
- 本地模式内置当前项目的 review 构建，使用实际网页组件和示例记录。编辑自动保存在独立的 `%APPDATA%/SmokeNotesWebPreview`，不需要网络或配对，不使用现有桌面应用资料目录。
- “线上正式版”加载已部署网站，需要网络；配对之后的操作会同步到相应云端账号。该模式不会部署任何代码。
- 使用 Chromium 模拟尺寸、方向、触摸能力及浏览器标识。不能模拟 iPad Safari 引擎、系统键盘、硬件安全区或真实设备性能。

## 构建

在仓库现有 Node/Electron 依赖环境中：

1. 在 `apps/web` 执行 `node ../../node_modules/vite/bin/vite.js build --config vite.review.config.ts`。
2. 将 `apps/web/dist-review` 的内容复制到本目录 `dist`（更新时替换此构建目录，避免复制成嵌套目录）。
3. 在仓库根目录执行：

```powershell
node apps/desktop/node_modules/electron-builder/cli.js --projectDir tools/web-preview --win --dir --publish never '-c.directories.output=../../outputs/jotday-calendar-clean-20261026' '-c.electronDist=D:/签/apps/desktop/node_modules/electron/dist' '-c.electronVersion=44.0.0'
```

这里只打包本地静态页面与预览窗口，不包含 `.env`、令牌或用户资料。本地构建快照不会随源代码编辑自动更新；需要重新构建。程序未签名。

## 本次验收

2026-10-22：源码与最终打包 EXE 均通过四种视图尺寸、iPad 旋转、触摸和方向状态、待办创建/完成/撤销、完整退出重启后数据保留，以及线上连接页加载和切回本地的数据隔离验证。测试未配对生产账户或修改正式便签。

记录：`outputs/web-preview-tests/packaged-result.json`；截图位于同目录。
