import {
  calendarRange,
  calendarWeekNumber,
} from "../src/components/calendar-dates";
import { expect, it } from "vitest";
import { calendarSpanRows } from "../src/components/calendar-layout";
import { projectCalendarEvents, type CalendarEvent } from "@smoke-notes/core";
const event = (id: string, start: string, end: string): CalendarEvent => ({
  id,
  start,
  end,
  title: id,
  allDay: true,
  color: "purple",
  notes: "",
  url: "",
  location: "",
  workspaceId: "one",
  updatedAt: "2026-10-24T00:00:00Z",
  deletedAt: null,
  exceptions: {},
});
const dates = [
  "2026-10-19",
  "2026-10-20",
  "2026-10-21",
  "2026-10-22",
  "2026-10-23",
  "2026-10-24",
  "2026-10-25",
];
it("clips one multi-day bar at week boundaries and respects exclusive midnight ends", () => {
  const events = projectCalendarEvents(
    [
      event("a", "2026-10-18T00:00", "2026-10-21T00:00"),
      event("b", "2026-10-24T00:00", "2026-10-28T00:00"),
    ],
    dates[0],
    dates[6],
  );
  expect(
    calendarSpanRows(events, [], dates).map(({ first, last, row }) => ({
      first,
      last,
      row,
    })),
  ).toEqual([
    { first: 0, last: 1, row: 0 },
    { first: 5, last: 6, row: 0 },
  ]);
});
it("packs spans without collisions and places excess entries after four lanes", () => {
  const events = projectCalendarEvents(
    Array.from({ length: 6 }, (_, i) =>
      event(String(i), "2026-10-20T00:00", "2026-10-22T00:00"),
    ),
    dates[0],
    dates[6],
  );
  const rows = calendarSpanRows(events, [], dates);
  expect(rows.map((r) => r.row)).toEqual([0, 1, 2, 3, 4, 5]);
  expect(rows.filter((r) => r.row < 4)).toHaveLength(4);
});

it("renders only the required calendar weeks, aligns all seven possible starts, and counts ISO weeks across years", () => {
  expect(calendarRange("2027-02-01")).toEqual({
    from: "2027-02-01",
    to: "2027-02-28",
    weeks: 4,
  });
  expect(calendarRange("2026-10-01")).toEqual({
    from: "2026-09-28",
    to: "2026-11-01",
    weeks: 5,
  });
  expect(calendarRange("2026-08-01")).toEqual({
    from: "2026-07-27",
    to: "2026-09-06",
    weeks: 6,
  });
  expect(calendarRange("2026-10-01", 0)).toEqual({
    from: "2026-09-27",
    to: "2026-10-31",
    weeks: 5,
  });
  for (let start = 0; start < 7; start++)
    expect(
      new Date(calendarRange("2026-10-01", start).from + "T12:00:00").getDay(),
    ).toBe(start);
  expect(calendarWeekNumber("2021-01-01")).toEqual({ year: 2020, week: 53 });
  expect(calendarWeekNumber("2026-12-31")).toEqual({ year: 2026, week: 53 });
  expect(calendarWeekNumber("2027-01-04")).toEqual({ year: 2027, week: 1 });
});
