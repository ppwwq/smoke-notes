# rc.5 后续动效、导航与默认配色验证

基线：`f2d5384d2fde534f501c5f055e927da0209ee8c1`（已 fetch，并用 `git merge-base --is-ancestor` 验证）。功能分支：`codex/smooth-notebook-nav-colors`。Node.js 24.19.0、pnpm 10.19.0、既有 lockfile frozen install；没有修改依赖、版本号或安装包。

## 本版交互约定

- **放开手指才切换页面**。停住但仍按住时，只有导航选中胶囊移动，页面 DOM、选中页面语义保持不变。此处是父对话提出、此次采用的解释，等待用户看效果。
- 胶囊有 6px 横向启动阈值，65ms 轻微跟随阻尼，最多 6% 拉伸，280ms 无回弹吸附。最终位置决定选项，不按速度预测。取消、Escape、失焦、窗口尺寸改变及纵向手势不提交；保留点击、Tab/Enter/Space、焦点及 reduced-motion。
- 便签展开／收起先采用 **500ms** 试验值；快速连续意图完成当前过渡后取最后一次意图，避免强行截断到终点的闪帧。

## 原因与修复

原版 `NotesWorkspace` 在 `NoteStacks` 和 `SortableStack` 之间替换 DOM。React key 本身并非错误；跨树动画依赖 `view-transition-name`。原版只有封面前三张有收起目标，剩余便签原地淡出。浏览器将视图过渡图层展平成兄弟节点，原来的 `z-index: 3-index` 不会自动维持；95% 帧中第三张 amber 卡片盖住第一张 violet 卡片，动画结束再切回 violet，形成明显重新排列闪动。此外根画面 140ms 与卡片 240ms 的交叉淡化叠出两套标题／内容。

修复不是单纯延时：

1. 活跃便签本每张便签都有稳定身份及堆叠目标；前三张之后以透明尾部目标收回，其他便签本仅渲染三张封面。
2. 显式指定动画图层深度，和最终纸张层级一致；头部与导航独立命名。
3. 根画面不再交叉淡化两个布局，封面共享卡片只呈现一个不透明面；尾部卡片同时移位并淡入堆叠。全部几何动画共用 500ms 时钟。
4. 不再用 `skipTransition()` 截断正在播放的布局；收尾清理、最后意图排队，以及 `ready` 拒绝／缺少 API／reduced-motion 均有回归测试。不支持所需动画类的浏览器直接完成布局更新。

采用 API 身份而非 DOM 相同节点，是 [Chrome 官方说明](https://developer.chrome.com/docs/web-platform/view-transitions/same-document) 支持的跨元素过渡方式。实际浏览器动画轨迹及 50%／95% 定格帧用于验证层级和重影修复。

导航实现位于共用 `WorkspaceDock`。真实触控测试发现按钮隐式 pointer capture 转给导航时，会从按钮冒泡 `lostpointercapture`；现只处理导航本身失去捕获，避免误取消。拖动时采用差值混合保持深浅背景上的图标文字可读，`aria-current` 直到松手才变化。

默认颜色位于 `LocalRepository.createNote` 的既有 IndexedDB 写交易：只统计当前便签本未删除记录，依 `amber → rose → sage → sky → violet → graphite` 顺序选最低计数，零次自然优先。并发新增也在交易内依序分配；显式颜色、手动改色、旧记录、同步载入／迁移逻辑不受影响。

## 验证

- 全套：42 个测试文件、375 项通过；最终手势补测后的定向回归 51 项通过（包括原有保存失败、列表状态等 SmokeNotesApp 测试）。最终合计新增测试使总数为 376，未再次重复全套。
- `pnpm typecheck`、`pnpm lint`、`pnpm build`、`git diff --check` 通过。Web 和桌面 renderer/Electron JS 编译通过，未打包 Windows installer。构建保留原有 chunk size 与 Vite 配置提示。
- `tools/review-motion-ui.py`：Chromium 154，Web 1440×1000／390×844，真实 CDP 触控；每尺寸 5 次展开收起，确认唯一身份、500ms、首张层级 4、根旧图层透明、封面旧面透明。手机概览 240px／展开 380px 捲动位置在编辑返回和收起后恢复。
- 慢拖、按住停留、快拖、反向、取消、随后正常点击、四个底部功能、键盘及焦点通过。按住时断言 workspace DOM 完全不变，胶囊中心与手指目标相差小于 3px。
- reduced-motion 与移除 `startViewTransition` 的降级路径同样通过。
- 浏览器连续新建：工作便签本原有 sky/sage，依次自动 amber/rose/violet/graphite/amber；手动 violet 改色保存并重载保留。
- 实际桌面 `apps/desktop/src/main.tsx` preview 入口及独立便签 `?noteId=…` 验证通过，左侧最近便签切换正确调用 bridge。原有 `NoteWindowApp` 保存失败／切换保护测试也在全套中通过。

## 交付与限制

原版／改后手机、桌面 Web 和桌面 renderer 截图、50%／95% 动画帧、短录屏、动画 JSON、测试日志放在交付证据包。`review-motion-ui.py` 可复跑；分别在 4174 运行隔离 Web review build、4176 运行桌面 `vite --mode preview`，使用本地示例 IndexedDB 和 mock IPC，不需要聊天中的密钥。

本机为 Linux 云端，桌面验证覆盖真实 renderer 与模拟原生 IPC；未运行 Windows 原生窗口、实际触摸硬件或其他浏览器内核。未验证线上 Supabase，保存／同步既有逻辑未改动且其测试通过。没有额外 DPI 工作，没有合并 main、生产部署或生成／安装 Windows 安装包。
