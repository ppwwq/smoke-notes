import {
  app,
  BrowserWindow,
  ipcMain,
  Menu,
  nativeImage,
  screen,
  session,
  Tray,
} from "electron";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  clampOpacity,
  normalizeNoteWindowState,
  type NoteWindowState,
  type WindowState,
} from "@smoke-notes/core";
import {
  NoteWindowManager,
  type NoteWindowStateStore,
} from "./note-window-manager";
import {
  ensureBackgroundLaunchAtLogin,
  readLaunchAtLogin,
  writeLaunchAtLogin,
} from "./launch-at-login";
import { registerSingleInstance, shouldShowMainWindow } from "./app-lifecycle";
import { registerNoteMousePassthrough } from "./note-mouse-passthrough";
import {
  createNoteWindowOptions,
  createWindowOptions,
  normalizeWindowState,
  toPersistedNoteWindowBounds,
} from "./window-config";

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let quitting = false;
let persistTimer: NodeJS.Timeout | null = null;
const notePersistTimers = new Map<string, NodeJS.Timeout>();
const noteIdByWebContents = new Map<number, string>();

function mainStatePath(): string {
  return join(app.getPath("userData"), "window-state.json");
}
function noteStatePath(): string {
  return join(app.getPath("userData"), "note-window-states.json");
}

function readMainState(): WindowState {
  try {
    const path = mainStatePath();
    return normalizeWindowState(
      existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : undefined,
    );
  } catch {
    return normalizeWindowState(undefined);
  }
}

function saveMainState(changes: Partial<WindowState> = {}): WindowState {
  const previous = readMainState();
  const bounds = mainWindow?.getBounds();
  const next = normalizeWindowState({
    ...previous,
    ...(bounds
      ? { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height }
      : {}),
    alwaysOnTop: mainWindow?.isAlwaysOnTop() ?? previous.alwaysOnTop,
    ...changes,
  });
  writeFileSync(mainStatePath(), JSON.stringify(next, null, 2), "utf8");
  return next;
}

const noteStateStore: NoteWindowStateStore = {
  readAll() {
    try {
      if (!existsSync(noteStatePath())) return [];
      const raw = JSON.parse(readFileSync(noteStatePath(), "utf8")) as unknown;
      if (!Array.isArray(raw)) return [];
      return raw
        .filter((item): item is Partial<NoteWindowState> & { noteId: string } =>
          Boolean(
            item &&
            typeof item === "object" &&
            typeof (item as { noteId?: unknown }).noteId === "string",
          ),
        )
        .map((item) => normalizeNoteWindowState(item.noteId, item));
    } catch {
      return [];
    }
  },
  writeAll(states) {
    writeFileSync(noteStatePath(), JSON.stringify(states, null, 2), "utf8");
  },
};

function configureRenderer(window: BrowserWindow) {
  window.setMenuBarVisibility(false);
  window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  window.webContents.on("will-navigate", (event, url) => {
    const allowedDevUrl =
      !app.isPackaged && url.startsWith("http://127.0.0.1:5173");
    if (!allowedDevUrl && !url.startsWith("file:")) event.preventDefault();
  });
}

async function loadRenderer(window: BrowserWindow, noteId?: string) {
  const query = noteId ? `?noteId=${encodeURIComponent(noteId)}` : "";
  if (app.isPackaged)
    await window.loadFile(
      join(__dirname, "../dist/index.html"),
      noteId ? { query: { noteId } } : undefined,
    );
  else await window.loadURL(`http://127.0.0.1:5173/${query}`);
}

const noteWindowManager = new NoteWindowManager(
  noteStateStore,
  async (state) => {
    const window = new BrowserWindow(
      createNoteWindowOptions(join(__dirname, "preload.cjs"), state),
    );
    noteIdByWebContents.set(window.webContents.id, state.noteId);
    configureRenderer(window);
    // A new document must never inherit the previous document's ignored-input state.
    window.webContents.on("did-start-loading", () =>
      window.setIgnoreMouseEvents(false),
    );
    window.webContents.on("render-process-gone", () =>
      window.setIgnoreMouseEvents(false),
    );
    const persist = () => {
      const currentNoteId = noteIdByWebContents.get(window.webContents.id);
      if (currentNoteId) scheduleNoteStateSave(currentNoteId, window);
    };
    window.on("resize", persist);
    window.on("move", persist);
    window.on("close", (event) => {
      if (!quitting) {
        event.preventDefault();
        const currentNoteId = noteIdByWebContents.get(window.webContents.id);
        if (currentNoteId) noteWindowManager.hide(currentNoteId);
      }
    });
    window.on("closed", () =>
      noteIdByWebContents.delete(window.webContents.id),
    );
    window.once("ready-to-show", () => window.show());
    await loadRenderer(window, state.noteId);
    return {
      show: () => window.show(),
      focus: () => window.focus(),
      hide: () => window.hide(),
      destroy: () => window.destroy(),
      isDestroyed: () => window.isDestroyed(),
      async navigate(targetNoteId: string) {
        const previousNoteId = noteIdByWebContents.get(window.webContents.id);
        noteIdByWebContents.set(window.webContents.id, targetNoteId);
        try {
          await loadRenderer(window, targetNoteId);
        } catch (error) {
          if (previousNoteId)
            noteIdByWebContents.set(window.webContents.id, previousNoteId);
          throw error;
        }
      },
    };
  },
);

