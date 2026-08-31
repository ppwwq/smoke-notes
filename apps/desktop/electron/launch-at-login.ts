export interface LoginItemApp {
  isPackaged: boolean;
  getLoginItemSettings(): { openAtLogin?: boolean };
  setLoginItemSettings(settings: { openAtLogin: boolean }): void;
}

export function readLaunchAtLogin(app: LoginItemApp): boolean {
  if (!app.isPackaged) {
    return false;
  }

  return app.getLoginItemSettings().openAtLogin === true;
}

export function writeLaunchAtLogin(
  app: LoginItemApp,
  enabled: boolean,
): boolean {
  if (!app.isPackaged) {
    return false;
  }

  app.setLoginItemSettings({ openAtLogin: enabled });
  return readLaunchAtLogin(app);
}
