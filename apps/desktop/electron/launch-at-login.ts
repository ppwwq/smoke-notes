import { BACKGROUND_LAUNCH_ARGUMENT } from "./app-lifecycle";

export interface LoginItemApp {
  isPackaged: boolean;
  getLoginItemSettings(options?: { args: string[] }): {
    openAtLogin?: boolean;
    executableWillLaunchAtLogin?: boolean;
  };
  setLoginItemSettings(settings: {
    openAtLogin: boolean;
    args: string[];
  }): void;
}

export function readLaunchAtLogin(app: LoginItemApp): boolean {
  if (!app.isPackaged) {
    return false;
  }

  return (
    app.getLoginItemSettings({ args: [BACKGROUND_LAUNCH_ARGUMENT] })
      .openAtLogin === true
  );
}

export function ensureBackgroundLaunchAtLogin(app: LoginItemApp): boolean {
  if (!app.isPackaged) return false;
  const current = app.getLoginItemSettings();
  if (
    current.openAtLogin !== true &&
    current.executableWillLaunchAtLogin !== true
  )
    return false;
  return writeLaunchAtLogin(app, true);
}

export function writeLaunchAtLogin(
  app: LoginItemApp,
  enabled: boolean,
): boolean {
  if (!app.isPackaged) {
    return false;
  }

  app.setLoginItemSettings({
    openAtLogin: enabled,
    args: enabled ? [BACKGROUND_LAUNCH_ARGUMENT] : [],
  });
  return readLaunchAtLogin(app);
}
