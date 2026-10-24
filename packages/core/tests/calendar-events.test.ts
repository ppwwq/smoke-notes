import { afterEach, expect, it } from "vitest";
import {
  SmokeNotesDatabase,
  LocalRepository,
  projectCalendarEvents,
  validateCalendarEvent,
  type CalendarEventInput,
} from "../src/index";
const databases: SmokeNotesDatabase[] = [];
afterEach(async () => {
  await Promise.all(databases.map((db) => db.delete()));
  databases.length = 0;
});
const input: CalendarEventInput = {
  title: "会议",
  start: "2028-02-28T23:30",
  end: "2028-02-29T01:00",
  allDay: false,
  color: "purple",
  notes: "",
  location: "",
  url: "",
};
function setup() {
  const db = new SmokeNotesDatabase(`events-${crypto.randomUUID()}`);
  databases.push(db);
  return {
    db,
    repo: new LocalRepository(db, { workspaceId: "one", deviceId: "one" }),
  };
}
it("preserves cross-day durations, updates a single recurrence, and does not enqueue cloud writes", async () => {
  const { repo, db } = setup();
  const event = await repo.saveCalendarEvent({
    ...input,
    repeat: { frequency: "daily", interval: 1, until: "2028-03-01" },
  });
  let results = projectCalendarEvents([event], "2028-02-29", "2028-02-29");
  expect(results).toHaveLength(2);
  expect(results[1].end).toBe("2028-03-01T01:00");
  await repo.saveCalendarEvent(
    {
      ...results[1],
      start: "2028-03-10T09:00",
      end: "2028-03-10T10:30",
      title: "移后的会议",
    },
    event.id,
    "2028-02-29",
  );
  results = projectCalendarEvents(
    await repo.listCalendarEvents(),
    "2028-02-29",
    "2028-02-29",
  );
  expect(results).toHaveLength(1);
  expect(
    projectCalendarEvents(
      await repo.listCalendarEvents(),
      "2028-03-10",
      "2028-03-10",
    )[0].title,
  ).toBe("移后的会议");
  expect(await db.operations.count()).toBe(0);
  expect(await db.calendarEvents.count()).toBe(1);
});
it("deletes one occurrence and restores it without losing another exception", async () => {
  const { repo } = setup();
  const event = await repo.saveCalendarEvent({
    ...input,
    repeat: { frequency: "daily", interval: 1 },
  });
  await repo.deleteCalendarEvent(event.id, "2028-02-29");
  await repo.saveCalendarEvent(
    {
      ...input,
      title: "另一日",
      start: "2028-03-02T09:00",
      end: "2028-03-02T10:00",
    },
    event.id,
    "2028-03-02",
  );
  await repo.restoreCalendarEvent(event, "2028-02-29");
  expect(
    (await repo.listCalendarEvents())[0].exceptions["2028-03-02"]?.title,
  ).toBe("另一日");
  expect(
    projectCalendarEvents(
      await repo.listCalendarEvents(),
      "2028-02-29",
      "2028-02-29",
    ),
  ).toHaveLength(2);
  await repo.deleteCalendarEvent(event.id);
  expect(await repo.listCalendarEvents()).toHaveLength(0);
  await repo.restoreCalendarEvent(event);
  expect(await repo.listCalendarEvents()).toHaveLength(1);
});
it("handles leap years, monthly day 31, weekly intervals and repeat end dates", async () => {
  const { repo } = setup();
  const monthly = await repo.saveCalendarEvent({
    ...input,
    start: "2028-01-31T09:00",
    end: "2028-01-31T10:00",
    repeat: { frequency: "monthly", interval: 1 },
  });
  expect(
    projectCalendarEvents([monthly], "2028-02-01", "2028-03-31").map((e) =>
      e.start.slice(0, 10),
    ),
  ).toEqual(["2028-03-31"]);
  const leap = await repo.saveCalendarEvent({
    ...input,
    start: "2028-02-29T09:00",
    end: "2028-02-29T10:00",
    repeat: { frequency: "yearly", interval: 1 },
  });
  expect(
    projectCalendarEvents([leap], "2029-01-01", "2029-12-31"),
  ).toHaveLength(0);
  expect(
    projectCalendarEvents([leap], "2032-01-01", "2032-12-31"),
  ).toHaveLength(1);
  const weekly = await repo.saveCalendarEvent({
    ...input,
    start: "2028-02-28T09:00",
    end: "2028-02-28T10:00",
    repeat: {
      frequency: "weekly",
      interval: 2,
      weekdays: [1, 3],
      until: "2028-03-13",
    },
  });
  expect(
    projectCalendarEvents([weekly], "2028-02-28", "2028-03-31").map((e) =>
      e.start.slice(0, 10),
    ),
  ).toEqual(["2028-02-28", "2028-03-01", "2028-03-13"]);
});
it("validates dates and time ranges without writing, and isolates workspaces", async () => {
  const { repo, db } = setup();
  await expect(
    repo.saveCalendarEvent({ ...input, end: input.start }),
  ).rejects.toThrow("结束时间");
  await expect(
    repo.saveCalendarEvent({ ...input, start: "2028-02-30T09:00" }),
  ).rejects.toThrow();
  expect(() =>
    validateCalendarEvent({ ...input, url: "javascript:alert(1)" }),
  ).toThrow();
  expect(() =>
    validateCalendarEvent({
      ...input,
      repeat: { frequency: "weekly", interval: 1, weekdays: [] },
    }),
  ).toThrow();
  expect(await db.calendarEvents.count()).toBe(0);
  const event = await repo.saveCalendarEvent(input);
  const other = new LocalRepository(db, {
    workspaceId: "other",
    deviceId: "two",
  });
  expect(await other.listCalendarEvents()).toHaveLength(0);
  await expect(other.saveCalendarEvent(input, event.id)).rejects.toThrow();
});

