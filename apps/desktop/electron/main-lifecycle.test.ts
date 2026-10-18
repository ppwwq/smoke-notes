import { EventEmitter } from "node:events";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { runInNewContext } from "node:vm";
import { describe, expect, it, vi } from "vitest";

// Exercise the real main-process IPC and window callbacks. Electron invalidates
// native window properties before emitting `closed`.
async function startMain(previewMode = false) {
  const paths = new Map<string, string>();
  const startup: string[] = [];
  const trayCreated = vi.fn();
  const beforeRequest = vi.fn();
  type Handler = (
    event: { sender: { id: number } },
    ...args: unknown[]
  ) => unknown;
  const handlers = new Map<string, Handler>();
  const files = new Map<string, string>();
  const windows: TestWindow[] = [];
  const appEvents = new Map<
    string,
    (event: { preventDefault(): void }) => void
  >();
  const quit = vi.fn();
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
    showInactive = vi.fn();
    focus = vi.fn();
    hide = vi.fn();
    setMenuBarVisibility = vi.fn();
    setIgnoreMouseEvents = vi.fn();
    loadURL = vi.fn(async () => {});
    loadFile = vi.fn(async () => {});
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
      setPath: (name: string, path: string) => {
        paths.set(name, path);
        startup.push(name);
      },
      requestSingleInstanceLock: () => {
        startup.push("lock");
        return true;
      },
      getPath: (name: string) => paths.get(name) ?? "test-user-data",
      on: (
        event: string,
        listener: (event: { preventDefault(): void }) => void,
      ) => appEvents.set(event, listener),
      quit,
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
        webRequest: {
          onHeadersReceived: vi.fn(),
          onBeforeRequest: beforeRequest,
        },
      },
    },
    nativeImage: { createEmpty: vi.fn() },
    Menu: { buildFromTemplate: vi.fn() },
    Tray: class extends EventEmitter {
      constructor() {
        super();
        trayCreated();
      }
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
          mkdirSync: vi.fn(),
          existsSync: (path: string) => files.has(path),
          readFileSync: (path: string) => files.get(path),
          writeFileSync: (path: string, value: string) =>
            files.set(path, value),
        };
      return require(id);
    },
    __dirname: dirname(bundlePath),
    process: {
      argv: previewMode ? ["smoke-notes", "--preview"] : ["smoke-notes"],
    },
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
  const requestQuit = () => {
    const preventDefault = vi.fn();
    appEvents.get("before-quit")?.({ preventDefault });
    return preventDefault;
  };
  return {
    invoke,
    open,
    windows,
    requestQuit,
    quit,
    paths,
    startup,
    trayCreated,
    beforeRequest,
    files,
  };
}

