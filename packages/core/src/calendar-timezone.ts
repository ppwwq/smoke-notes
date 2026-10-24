import { Temporal } from "@js-temporal/polyfill";
import { RecordValidationError } from "./validation";

export const DEFAULT_CALENDAR_ZONE = "Asia/Hong_Kong";
export function validCalendarZone(zone: string): boolean {
  try {
    new Intl.DateTimeFormat("en", { timeZone: zone });
    return true;
  } catch {
    return false;
  }
}
export function calendarInstant(
  stamp: string,
  zone = DEFAULT_CALENDAR_ZONE,
): number {
  return Temporal.PlainDateTime.from(stamp).toZonedDateTime(zone, {
    disambiguation: "compatible",
  }).epochMilliseconds;
}
export function calendarWallTime(
  instant: number,
  zone = DEFAULT_CALENDAR_ZONE,
): string {
  return Temporal.Instant.fromEpochMilliseconds(instant)
    .toZonedDateTimeISO(zone)
    .toPlainDateTime()
    .toString({ smallestUnit: "minute" });
}
export function convertCalendarTime(
  stamp: string,
  from: string,
  to: string,
): string {
  return from === to
    ? stamp
    : calendarWallTime(calendarInstant(stamp, from), to);
}
export function validateCalendarZoneTime(stamp: string, zone: string) {
  if (!validCalendarZone(zone))
    throw new RecordValidationError("请选择有效的 IANA 时区。");
  if (calendarWallTime(calendarInstant(stamp, zone), zone) !== stamp)
    throw new RecordValidationError(
      "这个时间在所选时区因夏令时跳时而不存在，请选择其他时间。",
    );
}
