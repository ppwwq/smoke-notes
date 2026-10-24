import ICAL from "ical.js";
import {
  calendarMinute,
  calendarStamp,
  validateCalendarEvent,
  type CalendarEventInput,
  type CalendarRepeat,
} from "./calendar-events";
import {
  DEFAULT_CALENDAR_ZONE,
  calendarInstant,
  calendarWallTime,
  validCalendarZone,
} from "./calendar-timezone";
import { isTodoDate, addTodoDays, normalizeTodoRepeat } from "./todo-planning";
import type { PlannerTodoInput } from "./planner-types";
import { RecordValidationError } from "./validation";

export type CalendarImportItem =
  | {
      kind: "event";
      input: CalendarEventInput;
      exceptions?: Record<string, CalendarEventInput | null>;
      uid?: string;
      typeName?: string;
    }
  | { kind: "todo"; input: PlannerTodoInput; uid?: string; typeName?: string };
export interface CalendarImportPlan {
  items: CalendarImportItem[];
  warnings: string[];
}
export interface CalendarImportResult {
  imported: number;
  skipped: number;
}
function fail(message: string): never {
  throw new RecordValidationError(message);
}
const object = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : fail("规划项目必须是对象。");
const string = (value: unknown, fallback = ""): string =>
  value == null
    ? fallback
    : typeof value === "string"
      ? value
      : fail("文字字段格式不正确。");
