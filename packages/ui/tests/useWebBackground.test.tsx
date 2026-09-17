import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useWebBackground } from "../src/useWebBackground";

const storageKey = "smoke-notes:web-background";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  localStorage.clear();
  delete document.documentElement.dataset.webBackground;
  delete document.body.dataset.webBackground;
});

describe("web background document theme", () => {
  it("restores the saved theme, updates both safe-area surfaces, and persists changes", () => {
    localStorage.setItem(storageKey, "paper");
    const { result, unmount } = renderHook(() => useWebBackground(true));
    expect(result.current.background).toBe("paper");
    expect(document.documentElement.dataset.webBackground).toBe("paper");
    expect(document.body.dataset.webBackground).toBe("paper");

    act(() => result.current.changeBackground("default"));
    expect(document.documentElement.dataset.webBackground).toBe("default");
    expect(document.body.dataset.webBackground).toBe("default");
    expect(localStorage.getItem(storageKey)).toBe("default");
    unmount();
    expect(document.documentElement.dataset.webBackground).toBeUndefined();
    expect(document.body.dataset.webBackground).toBeUndefined();
  });

  it("restores existing document attributes when disabled or unmounted", () => {
    document.documentElement.dataset.webBackground = "host-html";
    document.body.dataset.webBackground = "host-body";
    const { result, rerender, unmount } = renderHook(
      ({ enabled }) => useWebBackground(enabled),
      { initialProps: { enabled: true } },
    );
    act(() => result.current.changeBackground("paper"));
    rerender({ enabled: false });
    expect(document.documentElement.dataset.webBackground).toBe("host-html");
    expect(document.body.dataset.webBackground).toBe("host-body");
    rerender({ enabled: true });
    expect(document.body.dataset.webBackground).toBe("paper");
    unmount();
    expect(document.documentElement.dataset.webBackground).toBe("host-html");
    expect(document.body.dataset.webBackground).toBe("host-body");
  });

  it("does not apply a saved web preference to a desktop host", () => {
    localStorage.setItem(storageKey, "paper");
    const { result } = renderHook(() => useWebBackground(false));
    expect(result.current.background).toBe("default");
    expect(document.documentElement.dataset.webBackground).toBeUndefined();
    expect(document.body.dataset.webBackground).toBeUndefined();
  });

  it("still applies the theme and reports session-only persistence when storage fails", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("Unavailable", "SecurityError");
    });
    const { result } = renderHook(() => useWebBackground(true));
    act(() => result.current.changeBackground("paper"));
    expect(document.documentElement.dataset.webBackground).toBe("paper");
    expect(document.body.dataset.webBackground).toBe("paper");
    expect(result.current.notice).toContain("本次有效");
  });
});
