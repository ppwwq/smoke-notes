import {
  DEFAULT_CALENDAR_ZONE,
  convertCalendarTime,
  validateCalendarZoneTime,
  validCalendarZone,
} from "./calendar-timezone";
import { addTodoDays, isTodoDate } from "./todo-planning";
import { RecordValidationError } from "./validation";
import { RRule } from "rrule";
import { NOTE_COLORS } from "./note-content";

// Keep existing calendar IDs readable while adding the full note palette.
export const CALENDAR_COLORS = [
  ...NOTE_COLORS,
  "purple",
  "green",
  "blue",
  "orange",
] as const;

export interface CalendarRepeat {
  frequency: "daily" | "weekly" | "monthly" | "yearly";
  interval: number;
  weekdays?: number[];
  until?: string;
  count?: number;
  monthDays?: number[];
  months?: number[];
  nthWeekday?: { ordinal: number; weekday: number };
}
export interface CalendarEventInput {
  title: string;
  start: string;
  end: string;
  allDay: boolean;
  notes: string;
  location: string;
  url: string;
  color: (typeof CALENDAR_COLORS)[number];
  repeat?: CalendarRepeat;
  typeId?: string | null;
  timeZone?: string;
}
export interface CalendarEvent extends CalendarEventInput {
  id: string;
  workspaceId: string;
  updatedAt: string;
  importKey?: string;
  deletedAt: string | null;
  exceptions: Record<string, CalendarEventInput | null>;
}
export interface CalendarOccurrence extends CalendarEventInput {
  id: string;
  eventId: string;
  occurrenceDate: string;
  recurring: boolean;
  source?: CalendarEventInput;
}
export const calendarMinute = (value: string) =>
  Date.parse(`${value}:00Z`) / 60000;
export const calendarStamp = (minute: number) =>
  new Date(minute * 60000).toISOString().slice(0, 16);
