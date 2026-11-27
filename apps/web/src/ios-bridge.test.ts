import { describe, expect, it, vi } from "vitest";
import { getIOSBridge } from "./ios-bridge";

describe("iOS WebKit bridge", () => {
  it("leaves ordinary browsers and Android WebView alone", () => {
    expect(getIOSBridge(window)).toBeUndefined();
    expect(getIOSBridge({ webkit: {} } as unknown as Window)).toBeUndefined();
  });

  it("sends native operations with their arguments and exposes only available capabilities", () => {
    const postMessage = vi.fn();
    const host = { webkit: { messageHandlers: { jotday: { postMessage } } } };
    const bridge = getIOSBridge(host as unknown as Window);

    expect(bridge?.pinWidget).toBeUndefined();
    expect(bridge?.updateWidgetSnapshot).toBeUndefined();
    bridge?.onAppReady?.();
    bridge?.setSystemBarTheme?.("#111111", false);
    bridge?.haptic?.("confirm");
    bridge?.saveTextFile?.("Jotday.json", "application/json", "{}");
    bridge?.hideKeyboard?.();
    bridge?.openExternalUrl?.("https://example.com");

    expect(postMessage.mock.calls).toEqual([
      [{ method: "onAppReady", args: [] }],
      [{ method: "setSystemBarTheme", args: ["#111111", false] }],
      [{ method: "haptic", args: ["confirm"] }],
      [
        {
          method: "saveTextFile",
          args: ["Jotday.json", "application/json", "{}"],
        },
      ],
      [{ method: "hideKeyboard", args: [] }],
      [{ method: "openExternalUrl", args: ["https://example.com"] }],
    ]);
  });
});