function scheduleMainStateSave() {
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = setTimeout(() => saveMainState(), 250);
}

function scheduleNoteStateSave(noteId: string, window: BrowserWindow) {
  const current = notePersistTimers.get(noteId);
  if (current) clearTimeout(current);
  notePersistTimers.set(
    noteId,
    setTimeout(() => {
      if (window.isDestroyed()) return;
      const bounds = toPersistedNoteWindowBounds(window.getBounds());
      noteWindowManager.update(noteId, {
        x: bounds.x,
        y: bounds.y,
        width: bounds.width,
        height: bounds.height,
        alwaysOnTop: window.isAlwaysOnTop(),
      });
    }, 250),
  );
}

function trustedWindow(event: Electron.IpcMainInvokeEvent): BrowserWindow {
  const window = BrowserWindow.fromWebContents(event.sender);
  const trusted =
    window &&
    (window === mainWindow || noteIdByWebContents.has(event.sender.id));
  if (!trusted) throw new Error("Untrusted IPC sender");
  return window;
}

function validNoteId(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= 128 &&
    /^[a-zA-Z0-9-]+$/.test(value)
  );
}

function registerIpc() {
  registerNoteMousePassthrough(
    ipcMain,
    (senderId) =>
      BrowserWindow.getAllWindows().find(
        (window) => window.webContents.id === senderId,
      ),
    noteIdByWebContents,
    () => screen.getCursorScreenPoint(),
  );
  ipcMain.handle("window:get-state", (event) => {
    trustedWindow(event);
    return readMainState();
  });
  ipcMain.handle(
    "window:set-background-opacity",
    (event, rawValue: unknown) => {
      trustedWindow(event);
      const value = clampOpacity(
        typeof rawValue === "number" ? rawValue : 0.82,
      );
      const noteId = noteIdByWebContents.get(event.sender.id);
      if (noteId)
        noteWindowManager.update(noteId, { backgroundOpacity: value });
      else saveMainState({ backgroundOpacity: value });
      return value;
    },
  );
  ipcMain.handle("window:set-always-on-top", (event, rawValue: unknown) => {
    const window = trustedWindow(event);
    const value = rawValue === true;
    window.setAlwaysOnTop(value);
    const noteId = noteIdByWebContents.get(event.sender.id);
    if (noteId) noteWindowManager.update(noteId, { alwaysOnTop: value });
    else saveMainState({ alwaysOnTop: value });
    return value;
  });
  ipcMain.handle("window:save-state", (event, rawState: unknown) => {
    if (trustedWindow(event) !== mainWindow)
      throw new Error("Only the main window may save main state");
    const state =
      rawState && typeof rawState === "object"
        ? (rawState as Partial<WindowState>)
        : {};
    return saveMainState(state);
  });
  ipcMain.handle("window:minimize", (event) => {
    trustedWindow(event).minimize();
  });
  ipcMain.handle("window:close-current", (event) => {
    const window = trustedWindow(event);
    if (window === mainWindow) {
      window.hide();
      return;
    }
    const noteId = noteIdByWebContents.get(event.sender.id);
    if (!noteId) throw new Error("Note window identity is missing");
    noteWindowManager.hide(noteId);
  });
  ipcMain.handle("app:get-launch-at-login", (event) => {
    if (trustedWindow(event) !== mainWindow)
      throw new Error("Only the main window may change launch settings");
    return readLaunchAtLogin(app);
  });
  ipcMain.handle("app:set-launch-at-login", (event, rawValue: unknown) => {
    if (trustedWindow(event) !== mainWindow)
      throw new Error("Only the main window may change launch settings");
    return writeLaunchAtLogin(app, rawValue === true);
  });
  ipcMain.handle("note-window:open", async (event, rawNoteId: unknown) => {
    trustedWindow(event);
    if (!validNoteId(rawNoteId)) throw new Error("Invalid note id");
    await noteWindowManager.open(rawNoteId);
  });
  ipcMain.handle("note-window:close", (event, rawNoteId: unknown) => {
    trustedWindow(event);
    if (!validNoteId(rawNoteId)) throw new Error("Invalid note id");
    const senderNoteId = noteIdByWebContents.get(event.sender.id);
    if (senderNoteId && senderNoteId !== rawNoteId)
      throw new Error("A note window may only close itself");
    noteWindowManager.hide(rawNoteId);
  });
  ipcMain.handle(
    "note-window:get-recent",
    (event, rawCurrentNoteId: unknown, rawLimit: unknown) => {
      trustedWindow(event);
      if (!validNoteId(rawCurrentNoteId)) throw new Error("Invalid note id");
      const senderNoteId = noteIdByWebContents.get(event.sender.id);
      if (senderNoteId !== rawCurrentNoteId)
        throw new Error("A note window may only read its own recent list");
      const limit =
        typeof rawLimit === "number" && Number.isFinite(rawLimit)
          ? rawLimit
          : 4;
      return noteWindowManager.getRecentNoteIds(limit);
    },
  );
  ipcMain.handle("note-window:switch", async (event, rawTargetId: unknown) => {
    const window = trustedWindow(event);
    if (!validNoteId(rawTargetId)) throw new Error("Invalid note id");
    const sourceNoteId = noteIdByWebContents.get(event.sender.id);
    if (!sourceNoteId) throw new Error("Only a note window may switch notes");
    const bounds = toPersistedNoteWindowBounds(window.getBounds());
    return noteWindowManager.switch(sourceNoteId, rawTargetId, {
      x: bounds.x,
      y: bounds.y,
      width: bounds.width,
      height: bounds.height,
      alwaysOnTop: window.isAlwaysOnTop(),
    });
  });
  ipcMain.handle("note-window:get-state", (event, rawNoteId: unknown) => {
    trustedWindow(event);
    if (!validNoteId(rawNoteId)) throw new Error("Invalid note id");
    return noteWindowManager.getState(rawNoteId);
  });
  ipcMain.handle(
    "note-window:save-state",
    (event, rawNoteId: unknown, rawState: unknown) => {
      trustedWindow(event);
      if (!validNoteId(rawNoteId)) throw new Error("Invalid note id");
      const senderNoteId = noteIdByWebContents.get(event.sender.id);
      if (senderNoteId && senderNoteId !== rawNoteId)
        throw new Error("A note window may only save its own state");
      const changes =
        rawState && typeof rawState === "object"
          ? (rawState as Partial<NoteWindowState>)
          : {};
      return noteWindowManager.update(rawNoteId, changes);
    },
  );
}

