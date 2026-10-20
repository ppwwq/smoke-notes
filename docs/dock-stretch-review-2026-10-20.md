# 底部导航方向拉伸验证

基线：远端 main 与本地 HEAD 均为 `43820f0f0aec48c9adf8ad60d62e9f0f8c7b66db`。
分支：`feat/dock-directional-stretch`。仅调整既有 WorkspaceDock 背景胶囊与相关验证。

## 交互

- 拉伸从原先最多 6% 改为沿当前拖动方向最多 28%，按移动距离积累，反向移动重新积累；不依赖事件频率或速度预测目标。
- 胶囊尾部对齐基础按钮位置，额外宽度向拖动方向延伸，靠近导航边界逐渐减少；只变形背景，按钮、图标和文字不缩放或移动。
- 拖动跟随采用 90ms 缓动，松手用 360ms 无越界回弹的柔和回缩吸附。页面和 aria-current 只在松手提交后改变。
- 保留原有 6px 启动阈值、纵向手势放弃、次要触点忽略、pointercancel、capture 丢失、Escape、失焦、resize、纵向范围外松手取消、点击抑制及键盘焦点。
- 原有差值混合文字对比延续到松手动画，避免膨胀背景经过其他按钮时文字短暂变白不可读。reduced-motion 同时禁用过渡、拉伸和额外位移。

## 验证结果

- `pnpm test`：42 个文件、379 项通过（WorkspaceDock 12 项）。
- `pnpm typecheck`、`pnpm lint`、修改过的 TSX/CSS Prettier 检查、`git diff --check` 通过。
- Web 正式 build、隔离 review build、desktop renderer build 通过；测试前置 Electron JS 编译通过。Web 仍有原有大 chunk 提示。
- `tools/review-dock-stretch.py`：Chromium 154 真实 CDP 触控，在 320×740、390×844、430×932、1440×1000 以及 390×844 reduced-motion 下通过慢拖、停留、快拖、反向、边界、取消、Escape、松手切页、四个目标、Tab/Space、焦点验证。
- 五组共采样 2,018 个动画帧（包括松手阶段），无导航边界溢出。普通模式实测最大宽度 1.28 倍，reduced-motion 1.00 倍。拖住期间 workspace DOM 不变，按钮、图标和文字几何不变。
- 更新既有 `review-motion-ui.py` 的方向拉伸对齐断言，其手机和无 View Transition API 两组导航回归通过。
- 人工检查手机左右拉伸和回位截图，以及录屏抽帧；文字可读、胶囊对齐。录屏为真实本地浏览器连续画面，含仅用于说明的字幕与触点标记，示例数据，15.68 秒，390×844，H.264 MP4。

## 复跑及限制

运行 `pnpm --filter @smoke-notes/web build:review`，然后在 4174 运行 `pnpm --filter @smoke-notes/web preview:review --port 4174`。
安装 Python Playwright、Chromium 和 Playwright ffmpeg 后运行 `python tools/review-dock-stretch.py`；可通过 `SMOKE_REVIEW_URL`、`SMOKE_REVIEW_OUTPUT` 和 `PLAYWRIGHT_BROWSERS_PATH` 指定地址、证据目录与浏览器工具缓存。

证据输出位于 `/workspace/shared/dock-stretch`，交付录屏为 `dock-stretch-mobile.mp4`（Library 亦有副本）。未测试实体手机、Safari/WebKit 或 Windows 原生窗口。本次没有合并 main、部署、更新安装包，也没有修改每日待办、文字间距或新增表单遮挡逻辑。
