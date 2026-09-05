import { describe, expect, it, vi } from "vitest";
import {
  BACKGROUND_LAUNCH_ARGUMENT,
  registerSingleInstance,
  shouldShowMainWindow,
} from "./app-lifecycle";

describe("desktop application lifecycle", () => {
  it("quits a competing process before it can open a second data context", () => {
    const app = {
      requestSingleInstanceLock: vi.fn(() => false),
      quit: vi.fn(),
      on: vi.fn(),
    };

    expect(registerSingleInstance(app, vi.fn())).toBe(false);
    expect(app.quit).toHaveBeenCalledOnce();
    expect(app.on).not.toHaveBeenCalled();
  });

  it("activates the existing process when the user starts the app again", () => {
    let secondInstanceHandler: (() => void) | undefined;
    const activate = vi.fn();
    const app = {
      requestSingleInstanceLock: vi.fn(() => true),
      quit: vi.fn(),
      on: vi.fn((event: string, listener: () => void) => {
        if (event === "second-instance") secondInstanceHandler = listener;
      }),
    };

    expect(registerSingleInstance(app, activate)).toBe(true);
    secondInstanceHandler?.();

    expect(app.quit).not.toHaveBeenCalled();
    expect(activate).toHaveBeenCalledOnce();
  });

  it("shows the main window for normal launches but not login launches", () => {
    expect(shouldShowMainWindow(["SmokeNotes.exe"])).toBe(true);
    expect(
      shouldShowMainWindow(["SmokeNotes.exe", BACKGROUND_LAUNCH_ARGUMENT]),
    ).toBe(false);
  });
});
