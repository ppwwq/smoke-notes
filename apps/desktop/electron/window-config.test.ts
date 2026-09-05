import { describe, expect, it } from "vitest";
import {
  createContentSecurityPolicy,
  createNoteWindowOptions,
  createWindowOptions,
  normalizeWindowState,
  toPersistedNoteWindowBounds,
} from "./window-config";

describe("desktop window configuration", () => {
  it("allows Vite refresh and its local websocket only in development", () => {
    const development = createContentSecurityPolicy(false);
    const production = createContentSecurityPolicy(true);
    expect(development).toContain("script-src 'self' 'unsafe-inline'");
    expect(development).toContain("ws://127.0.0.1:5173");
    expect(production).toContain("script-src 'self';");
    expect(production).not.toContain("ws://127.0.0.1:5173");
    expect(production).toContain("https://*.supabase.co");
  });

  it("creates a frameless transparent and isolated renderer", () => {
    expect(
      createWindowOptions("C:/app/preload.cjs", { backgroundOpacity: 0.82 }),
    ).toMatchObject({
      frame: false,
      transparent: true,
      opacity: 1,
      minWidth: 560,
      minHeight: 380,
      webPreferences: {
        preload: "C:/app/preload.cjs",
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
        webSecurity: true,
      },
    });
  });

  it("normalizes unsafe or missing persisted window values", () => {
    expect(
      normalizeWindowState({ opacity: 0.1, width: 100, height: 100 }),
    ).toMatchObject({
      backgroundOpacity: 0.45,
      width: 560,
      height: 380,
      alwaysOnTop: false,
      lastView: "notes",
    });
  });

  it("creates a small resizable sticky window with its own state", () => {
    expect(
      createNoteWindowOptions("C:/app/preload.cjs", {
        noteId: "note-1",
        width: 410,
        height: 480,
        backgroundOpacity: 0.76,
        alwaysOnTop: true,
        isOpen: true,
      }),
    ).toMatchObject({
      width: 480,
      height: 480,
      minWidth: 320,
      minHeight: 180,
      frame: false,
      transparent: true,
      opacity: 1,
      alwaysOnTop: true,
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
    });
  });

  it("keeps persisted note bounds aligned with the visible note body", () => {
    const options = createNoteWindowOptions("C:/app/preload.cjs", {
      noteId: "note-1",
      x: 300,
      y: 120,
      width: 410,
      height: 480,
      backgroundOpacity: 0.76,
      alwaysOnTop: false,
      isOpen: true,
    });

    expect(options).toMatchObject({ x: 230, y: 120, width: 480, height: 480 });
    expect(
      toPersistedNoteWindowBounds({
        x: options.x!,
        y: options.y!,
        width: options.width!,
        height: options.height!,
      }),
    ).toEqual({ x: 300, y: 120, width: 410, height: 480 });
  });
});
