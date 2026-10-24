# Family Button 与每日待办 UX

2026-10-23。本次在原有未提交改动之上接入；不改变便签、每日待办、重复规则或同步的数据模型。

后续交互已经调整：完成事项同页显示、整卡长按排序、右下新增入口、RubberSegment 导航及中文日历。当前说明见 [后续 UX 调整](./ux-refinements-2026-10-23.md)；下文保留初次接入记录。

## 使用

- 便签页点击「＋ 新建」，可选目标便签本，再创建文字便签或清单便签，进入原编辑器。没有便签本时可直接建立第一个。
- 待办页点击「＋ 新建」，直接输入内容，选今天、明天或指定日期。重复与备注按需展开。Enter 添加时保留中文输入法组合保护。
- 面板可切换便签/待办；收起、Escape、切换类型后保留本次待办草稿。成功后清空已提交内容；失败显示错误并保留输入；正在保存时新输入的内容不会被旧请求清空。
- 「查看待办」打开全部安排并清除状态筛选，可找到刚添加到未来日期的事项。
- 每日页面优先显示今天未完成事项。完成、之前未完成、跳过、重复计划可展开；筛选和整理位于「筛选」入口。
- 每条任务右侧「…」统一提供适用的日期、跳过、删除操作。现有完成/撤销、重复规则生效边界、历史、离线与同步流程保留。
- 手机新建入口在底部导航上方。展开面板限制在可见视口内，支持滚动；软键盘出现时保持提交操作可达，关闭按钮吸附在面板顶部。

## 文件

| 文件 | 职责 |
| --- | --- |
| `packages/ui/src/components/family-button/FamilyButton.tsx` | 官方 Family Button 的本地适配：展开外壳、Motion、Base UI 焦点与关闭管理 |
| `packages/ui/src/components/family-button/family-button.css` | 面板视觉、定位、视口与键盘适配 |
| `packages/ui/src/components/WorkspaceCreate.tsx` | 统一新增入口、便签本选择、文字/清单便签、首个便签本 |
| `packages/ui/src/components/TodoComposer.tsx` | 独立的待办创建草稿和日期、重复、备注表单 |
| `packages/ui/src/components/TodoRepeatFields.tsx` | 创建与规则编辑共用的星期/重复字段 |
| `packages/ui/src/components/TodoWorkspace.tsx` | 紧凑日清单、进度、状态分组、更多操作与重复计划 |
| `packages/ui/src/components/NotesWorkspace.tsx` | 替换原新增菜单和空状态入口 |
| `packages/ui/src/components/RecordActions.tsx` | 原操作弹窗支持放入安排控件 |
| `packages/ui/src/SmokeNotesApp.tsx` | 连接原 repository、当前便签本、视图与视口 |
| `packages/ui/src/workspace/daily-focus.css`、`packages/ui/src/workspace.css` | 每日待办样式及导入 |
| `packages/ui/src/components/ScrubSelection.tsx` | 共用拖尾上限从 30% 改为 26% |
| `packages/ui/tests/WorkspaceCreate.test.tsx` | 草稿保留、焦点、创建目标、失败重试、首个便签本 |
| `packages/ui/tests/{TodoWorkspace,SmokeNotesApp,WorkspaceDock,PlannerIntegration}.test.tsx` | 将原回归测试迁移到新入口，保留业务断言，校验 26% 拖尾 |
| `tools/review-family-button.py` | 仅使用隔离 review 示例库的浏览器验收 |

## 参数

官方 registry 当前 API 只有必填 `children: ReactNode`，同时导出默认和具名 `FamilyButton`。以下是本地扩展，不能当作上游原生 API：

```tsx
<FamilyButton open={open} onOpenChange={setOpen} label="新建待办">
  {/* 自定义内容 */}
</FamilyButton>
```

- `open` / `onOpenChange`：可选受控开关；省略时由组件内部管理。
- `label`：触发按钮的无障碍名称，默认「新建」。视觉文案仍为「＋ 新建」。
- `family-button.css` 的 `--family-width: 352px`：桌面展开宽度；手机由视口宽度限制。
- `FamilyButton.tsx` 的 `damping: 25`、`stiffness: 400`：保留上游弹簧参数。系统减少动态效果设置会关闭布局弹簧和旋转。
- `ScrubSelection.tsx` 的 `Math.min(0.26, …)`：拖尾额外长度上限。底部导航、待办视图/筛选、新建类型共用；文字和图标不随背景缩放。上/下放大、拖尾方向与松手提交逻辑保留。

## 来源和依赖

- [Cult UI 文档](https://www.cult-ui.com/docs/components/family-button)、[官方 registry](https://www.cult-ui.com/r/family-button.json)。文档示例中出现的 Header/Content 不在当前 registry 文件导出中，本项目按实际实现接入。
- 原始快照：`work/family-button-source/family-button.json`；SHA-256 `31c7586ddae16c52d58925545f2a7bab491b3a42e23dcf0e2da0fbd4ca52533e`。
- MIT，Copyright (c) 2023 Jordan-Gilliam。完整许可在组件目录 `LICENSE.md`，并复制到两个应用的 `public/licenses/cult-ui-family-button-MIT.txt`，随构建输出。声明见 `THIRD_PARTY_NOTICES.md`。
- 使用已有 `motion`、`lucide-react`、`@base-ui/react`。沿用 pnpm 工作区和普通 CSS；本次没有添加依赖、更新锁文件、引入 Tailwind 或 shadcn 配置。
- [Planify](https://github.com/alainm23/planify) 与 [Super Productivity](https://github.com/super-productivity/super-productivity) 用于 UX 参考，没有复制其代码或素材。

## 验证与边界

最终结果：22 个 UI 测试文件、200 项测试全部通过；TypeScript、ESLint、格式检查通过；网页/PWA、review 预览和桌面渲染构建通过。下列 6 组浏览器场景全部通过，页面错误为 0；导航与分段按钮实测拖尾比例均为 1.26。

验收结果与截图保存在 `outputs/family-button-acceptance/`。浏览器脚本覆盖 1440×900、1180×820、820×1180、390×844、320×740，以及 390×844 减少动态效果。

覆盖内容：跨模式与关闭后的草稿保留、初始聚焦和 Escape 焦点恢复、明天/今天待办、查看全部、完成与撤销、刷新后 IndexedDB 持久化、清单便签指定便签本、导航与分段按钮触摸拖尾 1.26、窄屏溢出、面板与导航分离、模拟软键盘视口下关闭/提交可达、页面错误。

测试、类型与构建日志：`work/family-ui-tests-final.txt`、`work/family-web-build.txt`、`work/family-review-build.txt`、`work/family-desktop-build.txt`。网页构建仍有超过 500 kB 的原有体积提示。

本次验证的是源码、浏览器和桌面渲染构建；没有部署正式网站、发布安装包、替换已安装桌面程序、连接真实同步账号或进行真实 iPad Safari 验收。软键盘与触摸使用 Chromium 模拟，不能等同于真机验收。

本地开发预览：`http://127.0.0.1:4176/review.html`，使用 `smoke-notes-ui-review-v1` 示例数据库，不创建云端客户端。重新启动可在 `apps/web` 执行：

```powershell
node ../../node_modules/vite/bin/vite.js --config vite.review.config.ts --host 127.0.0.1 --port 4176 --strictPort
```
