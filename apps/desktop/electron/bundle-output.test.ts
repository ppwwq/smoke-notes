import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("packaged main-process bundle", () => {
  it.each(["main.cjs", "preload.cjs"])(
    "keeps Electron external in %s",
    (fileName) => {
      const output = resolve(
        process.cwd(),
        "apps/desktop/dist-electron",
        fileName,
      );
      expect(existsSync(output)).toBe(true);
      const source = readFileSync(output, "utf8");

      expect(source).toContain('require("electron")');
      expect(source).not.toContain("path.txt");
    },
  );

  it("bundles the workspace core into the main process", () => {
    const output = resolve(
      process.cwd(),
      "apps/desktop/dist-electron/main.cjs",
    );
    const source = readFileSync(output, "utf8");

    expect(source).not.toContain('require("@smoke-notes/core")');
  });

  it("keeps one data-owning process and restores notes without showing the main window at login", () => {
    const main = readFileSync(
      resolve(process.cwd(), "apps/desktop/dist-electron/main.cjs"),
      "utf8",
    );

    expect(main).toContain("requestSingleInstanceLock");
    expect(main).toContain("second-instance");
    expect(main).toContain("--background");
    expect(main).toContain("restoreOpen");
  });

  it("uses the same app identity artwork for the installer and tray", () => {
    const installerIcon = readFileSync(
      resolve(process.cwd(), "apps/desktop/build/icon.png"),
    );
    const trayIcon = readFileSync(
      resolve(process.cwd(), "apps/desktop/public/icon-32.png"),
    );

    expect(trayIcon.equals(installerIcon)).toBe(true);
  });

  it("exposes only the validated background, window, and note-switch IPC", () => {
    const main = readFileSync(
      resolve(process.cwd(), "apps/desktop/dist-electron/main.cjs"),
      "utf8",
    );
    const preload = readFileSync(
      resolve(process.cwd(), "apps/desktop/dist-electron/preload.cjs"),
      "utf8",
    );

    for (const channel of [
      "window:set-background-opacity",
      "window:minimize",
      "window:close-current",
      "app:get-launch-at-login",
      "app:set-launch-at-login",
      "note-window:get-recent",
      "note-window:switch",
      "note-window:mouse-passthrough",
      "note-window:pointer",
    ]) {
      expect(main).toContain(channel);
      expect(preload).toContain(channel);
    }
    expect(main).toContain("Untrusted IPC sender");
    expect(main).toContain("Only the main window may change launch settings");
    expect(main).toContain("Invalid note id");
    expect(main).not.toContain(".setOpacity(");
    expect(preload).not.toContain("window:set-opacity");
  });
});
