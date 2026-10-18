# Windows 常驻透明便签：现有能力与本机预览方案

本轮仅规划，不实施玻璃效果。目标是已有 Electron 应用里的独立、小型、可置顶透明便签窗；不是浏览器管理面板，也不新建另一套应用。

## 已有代码可直接复用

| 入口                                                             | 已有能力                                                                                                                                                       |
| ---------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/desktop/electron/window-config.ts:createNoteWindowOptions` | 无边框、`transparent: true`、透明窗口底色、窗口整体 `opacity: 1`、置顶、可调整尺寸。默认便签内容 360×420，原生窗口另加 70px 侧边标签透明区；最小内容 250×180。 |
| `apps/desktop/electron/main.ts` / `note-window-manager.ts`       | 创建/恢复多个便签窗；窗口位置、尺寸、置顶和打开状态持久化；主窗口关闭时隐藏到托盘，便签继续存在；退出前等待保存。                                              |
| `apps/desktop/src/main.tsx`                                      | `?noteId=` 路由加载 `NoteWindowApp`；小窗复用 `smoke-notes-desktop` 数据库，由主渲染进程负责云认证和同步，小窗通过 BroadcastChannel 接收数据变化。             |
| `packages/ui/src/NoteWindowApp.tsx`                              | 顶栏新建、最小化、置顶、45–100% 背景透明度、删除、关闭；最近便签切换；原有富文本、自动保存和草稿保护。                                                         |
| `packages/ui/src/note-mouse-passthrough.ts`                      | 侧边标签外的透明空隙可穿透；正文和控件保持可点击。并非整张便签点击穿透。                                                                                       |
| `packages/ui/src/styles.css` / `apps/desktop/src/shell.css`      | 小窗容器、顶栏、透明底、标签和编辑正文。后续材料改动应限定于这些小窗选择器。                                                                                   |

`GlassSurface.tsx` / `LiquiSurface.tsx` 当前只由网页 glass 模式启用；独立 `NoteWindowApp` 没有启用这套光学层。不能因为网页已有玻璃模式就宣称原生小窗已实现相同效果。

## 先在用户 Windows 上看真实的小窗

1. 使用已有仓库和 Node/pnpm，运行 `pnpm install --frozen-lockfile` 后 `pnpm --filter @smoke-notes/desktop dev`。脚本会先编译 Electron 主进程，再启动 127.0.0.1:5173 的渲染器和 Electron；不需要安装 NSIS 包。5173 必须空闲。
2. 在桌面应用新建一张示例便签，或双击便签卡片打开独立窗。点「窗口置顶」，将透明度先调到 70–80%，把窗口放在用户实际桌面上，关闭主列表窗口（会隐藏到托盘）。这样可以先看核心使用方式，不需要先选择抽象材质。
3. 在浅色壁纸、深色壁纸和有文字的网页背景上，检查文字清晰度、置顶、拖动、缩放、侧边透明区穿透、输入法和保存/重启恢复。缩放与透明窗口的组合必须在实际 Windows/显卡上验收。
4. 如要安装体验，现有 `pnpm --filter @smoke-notes/desktop package` 会生成 Windows NSIS 安装包；本轮没有生成或安装新包。开发预览不等于已安装版更新。

现有启动流程会读取用户数据目录并处理开机启动设置；预览执行者应先确认当前 `app.getPath('userData')`、备份相关目录并避免测试实例与已安装实例争用数据或单实例锁。不要删除 IndexedDB、`window-state.json` 或 `note-window-states.json`。云端环境未运行真实 Windows 透明窗；以上为代码核查与可执行预览路径，不能代替本机效果验证。

## 推荐的小窗玻璃方向

先做一个小窗原型供用户看：内容纸面保持稳定、文字和图标保持不透明；玻璃集中在顶部 38–44px 控制条、外边框和最近便签标签。普通状态轻透，编辑聚焦时提高正文底色遮盖度；置顶状态用明确图标/状态表达。保持当前新建、透明度和关闭入口，不改变保存、同步或窗口管理。

第一阶段只用有限的半透明底、细高光边缘和柔和阴影，验证真实桌面阅读效果。若用户需要桌面背景本身被磨砂，再单独试验系统材料：Electron 的 Windows `setBackgroundMaterial` 提供 mica/acrylic 等，官方限定 Windows 11 22H2 及以上；macOS 使用独立的 vibrancy API。这里不会直接获得原生 iOS Liquid Glass，需要按现有 Electron/Windows 能力做视觉实现。[Electron BrowserWindow](https://www.electronjs.org/docs/latest/api/browser-window#winsetbackgroundmaterialmaterial-windows)

透明不等于模糊：网页内 CSS 模糊只能处理渲染器中的内容，不能把其他应用或桌面直接当成网页模糊采样源。系统背景材料与现有透明窗/可缩放/穿透行为的兼容性必须做本机小范围试验。[Electron 透明窗口限制](https://www.electronjs.org/docs/latest/tutorial/custom-window-styles#limitations)

## 性能、易读性与降级验收

- 每个小窗最多一个背景材料层；不对正文、每一行或每个按钮叠加 blur。先从 12–16px 的局部模糊试验；数值是设计起点，不是已测得的性能保证。
- 保持窗口整体 opacity 为 1，只调背景材料透明度，避免正文也变淡；内容区域建议从 0.85–0.94 遮盖度起调。分别检查文字、光标、选区和焦点轮廓的对比度。
- 不使用持续光标追踪折射、桌面截图循环或每帧 React 更新；小窗隐藏/最小化时停止视觉动画。同时打开 1/5/10 张便签，测输入、滚动和拖动帧时间与内存；以 60Hz 下约 16.7ms 的帧预算为验收目标，不宣称目前已经达到。
- 「减少透明效果」、高对比度、远程桌面、材料不支持或 GPU 合成异常时，退到清晰的实底/半实底。减少动态效果时取消浮动、弹性和高光动画。
- 不改变原有本地数据、同步、自动保存、关闭前保存、窗口位置恢复和侧边穿透范围。先交付本机前后对比，再决定是否扩到主列表界面。
