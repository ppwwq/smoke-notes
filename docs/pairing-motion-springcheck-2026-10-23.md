# 2026-10-23 配对、横向选择与 SpringCheck

## 使用新版预览

运行根目录的 `打开iPad网页预览.cmd`，或者 `outputs/web-preview-centered-selection/win-unpacked/SmokeNotes-Web-Preview.exe`。便携程序需要保留整个 `win-unpacked` 目录。

首次进入可以点击「暂时跳过，先在本机使用」。之后打开「设置 → 手机与同步 → 配对设备」。本地预览使用隔离示例记录，展示入口和错误反馈，不与真实账号配对。旧预览程序保留在 `outputs/web-preview-simulator`。

正式网页源码已实现跳过、记住本地模式和后续兑换配对码。跳过期间不启动云端同步；配对成功后，在一个 IndexedDB 事务内保留便签、待办、历史、回收站和换日设置，将未发送的本机修改合为新空间的创建快照，再启动同步。失败不会清空本机资料。已经配对的设备保留原启动方式。

## 主要修改文件

| 文件                                                                                                     | 改动                                                     |
| -------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| `apps/web/src/main.tsx`、`local-workspace.ts`                                                            | 本地模式、后续配对和本机记录迁移                         |
| `packages/ui/src/components/PairingDialog.tsx`、`SettingsPanel.tsx`、`packages/ui/src/SmokeNotesApp.tsx` | 跳过按钮及设置里的配对表单                               |
| `apps/web/src/review.tsx`                                                                                | 本地预览中的首次跳过流程                                 |
| `packages/ui/src/components/ScrubSelection.tsx`                                                          | 共享拖动逻辑；拖动时以中心上下放大并横向拉伸，松开才提交选择 |
| `WorkspaceDock.tsx`、`SegmentedControl.tsx`、`TodoWorkspace.tsx`（同目录）                               | 底部导航、今天/全部/历史、全部状态/未完成/已完成统一接入 |
| `packages/ui/src/components/spring-check/`                                                               | 官方 TS/CSS 组件、可编辑标签适配及完整许可               |
| `packages/ui/src/styles.css`、`workspace/interactions.css`、`workspace/todo-planner.css`                 | 控件布局、移动端、弹窗宽度与减少动态效果                 |
| `packages/ui/package.json`、`pnpm-lock.yaml`                                                             | 仅新增 SpringCheck 依赖，原有依赖锁定版本保留            |
| `THIRD_PARTY_NOTICES.md`、`apps/web/public/licenses/`                                                    | 来源、修改说明、随网页及便携程序分发的许可               |

## 动效参数

待办的组件调用在 `packages/ui/src/components/TodoWorkspace.tsx`：

| 参数                                 | 当前值                     | 调整效果                                                     |
| ------------------------------------ | -------------------------- | ------------------------------------------------------------ |
| `bounce`                             | `0.2`                      | 回弹幅度；保持在 0–1 范围内                                  |
| `strikeLag`                          | `0.12`                     | 弹簧进度达到此值后开始划线；应小于组件中的 `RULE_END = 0.84` |
| `doneOpacity`                        | `0.58`                     | 完成后的文字不透明度                                         |
| `boxSize` / `boxRadius`              | `24` / `8`                 | 勾选框尺寸和圆角                                             |
| `fontSize`                           | `14`                       | 默认字号；手机布局保留 16px 输入字号                         |
| `color` / `fillColor` / `checkColor` | 现有 `--ink` / `--surface` | 跟随项目文字和纸面颜色                                       |

官方组件的 `VISUAL_DURATION = 0.2` 控制弹簧的视觉时长。完成事项在原位置停留 320ms，让填充、勾线、文字划线可见，然后归入已完成。保留受控 `checked`、键盘切换、原地编辑、撤销和失败回退。`editableLabel` 是本项目的局部适配：把文本输入放到复选按钮旁边，避免交互元素互相嵌套；仍由同一个 motion value 驱动划线和填充。

共享选择动效参数在 `ScrubSelection.tsx`：纵向以中心向上下同时放大最多 1.16，横向拉伸最多 1.3。白色选中块的垂直中心保持不变。CSS 中拖动跟随 90ms、松开回位 360ms。系统减少动态效果时取消放大和弹簧，仍能选择、勾选和看见最终状态。

## 官方来源与依赖

- [SpringCheck 文档](https://reactbits.dev/micro/spring-check)
- [本次取得的官方 registry](https://raw.githubusercontent.com/DavidHDev/react-bits/e12c22192ac7b4b452c5e2feb9b586d74765d696/public/r/SpringCheck-TS-CSS.json)
- 固定来源提交：`e12c22192ac7b4b452c5e2feb9b586d74765d696`。
- 项目包管理器仍为 pnpm 10.19.0；新增 `motion` 12.23.12、`@hugeicons/core-free-icons` 4.3.3。使用普通 CSS，不引入 Tailwind 或 shadcn 配置。
- 完整 MIT + Commons Clause 许可随组件、网页构建和预览 ASAR 保存。

## 验证记录与边界

- TypeScript 项目引用检查通过；修改的 TS/TSX 文件 ESLint 通过，Impeccable 检测未报告问题。
- 25 个相关测试文件、245 项测试通过；之后补充配对失败/成功切换用例，配对入口和迁移的 5 项测试再次全部通过。
- 正式网页/PWA 构建和隔离 review 构建通过。Vite 提示主包超过 500kB，是包大小警告，不影响构建完成。
- 浏览器检查通过：1180×820、390×844、1440×900，含真实触摸事件的导航拖动、三项筛选拖动、键盘、减少动态效果、勾选动画的中间帧、编辑/撤销、刷新保留和设置配对入口。检查并修正了短文本截断与窄屏弹窗宽度。
- 最终打包 EXE 在独立测试资料目录中通过离线启动、四种设备视图、iPad 旋转、创建/完成/撤销、完整退出重开保留，以及设置配对入口检查。
- 结果：`outputs/springcheck-acceptance/result.json`、`outputs/springcheck-packaged-tests/offline-result.json`。无页面错误。
- ASAR SHA-256：`7e540954d0e1f1d613b22eb12a40d905c7606330d9205a69ed227b884595aa05`。
- 未部署正式网站、未用真实账号完成配对、未做真实 iPad Safari 验收。预览仍是 Chromium 模拟。

更新预览时已保留上一份静态构建于 `work/web-preview-dist-before-springcheck-20261023`，无需删除任何用户资料。

## 上下同时放大修正

- 移除垂直平移，将导航和横向筛选的缩放原点统一为中心。
- 导航交互 14 项测试、review 构建通过；构建仍有原有的包体积提示。
- 新打包 EXE 通过 iPad 横屏、手机竖屏和桌面减少动态效果下的 6 组导航/筛选拖动检查。实测 iPad 导航白色块上下各扩张约 3.8px，垂直中心不变，松手恢复原尺寸，无页面错误。使用 Electron 原生截图检查了画面。
- 结果：`outputs/centered-selection-acceptance/result.json`；程序：`outputs/web-preview-centered-selection`。
- 新 ASAR SHA-256：`a805d6e3486271b7ae0cbbe5552b73d13247c089c949959848a4671fc752a906`。
- 修正前静态构建保留于 `work/web-preview-dist-before-centered-20261023`；原有预览程序和用户资料保留。
