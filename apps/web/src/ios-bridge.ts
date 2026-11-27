import type { AndroidBridge } from "@smoke-notes/ui";

interface IOSMessage {
  method: string;
  args: (string | boolean)[];
}

interface IOSMessageHandler {
  postMessage(message: IOSMessage): void;
}

export function getIOSBridge(win: Window): AndroidBridge | undefined {
  const { webkit } = win as Window & {
    webkit?: { messageHandlers?: { jotday?: IOSMessageHandler } };
  };
  const handler = webkit?.messageHandlers?.jotday;
  if (typeof handler?.postMessage !== "function") return undefined;

  const post = (method: string, ...args: IOSMessage["args"]) =>
    handler.postMessage({ method, args });

  return {
    onAppReady: () => post("onAppReady"),
    setSystemBarTheme: (background, darkIcons) =>
      post("setSystemBarTheme", background, darkIcons),
    haptic: (kind) => post("haptic", kind),
    saveTextFile: (filename, mime, content) =>
      post("saveTextFile", filename, mime, content),
    hideKeyboard: () => post("hideKeyboard"),
    openExternalUrl: (url) => post("openExternalUrl", url),
  };
}
