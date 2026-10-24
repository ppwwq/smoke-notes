# Diamond Grid 加载动画接入

## 来源与适配

- 官方源码：https://github.com/Subhan-code/Amicro--Micro-transitions-/blob/dc2a183f3a5e6e0ea1b0d75530ac084e3a4e0bd2/registry/ui/loading/diamond-grid.tsx
- 已核对用户指定提交及官方默认分支，均为无参数的命名导出 `DiamondGrid`。四个 12px 方块、8px 间距，整个网格旋转 45 度；缩放 `[1, 0.5, 1]`，透明度 `[1, 0.3, 1]`，周期 1.5 秒，每格延迟 0.2 秒。
- 直接使用官方源码适配，未运行可能变更依赖的 CLI。沿用项目 pnpm 10.19.0、React、TypeScript、普通 CSS 和 Motion 12.23.12，没有新增/升级依赖，也没有修改锁文件。
- 根据 https://motion.dev/docs/react-upgrade-guide 的官方迁移说明，将 `framer-motion` 导入替换为已有的 `motion/react`。Tailwind 类转为等价局部 CSS，不新增 Tailwind。
- 官方源码没有字体或图片依赖。MIT 版权与完整许可保存在组件目录，并随网页和桌面渲染器产物分发。

## 接入位置与文件

| 文件 | 改动 |
| --- | --- |
| `packages/ui/src/components/diamond-grid/DiamondGrid.tsx` | 官方动画、减少动态效果分支、装饰语义 |
| `packages/ui/src/components/diamond-grid/diamond-grid.css` | 普通 CSS，标准与紧凑尺寸、配色继承 |
| `packages/ui/src/components/LoadingStatus.tsx` | 外层加载状态及可访问文本；本地封装参数 `label: string` |
| `packages/ui/src/SmokeNotesApp.tsx` | 编辑器懒加载占位、桌面同步等待图标 |
| `packages/ui/src/components/RichNoteEditor.tsx` | 编辑器初始化等待 |
| `packages/ui/src/components/PairingDialog.tsx` | 生成配对码和配对提交等待 |
| `packages/ui/src/components/SyncIndicator.tsx` | 网页同步加载图标；保留后续同步 300ms 延迟及离线/重试/错误静态提示 |
| `packages/ui/package.json` | 增加 `./loading` 导出供预览使用；无依赖变更 |
| `apps/web/src/review.tsx`、`review.css` | 独立预览参数 `?loading=diamond-grid`；此模式不初始化或修改示例数据库 |
| `packages/ui/tests/SyncIndicator.test.tsx`、`PairingGate.test.tsx` | 同步显隐、配对等待和完成后撤除动画的回归断言 |
| `THIRD_PARTY_NOTICES.md`、组件 `LICENSE`、两端 `public/licenses/amicro-diamond-grid-MIT.txt` | 来源及许可 |

待办完成进度仍然表示实际完成比例；没有替换为无限循环加载动画。正常页面不延长等待时间来展示动画。

## 使用与调节

```tsx
import { DiamondGrid } from './components/diamond-grid/DiamondGrid';
import { LoadingStatus } from './components/LoadingStatus';

// 纯动画，无参数；外层负责状态文本。
<DiamondGrid />

// 项目封装：包含 role="status" 和可见文本。
<LoadingStatus label="正在打开便签…" />
```

- 颜色：外层 `color`，或 CSS 变量 `--diamond-color`；默认继承当前页面文字色。
- 方块大小：`--diamond-cell-size`，默认 `12px`；间距 `--diamond-gap`，默认 `8px`；圆角 `--diamond-radius`，默认 `2px`。
- 紧凑同步图标使用 `5px` 方块和 `3px` 间距，旋转后仍适配既有 20px 容器。
- 周期/错峰：在 `DiamondGrid.tsx` 的 `transition.duration` 与 `delay` 调整；这些是实现常量，不是官方公开参数。
- 减少动态效果：保留静态四菱形与状态文本，关闭缩放及透明度循环。动画不获取焦点、不拦截点击。

## 验证

- TypeScript、改动文件 ESLint 通过。
- 4 个相关测试文件、61 项测试通过。
- Web/PWA 与桌面渲染器构建通过；两端产物的 MIT 许可与源文件 SHA-256 一致。
- 浏览器验证 1180px、390px、320px：动画变化、减少动态效果静止、无横向溢出、键盘可到达返回链接。
- 拦截真实编辑器模块加载，验证等待期间出现 Diamond Grid、释放模块后编辑器出现并撤除加载状态。
- 无待解决依赖/资料缺口。现有 Web 大包提示、桌面 Vite 将来配置加载方式兼容提示仍存在；没有发布或重新安装桌面应用。

效果预览：http://127.0.0.1:4176/review.html?loading=diamond-grid
