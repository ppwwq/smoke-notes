import { contextBridge, ipcRenderer } from "electron";
import type { NoteWindowState, WindowState } from "@smoke-notes/core";

contextBridge.exposeInMainWorld("smokeDesktop", {
  getPreviewMode: (): Promise<boolean> =>
    ipcRenderer.invoke("app:preview-mode"),
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
  onNoteCloseRequested: (listener: () => void): (() => void) => {
    const handler = () => listener();
    ipcRenderer.on("note-window:request-close", handler);
    return () =>
      ipcRenderer.removeListener("note-window:request-close", handler);
  },
  onPrepareQuit: (listener: () => Promise<void>): (() => void) => {
    const handler = async (
      _event: Electron.IpcRendererEvent,
      requestId: number,
    ) => {
      let saved = false;
      try {
        await listener();
        saved = true;
      } catch {
        /* Keep the draft and cancel quit. */
      }
      await ipcRenderer
        .invoke("app:quit-result", requestId, saved)
        .catch(() => {});
    };
    ipcRenderer.on("app:prepare-quit", handler);
    void ipcRenderer.invoke("app:editor-ready", true).catch(() => {});
    return () => {
      ipcRenderer.removeListener("app:prepare-quit", handler);
      void ipcRenderer.invoke("app:editor-ready", false).catch(() => {});
    };
  },
  onQuitCancelled: (listener: (message: string) => void): (() => void) => {
    const handler = (
      _event: Electron.IpcRendererEvent,
      _requestId: number,
      message: string,
    ) => listener(message);
    ipcRenderer.on("app:cancel-quit", handler);
    return () => ipcRenderer.removeListener("app:cancel-quit", handler);
  },
  getRecentNoteIds: (currentNoteId: string, limit: number): Promise<string[]> =>
    ipcRenderer.invoke("note-window:get-recent", currentNoteId, limit),
  switchNote: (targetNoteId: string): Promise<void> =>
    ipcRenderer.invoke("note-window:switch", targetNoteId),
  setNoteWindowMousePassthrough: (ignore: boolean): Promise<void> =>
    ipcRenderer.invoke("note-window:mouse-passthrough", ignore),
  getNoteWindowPointer: (): Promise<{ x: number; y: number }> =>
    ipcRenderer.invoke("note-window:pointer"),
  getNoteWindowState: (noteId: string): Promise<NoteWindowState> =>
    ipcRenderer.invoke("note-window:get-state", noteId),
  saveNoteWindowState: (
    noteId: string,
    state: Partial<NoteWindowState>,
  ): Promise<NoteWindowState> =>
    ipcRenderer.invoke("note-window:save-state", noteId, state),
});
