# 便签、每日待办与交互调整

2026-10-23。在现有未提交工作上继续调整，保留原数据、离线保存、同步和编辑流程。

## 使用变化

- 每日待办的已完成、未完成和跳过事项直接显示在同一列表，保持原排列；完成后勾选和划线，不再收进「已完成」折叠区。历史日期和状态筛选继续可用。
- 展开的便签列表移除「整理便签」按钮和左上拖动手柄。长按卡片约 300 ms 后，可以从正文、标题或留白拖动排序；短按仍打开。更多操作按钮保留其原操作。键盘可聚焦卡片，空格拾起、方向键移动、空格放下、Escape 取消。
- 每日进度、日期提示和分段控件复用主页的纸面、浅灰与墨色变量。
- Family Button 新增入口在右下。手机上位于底部导航上方，面板内可滚动；顶部「新建便签本」不再被覆盖。
- 底部主导航、今天/全部/历史、状态筛选、新建便签/待办切换统一使用 React Bits RubberSegment。
- 「文字格式」支持鼠标悬浮展开、点击固定展开、键盘方向键进入工具条和 Escape 关闭。流体形变只作用于装饰背景，编辑命令和选中文字保持原流程。手机支持点击，紧凑键盘布局保留顶部格式入口。
- 新建待办的「选日期」展开中文月历；历史日期及任务改期使用同一日历弹层。保留今天/明天快捷选择，历史不能选择未来日期。

## 官方来源与许可

### RubberSegment

[官方文档](https://reactbits.dev/micro/rubber-segment) / [TypeScript + CSS registry](https://reactbits.dev/r/RubberSegment-TS-CSS.json)。源码与附带 CSS 保存于 `packages/ui/src/components/rubber-segment/`，完整 MIT + Commons Clause 许可保留，并复制到两个应用的 `public/licenses/`。

核实的导出为默认 `RubberSegment`，以及 `RubberSegmentProps`、`RubberSegmentItem`、`RubberSegmentSize` 类型。`items` 支持字符串或 `{ value, label, icon? }`；使用现有 Motion 12.23.12。保留上游独立边缘动画、裁切文本副本、弹性挤压和拖动惯性；补上原生点击/键盘、滚动取消、失焦/窗口变化取消和父容器动画时的测量适配。`navigation` 和条目的 `ariaLabel` 是本地扩展。

### 日期

采用 [React DayPicker](https://daypicker.dev/start) 官方当前包名 `@daypicker/react`，固定 10.0.2，使用官方中文 locale、CSS、键盘导航和单选 API。MIT 许可随网页与桌面构建保留。

只新增其依赖链四项：`@daypicker/react`、`react-day-picker`、`@date-fns/tz`、`date-fns`。相对于本轮开始的锁文件，只新增 48 行，现有锁定版本未升级。

### 文字格式菜单

[Skiper46 官方页](https://skiper-ui.com/v1/skiper46) 标明 Pro 授权要求，实际导出是无参数的 `Skiper46`。用户确认「先做独立的同类悬浮交互」后，使用本项目原创 `GooeyFormatMenu`；没有下载或复制 Pro 源码、标识或素材。使用现有 Motion，无需另装 framer-motion。

## 修改位置及调节参数

| 文件 | 改动或参数 |
| --- | --- |
| `packages/ui/src/components/TodoWorkspace.tsx` | 状态同页显示；历史和改期接入日历 |
| `packages/ui/src/components/NotesWorkspace.tsx` | 去掉整理入口，启用整卡排序 |
| `packages/ui/src/components/SortableStack.tsx` | `wholeCard`，鼠标/触摸长按阈值 300 ms，移动容差 6/8 px，网格排序与键盘操作 |
| `packages/ui/src/components/rubber-segment/RubberSegment.tsx`、`.css` | 上游实现与本地适配；`stretch`、`squash`、`speed`、`glide` 控制弹性、挤压、速度与惯性 |
| `packages/ui/src/components/WorkspaceDock.tsx`、`SegmentedControl.tsx` | 公共导航接入；当前 `stretch={26}`，点击移动时额外宽度也限制为一个选项宽度的 26% |
| `packages/ui/src/components/GooeyFormatMenu.tsx`、`gooey-format-menu.css` | 原创文字格式入口；离开延时 180 ms，弹簧 stiffness 380 / damping 25，背景 SVG blur 6 |
| `packages/ui/src/components/RichNoteEditor.tsx` | 保留原 Tiptap 命令，连接悬浮菜单开关 |
| `packages/ui/src/components/PlannerCalendar.tsx`、`PlannerDatePicker.tsx`、`planner-calendar.css` | 中文、周一开头、单选、最大日期限制、弹层与日历颜色/圆角/格子尺寸 |
| `packages/ui/src/components/TodoComposer.tsx` | 今天/明天快捷项和内嵌月历 |
| `packages/ui/src/components/family-button/family-button.css` | 桌面右/下边距 28 px；手机沿用导航上方和软键盘可见区域定位 |
| `packages/ui/src/workspace/ux-refinements.css`、`workspace.css` | 统一色彩、导航尺寸和拖动状态 |
| `packages/ui/package.json`、`pnpm-lock.yaml` | 日期依赖，保留既有锁定版本 |
| `packages/ui/tests/{WorkspaceDock,TodoWorkspace,PlannerCalendar}.test.tsx`、`vitest.setup.ts` | 新交互与日期回归、JSDOM 布局 observer 支持 |
| `tools/review-ux-refinement.py` | 隔离 review 示例库的浏览器验收 |
| `THIRD_PARTY_NOTICES.md`、两个应用的 `public/licenses/` | 来源与许可 |

`stretch=26` 是上游拉伸强度百分比，并非所有动画都固定缩放 1.26；本地另限制点击动画的额外宽度为 26%。拖动到边界时仍采用上游挤压行为。所有装饰动效尊重减少动态效果设置。

## 验证

- 23 个 UI 测试文件、199 项测试通过；测量适配后，对导航、新增面板、每日待办的 33 项相关回归再次通过。
- TypeScript、修改文件的 ESLint 和格式检查通过。
- 网页/PWA 与桌面渲染构建通过。网页仍有超过 500 kB 的体积提示；主包约 1,005 kB（gzip 309 kB）。
- Chromium 1180×820、820×1180、390×844、320×740、390×844 减少动态效果，共 5 组通过，无页面错误。覆盖鼠标/触摸长按排序与真实 rank 保存、短按打开、选中文字的格式命令、同页完成/撤销、RubberSegment 触摸释放选择及滑块几何、月历键盘选择、创建/历史/改期弹层，以及两个新增按钮分离。
- 额外检查键盘排序、Escape 取消和不误打开便签。

截图和浏览器结果：`outputs/ux-refinement-acceptance/`。日志：`work/ux-refinement-ui-tests.txt`、`work/ux-refinement-rubber-regression.txt`、`work/ux-refinement-browser.txt`、`work/ux-refinement-web-build.txt`、`work/ux-refinement-desktop-build.txt`。

本地预览：http://127.0.0.1:4176/review.html 。使用独立 review 示例数据。没有部署、发布安装包或替换已安装程序；触屏和减少动态效果使用浏览器模拟，未做真实 iPad Safari 验收。