function eventInput(
  value: Record<string, unknown>,
  zone: string,
): CalendarEventInput {
  if (value.allDay != null && typeof value.allDay !== "boolean")
    fail("全天须为 true 或 false。");
  const allDay = value.allDay === true;
  let start = string(value.start),
    end = string(value.end);
  if (allDay && /^\d{4}-\d{2}-\d{2}$/.test(start)) start += "T00:00";
  if (allDay && /^\d{4}-\d{2}-\d{2}$/.test(end)) end += "T00:00";
  return validateCalendarEvent({
    title: string(value.title),
    start,
    end,
    allDay,
    timeZone: string(value.timeZone, zone),
    color: string(value.color, "purple") as CalendarEventInput["color"],
    notes: string(value.notes),
    location: string(value.location),
    url: string(value.url),
    repeat:
      value.repeat == null
        ? undefined
        : (object(value.repeat) as unknown as CalendarRepeat),
  });
}
function jsonPlan(text: string, zone: string): CalendarImportPlan {
  const data = object(JSON.parse(text));
  if (data.version !== 1) fail("规划文件 version 必须为 1。");
  zone = string(data.timeZone, zone);
  if (!validCalendarZone(zone)) fail("规划时区无效。");
  if (!Array.isArray(data.events ?? []) || !Array.isArray(data.todos ?? []))
    fail("events 和 todos 必须是数组。");
  const events = (data.events ?? []) as unknown[],
    todos = (data.todos ?? []) as unknown[];
  const items: CalendarImportItem[] = events.map((raw) => {
    const row = object(raw);
    return {
      kind: "event",
      input: eventInput(row, zone),
      uid: row.id == null ? undefined : `plan:${string(row.id)}`,
      typeName: row.type == null ? undefined : string(row.type),
    };
  });
  for (const raw of todos) {
    const row = object(raw);
    const date = string(row.date),
      time = row.time == null ? null : string(row.time),
      text = string(row.text),
      notes = string(row.notes);
    if (
      !isTodoDate(date) ||
      !text.trim() ||
      text.length > 500 ||
      notes.length > 10000 ||
      (time !== null && !/^([01]\d|2[0-3]):[0-5]\d$/.test(time))
    )
      fail("待办的内容、日期或时间无效。");
    const repeat =
      row.repeat == null
        ? undefined
        : normalizeTodoRepeat(
            object(row.repeat) as unknown as NonNullable<
              PlannerTodoInput["repeat"]
            >,
          );
    if (repeat && !["daily", "weekdays", "weekly"].includes(repeat.kind))
      fail("待办重复支持 daily、weekdays 或 weekly。");
    items.push({
      kind: "todo",
      input: { text, date, time, notes, repeat },
      uid: row.id == null ? undefined : `plan:${string(row.id)}`,
      typeName: row.type == null ? undefined : string(row.type),
    });
  }
  return {
    items,
    warnings: todos.length
      ? ["待办是日期／时间点安排，按待办清单的本地时间显示；行程支持独立时区。"]
      : [],
  };
}
function parseRule(
  rule: ICAL.Recur,
  zone: string,
  startStamp: string,
): CalendarRepeat {
  const parts: Record<string, string> = Object.fromEntries(
    rule
      .toString()
      .split(";")
      .map((part) => part.split("=")),
  );
  const allowed = [
    "FREQ",
    "INTERVAL",
    "COUNT",
    "UNTIL",
    "BYDAY",
    "BYMONTHDAY",
    "BYMONTH",
    "BYSETPOS",
    "WKST",
  ];
  if (
    Object.keys(parts).some((key) => !allowed.includes(key)) ||
    (parts.WKST && parts.WKST !== "MO")
  )
    fail("此 ICS 含尚不支持的重复规则，请先转成具体日期再导入。");
  const frequency = (
    {
      DAILY: "daily",
      WEEKLY: "weekly",
      MONTHLY: "monthly",
      YEARLY: "yearly",
    } as Record<string, CalendarRepeat["frequency"]>
  )[parts.FREQ];
  if (!frequency) fail("仅支持日、周、月、年的重复行程。");
  const result: CalendarRepeat = {
    frequency,
    interval: Number(parts.INTERVAL ?? 1),
  };
  if (parts.COUNT) result.count = Number(parts.COUNT);
  if (rule.until) {
    const until = rule.until.toString();
    const local = until.endsWith("Z")
      ? calendarWallTime(Date.parse(until), zone)
      : until;
    result.until = local.slice(0, 10);
    if (!rule.until.isDate && local.slice(11, 16) < startStamp.slice(11, 16))
      result.until = addTodoDays(result.until, -1);
  }
  const numbers = (key: string) => parts[key]?.split(",").map(Number);
  result.monthDays = numbers("BYMONTHDAY");
  result.months = numbers("BYMONTH");
  const days = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];
  if (
    frequency === "daily" &&
    (parts.BYDAY || parts.BYMONTHDAY || parts.BYMONTH || parts.BYSETPOS)
  )
    fail("每日重复的组合筛选暂不支持，请展开后导入。");
  if (frequency === "monthly" && parts.BYMONTH)
    fail("按月份筛选的每月重复暂不支持，请展开后导入。");
  if (frequency === "yearly" && parts.BYDAY && !parts.BYMONTH)
    fail("每年星期规则需明确 BYMONTH 月份，请展开后导入。");
  if (frequency === "weekly") {
    if (parts.BYMONTHDAY || parts.BYMONTH || parts.BYSETPOS)
      fail("此每周重复规则暂不支持。");
    result.weekdays = parts.BYDAY?.split(",").map((day) => days.indexOf(day));
  } else if (parts.BYDAY) {
    const match = /^([+-]?\d)?(SU|MO|TU|WE|TH|FR|SA)$/.exec(parts.BYDAY);
    const ordinal = Number(match?.[1] ?? parts.BYSETPOS);
    if (match?.[1] && parts.BYSETPOS)
      fail("组合星期序号和 BYSETPOS 暂不支持。");
    if (!match || !ordinal || parts.BYMONTHDAY)
      fail("此每月／每年重复规则暂不支持，请展开后导入。");
    result.nthWeekday = { ordinal, weekday: days.indexOf(match[2]) };
  } else if (parts.BYSETPOS) fail("不支持独立 BYSETPOS 规则。");
  return result;
}
function icsPlan(text: string, fallbackZone: string): CalendarImportPlan {
  const root = new ICAL.Component(ICAL.parse(text));
  if (root.name !== "vcalendar") fail("文件必须是 VCALENDAR 日历。");
  if (root.getAllSubcomponents("vtodo").length)
    fail("此 ICS 含 VTODO，请将待办转成规划 JSON 的 todos 数组后导入。");
  const components = root.getAllSubcomponents("vevent"),
    items: CalendarImportItem[] = [];
  const warnings = new Set<string>();
  const read = (component: ICAL.Component): CalendarEventInput => {
    const prop = component.getFirstProperty("dtstart"),
      start = prop?.getFirstValue();
    if (!(start instanceof ICAL.Time)) fail("ICS 日程缺少有效 DTSTART。");
    const zone =
      start.zone.tzid === "UTC"
        ? "UTC"
        : String(prop!.getParameter("tzid") || fallbackZone);
    if (!validCalendarZone(zone))
      fail(`不支持的时区 ${zone}，请使用 IANA 城市时区。`);
    const stamp = start.toString().replace(/Z$/, ""),
      allDay = start.isDate;
    const startStamp = allDay ? stamp + "T00:00" : stamp.slice(0, 16);
    if (!allDay && start.second !== 0)
      fail("当前日历精确到分钟，请先移除 ICS 中的秒数。");
    const endProperty = component.getFirstProperty("dtend"),
      end = endProperty?.getFirstValue();
    let endStamp: string;
    if (end instanceof ICAL.Time) {
      if (end.isDate !== allDay || (!allDay && end.second !== 0))
        fail("ICS 起止时间格式不一致或含秒数。");
      const endZone =
        end.zone.tzid === "UTC"
          ? "UTC"
          : String(endProperty!.getParameter("tzid") || zone);
      endStamp = allDay
        ? end.toString() + "T00:00"
        : calendarWallTime(
            calendarInstant(
              end.toString().replace(/Z$/, "").slice(0, 16),
              endZone,
            ),
            zone,
          );
    } else {
      const duration = component.getFirstPropertyValue("duration");
      const minutes =
        duration instanceof ICAL.Duration
          ? duration.toSeconds() / 60
          : allDay
            ? 1440
            : 60;
      if (!Number.isInteger(minutes) || minutes <= 0)
        fail("ICS 时长必须为正整数分钟。");
      endStamp = allDay
        ? calendarStamp(calendarMinute(startStamp) + minutes)
        : calendarWallTime(
            calendarInstant(startStamp, zone) + minutes * 60000,
            zone,
          );
      if (!duration && !allDay)
        warnings.add("缺少结束时间的行程使用 60 分钟时长。");
    }
    if (
      component.hasProperty("rdate") ||
      component.getAllProperties("rrule").length > 1
    )
      fail("暂不支持 RDATE 或多个 RRULE，请先展开成具体日程。");
    const rule = component.getFirstPropertyValue("rrule");
    const repeat =
      rule instanceof ICAL.Recur
        ? parseRule(rule, zone, startStamp)
        : undefined;
    if (repeat?.frequency === "weekly" && !repeat.weekdays)
      repeat.weekdays = [
        new Date(startStamp.slice(0, 10) + "T12:00Z").getUTCDay(),
      ];
    if (component.getAllSubcomponents("valarm").length)
      warnings.add("文件中的系统提醒不会导入；当前为本地日历。");
    if (component.hasProperty("attendee") || component.hasProperty("attach"))
      warnings.add(
        "参与人、邀请和附件暂不导入，标题、时间、地点与备注会保留。",
      );
    return validateCalendarEvent({
      title: String(component.getFirstPropertyValue("summary") ?? "未命名行程"),
      start: startStamp,
      end: endStamp,
      allDay,
      timeZone: zone,
      color: "purple",
      notes: String(component.getFirstPropertyValue("description") ?? ""),
      location: String(component.getFirstPropertyValue("location") ?? ""),
      url: String(component.getFirstPropertyValue("url") ?? ""),
      repeat,
    });
  };
  const masters = new Map<
    string,
    Extract<CalendarImportItem, { kind: "event" }>
  >();
  for (const c of components.filter((c) => !c.hasProperty("recurrence-id"))) {
    if (c.getFirstPropertyValue("status") === "CANCELLED") {
      warnings.add("已取消的日程未导入。");
      continue;
    }
    const uid = String(c.getFirstPropertyValue("uid") ?? "");
    if (uid && masters.has(uid)) fail("ICS 含重复 UID 的主日程。");
    const input = read(c),
      item: Extract<CalendarImportItem, { kind: "event" }> = {
        kind: "event",
        input,
        uid: uid ? `ics:${uid}` : undefined,
        exceptions: {},
      };
    const category = c.getFirstProperty("categories")?.getFirstValue();
    if (typeof category === "string") item.typeName = category;
    for (const p of c.getAllProperties("exdate"))
      for (const value of p.getValues()) {
        if (!(value instanceof ICAL.Time)) fail("EXDATE 格式无效。");
        const zone =
          value.zone.tzid === "UTC"
            ? "UTC"
            : String(p.getParameter("tzid") || input.timeZone);
        const date = value.isDate
          ? value.toString()
          : calendarWallTime(
              calendarInstant(
                value.toString().replace(/Z$/, "").slice(0, 16),
                zone,
              ),
              input.timeZone,
            ).slice(0, 10);
        item.exceptions![date] = null;
      }
    items.push(item);
    if (uid) masters.set(uid, item);
  }
  for (const c of components.filter((c) => c.hasProperty("recurrence-id"))) {
    const master = masters.get(String(c.getFirstPropertyValue("uid") ?? "")),
      p = c.getFirstProperty("recurrence-id")!,
      value = p.getFirstValue();
    if (!master || !(value instanceof ICAL.Time) || !master.input.repeat)
      fail("重复例外缺少对应主日程。");
    if (p.getParameter("range"))
      fail("请将 THISANDFUTURE 例外拆分成两个系列后导入。");
    const zone =
      value.zone.tzid === "UTC"
        ? "UTC"
        : String(p.getParameter("tzid") || master.input.timeZone);
    const day = value.isDate
      ? value.toString()
      : calendarWallTime(
          calendarInstant(
            value.toString().replace(/Z$/, "").slice(0, 16),
            zone,
          ),
          master.input.timeZone,
        ).slice(0, 10);
    master.exceptions![day] =
      c.getFirstPropertyValue("status") === "CANCELLED" ? null : read(c);
  }
  return { items, warnings: [...warnings] };
}
export function parseCalendarImport(
  text: string,
  timeZone = DEFAULT_CALENDAR_ZONE,
): CalendarImportPlan {
  if (new TextEncoder().encode(text).length > 2_000_000)
    fail("文件不得超过 2 MB。");
  try {
    const trimmed = text.trim().replace(/^\uFEFF/, "");
    const plan = trimmed.startsWith("{")
      ? jsonPlan(trimmed, timeZone)
      : icsPlan(trimmed, timeZone);
    if (!plan.items.length || plan.items.length > 500)
      fail("一次请导入 1 至 500 项安排。");
    for (const item of plan.items) {
      if (item.typeName && (!item.typeName.trim() || item.typeName.length > 40))
        fail("类型标签须为 1 至 40 字。");
      if (item.uid && item.uid.length > 500) fail("日程标识过长。");
    }
    return plan;
  } catch (error) {
    if (error instanceof RecordValidationError) throw error;
    throw new RecordValidationError(
      `无法读取规划文件：${error instanceof Error ? error.message : "格式无效"}`,
    );
  }
}
