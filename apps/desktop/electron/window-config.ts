import type { BrowserWindowConstructorOptions } from "electron";
import {
  clampOpacity,
  normalizeNoteWindowState,
  type NoteWindowState,
  type WindowState,
} from "@smoke-notes/core";

export const DEFAULT_WINDOW_STATE: WindowState = {
  backgroundOpacity: 0.82,
  alwaysOnTop: false,
  width: 1000,
  height: 680,
  lastView: "notes",
};

export const NOTE_WINDOW_TAB_GUTTER = 70;

interface WindowBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function toPersistedNoteWindowBounds(
  bounds: WindowBounds,
): WindowBounds {
  return {
    x: bounds.x + NOTE_WINDOW_TAB_GUTTER,
    y: bounds.y,
    width: bounds.width - NOTE_WINDOW_TAB_GUTTER,
    height: bounds.height,
  };
}

export function normalizeWindowState(
  input: (Partial<WindowState> & { opacity?: unknown }) | undefined,
): WindowState {
  const width = Number.isFinite(input?.width)
    ? Math.max(560, Number(input?.width))
    : DEFAULT_WINDOW_STATE.width;
  const height = Number.isFinite(input?.height)
    ? Math.max(380, Number(input?.height))
    : DEFAULT_WINDOW_STATE.height;
  return {
    ...DEFAULT_WINDOW_STATE,
    ...input,
    width,
    height,
    backgroundOpacity: clampOpacity(
      Number.isFinite(input?.backgroundOpacity)
        ? Number(input?.backgroundOpacity)
        : Number.isFinite(input?.opacity)
          ? Number(input?.opacity)
          : DEFAULT_WINDOW_STATE.backgroundOpacity,
    ),
    alwaysOnTop: input?.alwaysOnTop === true,
    lastView: input?.lastView === "todos" ? "todos" : "notes",
    x: Number.isFinite(input?.x) ? Number(input?.x) : undefined,
    y: Number.isFinite(input?.y) ? Number(input?.y) : undefined,
  };
}

export function createWindowOptions(
  preloadPath: string,
  input: Partial<WindowState> = {},
): BrowserWindowConstructorOptions {
  const state = normalizeWindowState(input);
  return {
    width: state.width,
    height: state.height,
    x: state.x,
    y: state.y,
    minWidth: 560,
    minHeight: 380,
    frame: false,
    transparent: true,
    backgroundColor: "#00000000",
    opacity: 1,
    alwaysOnTop: state.alwaysOnTop,
    show: false,
    hasShadow: true,
    webPreferences: {
      preload: preloadPath,
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
    },
  };
}

export function createNoteWindowOptions(
  preloadPath: string,
  input: NoteWindowState,
): BrowserWindowConstructorOptions {
  const state = normalizeNoteWindowState(input.noteId, input);
  return {
    width: state.width + NOTE_WINDOW_TAB_GUTTER,
    height: state.height,
    x: state.x === undefined ? undefined : state.x - NOTE_WINDOW_TAB_GUTTER,
    y: state.y,
    minWidth: 250 + NOTE_WINDOW_TAB_GUTTER,
    minHeight: 180,
    frame: false,
    transparent: true,
    backgroundColor: "#00000000",
    opacity: 1,
    alwaysOnTop: state.alwaysOnTop,
    show: false,
    hasShadow: true,
    resizable: true,
    webPreferences: {
      preload: preloadPath,
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
    },
  };
}
