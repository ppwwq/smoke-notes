# Jotday 0.1.12

2026-10-25：将应用名称更新为 Jotday，采用用户选定的白色底「紫色日历 + 折角便签」图标。桌面窗口、托盘、侧栏、配对界面、网页标题、PWA 名称和日程模板文件名同步更新。

## 数据兼容

保留 Electron appId、npm 包名、存储键及同步协议。已安装版本继续使用原来的 `%APPDATA%\@smoke-notes\desktop`，预览版和指定隔离目录的行为不变。本次不包含数据库迁移或后端变更。

## 发布前验证

- TypeScript、修改范围内 ESLint、格式和差异检查通过。
- Vitest：60 个测试文件，532 项测试通过，包含生产数据目录回归测试。
- 网页生产构建、PWA 构建、桌面 release 构建及 Electron 主进程构建通过。
- Windows NSIS 安装包已生成，ASAR 内 27 个应用文件与构建产物逐一一致；未包含环境文件或本地工作资料。
- 使用独立数据目录运行打包后的 Jotday：名称和图标加载正确，新建便签本、保存便签、完全退出后重新打开，内容保留；无渲染器异常。
- 本地网页浏览器检查通过：标题、PWA 名称及各尺寸图标正确，无页面异常。

这些检查不等于真实手机、平板交互验收。安装包未进行代码签名。

## 安装包

文件：`Jotday-Setup-0.1.12.exe`（112,138,100 字节）

SHA-256：

```text
a02aa3b5e148a88eac2ca2ac15c52cbb0d5648a396ba437946b4027e44aff14f
```

打包后的 `resources/app.asar` SHA-256：

```text
41eac4545dc48ac0c07e32fb7a99352ecfa37baeffcfcb002932514219ebf8a3
```

发布目标：GitHub `ppwwq/smoke-notes` 的 `main` 与 `v0.1.12`，Cloudflare Pages 现有项目 `smoke-notes-philipwwq`。网站仅上传 `apps/web/dist` 静态文件。线上部署、远端资源和本机安装结果在执行后单独核验。