it("expands last weekdays, selected month dates, yearly months, and finite counts with rrule", async () => {
  const { repo } = setup();
  const lastFriday = await repo.saveCalendarEvent({
    ...input,
    start: "2026-10-01T09:00",
    end: "2026-10-01T10:00",
    repeat: {
      frequency: "monthly",
      interval: 1,
      nthWeekday: { ordinal: -1, weekday: 5 },
      count: 3,
    },
  });
  expect(
    projectCalendarEvents([lastFriday], "2026-10-01", "2027-03-01").map((e) =>
      e.start.slice(0, 10),
    ),
  ).toEqual(["2026-10-30", "2026-11-27", "2026-12-25"]);
  const dates = await repo.saveCalendarEvent({
    ...input,
    start: "2026-10-01T09:00",
    end: "2026-10-01T10:00",
    repeat: {
      frequency: "monthly",
      interval: 1,
      monthDays: [1, 15, 31],
      count: 6,
    },
  });
  expect(
    projectCalendarEvents([dates], "2026-10-01", "2026-12-31").map((e) =>
      e.start.slice(0, 10),
    ),
  ).toEqual([
    "2026-10-01",
    "2026-10-15",
    "2026-10-31",
    "2026-11-01",
    "2026-11-15",
    "2026-12-01",
  ]);
  const yearly = await repo.saveCalendarEvent({
    ...input,
    start: "2026-01-01T09:00",
    end: "2026-01-01T10:00",
    repeat: {
      frequency: "yearly",
      interval: 1,
      months: [3, 9],
      monthDays: [10],
    },
  });
  expect(
    projectCalendarEvents([yearly], "2026-01-01", "2026-12-31").map((e) =>
      e.start.slice(0, 10),
    ),
  ).toEqual(["2026-03-10", "2026-09-10"]);
});

it("splits this-and-following atomically, retains history and future exceptions, and preserves remaining count", async () => {
  const { repo, db } = setup();
  const event = await repo.saveCalendarEvent({
    ...input,
    start: "2026-10-20T09:00",
    end: "2026-10-20T10:00",
    repeat: { frequency: "daily", interval: 1, count: 5 },
  });
  await repo.saveCalendarEvent(
    {
      ...event,
      title: "单独改过",
      start: "2026-10-24T11:00",
      end: "2026-10-24T12:00",
    },
    event.id,
    "2026-10-24",
  );
  const next = await repo.saveCalendarEvent(
    {
      ...event,
      title: "新时间",
      start: "2026-10-22T14:00",
      end: "2026-10-22T15:00",
    },
    event.id,
    "2026-10-22",
    true,
  );
  expect(next.id).not.toBe(event.id);
  expect(next.repeat?.count).toBe(3);
  const list = await repo.listCalendarEvents();
  expect(
    projectCalendarEvents(list, "2026-10-20", "2026-10-26").map((e) => [
      e.title,
      e.start,
    ]),
  ).toEqual([
    ["会议", "2026-10-20T09:00"],
    ["会议", "2026-10-21T09:00"],
    ["新时间", "2026-10-22T14:00"],
    ["新时间", "2026-10-23T14:00"],
    ["单独改过", "2026-10-24T11:00"],
  ]);
  const snapshot = (await repo.listCalendarEvents()).find(
    (e) => e.id === next.id,
  )!;
  await repo.deleteCalendarEvent(next.id, "2026-10-23", true);
  expect(
    projectCalendarEvents(
      await repo.listCalendarEvents(),
      "2026-10-23",
      "2026-10-26",
    ),
  ).toHaveLength(0);
  await repo.restoreCalendarEvent(snapshot, "2026-10-23", true);
  expect(
    projectCalendarEvents(
      await repo.listCalendarEvents(),
      "2026-10-23",
      "2026-10-26",
    ),
  ).toHaveLength(2);
  expect(await db.operations.count()).toBe(0);
});

it("removes stale exceptions when a repeating series is changed to a single event", async () => {
  const { repo } = setup();
  const event = await repo.saveCalendarEvent({
    ...input,
    repeat: { frequency: "daily", interval: 1 },
  });
  await repo.saveCalendarEvent(
    {
      ...input,
      title: "旧例外",
      start: "2028-03-10T09:00",
      end: "2028-03-10T10:00",
    },
    event.id,
    "2028-03-10",
  );
  await repo.saveCalendarEvent(input, event.id);
  expect(
    projectCalendarEvents(
      await repo.listCalendarEvents(),
      "2028-03-01",
      "2028-03-31",
    ),
  ).toHaveLength(0);
});
