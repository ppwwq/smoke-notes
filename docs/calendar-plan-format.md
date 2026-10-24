# 可导入的日程规划

日历工具栏 → **导入日程规划** → 选择 `.json` / `.ics` 文件，或粘贴内容 → **检查并预览** → **确认导入**。
下载规划模板会按当前选中日期生成示例。仓库另有 [JSON 示例](../examples/calendar-plan-template.json)。示例不会自动写入你的日历。

你提供日期范围、每天可用时间、目标、固定行程与休息要求后，助手可以直接输出符合此格式的完整规划文件。之后在上述入口预览并导入即可；不需要逐条手动新增。

## JSON version 1

```json
{
  "version": 1,
  "timeZone": "Asia/Hong_Kong",
  "events": [
    {
      "id": "study-20261026-am",
      "title": "学习安排",
      "start": "2026-10-26T09:00",
      "end": "2026-10-26T10:30",
      "type": "学习",
      "color": "purple",
      "notes": "本次目标"
    }
  ],
  "todos": [
    {
      "id": "review-20261026",
      "text": "整理今日收获",
      "date": "2026-10-26",
      "time": "20:30",
      "type": "学习"
    }
  ]
}
```

- `version` 必须为 `1`；`events` 与 `todos` 可以只提供其中一个。一次 1–500 项，不超过 2 MB。
- `id` 建议提供稳定的非空唯一标识。同一工作区内，同类型同标识的再次导入会跳过，不覆盖你修改过的内容。没有 `id` 时，以规范化内容识别重复。导入是一次性批量新增，不是订阅或文件同步。
- 行程 `title`、`start`、`end` 必填。时间精确到分钟，使用 `YYYY-MM-DDTHH:mm`，不带 `Z` 或偏移量；时区写入 `timeZone`，可按行程覆盖文件默认值。缺省是香港。
- `allDay: true` 时可用日期字符串。**结束日期不包含在行程内**：10 月 30–31 日，填 `start: "2026-10-30"`、`end: "2026-11-01"`。
- `color` 为 `purple` / `green` / `blue` / `orange`。`type` 为 1–40 字标签；已有同名标签复用其颜色，没有的自动创建。
- 可选行程 `location`、`notes`、`url`（仅 http/https）。
- 行程 `repeat`：`frequency` 为 `daily` / `weekly` / `monthly` / `yearly`；`interval` 为 1–99。每周用 `weekdays`（周日 0 至周六 6）；每月用 `monthDays` 或 `nthWeekday: {"ordinal": -1, "weekday": 5}`（最后一个周五）；每年可用 `months`。`count` 和 `until` 二选一。优先用具体日期展开计划，便于检查每项安排。
- 待办 `text` 和 `date` 必填；可选 `time`、`notes`、`type`。`repeat` 支持 `{"kind":"daily"}`、`{"kind":"weekdays"}`、`{"kind":"weekly","weekdays":[1,3,5]}`。待办保持原有香港日期／时间点语义，不随行程查看时区换算。
- 所有项目先解析验证，再在一个本地数据库事务里保存；任何一项写入失败都会回滚整批。

## ICS 范围

使用 [ICAL.js](https://github.com/kewisch/ical.js) 解析 [RFC 5545](https://www.rfc-editor.org/rfc/rfc5545) 的语法，支持 VEVENT、UTC、浮动时间、IANA TZID、DTEND/DURATION、全天、常用 RRULE、EXDATE、RECURRENCE-ID 修改与取消、标题、地点、备注、链接和第一个分类标签。

暂不支持的规则会明确拒绝，避免悄悄改变日程：VTODO（改用 JSON todos）、RDATE、多个 RRULE、小时／分钟级重复、自定义非 IANA 时区、THISANDFUTURE、部分组合筛选。系统提醒、参与人和附件不会导入，预览会提示。没有结束时间的定时行程会提示并使用 60 分钟。

## 时区边界

- 查看时区换算定时行程；全天日期不变。每项行程保留自己的输入时区，编辑时显示原时区时间。
- 春季夏令时不存在的时间不能保存；重复到该时间的实例跳过。当前重复次数仍按候选日期计数，跨夏令时且需要精确次数时应展开成具体日期导入。
- 秋季回拨的同名时间取较早的一次；没有选择第二个折返时间的控件。精确到分钟，不支持秒。
- 本地日程不接入 iCloud、共享邀请或系统通知。
