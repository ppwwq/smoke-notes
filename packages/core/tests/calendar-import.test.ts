import { parseCalendarImport } from "../src/calendar-import";
import { afterEach, expect, it } from "vitest";
import {
  SmokeNotesDatabase,
  LocalRepository,
  projectCalendarEvents,
  validateCalendarEvent,
  convertCalendarTime,
  calendarInstant,
  type CalendarEventInput,
  type CalendarEvent,
} from "../src/index";
const input: CalendarEventInput = {
  title: "会议",
  start: "2026-10-24T09:00",
  end: "2026-10-24T10:30",
  allDay: false,
  color: "purple",
  location: "",
  notes: "",
  url: "",
  timeZone: "Asia/Hong_Kong",
};
const event = (fields: Partial<CalendarEventInput> = {}): CalendarEvent => ({
  ...input,
  ...fields,
  id: "one",
  workspaceId: "one",
  updatedAt: "2026-10-24T00:00:00Z",
  deletedAt: null,
  exceptions: {},
});
const ics = (...lines: string[]) =>
  ["BEGIN:VCALENDAR", "VERSION:2.0", ...lines, "END:VCALENDAR"].join("\r\n");
const vevent = (...lines: string[]) => [
  "BEGIN:VEVENT",
  "UID:test-1",
  "SUMMARY:测试",
  ...lines,
  "END:VEVENT",
];
const dbs: SmokeNotesDatabase[] = [];
afterEach(async () => {
  await Promise.all(dbs.map((db) => db.delete()));
  dbs.length = 0;
});
function setup() {
  const db = new SmokeNotesDatabase(`import-${crypto.randomUUID()}`);
  dbs.push(db);
  return {
    db,
    repo: new LocalRepository(db, { workspaceId: "one", deviceId: "one" }),
  };
}
it("converts a dated instant across the date line and does not move all-day events", () => {
  expect(
    convertCalendarTime(
      "2026-10-24T09:00",
      "Asia/Hong_Kong",
      "America/Los_Angeles",
    ),
  ).toBe("2026-10-23T18:00");
  expect(
    projectCalendarEvents(
      [event()],
      "2026-10-23",
      "2026-10-23",
      "America/Los_Angeles",
    )[0],
  ).toMatchObject({
    start: "2026-10-23T18:00",
    end: "2026-10-23T19:30",
    occurrenceDate: "2026-10-24",
    source: { start: input.start },
  });
  expect(
    projectCalendarEvents(
      [
        event({
          allDay: true,
          start: "2026-10-24T00:00",
          end: "2026-10-26T00:00",
        }),
      ],
      "2026-10-24",
      "2026-10-24",
      "America/Los_Angeles",
    )[0].start,
  ).toBe("2026-10-24T00:00");
});
it("keeps recurring source wall time while observing DST and skips nonexistent gap instances", () => {
  const e = event({
    start: "2026-03-07T09:00",
    end: "2026-03-07T10:00",
    timeZone: "America/New_York",
    repeat: { frequency: "daily", interval: 1, count: 3 },
  });
  expect(
    projectCalendarEvents([e], "2026-03-07", "2026-03-09", "UTC").map(
      (e) => e.start,
    ),
  ).toEqual(["2026-03-07T14:00", "2026-03-08T13:00", "2026-03-09T13:00"]);
  expect(() =>
    validateCalendarEvent({
      ...e,
      start: "2026-03-08T02:30",
      end: "2026-03-08T03:30",
    }),
  ).toThrow(/夏令时/);
  const gaps = projectCalendarEvents(
    [{ ...e, start: "2026-03-07T02:30", end: "2026-03-07T03:30" }],
    "2026-03-07",
    "2026-03-09",
    "UTC",
  );
  expect(gaps.map((e) => e.occurrenceDate)).toEqual([
    "2026-03-07",
    "2026-03-09",
  ]);
  expect(
    new Date(
      calendarInstant("2026-11-01T01:30", "America/New_York"),
    ).toISOString(),
  ).toBe("2026-11-01T05:30:00.000Z");
});
it("validates zones for timed and all-day records", () => {
  for (const allDay of [false, true])
    expect(() =>
      validateCalendarEvent({
        ...input,
        allDay,
        start: "2026-10-24T00:00",
        end: "2026-10-25T00:00",
        timeZone: "Invalid/City",
      }),
    ).toThrow(/时区/);
});
it("parses JSON planning with typed timed events, daily tasks, and exclusive all-day ends", () => {
  const plan = parseCalendarImport(
    JSON.stringify({
      version: 1,
      timeZone: "Asia/Tokyo",
      events: [
        {
          title: "假期",
          start: "2026-10-24",
          end: "2026-10-27",
          allDay: true,
          type: "生活",
        },
      ],
      todos: [
        {
          text: "读书",
          date: "2026-10-24",
          time: "20:30",
          repeat: { kind: "daily" },
        },
      ],
    }),
  );
  expect(plan.items[0]).toMatchObject({
    kind: "event",
    typeName: "生活",
    input: {
      start: "2026-10-24T00:00",
      end: "2026-10-27T00:00",
      timeZone: "Asia/Tokyo",
    },
  });
  expect(plan.items[1]).toMatchObject({
    kind: "todo",
    input: { time: "20:30", repeat: { kind: "daily" } },
  });
});
it("reads UTC and TZID times, folded descriptions, all-day spans and default durations", () => {
  const plan = parseCalendarImport(
    ics(
      ...vevent(
        "DTSTART:20261024T010000Z",
        "DTEND:20261024T023000Z",
        "DESCRIPTION:hello\\nworld",
        " folded",
        "CATEGORIES:学习",
      ),
    ),
  );
  expect(plan.items[0]).toMatchObject({
    kind: "event",
    typeName: "学习",
    input: {
      start: "2026-10-24T01:00",
      end: "2026-10-24T02:30",
      timeZone: "UTC",
      notes: "hello\nworldfolded",
    },
  });
  expect(
    parseCalendarImport(
      ics(
        ...vevent(
          "DTSTART;TZID=America/New_York:20261024T090000",
          "DURATION:PT90M",
        ),
      ),
    ).items[0],
  ).toMatchObject({
    input: {
      start: "2026-10-24T09:00",
      end: "2026-10-24T10:30",
      timeZone: "America/New_York",
    },
  });
  expect(
    parseCalendarImport(
      ics(
        ...vevent("DTSTART;VALUE=DATE:20261024", "DTEND;VALUE=DATE:20261027"),
      ),
    ).items[0],
  ).toMatchObject({ input: { allDay: true, end: "2026-10-27T00:00" } });
  expect(
    parseCalendarImport(ics(...vevent("DTSTART:20261024T090000"))).warnings,
  ).toHaveLength(1);
});
it("preserves exclusions and edited/cancelled occurrences from ICS", () => {
  const plan = parseCalendarImport(
    ics(
      ...vevent(
        "DTSTART;TZID=Asia/Hong_Kong:20261024T090000",
        "DTEND;TZID=Asia/Hong_Kong:20261024T100000",
        "RRULE:FREQ=DAILY;COUNT=4",
        "EXDATE;TZID=Asia/Hong_Kong:20261025T090000",
      ),
      ...vevent(
        "RECURRENCE-ID;TZID=Asia/Hong_Kong:20261026T090000",
        "DTSTART;TZID=Asia/Hong_Kong:20261026T110000",
        "DTEND;TZID=Asia/Hong_Kong:20261026T120000",
      ),
      ...vevent(
        "RECURRENCE-ID;TZID=Asia/Hong_Kong:20261027T090000",
        "STATUS:CANCELLED",
      ),
    ),
  );
  expect(plan.items[0]).toMatchObject({
    input: { repeat: { frequency: "daily", count: 4 } },
    exceptions: {
      "2026-10-25": null,
      "2026-10-26": { start: "2026-10-26T11:00" },
      "2026-10-27": null,
    },
  });
});
it("does not silently simplify unsupported ICS recurrence or custom zones", () => {
  for (const rule of [
    "FREQ=HOURLY",
    "FREQ=MONTHLY;BYMONTH=3",
    "FREQ=YEARLY;BYDAY=1MO",
    "FREQ=DAILY;BYHOUR=9",
    "FREQ=MONTHLY;BYDAY=1MO;BYSETPOS=2",
  ])
    expect(() =>
      parseCalendarImport(
        ics(
          ...vevent(
            "DTSTART:20261024T090000",
            "DTEND:20261024T100000",
            `RRULE:${rule}`,
          ),
        ),
      ),
    ).toThrow();
  expect(() =>
    parseCalendarImport(
      ics(...vevent("DTSTART;TZID=Custom/Zone:20261024T090000")),
    ),
  ).toThrow(/时区/);
  expect(() =>
    parseCalendarImport(ics("BEGIN:VTODO", "SUMMARY:任务", "END:VTODO")),
  ).toThrow(/VTODO/);
});
it("respects a time-specific UNTIL cutoff and monthly ordinal weekday", () => {
  const plan = parseCalendarImport(
    ics(
      ...vevent(
        "DTSTART;TZID=Asia/Hong_Kong:20261024T090000",
        "DTEND;TZID=Asia/Hong_Kong:20261024T100000",
        "RRULE:FREQ=DAILY;UNTIL=20261026T003000Z",
      ),
    ),
  );
  expect(plan.items[0].input.repeat).toMatchObject({ until: "2026-10-25" });
  expect(
    parseCalendarImport(
      ics(
        ...vevent("DTSTART:20261024T090000", "RRULE:FREQ=MONTHLY;BYDAY=-1FR"),
      ),
    ).items[0].input.repeat,
  ).toMatchObject({ nthWeekday: { ordinal: -1, weekday: 5 } });
});
it("rejects invalid files before changing data", async () => {
  const { repo, db } = setup();
  for (const raw of [
    { version: 2, events: [input] },
    { version: 1, events: [input], todos: [{ text: "x", date: "2026-02-30" }] },
    {
      version: 1,
      events: [input],
      todos: [
        {
          text: "x",
          date: "2026-10-24",
          repeat: { kind: "weekly", weekdays: [] },
        },
      ],
    },
  ])
    await expect(
      repo.importCalendarPlan(JSON.stringify(raw)),
    ).rejects.toThrow();
  expect(await db.calendarEvents.count()).toBe(0);
  expect(await db.todos.count()).toBe(0);
  expect(await db.operations.count()).toBe(0);
  expect(() => parseCalendarImport("x".repeat(2_000_001))).toThrow(/2 MB/);
  expect(() =>
    parseCalendarImport(
      JSON.stringify({
        version: 1,
        events: Array.from({ length: 501 }, () => input),
      }),
    ),
  ).toThrow(/500/);
});
it("imports atomically, reuses labels, deduplicates after edits and isolates workspaces", async () => {
  const { repo, db } = setup();
  const data = JSON.stringify({
    version: 1,
    events: [{ ...input, id: "event-1", type: "学习" }],
    todos: [
      {
        text: "阅读",
        id: "task-1",
        date: "2026-10-24",
        time: "20:30",
        type: "学习",
      },
    ],
  });
  expect(await repo.importCalendarPlan(data)).toEqual({
    imported: 2,
    skipped: 0,
  });
  expect(await repo.listPlannerTypes()).toHaveLength(1);
  expect(await repo.listCalendarEvents()).toHaveLength(1);
  const saved = (await repo.listCalendarEvents())[0];
  await repo.saveCalendarEvent({ ...saved, title: "已修改" }, saved.id);
  const todo = (await db.todos.toArray())[0];
  await repo.savePlannerTodo(
    { text: "改过的阅读", notes: "", date: "2026-10-24" },
    todo,
  );
  expect(await repo.importCalendarPlan(data)).toEqual({
    imported: 0,
    skipped: 2,
  });
  const other = new LocalRepository(db, {
    workspaceId: "other",
    deviceId: "one",
  });
  expect(await other.importCalendarPlan(data)).toEqual({
    imported: 2,
    skipped: 0,
  });
  expect(await repo.listPlannerTypes()).toHaveLength(1);
});
it("rolls back a mid-batch persistence failure including new types and todo operations", async () => {
  const { repo, db } = setup();
  let count = 0;
  db.calendarEvents.hook("creating", () => {
    if (++count === 2) throw new Error("storage failure");
  });
  await expect(
    repo.importCalendarPlan(
      JSON.stringify({
        version: 1,
        events: [
          { ...input, type: "新标签" },
          { ...input, title: "第二项", type: "新标签" },
        ],
      }),
    ),
  ).rejects.toThrow("storage failure");
  expect(await db.calendarEvents.count()).toBe(0);
  expect(await db.plannerTypes.count()).toBe(0);
  expect(await db.operations.count()).toBe(0);
});
