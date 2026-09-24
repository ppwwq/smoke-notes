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

describe("glass preferences", () => {
  it("restores glass and reduced transparency, and cleans up host attributes", () => {
    localStorage.setItem(storageKey, "glass");
    localStorage.setItem("smoke-notes:web-reduced-transparency", "true");
    const { result, unmount } = renderHook(() => useWebBackground(true));
    expect(result.current.background).toBe("glass");
    expect(result.current.reducedTransparency).toBe(true);
    expect(document.body.dataset.reducedTransparency).toBe("true");
    act(() => result.current.changeReduceTransparency(false));
    expect(localStorage.getItem("smoke-notes:web-reduced-transparency")).toBe(
      "false",
    );
    act(() => result.current.changeBackground("paper"));
    expect(result.current.background).toBe("paper");
    unmount();
    expect(document.body.dataset.reducedTransparency).toBeUndefined();
  });

  it("keeps invalid and unreadable preferences on the old default", () => {
    localStorage.setItem(storageKey, "unknown");
    const first = renderHook(() => useWebBackground(true));
    expect(first.result.current.background).toBe("default");
    first.unmount();
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    const second = renderHook(() => useWebBackground(true));
    expect(second.result.current.background).toBe("default");
    expect(second.result.current.reducedTransparency).toBe(false);
  });

  it("applies reduction for the session when persistence fails", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    const { result } = renderHook(() => useWebBackground(true));
    act(() => result.current.changeReduceTransparency(true));
    expect(result.current.reducedTransparency).toBe(true);
    expect(result.current.notice).toContain("本次有效");
  });

  it("does not read or write web preferences for the desktop host", () => {
    localStorage.setItem(storageKey, "glass");
    localStorage.setItem("smoke-notes:web-reduced-transparency", "true");
    const { result } = renderHook(() => useWebBackground(false));
    act(() => {
      result.current.changeBackground("paper");
      result.current.changeReduceTransparency(false);
    });
    expect(result.current.background).toBe("default");
    expect(result.current.reducedTransparency).toBe(false);
    expect(localStorage.getItem(storageKey)).toBe("glass");
    expect(localStorage.getItem("smoke-notes:web-reduced-transparency")).toBe(
      "true",
    );
  });

  it("reacts to system reduction and removes the media listeners on teardown", () => {
    const queries = new Map<string, MediaQueryList>();
    const previous = window.matchMedia;
    window.matchMedia = vi.fn((media: string) => {
      const target = Object.assign(new EventTarget(), {
        media,
        matches: false,
      });
      const query = target as unknown as MediaQueryList;
      queries.set(media, query);
      return query;
    });
    try {
      const { result, unmount } = renderHook(() => useWebBackground(true));
      const query = queries.get("(prefers-reduced-transparency: reduce)")!;
      const remove = vi.spyOn(query, "removeEventListener");
      act(() => {
        Object.assign(query, { matches: true });
        query.dispatchEvent(new Event("change"));
      });
      expect(result.current.reducedTransparency).toBe(true);
      act(() => result.current.changeReduceTransparency(false));
      expect(result.current.reducedTransparency).toBe(true);
      act(() => {
        Object.assign(query, { matches: false });
        query.dispatchEvent(new Event("change"));
      });
      expect(result.current.reducedTransparency).toBe(false);
      unmount();
      expect(remove).toHaveBeenCalled();
    } finally {
      window.matchMedia = previous;
    }
  });
});
