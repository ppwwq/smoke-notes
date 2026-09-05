import type { NoteWindowState, WindowState } from "@smoke-notes/core";
import type { PairingDetails } from "@smoke-notes/core";

export interface DesktopBridge {
  getWindowState(): Promise<WindowState>;
  setBackgroundOpacity(value: number): Promise<number>;
  setAlwaysOnTop(value: boolean): Promise<boolean>;
  saveWindowState(state: Partial<WindowState>): Promise<void>;
  getLaunchAtLogin(): Promise<boolean>;
  setLaunchAtLogin(value: boolean): Promise<boolean>;
  minimizeWindow(): Promise<void>;
  closeCurrentWindow(): Promise<void>;
  openNote(noteId: string): Promise<void>;
  closeNote(noteId: string): Promise<void>;
  getRecentNoteIds(currentNoteId: string, limit: number): Promise<string[]>;
  switchNote(targetNoteId: string): Promise<void>;
  setNoteWindowMousePassthrough(ignore: boolean): Promise<void>;
  getNoteWindowPointer(): Promise<{ x: number; y: number }>;
  getNoteWindowState(noteId: string): Promise<NoteWindowState>;
  saveNoteWindowState(
    noteId: string,
    state: Partial<NoteWindowState>,
  ): Promise<NoteWindowState>;
}

export type AppPlatform = "desktop" | "web";

export interface PairingController {
  createPairing(): Promise<PairingDetails>;
}
