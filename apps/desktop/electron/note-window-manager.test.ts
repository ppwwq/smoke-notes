import { describe, expect, it, vi } from "vitest";
import type { NoteWindowState } from "@smoke-notes/core";
import {
  NoteWindowManager,
  type NoteWindowHandle,
  type NoteWindowStateStore,
} from "./note-window-manager";

function createStore(
  initial: NoteWindowState[] = [],
): NoteWindowStateStore & { states: NoteWindowState[] } {
  return {
    states: initial,
    readAll() {
      return this.states;
    },
    writeAll(states) {
      this.states = states;
    },
  };
}

function createHandle(): NoteWindowHandle & {
  shown: number;
  focused: number;
  hidden: number;
  destroyed: boolean;
  navigated: string[];
} {
  return {
    shown: 0,
    focused: 0,
    hidden: 0,
    destroyed: false,
    navigated: [],
    show() {
      this.shown += 1;
    },
    focus() {
      this.focused += 1;
    },
    hide() {
      this.hidden += 1;
    },
    destroy() {
      this.destroyed = true;
    },
    isDestroyed() {
      return this.destroyed;
    },
    async navigate(noteId) {
      this.navigated.push(noteId);
    },
  };
}

describe("NoteWindowManager", () => {
  it("focuses an existing note window instead of opening a duplicate", async () => {
    const store = createStore();
    const handle = createHandle();
    const factory = vi.fn(async () => handle);
    const manager = new NoteWindowManager(store, factory);

    await manager.open("note-1");
    await manager.open("note-1");

    expect(factory).toHaveBeenCalledTimes(1);
    expect(handle.focused).toBe(1);
    expect(store.states[0]).toMatchObject({ noteId: "note-1", isOpen: true });
  });

  it("hides a note without deleting its saved state", async () => {
    const store = createStore();
    const handle = createHandle();
    const manager = new NoteWindowManager(store, async () => handle);

    await manager.open("note-2");
    manager.hide("note-2");

    expect(handle.hidden).toBe(1);
    expect(store.states[0]).toMatchObject({ noteId: "note-2", isOpen: false });
  });

  it("restores only windows that were open at shutdown", async () => {
    const store = createStore([
      {
        noteId: "open",
        width: 420,
        height: 500,
        backgroundOpacity: 0.8,
        alwaysOnTop: true,
        isOpen: true,
      },
      {
        noteId: "closed",
        width: 360,
        height: 420,
        backgroundOpacity: 0.92,
        alwaysOnTop: false,
        isOpen: false,
      },
    ]);
    const factory = vi.fn(async () => createHandle());
    const manager = new NoteWindowManager(store, factory);

    await manager.restoreOpen();

    expect(factory).toHaveBeenCalledTimes(1);
    expect(factory).toHaveBeenCalledWith(
      expect.objectContaining({ noteId: "open", width: 420 }),
    );
  });

  it("keeps the four most recently opened note ids in local state", async () => {
    let tick = 0;
    const store = createStore();
    const manager = new NoteWindowManager(
      store,
      async () => createHandle(),
      () => new Date(`2026-08-29T08:00:0${++tick}.000Z`),
    );

    for (const id of ["one", "two", "three", "four", "five"]) {
      await manager.open(id);
    }

    expect(manager.getRecentNoteIds(4)).toEqual([
      "five",
      "four",
      "three",
      "two",
    ]);
  });

  it("reuses the source window and destroys an already open target after navigation", async () => {
    const store = createStore();
    const handles = new Map<string, ReturnType<typeof createHandle>>();
    const manager = new NoteWindowManager(store, async (state) => {
      const handle = createHandle();
      handles.set(state.noteId, handle);
      return handle;
    });
    await manager.open("source");
    manager.update("source", {
      x: 42,
      y: 68,
      width: 520,
      height: 430,
      backgroundOpacity: 0.77,
      alwaysOnTop: true,
    });
    await manager.open("target");

    await expect(manager.switch("source", "target")).resolves.toBeUndefined();

    expect(handles.get("source")?.navigated).toEqual(["target"]);
    expect(handles.get("target")?.destroyed).toBe(true);
    expect(store.states).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ noteId: "source", isOpen: false }),
        expect.objectContaining({
          noteId: "target",
          isOpen: true,
          x: 42,
          y: 68,
          width: 520,
          height: 430,
          backgroundOpacity: 0.77,
          alwaysOnTop: true,
        }),
      ]),
    );
  });

  it("exposes inherited target state while the source window is navigating", async () => {
    const store = createStore();
    const source = createHandle();
    source.navigate = vi.fn(async (noteId) => {
      expect(noteId).toBe("target");
      expect(manager.getState("target")).toMatchObject({
        noteId: "target",
        x: 42,
        y: 68,
        width: 520,
        height: 430,
        backgroundOpacity: 0.77,
        alwaysOnTop: true,
        isOpen: true,
      });
    });
    const manager = new NoteWindowManager(store, async () => source);
    await manager.open("source");
    const originalWriteAll = store.writeAll.bind(store);
    store.writeAll = vi.fn((states) => originalWriteAll(states));

    await manager.switch("source", "target", {
      x: 42,
      y: 68,
      width: 520,
      height: 430,
      backgroundOpacity: 0.77,
      alwaysOnTop: true,
    });

    expect(store.writeAll).toHaveBeenCalledOnce();
    expect(store.states).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ noteId: "source", isOpen: false }),
        expect.objectContaining({
          noteId: "target",
          x: 42,
          y: 68,
          width: 520,
          height: 430,
          backgroundOpacity: 0.77,
          alwaysOnTop: true,
          isOpen: true,
        }),
      ]),
    );
  });

  it("reuses the source window and its bounds for an unopened target", async () => {
    const store = createStore();
    const handle = createHandle();
    const manager = new NoteWindowManager(store, async () => handle);
    await manager.open("source");
    manager.update("source", { x: 42, y: 68, width: 520, height: 430 });

    await expect(manager.switch("source", "target")).resolves.toBeUndefined();

    expect(handle.navigated).toEqual(["target"]);
    expect(store.states).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ noteId: "source", isOpen: false }),
        expect.objectContaining({
          noteId: "target",
          isOpen: true,
          x: 42,
          y: 68,
          width: 520,
          height: 430,
        }),
      ]),
    );
  });

  it("keeps the source active when target navigation fails", async () => {
    const store = createStore();
    const handle = createHandle();
    handle.navigate = vi.fn(async () => {
      throw new Error("load failed");
    });
    const manager = new NoteWindowManager(store, async () => handle);
    await manager.open("source");

    await expect(manager.switch("source", "target")).rejects.toThrow(
      "load failed",
    );

    expect(store.states).toEqual([
      expect.objectContaining({ noteId: "source", isOpen: true }),
    ]);
  });

  it("keeps both windows active when replacing an open target fails", async () => {
    const store = createStore();
    const handles = new Map<string, ReturnType<typeof createHandle>>();
    const manager = new NoteWindowManager(store, async (state) => {
      const handle = createHandle();
      handles.set(state.noteId, handle);
      return handle;
    });
    await manager.open("source");
    await manager.open("target");
    handles.get("source")!.navigate = vi.fn(async () => {
      throw new Error("load failed");
    });

    await expect(manager.switch("source", "target")).rejects.toThrow(
      "load failed",
    );

    expect(handles.get("target")?.destroyed).toBe(false);
    expect(store.states).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ noteId: "source", isOpen: true }),
        expect.objectContaining({ noteId: "target", isOpen: true }),
      ]),
    );
  });

  it("rolls navigation back when the atomic state write fails", async () => {
    const store = createStore();
    const handles = new Map<string, ReturnType<typeof createHandle>>();
    const manager = new NoteWindowManager(store, async (state) => {
      const handle = createHandle();
      handles.set(state.noteId, handle);
      return handle;
    });
    await manager.open("source");
    manager.update("source", {
      x: 42,
      y: 68,
      width: 520,
      height: 430,
      backgroundOpacity: 0.77,
      alwaysOnTop: true,
    });
    await manager.open("target");
    const snapshot = structuredClone(store.states);
    store.writeAll = vi.fn(() => {
      throw new Error("write failed");
    });

    await expect(manager.switch("source", "target")).rejects.toThrow(
      "write failed",
    );

    expect(handles.get("source")?.navigated).toEqual(["target", "source"]);
    expect(handles.get("target")?.destroyed).toBe(false);
    expect(store.writeAll).toHaveBeenCalledOnce();
    expect(store.states).toEqual(snapshot);
    expect(manager.getState("target")).toEqual(
      snapshot.find((state) => state.noteId === "target"),
    );
  });

  it("preserves unrelated state changes made while the source is navigating", async () => {
    const store = createStore([
      {
        noteId: "other",
        width: 360,
        height: 420,
        backgroundOpacity: 0.92,
        alwaysOnTop: false,
        isOpen: true,
      },
    ]);
    const source = createHandle();
    const manager = new NoteWindowManager(store, async () => source);
    await manager.open("source");
    source.navigate = vi.fn(async () => {
      manager.update("other", { width: 777, backgroundOpacity: 0.66 });
    });

    await manager.switch("source", "target");

    expect(manager.getState("other")).toMatchObject({
      width: 777,
      backgroundOpacity: 0.66,
      isOpen: true,
    });
  });

  it("rejects a second switch that competes for the same target", async () => {
    const store = createStore();
    const handles = new Map<string, ReturnType<typeof createHandle>>();
    let finishFirstNavigation!: () => void;
    const firstNavigation = new Promise<void>((resolve) => {
      finishFirstNavigation = resolve;
    });
    const manager = new NoteWindowManager(store, async (state) => {
      const handle = createHandle();
      handles.set(state.noteId, handle);
      return handle;
    });
    await manager.open("source-a");
    await manager.open("source-b");
    handles.get("source-a")!.navigate = vi.fn(() => firstNavigation);

    const firstSwitch = manager.switch("source-a", "target");
    await vi.waitFor(() =>
      expect(handles.get("source-a")?.navigate).toHaveBeenCalledWith("target"),
    );

    await expect(manager.switch("source-b", "target")).rejects.toThrow(
      "already in progress",
    );
    finishFirstNavigation();
    await firstSwitch;
  });

  it("destroys the inconsistent source and preserves the write error when rollback also fails", async () => {
    const store = createStore();
    const handles = new Map<string, ReturnType<typeof createHandle>>();
    const manager = new NoteWindowManager(store, async (state) => {
      const handle = createHandle();
      handles.set(state.noteId, handle);
      return handle;
    });
    await manager.open("source");
    await manager.open("target");
    const source = handles.get("source")!;
    source.navigate = vi.fn(async (noteId) => {
      source.navigated.push(noteId);
      if (noteId === "source") throw new Error("rollback failed");
    });
    store.writeAll = vi.fn(() => {
      throw new Error("write failed");
    });

    let failure: unknown;
    try {
      await manager.switch("source", "target");
    } catch (error) {
      failure = error;
    }

    expect(failure).toBeInstanceOf(AggregateError);
    expect((failure as AggregateError).errors).toEqual([
      expect.objectContaining({ message: "write failed" }),
      expect.objectContaining({ message: "rollback failed" }),
    ]);
    expect((failure as AggregateError).cause).toEqual(
      expect.objectContaining({ message: "rollback failed" }),
    );
    expect(source.destroyed).toBe(true);
    expect(handles.get("target")?.destroyed).toBe(false);
  });

  it("keeps a committed switch successful when old-target destruction fails", async () => {
    const store = createStore();
    const handles = new Map<string, ReturnType<typeof createHandle>>();
    const manager = new NoteWindowManager(store, async (state) => {
      const handle = createHandle();
      handles.set(state.noteId, handle);
      return handle;
    });
    await manager.open("source");
    await manager.open("target");
    const source = handles.get("source")!;
    const oldTarget = handles.get("target")!;
    oldTarget.destroy = vi.fn(() => {
      throw new Error("destroy failed");
    });

    await expect(manager.switch("source", "target")).resolves.toBeUndefined();

    expect(oldTarget.hidden).toBe(1);
    await manager.open("target");
    expect(source.focused).toBe(1);
    expect(oldTarget.focused).toBe(0);
  });
});
