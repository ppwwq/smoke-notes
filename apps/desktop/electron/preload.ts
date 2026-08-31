import { contextBridge, ipcRenderer } from "electron";
import type { NoteWindowState, WindowState } from "@smoke-notes/core";

contextBridge.exposeInMainWorld("smokeDesktop", {
  getWindowState: (): Promise<WindowState> =>
    ipcRenderer.invoke("window:get-state"),
  setBackgroundOpacity: (value: number): Promise<number> =>
    ipcRenderer.invoke("window:set-background-opacity", value),
  setAlwaysOnTop: (value: boolean): Promise<boolean> =>
    ipcRenderer.invoke("window:set-always-on-top", value),
  saveWindowState: async (state: Partial<WindowState>): Promise<void> => {
    await ipcRenderer.invoke("window:save-state", state);
  },
  getLaunchAtLogin: (): Promise<boolean> =>
    ipcRenderer.invoke("app:get-launch-at-login"),
  setLaunchAtLogin: (value: boolean): Promise<boolean> =>
    ipcRenderer.invoke("app:set-launch-at-login", value),
  minimizeWindow: async (): Promise<void> => {
    await ipcRenderer.invoke("window:minimize");
  },
  closeCurrentWindow: async (): Promise<void> => {
    await ipcRenderer.invoke("window:close-current");
  },
  openNote: async (noteId: string): Promise<void> => {
    await ipcRenderer.invoke("note-window:open", noteId);
  },
  closeNote: async (noteId: string): Promise<void> => {
    await ipcRenderer.invoke("note-window:close", noteId);
  },
  getRecentNoteIds: (currentNoteId: string, limit: number): Promise<string[]> =>
    ipcRenderer.invoke("note-window:get-recent", currentNoteId, limit),
  switchNote: (targetNoteId: string): Promise<void> =>
    ipcRenderer.invoke("note-window:switch", targetNoteId),
  getNoteWindowState: (noteId: string): Promise<NoteWindowState> =>
    ipcRenderer.invoke("note-window:get-state", noteId),
  saveNoteWindowState: (
    noteId: string,
    state: Partial<NoteWindowState>,
  ): Promise<NoteWindowState> =>
    ipcRenderer.invoke("note-window:save-state", noteId, state),
});
