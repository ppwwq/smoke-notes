/// <reference types="node" />
import { readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";
import { projectCalendarEvents, type CalendarEvent } from "./calendar-events";
const fixtures = JSON.parse(
  readFileSync("packages/core/test-fixtures/calendar-contract.json", "utf8"),
) as Array<{
  name: string;
  from: string;
  to: string;
  event: Partial<CalendarEvent>;
  starts: string[];
}>;
describe("shared Android/web calendar contract", () => {
  for (const f of fixtures)
    it(f.name, () => {
      const event: CalendarEvent = {
        id: "contract",
        workspaceId: "synthetic",
        updatedAt: "2026-10-25T00:00:00Z",
        deletedAt: null,
        title: "synthetic",
        start: "",
        end: "",
        allDay: false,
        timeZone: "Asia/Hong_Kong",
        color: "purple",
        notes: "",
        location: "",
        url: "",
        exceptions: {},
        ...f.event,
      };
      expect(
        projectCalendarEvents([event], f.from, f.to).map((o) => o.start),
      ).toEqual(f.starts);
    });
});