function createTray() {
  const iconPath = join(__dirname, "../dist/icon-32.png");
  const icon = existsSync(iconPath)
    ? nativeImage.createFromPath(iconPath)
    : nativeImage.createEmpty();
  tray = new Tray(icon);
  tray.setToolTip("烟笺");
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: "显示便签列表", click: activateMainWindow },
      { type: "separator" },
      {
        label: "退出",
        click: () => {
          quitting = true;
          app.quit();
        },
      },
    ]),
  );
  tray.on("double-click", activateMainWindow);
}

async function createMainWindow(showOnReady = true) {
  const state = readMainState();
  mainWindow = new BrowserWindow(
    createWindowOptions(join(__dirname, "preload.cjs"), state),
  );
  configureRenderer(mainWindow);
  mainWindow.on("resize", scheduleMainStateSave);
  mainWindow.on("move", scheduleMainStateSave);
  mainWindow.on("close", (event) => {
    if (!quitting) {
      event.preventDefault();
      mainWindow?.hide();
    }
  });
  if (showOnReady) mainWindow.once("ready-to-show", () => mainWindow?.show());
  await loadRenderer(mainWindow);
}

function activateMainWindow() {
  void app.whenReady().then(async () => {
    if (!mainWindow) {
      await createMainWindow(true);
      return;
    }
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  });
}

if (registerSingleInstance(app, activateMainWindow)) {
  app.whenReady().then(async () => {
    try {
      ensureBackgroundLaunchAtLogin(app);
    } catch (error) {
      console.warn("Could not update the login launch mode", error);
    }
    session.defaultSession.setPermissionRequestHandler(
      (_webContents, _permission, callback) => callback(false),
    );
    session.defaultSession.webRequest.onHeadersReceived((details, callback) =>
      callback({
        responseHeaders: {
          ...details.responseHeaders,
          "Content-Security-Policy": [
            "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self' https://*.supabase.co wss://*.supabase.co",
          ],
        },
      }),
    );
    registerIpc();
    await createMainWindow(shouldShowMainWindow(process.argv));
    createTray();
    await noteWindowManager.restoreOpen();
  });

  app.on("before-quit", () => {
    quitting = true;
    saveMainState();
  });
  app.on("activate", activateMainWindow);
  app.on("window-all-closed", () => {
    /* Windows tray keeps the process alive. */
  });
}
