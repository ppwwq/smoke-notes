# 烟笺 Smoke Notes

一款参考 Windows 便笺操作方式的烟雾玻璃便签程序。桌面端支持多张独立便签窗口，手机端以 PWA 运行；两端均可离线记录，并可通过 Supabase 配对同步。

## 已实现功能

- 便签本新建、改名、删除、滚动与拖动排序。
- 桌面便签双击打开独立窗口，位置、尺寸、背景透明度和置顶状态分别记忆；文字始终保持清晰。
- 普通便签和待办便签、可勾选清单、标题、自动保存、六种便签色及常用文字格式。
- 主窗口可拖动、最小化或隐藏到托盘；小便签可最小化，并通过悬停展开的最近记录侧签快速切换。
- 透明圆圈待办、筛选、编辑、删除与拖动排序。
- IndexedDB 离线存储、30 天最近删除、即时撤销和冲突副本。
- 手机 PWA、二维码/六位码配对、Supabase 队列同步与 RLS 空间隔离。
- Windows 无边框透明窗口、系统托盘和未签名 NSIS 安装包。

## 项目结构

- `apps/desktop`：Electron Windows 应用。
- `apps/web`：手机 PWA。
- `packages/core`：Dexie 数据库、领域逻辑和同步引擎。
- `packages/ui`：桌面、手机与独立便签共享界面。
- `supabase`：数据库迁移、RLS 测试和边缘函数。

## 本地开发

需要 Node.js 22+ 与 pnpm 10。

```powershell
pnpm install
pnpm test
pnpm typecheck
pnpm --filter @smoke-notes/web dev
pnpm --filter @smoke-notes/desktop dev
```

复制 `.env.example` 为 `.env` 并填写 Supabase 与手机网址。未填写云端变量时，应用仍能离线使用，但不会显示有效配对功能。

## 构建

```powershell
pnpm --filter @smoke-notes/web build
pnpm --filter @smoke-notes/desktop package
```

桌面安装包输出到 `apps/desktop/release`。没有代码签名证书时，Windows 可能显示 SmartScreen 提示。

云端发布步骤见 [DEPLOY.md](DEPLOY.md)。
