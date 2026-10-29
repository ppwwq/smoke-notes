# 重复待办修改范围（本地 P1）

日历中编辑重复待办时，默认“仅此次”，可切换为“此后全部”。后者包含所选当天，从该日期追加规则修订，支持修改内容、备注和重复频率。此前记录保持原样，其他日期已单独修改、完成或跳过的实例继续保留。已有更晚生效的规则也由本次修改覆盖；保留原修订历史，不删除旧规则。

沿用待办的 series / occurrence / revisions，不合并便签清单和计划待办，不新增数据库结构或线上配置。原重复计划面板的“明天起修改”语义保持不变。

本轮范围限制：时间、类型标签仍只支持单次修改；选择“此后全部”时禁用这两项并说明原因。重复频率可在“日期与时间”展开后修改；本轮不增加“从当天起停止重复”入口。所选当天视为明确修改，即使新频率不包含当天仍保留该次待办。

## 验证

- 核心 4 个测试文件共 46 项通过：planner-types、todo-calendar、todo-planning、planner-move。
- 常规 Vitest 的 jsdom 在本机 Node 20.19.2 下启动失败：`webidl.util.markAsUncloneable is not a function`。核心测试通过 /tmp 临时配置使用 node 环境与 fake-indexeddb 运行；项目配置及依赖未更改。
- 已补 CalendarTodoEditor 界面测试，验证默认单次及切换此后全部后的保存参数；受上述环境限制尚未执行成功。在兼容当前 jsdom 的 Node 环境中运行：

```sh
pnpm exec vitest run packages/ui/tests/CalendarTodoEditor.test.tsx packages/ui/tests/CalendarComposer.test.tsx
pnpm exec vitest run packages/core/tests/planner-types.test.ts packages/core/tests/todo-calendar.test.ts packages/core/tests/todo-planning.test.ts packages/core/tests/planner-move.test.ts
```

## 手动自测步骤（待执行）

1. 新建每天重复的待办，在日历打开某天实例；默认应选“仅此次”。修改内容及备注，保存后前后日期应维持原内容。
2. 重开该实例，选“此后全部”，修改内容及备注；保存后当天和后续日期应显示新内容，更早日期不变。
3. 选“此后全部”，展开“日期与时间”，将每天改为工作日；后续周末应不再生成，工作日仍生成。所选当天保留。
4. 先将另一天完成，另选一天做单次修改；再从更早日期修改“此后全部”，已完成和单次修改的实例应保留。
5. 选择“此后全部”时，时间与类型不可修改；切回“仅此次”后可用。保存后关闭再打开应仍能查看正确内容。
