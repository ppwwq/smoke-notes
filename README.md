<div align="center">

<img src="apps/desktop/build/icon.png" width="104" alt="烟笺图标" />

# 烟笺 · Smoke Notes

**把灵感贴在桌面，把今天慢慢划掉。**

轻盈的烟雾玻璃便签，独立窗口随手放。离线安心写，电脑与手机接着记。

![Windows](https://img.shields.io/badge/Windows-桌面便签-527E86?style=flat-square)
![PWA](https://img.shields.io/badge/PWA-手机随行-8A7866?style=flat-square)
![Version](https://img.shields.io/badge/版本-0.1.5-687C65?style=flat-square)
[![MIT](https://img.shields.io/badge/License-MIT-A78B6A?style=flat-square)](LICENSE)

[开始使用](#快速开始) · [功能一览](#一张便签刚刚好) · [配置同步](DEPLOY.md) · [验证记录](docs/verification-2026-09-05.md)

</div>

## 一张便签，刚刚好

开会时留一张记录，学习时贴一张清单，灵感冒出来时随手写下。烟笺把这些小事放在看得见的地方。

| 你想做的事               | 烟笺的方式                                       |
| ------------------------ | ------------------------------------------------ |
| 随手记下一个想法         | 普通便签、富文本、文字颜色与高亮，输入后自动保存 |
| 把今天的事一项项完成     | 待办便签内的勾选清单，以及独立的待办页面         |
| 让提醒留在眼前           | 双击打开独立窗口，调整大小、透明度和置顶         |
| 给工作和生活各留一处空间 | 多个便签本、六种便签色、拖动排序                 |
| 在几张便签之间来回切换   | 侧边最近便签，悬停展开标题                       |
| 从电脑接着写到手机       | 二维码或六位码配对，可安装到手机主屏幕的 PWA     |
| 断网时继续记录           | 本地优先保存，恢复连接后自动重试同步             |
| 找回误删的内容           | 即时撤销与「最近删除」恢复                       |

### 留在桌面，也留得住状态

每张独立便签记住自己的位置、尺寸、透明度与置顶状态。透明度作用于背景，文字保持清晰；主窗口关闭后收进系统托盘。

安装后可在「设置与同步 → 窗口」开启登录 Windows 时启动。登录启动时恢复上次仍打开的便签，主列表保持隐藏。

### 同一份记录，随身继续

电脑端生成一次性配对码，手机加入同一个私人空间。首次配对需要联网；配对后，已有本地便签可以离线打开和编辑。

同步会合并尚未发送的连续修改，保留失败操作以便重试。同一便签出现版本冲突时，会留下本地冲突副本，方便找回两端内容。

## 快速开始

需要 **Node.js 22.12+** 和 **pnpm 10.19.0**。Windows 桌面端使用 Electron，手机端可以直接在浏览器中运行。

```powershell
git clone https://github.com/ppwwq/smoke-notes.git
cd smoke-notes
corepack enable
corepack pnpm@10.19.0 install --frozen-lockfile

# 启动 Windows 桌面端
corepack pnpm@10.19.0 --filter @smoke-notes/desktop dev

# 或启动网页版
corepack pnpm@10.19.0 --filter @smoke-notes/web dev
```

桌面开发命令会先生成 Electron 入口。修改主进程或预加载脚本后，重新运行该命令；界面代码支持热更新。

**不配置云端也可以使用本地便签。** 先建立便签本，再新建普通便签或待办便签。桌面端双击卡片打开独立窗口，手机端点按进入编辑。

## 配置手机同步

将根目录的 `.env.example` 复制为 `.env`，填写自己的配置：

```dotenv
VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=YOUR_PUBLISHABLE_KEY
VITE_WEB_APP_URL=https://YOUR_PROJECT.pages.dev
```

两个应用都读取根目录配置。云端还需启用匿名登录、执行数据库迁移、部署三个边缘函数，并设置服务端 `WEB_APP_URL`。完整步骤见 [部署指南](DEPLOY.md)。

## 构建与验证

```powershell
corepack pnpm@10.19.0 test
corepack pnpm@10.19.0 typecheck
corepack pnpm@10.19.0 lint
corepack pnpm@10.19.0 format:check
corepack pnpm@10.19.0 build

# 生成 Windows 安装包
corepack pnpm@10.19.0 --filter @smoke-notes/desktop package
```

测试命令会先生成主进程测试需要的构建文件。安装包默认输出到 `apps/desktop/release/`，网页版产物位于 `apps/web/dist/`。

2026-09-05 的本地完整回归为 **20 个测试文件、166 项测试通过**，覆盖数据读写、编辑保存、删除恢复、窗口状态、配对输入及同步队列。各项验证和实际设备验收边界见 [验证记录](docs/verification-2026-09-05.md)。

## 项目结构

```text
apps/
  desktop/       Electron 桌面端与 Windows 打包配置
  web/           手机 PWA 与离线缓存
packages/
  core/          本地数据库、数据操作、配对与同步
  ui/            两端共享的便签、编辑器和待办界面
supabase/
  migrations/    数据库结构与访问控制
  functions/     配对与同步接口
  tests/         数据库策略与迁移检查
```

**主要技术：** Electron · React · TypeScript · Vite · Tiptap · Dexie / IndexedDB · Supabase · Vitest。

## 数据与当前边界

- 内容首先保存在设备本地的 IndexedDB。配置云端的构建会自动连接相应 Supabase 项目，同步权限通过私人空间成员和 RLS 隔离。
- `.env`、本地数据、安装目录和构建产物均不纳入版本控制。Service Role Key 只能用于服务端。
- 项目处于早期阶段，尚无内置导入导出。清除浏览器或应用数据前，请自行备份重要记录。
- 便签本及独立待办的版本冲突采用服务端内容；便签正文冲突另存本地副本。
- Windows 安装包尚未配置代码签名。真实手机配对、PWA 更新和注销／重启后的开机启动，仍应在实际设备上验收。

## 一起把小工具打磨好

欢迎通过 [Issues](https://github.com/ppwwq/smoke-notes/issues) 反馈问题或建议。描述操作步骤、预期结果和实际表现，会让问题更容易复现；提交截图前请隐藏私人便签。

烟笺采用 [MIT License](LICENSE)，可以使用、修改、分发和商用，请保留版权与许可证声明。
