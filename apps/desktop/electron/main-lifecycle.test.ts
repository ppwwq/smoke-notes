import { EventEmitter } from "node:events";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { runInNewContext } from "node:vm";
import { describe, expect, it, vi } from "vitest";

// Exercise the real main-process IPC and window callbacks. Electron invalidates
// native window properties before emitting `closed`.
async function startMain() {
  type Handler = (
    event: { sender: { id: number } },
    ...args: unknown[]
  ) => unknown;
  const handlers = new Map<string, Handler>();
  const files = new Map<string, string>();
  const windows: TestWindow[] = [];
  class TestWindow extends EventEmitter {
    private destroyed = false;
    private readonly contents = Object.assign(new EventEmitter(), {
      id: windows.length + 1,
      setWindowOpenHandler: vi.fn(),
      send: vi.fn(),
    });
    constructor() {
      super();
      windows.push(this);
    }
    get webContents() {
      if (this.destroyed) throw new TypeError("Object has been destroyed");
      return this.contents;
    }
    static fromWebContents(sender: { id: number }) {
      return windows.find(
        (window) => !window.destroyed && window.contents.id === sender.id,
      );
    }
    static getAllWindows() {
      return windows.filter((window) => !window.destroyed);
    }
    show = vi.fn();
    focus = vi.fn();
    hide = vi.fn();
    setMenuBarVisibility = vi.fn();
    setIgnoreMouseEvents = vi.fn();
    loadURL = vi.fn(async () => {});
    getBounds = () => ({ x: 0, y: 0, width: 490, height: 500 });
    isAlwaysOnTop = () => false;
    isDestroyed = () => this.destroyed;
    destroy() {
      this.destroyed = true;
      this.emit("closed");
    }
  }
  let ready: Promise<unknown> | undefined;
  const electron = {
    app: {
      isPackaged: false,
      requestSingleInstanceLock: () => true,
      getPath: () => "test-user-data",
      on: vi.fn(),
      whenReady: () => ({
        then: (callback: () => Promise<unknown>) => (ready = callback()),
      }),
    },
    BrowserWindow: TestWindow,
    ipcMain: {
      handle: (channel: string, handler: Handler) =>
        handlers.set(channel, handler),
    },
    session: {
      defaultSession: {
        setPermissionRequestHandler: vi.fn(),
        webRequest: { onHeadersReceived: vi.fn() },
      },
    },
    nativeImage: { createEmpty: vi.fn() },
    Menu: { buildFromTemplate: vi.fn() },
    Tray: class extends EventEmitter {
      setToolTip = vi.fn();
      setContextMenu = vi.fn();
    },
  };
  const bundlePath = resolve("apps/desktop/dist-electron/main.cjs");
  const require = createRequire(bundlePath);
  runInNewContext(readFileSync(bundlePath, "utf8"), {
    require: (id: string) => {
      if (id === "electron") return electron;
      if (id === "node:fs" || id === "fs")
        return {
          existsSync: (path: string) => files.has(path),
          readFileSync: (path: string) => files.get(path),
          writeFileSync: (path: string, value: string) =>
            files.set(path, value),
        };
      return require(id);
    },
    __dirname: dirname(bundlePath),
    process: { argv: ["smoke-notes"] },
    console,
    setTimeout,
    clearTimeout,
  });
  await ready;
  const invoke = (channel: string, senderId: number, ...args: unknown[]) => {
    const handler = handlers.get(channel);
    if (!handler) throw new Error(`Missing IPC handler: ${channel}`);
    return handler({ sender: { id: senderId } }, ...args);
  };
  const open = async (noteId: string) => {
    await invoke("note-window:open", windows[0].webContents.id, noteId);
    return windows[windows.length - 1];
  };
  return { invoke, open, windows };
}

describe("main-process note window lifecycle", () => {
  it("cleans up a destroyed note without reading its native properties", async () => {
    const { open, invoke } = await startMain();
    const note = await open("note-1");
    const senderId = note.webContents.id;

    expect(() => note.destroy()).not.toThrow();
    expect(() =>
      invoke("note-window:mouse-passthrough", senderId, false),
    ).toThrow("Not a note window");
  });

  it("switches to an already open note and removes the destroyed duplicate identity", async () => {
    const { open, invoke } = await startMain();
    const source = await open("source");
    const target = await open("target");
    const sourceId = source.webContents.id;
    const targetId = target.webContents.id;

    await invoke("note-window:switch", sourceId, "target");

    expect(target.isDestroyed()).toBe(true);
    expect(source.isDestroyed()).toBe(false);
    expect(() =>
      invoke("note-window:mouse-passthrough", targetId, false),
    ).toThrow("Not a note window");
    expect(() =>
      invoke("note-window:mouse-passthrough", sourceId, false),
    ).not.toThrow();
    // Native close waits for the renderer to save before releasing the process.
    const preventDefault = vi.fn();
    source.emit("close", { preventDefault });
    expect(preventDefault).toHaveBeenCalledOnce();
    expect(source.webContents.send).toHaveBeenCalledWith(
      "note-window:request-close",
    );
    expect(source.isDestroyed()).toBe(false);
    await invoke("note-window:close", sourceId, "target");
    expect(source.isDestroyed()).toBe(true);
    expect(invoke("note-window:get-state", 1, "target")).toMatchObject({
      noteId: "target",
      isOpen: false,
    });
    expect(() =>
      invoke("note-window:mouse-passthrough", sourceId, false),
    ).toThrow("Not a note window");
  });

  it("releases closed renderers while retaining the main window and reopen state", async () => {
    const { open, invoke, windows } = await startMain();
    const note = await open("note-1");
    const senderId = note.webContents.id;
    note.emit("move");
    await invoke("note-window:close", senderId, "note-1");
    expect(note.isDestroyed()).toBe(true);
    expect(windows[0].isDestroyed()).toBe(false);
    expect(invoke("note-window:get-state", 1, "note-1")).toMatchObject({
      noteId: "note-1",
      x: 70,
      y: 0,
      width: 420,
      height: 500,
      isOpen: false,
    });
    const reopened = await open("note-1");
    expect(reopened).not.toBe(note);
    expect(reopened.isDestroyed()).toBe(false);
  });
});