export function validateCalendarEvent(
  input: CalendarEventInput,
): CalendarEventInput {
  const validStamp = (s: string) =>
    /^\d{4}-\d{2}-\d{2}T([01]\d|2[0-3]):[0-5]\d$/.test(s) &&
    isTodoDate(s.slice(0, 10));
  if (!input.title.trim() || input.title.length > 240)
    throw new RecordValidationError("请填写不超过 240 字的日程名称。");
  if (
    !validStamp(input.start) ||
    !validStamp(input.end) ||
    input.end <= input.start
  )
    throw new RecordValidationError("结束时间必须晚于开始时间。");
  if (calendarMinute(input.end) - calendarMinute(input.start) > 366 * 1440)
    throw new RecordValidationError("单个日程不能超过一年。");
  if (
    input.allDay &&
    (!input.start.endsWith("T00:00") || !input.end.endsWith("T00:00"))
  )
    throw new RecordValidationError("全天日程请按日期安排。");
  if (
    input.notes.length > 4000 ||
    input.location.length > 500 ||
    input.url.length > 2000
  )
    throw new RecordValidationError("备注、地点或链接过长，请缩短后保存。");
  if (input.url && !/^https?:\/\//i.test(input.url))
    throw new RecordValidationError("链接须以 https:// 或 http:// 开头。");
  if (!CALENDAR_COLORS.includes(input.color))
    throw new RecordValidationError("请选择有效颜色。");
  const timeZone = input.timeZone ?? DEFAULT_CALENDAR_ZONE;
  if (!validCalendarZone(timeZone))
    throw new RecordValidationError("请选择有效的 IANA 时区。");
  if (!input.allDay) {
    validateCalendarZoneTime(input.start, timeZone);
    validateCalendarZoneTime(input.end, timeZone);
  }
  const repeat = input.repeat;
  if (repeat) {
    if (
      !["daily", "weekly", "monthly", "yearly"].includes(repeat.frequency) ||
      !Number.isInteger(repeat.interval) ||
      repeat.interval < 1 ||
      repeat.interval > 99
    )
      throw new RecordValidationError("重复间隔须为 1 至 99。");
    if (
      repeat.until &&
      (!isTodoDate(repeat.until) || repeat.until < input.start.slice(0, 10))
    )
      throw new RecordValidationError("重复结束日不能早于开始日。");
    if (
      repeat.frequency === "weekly" &&
      (!repeat.weekdays?.length ||
        repeat.weekdays.some((d) => !Number.isInteger(d) || d < 0 || d > 6))
    )
      throw new RecordValidationError("请选择至少一个重复星期。");
    if (
      repeat.count !== undefined &&
      (!Number.isInteger(repeat.count) ||
        repeat.count < 1 ||
        repeat.count > 10000)
    )
      throw new RecordValidationError("重复次数须为 1 至 10000。");
    if (repeat.count && repeat.until)
      throw new RecordValidationError("请选择按日期或按次数结束重复。");
    if (
      repeat.monthDays &&
      (!repeat.monthDays.length ||
        repeat.monthDays.some((d) => !Number.isInteger(d) || d < 1 || d > 31))
    )
      throw new RecordValidationError("请选择有效的重复日期。");
    if (
      repeat.months &&
      (!repeat.months.length ||
        repeat.months.some((m) => !Number.isInteger(m) || m < 1 || m > 12))
    )
      throw new RecordValidationError("请选择至少一个重复月份。");
    if (
      repeat.nthWeekday &&
      (![-1, 1, 2, 3, 4, 5].includes(repeat.nthWeekday.ordinal) ||
        !Number.isInteger(repeat.nthWeekday.weekday) ||
        repeat.nthWeekday.weekday < 0 ||
        repeat.nthWeekday.weekday > 6)
    )
      throw new RecordValidationError("请选择有效的星期规则。");
  }
  return {
    title: input.title.trim(),
    start: input.start,
    end: input.end,
    allDay: input.allDay,
    color: input.color,
    typeId: input.typeId ?? null,
    timeZone,
    notes: input.notes.trim(),
    location: input.location.trim(),
    url: input.url.trim(),
    repeat: repeat
      ? {
          ...repeat,
          weekdays: repeat.weekdays
            ? [...new Set(repeat.weekdays)].sort()
            : undefined,
        }
      : undefined,
  };
}
/** Floating UTC dates keep recurrence independent of the browser timezone. */
export function calendarRule(event: CalendarEventInput) {
  const r = event.repeat;
  if (!r) return undefined;
  const weekdays = [
    RRule.SU,
    RRule.MO,
    RRule.TU,
    RRule.WE,
    RRule.TH,
    RRule.FR,
    RRule.SA,
  ];
  return new RRule({
    freq: {
      daily: RRule.DAILY,
      weekly: RRule.WEEKLY,
      monthly: RRule.MONTHLY,
      yearly: RRule.YEARLY,
    }[r.frequency],
    dtstart: new Date(`${event.start.slice(0, 10)}T00:00:00Z`),
    interval: r.interval,
    wkst: RRule.MO,
    until: r.until ? new Date(`${r.until}T23:59:59Z`) : undefined,
    count: r.count,
    byweekday:
      r.frequency === "weekly"
        ? r.weekdays?.map((d) => weekdays[d])
        : r.nthWeekday
          ? weekdays[r.nthWeekday.weekday].nth(r.nthWeekday.ordinal)
          : undefined,
    bymonthday:
      (r.frequency === "monthly" || r.frequency === "yearly") && !r.nthWeekday
        ? r.monthDays
        : undefined,
    bymonth: r.frequency === "yearly" ? r.months : undefined,
  });
}
/** Expand repeats in their own zone, then render in the selected viewing zone. */
export function projectCalendarEvents(
  events: CalendarEvent[],
  from: string,
  to: string,
  timeZone = DEFAULT_CALENDAR_ZONE,
): CalendarOccurrence[] {
  if (
    !isTodoDate(from) ||
    !isTodoDate(to) ||
    from > to ||
    Date.parse(to) - Date.parse(from) > 370 * 86400000
  )
    throw new RecordValidationError("请选择一年内的日历范围。");
  const result: CalendarOccurrence[] = [];
  const lower = `${from}T00:00`,
    upper = `${addTodoDays(to, 1)}T00:00`;
  for (const event of events) {
    if (event.deletedAt) continue;
    const duration = calendarMinute(event.end) - calendarMinute(event.start);
    const add = (date: string, value: CalendarEventInput) => {
      const zone = value.timeZone ?? DEFAULT_CALENDAR_ZONE;
      if (!value.allDay) {
        try {
          validateCalendarZoneTime(value.start, zone);
          validateCalendarZoneTime(value.end, zone);
        } catch {
          return;
        } // A recurrence landing in a DST gap has no local occurrence.
      }
      const start = value.allDay
        ? value.start
        : convertCalendarTime(value.start, zone, timeZone);
      const end = value.allDay
        ? value.end
        : convertCalendarTime(value.end, zone, timeZone);
      if (start < upper && end > lower)
        result.push({
          ...value,
          start,
          end,
          timeZone,
          source: value,
          id: `${event.id}:${date}`,
          eventId: event.id,
          occurrenceDate: date,
          recurring: !!event.repeat,
        });
    };
    const first = event.start.slice(0, 10),
      scan = addTodoDays(from, -Math.ceil(duration / 1440) - 2);
    const dates = calendarRule(event)
      ?.between(
        new Date(`${scan}T00:00:00Z`),
        new Date(`${addTodoDays(to, 2)}T23:59:59Z`),
        true,
      )
      .map((d) => d.toISOString().slice(0, 10)) ?? [first];
    for (const date of dates) {
      if (Object.hasOwn(event.exceptions, date)) continue;
      const start = `${date}${event.start.slice(10)}`;
      add(date, {
        ...event,
        start,
        end: calendarStamp(calendarMinute(start) + duration),
      });
    }
    for (const [date, exception] of Object.entries(event.exceptions))
      if (exception) add(date, exception);
  }
  return result.sort(
    (a, b) => a.start.localeCompare(b.start) || a.title.localeCompare(b.title),
  );
}
