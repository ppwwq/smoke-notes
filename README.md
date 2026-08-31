# 烟笺 Smoke Notes

一款面向 Windows 的烟雾玻璃便签应用，同时提供可安装到手机的 PWA。桌面端支持多张独立便签窗口；桌面与手机均可离线记录，并可选择通过 Supabase 配对同步。

> 当前版本：`0.1.0`。项目仍在早期阶段，建议先备份重要内容再用于长期记录。

## 功能亮点

- 普通便签与待办便签，可使用标题、清单、常用文字格式和六种便签色。
- 双击卡片打开独立桌面便签，分别记忆位置、尺寸、透明度和置顶状态。
- 最近使用的便签以侧签显示，悬停后展开标题并可快速切换。
- 主窗口支持拖动、最小化和关闭到系统托盘。
- 可在“设置与同步 → 窗口”中开启或关闭 Windows 登录时自动启动。
- 便签本、便签和待办支持排序、最近删除及即时撤销。
- Dexie/IndexedDB 本地优先存储；断网时仍可编辑，恢复网络后处理同步队列。
- 手机 PWA 可通过二维码或六位码与桌面端配对。
- Supabase Row Level Security 用于隔离不同工作空间的数据。

## 技术栈

- Electron、React、TypeScript、Vite
- Dexie / IndexedDB
- Supabase Edge Functions、Postgres RLS
- Vitest、Testing Library
- electron-builder / NSIS

## 项目结构

```text
apps/
  desktop/       Electron Windows 应用
  web/           手机 PWA
packages/
  core/          数据库、领域逻辑与同步引擎
  ui/            桌面、手机与独立便签共享界面
supabase/        数据库迁移、RLS 测试与边缘函数
```

## 本地运行

需要 Node.js 22+。项目锁定使用 pnpm 10.19.0，推荐通过 Corepack 运行。

```powershell
corepack enable
corepack pnpm install

# 桌面端
corepack pnpm --filter @smoke-notes/desktop dev

# 手机 PWA
corepack pnpm --filter @smoke-notes/web dev
```

应用在没有云端配置时仍可离线使用，但手机配对和跨设备同步不可用。

## 配置手机同步

复制 `.env.example` 为 `.env`，填写自己的 Supabase 项目与 Web 地址：

```dotenv
VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=YOUR_PUBLISHABLE_KEY
VITE_WEB_APP_URL=https://YOUR_PROJECT.pages.dev
```

不要把 `.env`、Service Role Key 或其他私密凭据提交到 Git。完整云端部署步骤见 [DEPLOY.md](DEPLOY.md)。

## 测试与检查

```powershell
corepack pnpm test
corepack pnpm typecheck
corepack pnpm lint
corepack pnpm build
```

保存本版本时，自动化测试结果为 16 个测试文件、99 项测试通过。

## 构建 Windows 安装包

```powershell
corepack pnpm --filter @smoke-notes/desktop package
```

安装包输出到 `apps/desktop/release/`。当前未配置代码签名证书，因此 Windows SmartScreen 可能显示未知发布者提示。

安装完成后，可进入“设置与同步 → 窗口 → 开机时启动”，控制烟笺是否随 Windows 登录自动显示主窗口。

## 数据与隐私

- 本地数据保存在当前设备的 IndexedDB 中。
- 只有配置并启用 Supabase 后，数据才会发送到你自己的 Supabase 项目。
- 仓库只提供环境变量占位符，不包含可用的云端密钥。

## 当前限制

- Windows 安装包尚未进行代码签名。
- 云端部署需要使用者自行准备 Supabase 与静态网站托管环境。
- 开机启动应在实际安装后通过一次 Windows 注销或重启完成最终确认。
- 仓库目前尚未附带开源许可证。
