import { addTodoDays } from "@smoke-notes/core";

export function calendarDate(value: Date) {
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
}
export function calendarDay(value: string) {
  return new Date(`${value}T12:00:00`);
}
export function calendarRange(month: string, weekStartsOn = 1) {
  const first = `${month.slice(0, 7)}-01`;
  const offset = (calendarDay(first).getDay() - weekStartsOn + 7) % 7;
  const from = addTodoDays(first, -offset);
  const start = calendarDay(first);
  const days = new Date(start.getFullYear(), start.getMonth() + 1, 0).getDate();
  const weeks = Math.ceil((offset + days) / 7);
  return { from, to: addTodoDays(from, weeks * 7 - 1), weeks };
}
/** ISO week number uses the Thursday of its week, independent of local clock/DST. */
export function calendarWeekNumber(day: string) {
  const value = new Date(`${day}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + 4 - (value.getUTCDay() || 7));
  const year = value.getUTCFullYear();
  return {
    year,
    week: Math.ceil(
      ((value.getTime() - Date.UTC(year, 0, 1)) / 86400000 + 1) / 7,
    ),
  };
}
