import { describe, expect, it } from "vitest";
import { planningPayload, supportsTodoPlanning } from "./planning";

describe("planning mutation payload", () => {
  it("preserves the full document, clocks and previous revisions", () => {
    const planning = {
      version: 1,
      kind: "series",
      revisions: [
        { id: "past", text: "Previous name" },
        { id: "new", text: "New name" },
      ],
      clocks: { text: { at: "2026-10-20T00:00:00Z", id: "edit-1" } },
      extension: { retained: true },
    };
    expect(planningPayload({ text: "New name", planning })).toEqual({
      planning,
    });
  });

  it("leaves legacy payloads omitted instead of inventing null metadata", () => {
    expect(planningPayload({ text: "Legacy task" })).toEqual({});
  });

  it.each([
    null,
    [],
    "text",
    {},
    { version: 2, kind: "task" },
    { version: 1, kind: "unknown" },
  ])("rejects invalid metadata %j before mutation", (planning) => {
    expect(() => planningPayload({ planning })).toThrow(
      "invalid_todo_planning",
    );
  });

  it("rejects oversized metadata rather than dropping it", () => {
    expect(() =>
      planningPayload({
        planning: { version: 1, kind: "task", notes: "x".repeat(1_000_000) },
      }),
    ).toThrow("invalid_todo_planning");
  });

  it("requires an explicit supported capability version", () => {
    expect(supportsTodoPlanning({ todoPlanning: 1 })).toBe(true);
    for (const value of [null, {}, { todoPlanning: "1" }, { todoPlanning: 2 }])
      expect(supportsTodoPlanning(value)).toBe(false);
  });
});
