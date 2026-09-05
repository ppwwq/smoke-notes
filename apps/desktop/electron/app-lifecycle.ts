export const BACKGROUND_LAUNCH_ARGUMENT = "--background";

interface SingleInstanceApp {
  requestSingleInstanceLock(): boolean;
  quit(): void;
  on(event: "second-instance", listener: () => void): unknown;
}

export function registerSingleInstance(
  app: SingleInstanceApp,
  activateExistingInstance: () => void,
): boolean {
  if (!app.requestSingleInstanceLock()) {
    app.quit();
    return false;
  }

  app.on("second-instance", activateExistingInstance);
  return true;
}

export function shouldShowMainWindow(argv: readonly string[]): boolean {
  return !argv.includes(BACKGROUND_LAUNCH_ARGUMENT);
}
