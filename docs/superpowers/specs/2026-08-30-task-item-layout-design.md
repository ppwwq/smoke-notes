# 待办列点布局修复设计

## 问题

Tiptap 3.30.5 的实时 `TaskItem` NodeView 输出 `li[data-checked]`，但不会输出项目现有 CSS 所依赖的 `li[data-type="taskItem"]`。因此清单项的横向布局和圆形复选框样式均未命中。

## 设计

在 `TaskItem.configure` 的 `HTMLAttributes` 中加入稳定类名 `task-list-item`。所有仅针对待办清单项的 CSS 改为匹配该类名，不修改存储的富文本 JSON，也不改变普通便签、待办便签或全局待办的数据模型。

## 验收

- 实际渲染的待办清单项包含 `task-list-item` 类名。
- 清单项使用横向 flex 布局，圆点与文字在同一行。
- 未完成复选框为圆形；完成项仍显示淡化和删除线。
- 相关组件测试、样式测试、完整测试及桌面构建通过。
