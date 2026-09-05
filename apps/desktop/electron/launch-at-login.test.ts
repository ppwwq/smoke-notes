import { describe, expect, it, vi } from "vitest";
import { BACKGROUND_LAUNCH_ARGUMENT } from "./app-lifecycle";
import {
  ensureBackgroundLaunchAtLogin,
  readLaunchAtLogin,
  writeLaunchAtLogin,
} from "./launch-at-login";

describe("launch at login", () => {
  it("stays disabled without calling Electron in development", () => {
    const app = {
      isPackaged: false,
      getLoginItemSettings: vi.fn(() => ({ openAtLogin: true })),
      setLoginItemSettings: vi.fn(),
    };

    expect(readLaunchAtLogin(app)).toBe(false);
    expect(writeLaunchAtLogin(app, true)).toBe(false);
    expect(app.getLoginItemSettings).not.toHaveBeenCalled();
    expect(app.setLoginItemSettings).not.toHaveBeenCalled();
  });

  it("writes and returns the system launch-at-login state when packaged", () => {
    let openAtLogin = false;
    const app = {
      isPackaged: true,
      getLoginItemSettings: vi.fn(() => ({ openAtLogin })),
      setLoginItemSettings: vi.fn((settings: { openAtLogin: boolean }) => {
        openAtLogin = settings.openAtLogin;
      }),
    };

    expect(readLaunchAtLogin(app)).toBe(false);
    expect(writeLaunchAtLogin(app, true)).toBe(true);
    expect(app.setLoginItemSettings).toHaveBeenCalledWith({
      openAtLogin: true,
      args: [BACKGROUND_LAUNCH_ARGUMENT],
    });
    expect(readLaunchAtLogin(app)).toBe(true);
    expect(app.getLoginItemSettings).toHaveBeenLastCalledWith({
      args: [BACKGROUND_LAUNCH_ARGUMENT],
    });
  });

  it("upgrades an existing login item to use background mode", () => {
    let backgroundRegistration = false;
    const app = {
      isPackaged: true,
      getLoginItemSettings: vi.fn((options?: { args: string[] }) =>
        options
          ? { openAtLogin: backgroundRegistration }
          : { openAtLogin: false, executableWillLaunchAtLogin: true },
      ),
      setLoginItemSettings: vi.fn(() => {
        backgroundRegistration = true;
      }),
    };

    expect(ensureBackgroundLaunchAtLogin(app)).toBe(true);
    expect(app.setLoginItemSettings).toHaveBeenCalledWith({
      openAtLogin: true,
      args: [BACKGROUND_LAUNCH_ARGUMENT],
    });
  });

  it("returns the system state after writing instead of the requested value", () => {
    const app = {
      isPackaged: true,
      getLoginItemSettings: vi.fn(() => ({ openAtLogin: false })),
      setLoginItemSettings: vi.fn(),
    };

    expect(writeLaunchAtLogin(app, true)).toBe(false);
    expect(app.setLoginItemSettings).toHaveBeenCalledWith({
      openAtLogin: true,
      args: [BACKGROUND_LAUNCH_ARGUMENT],
    });
    expect(app.getLoginItemSettings).toHaveBeenCalledTimes(1);
  });

  it("propagates errors from reading the system state", () => {
    const error = new Error("Windows could not read the login item");
    const app = {
      isPackaged: true,
      getLoginItemSettings: vi.fn(() => {
        throw error;
      }),
      setLoginItemSettings: vi.fn(),
    };

    let caught: unknown;
    try {
      readLaunchAtLogin(app);
    } catch (thrown) {
      caught = thrown;
    }

    expect(caught).toBe(error);
  });

  it("propagates errors rejected by Windows", () => {
    const error = new Error("Windows rejected the login item");
    const app = {
      isPackaged: true,
      getLoginItemSettings: vi.fn(() => ({ openAtLogin: false })),
      setLoginItemSettings: vi.fn(() => {
        throw error;
      }),
    };

    expect(() => writeLaunchAtLogin(app, true)).toThrow(error);
  });

  it("propagates errors from rereading after a successful write", () => {
    const error = new Error("Windows could not reread the login item");
    const calls: string[] = [];
    const app = {
      isPackaged: true,
      getLoginItemSettings: vi.fn(() => {
        calls.push("get");
        throw error;
      }),
      setLoginItemSettings: vi.fn(() => {
        calls.push("set");
      }),
    };

    let caught: unknown;
    try {
      writeLaunchAtLogin(app, true);
    } catch (thrown) {
      caught = thrown;
    }

    expect(calls).toEqual(["set", "get"]);
    expect(caught).toBe(error);
  });
});
