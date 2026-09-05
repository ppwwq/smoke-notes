import { describe, expect, it, vi } from "vitest";
import { registerNoteMousePassthrough } from "./note-mouse-passthrough";

describe("note window mouse IPC", () => {
  function setup() {
    const handlers = new Map<
      string,
      Parameters<
        Parameters<typeof registerNoteMousePassthrough>[0]["handle"]
      >[1]
    >();
    const window = {
      isDestroyed: () => false,
      setIgnoreMouseEvents: vi.fn(),
      getContentBounds: () => ({ x: -500, y: 100 }),
      webContents: { getZoomFactor: () => 1.25 },
    };
    const resolve = vi.fn(() => window);
    registerNoteMousePassthrough(
      {
        handle: (name, callback) => {
          handlers.set(name, callback);
        },
      },
      resolve,
      new Map([[7, "note-1"]]),
      () => ({ x: -375, y: 225 }),
    );
    return { handlers, window, resolve, event: { sender: { id: 7 } } };
  }

  it("forwards mouse movement while ignoring clicks, and restores input", () => {
    const { handlers, window, event } = setup();
    handlers.get("note-window:mouse-passthrough")!(event, true);
    expect(window.setIgnoreMouseEvents).toHaveBeenLastCalledWith(true, {
      forward: true,
    });
    handlers.get("note-window:mouse-passthrough")!(event, false);
    expect(window.setIgnoreMouseEvents).toHaveBeenLastCalledWith(false);
  });

  it("rejects main/unknown windows and non-boolean requests without changing input", () => {
    const { handlers, window, event } = setup();
    const set = handlers.get("note-window:mouse-passthrough")!;
    expect(() => set({ sender: { id: 8 } }, true)).toThrow();
    expect(() => set(event, "true")).toThrow();
    expect(() =>
      handlers.get("note-window:pointer")!({ sender: { id: 8 } }),
    ).toThrow();
    expect(window.setIgnoreMouseEvents).not.toHaveBeenCalled();
  });

  it("changes only the sender window and rejects a destroyed window", () => {
    const { handlers, window, resolve, event } = setup();
    handlers.get("note-window:mouse-passthrough")!(event, true);
    expect(resolve).toHaveBeenCalledExactlyOnceWith(7);
    window.setIgnoreMouseEvents.mockClear();
    vi.spyOn(window, "isDestroyed").mockReturnValue(true);
    expect(() =>
      handlers.get("note-window:mouse-passthrough")!(event, true),
    ).toThrow();
    expect(window.setIgnoreMouseEvents).not.toHaveBeenCalled();
  });

  it("converts screen DIP to renderer CSS pixels including negative monitor positions", () => {
    const { handlers, event } = setup();
    expect(handlers.get("note-window:pointer")!(event)).toEqual({
      x: 100,
      y: 100,
    });
  });
});