describe("main-process note window lifecycle", () => {
  it("isolates preview storage before the instance lock, denies external requests and exits after its final note", async () => {
    const {
      invoke,
      open,
      windows,
      paths,
      startup,
      trayCreated,
      beforeRequest,
      files,
      quit,
    } = await startMain(true);
    expect(startup.slice(0, 3)).toEqual(["userData", "sessionData", "lock"]);
    expect(paths.get("userData")).toBe(paths.get("sessionData"));
    expect(paths.get("userData")).toContain("desktop-preview");
    expect(invoke("app:preview-mode", 1)).toBe(true);
    expect(invoke("app:set-launch-at-login", 1, true)).toBe(false);
    expect(trayCreated).not.toHaveBeenCalled();
    expect(windows[0].loadFile).toHaveBeenCalled();
    expect(windows[0].show).not.toHaveBeenCalled();
    const callback = vi.fn();
    const filter = beforeRequest.mock.calls[0][0];
    filter({ url: "https://example.com" }, callback);
    expect(callback).toHaveBeenLastCalledWith({ cancel: true });
    filter({ url: "file:///preview/index.html" }, callback);
    expect(callback).toHaveBeenLastCalledWith({ cancel: false });
    const note = await open("sample");
    await open("sample");
    expect(note.showInactive).toHaveBeenCalled();
    expect(note.focus).not.toHaveBeenCalled();
    invoke("window:set-background-opacity", note.webContents.id, 0.28);
    expect(
      [...files.keys()].every((path) =>
        path.startsWith(paths.get("userData")!),
      ),
    ).toBe(true);
    await invoke("note-window:close", note.webContents.id, "sample");
    expect(quit).toHaveBeenCalledOnce();
  });

  it("persists a clear note background while retaining the main window opacity floor", async () => {
    const { open, invoke } = await startMain();
    const note = await open("clear");
    const sender = note.webContents.id;
    expect(invoke("window:set-background-opacity", sender, 0.28)).toBe(0.28);
    expect(invoke("note-window:get-state", sender, "clear")).toMatchObject({
      backgroundOpacity: 0.28,
    });
    expect(invoke("window:set-background-opacity", 1, 0.28)).toBe(0.45);
  });
  it("cleans up a destroyed note without reading its native properties", async () => {
    const { open, invoke } = await startMain();
    const note = await open("note-1");
    const senderId = note.webContents.id;

    expect(() => note.destroy()).not.toThrow();
    expect(() =>
      invoke("note-window:mouse-passthrough", senderId, false),
    ).toThrow("Not a note window");
  });

  it("focuses an already open target and preserves both window identities and drafts", async () => {
    const { open, invoke } = await startMain();
    const source = await open("source");
    const target = await open("target");
    const sourceId = source.webContents.id;
    const targetId = target.webContents.id;

    await invoke("note-window:switch", sourceId, "target");

    expect(target.isDestroyed()).toBe(false);
    expect(target.focus).toHaveBeenCalledOnce();
    expect(source.isDestroyed()).toBe(false);
    expect(() =>
      invoke("note-window:mouse-passthrough", targetId, false),
    ).not.toThrow();
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
    await invoke("note-window:close", sourceId, "source");
    expect(source.isDestroyed()).toBe(true);
    expect(invoke("note-window:get-state", 1, "source")).toMatchObject({
      noteId: "source",
      isOpen: false,
    });
    expect(() =>
      invoke("note-window:mouse-passthrough", sourceId, false),
    ).toThrow("Not a note window");
  });

  it("cancels quit when an acknowledged document reloads", async () => {
    const { open, invoke, windows, requestQuit, quit } = await startMain();
    const note = await open("note-1");
    requestQuit();
    await invoke("app:quit-result", note.webContents.id, 1, true);
    note.webContents.emit("did-start-loading");
    await invoke("app:quit-result", windows[0].webContents.id, 1, true);
    expect(quit).not.toHaveBeenCalled();
    expect(windows[0].webContents.send).toHaveBeenCalledWith(
      "app:cancel-quit",
      1,
      expect.stringContaining("重新载入"),
    );
  });

  it("does not quit during an already pending note navigation", async () => {
    const { open, invoke, requestQuit, quit } = await startMain();
    const note = await open("note-1");
    let loaded!: () => void;
    note.loadURL.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          loaded = resolve;
        }),
    );
    const switching = invoke(
      "note-window:switch",
      note.webContents.id,
      "note-2",
    );
    requestQuit();
    await invoke("app:quit-result", note.webContents.id, 1, true);
    await invoke("app:quit-result", 1, 1, true);
    expect(quit).not.toHaveBeenCalled();
    loaded();
    await switching;
    requestQuit();
    await invoke("app:quit-result", note.webContents.id, 2, true);
    await invoke("app:quit-result", 1, 2, true);
    expect(quit).toHaveBeenCalledOnce();
  });

  it("intercepts quit until the main editor and every note have saved", async () => {
    const { open, invoke, windows, requestQuit, quit } = await startMain();
    const note = await open("note-1");
    const preventDefault = requestQuit();
    expect(preventDefault).toHaveBeenCalledOnce();
    expect(quit).not.toHaveBeenCalled();
    expect(windows[0].webContents.send).toHaveBeenCalledWith(
      "app:prepare-quit",
      1,
    );
    expect(note.webContents.send).toHaveBeenCalledWith("app:prepare-quit", 1);
    await invoke("app:quit-result", 1, 1, true);
    expect(quit).not.toHaveBeenCalled();
    await invoke("app:quit-result", note.webContents.id, 1, true);
    expect(quit).toHaveBeenCalledOnce();
    expect(requestQuit()).not.toHaveBeenCalled();
    expect(invoke("note-window:get-state", 1, "note-1")).toMatchObject({
      isOpen: true,
    });
  });

  it("cancels quitting on save failure and permits a later successful retry", async () => {
    const { open, invoke, windows, requestQuit, quit } = await startMain();
    const note = await open("note-1");
    requestQuit();
    await invoke("app:quit-result", 1, 1, true);
    await invoke("app:quit-result", note.webContents.id, 1, false);
    expect(quit).not.toHaveBeenCalled();
    expect(windows[0].webContents.send).toHaveBeenCalledWith(
      "app:cancel-quit",
      1,
      expect.stringContaining("保存失败"),
    );
    expect(note.isDestroyed()).toBe(false);
    requestQuit();
    await invoke("app:quit-result", 1, 2, true);
    await invoke("app:quit-result", note.webContents.id, 2, true);
    expect(quit).toHaveBeenCalledOnce();
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
      x: 0,
      y: 0,
      width: 490,
      height: 500,
      isOpen: false,
    });
    const reopened = await open("note-1");
    expect(reopened).not.toBe(note);
    expect(reopened.isDestroyed()).toBe(false);
  });
});
