import type { AndroidBridge } from "./types";

type NativeActions = Pick<AndroidBridge, "haptic" | "saveTextFile">;
let iosNativeActions: NativeActions | undefined;

export function bindIOSNativeActions(actions: NativeActions) {
  iosNativeActions = actions;
}

export function isAndroidApp(): boolean {
  return (
    typeof document !== "undefined" &&
    document.documentElement.dataset.androidApp === "true"
  );
}

export function getNativeActions() {
  if (typeof window === "undefined") return;
  const { JotdayAndroid } = window as Window & {
    JotdayAndroid?: NativeActions;
  };
  return JotdayAndroid ?? iosNativeActions;
}
