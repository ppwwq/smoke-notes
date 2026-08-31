import { describe, expect, it } from "vitest";
import { normalizeNoteWindowState } from "../src/index";

describe("normalizeNoteWindowState", () => {
  it("clamps unsafe values and keeps a note-local window state", () => {
    expect(
      normalizeNoteWindowState("note-1", {
        x: 120.8,
        y: 48.2,
        width: 80,
        height: 90,
        opacity: 0.1,
        alwaysOnTop: true,
        isOpen: true,
        lastOpenedAt: "2026-08-29T08:00:00.000Z",
      }),
    ).toEqual({
      noteId: "note-1",
      x: 121,
      y: 48,
      width: 250,
      height: 180,
      backgroundOpacity: 0.45,
      alwaysOnTop: true,
      isOpen: true,
      lastOpenedAt: "2026-08-29T08:00:00.000Z",
    });
  });

  it("uses stable defaults when persisted state is missing or invalid", () => {
    expect(
      normalizeNoteWindowState("note-2", {
        backgroundOpacity: Number.NaN,
        lastOpenedAt: "not-a-date",
      }),
    ).toEqual({
      noteId: "note-2",
      width: 360,
      height: 420,
      backgroundOpacity: 0.92,
      alwaysOnTop: false,
      isOpen: false,
    });
  });
});
