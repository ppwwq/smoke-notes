import { act, cleanup, fireEvent, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useWebViewport } from "../src/useWebViewport";

afterEach(() => {
  cleanup();
  document.body.replaceChildren();
  vi.restoreAllMocks();
  Reflect.deleteProperty(navigator, "maxTouchPoints");
  vi.unstubAllGlobals();
});

describe("web editor viewport", () => {
  it("tracks keyboard resize and pan, restores height, and removes listeners", () => {
    const viewport = Object.assign(new EventTarget(), {
      height: 800,
      offsetTop: 0,
      scale: 1,
    });
    const remove = vi.spyOn(viewport, "removeEventListener");
    vi.stubGlobal("visualViewport", viewport);
    const { result, rerender } = renderHook(
      ({ enabled }) => useWebViewport(enabled),
      { initialProps: { enabled: true } },
    );
    expect(result.current.style).toMatchObject({
      "--web-viewport-height": "800px",
    });
    act(() => {
      viewport.height = 340;
      viewport.offsetTop = 20;
      viewport.dispatchEvent(new Event("resize"));
    });
    expect(result.current.style).toMatchObject({
      "--web-viewport-height": "340px",
      "--web-viewport-top": "20px",
    });
    act(() => {
      viewport.offsetTop = 40;
      viewport.dispatchEvent(new Event("scroll"));
    });
    expect(result.current.style).toMatchObject({
      "--web-viewport-top": "40px",
    });
    act(() => {
      viewport.height = 800;
      viewport.offsetTop = 0;
      viewport.dispatchEvent(new Event("resize"));
    });
    expect(result.current.style).toMatchObject({
      "--web-viewport-height": "800px",
      "--web-viewport-top": "0px",
    });
    rerender({ enabled: false });
    expect(result.current).toEqual({ style: {}, compactEditing: false });
    expect(remove).toHaveBeenCalledTimes(2);
  });

  it("uses CSS fallback without VisualViewport and does not resize during pinch zoom", () => {
    vi.stubGlobal("visualViewport", undefined);
    const fallback = renderHook(() => useWebViewport(true));
    expect(fallback.result.current).toEqual({
      style: {},
      compactEditing: false,
    });
    fallback.unmount();
    const viewport = Object.assign(new EventTarget(), {
      height: 800,
      offsetTop: 0,
      scale: 1,
    });
    vi.stubGlobal("visualViewport", viewport);
    const { result } = renderHook(() => useWebViewport(true));
    act(() => {
      viewport.height = 400;
      viewport.scale = 2;
      viewport.dispatchEvent(new Event("resize"));
    });
    expect(result.current.style).toMatchObject({
      "--web-viewport-height": "800px",
    });
  });
});

describe("compact web editing", () => {
  function setup() {
    vi.stubGlobal("innerWidth", 1194);
    vi.stubGlobal("innerHeight", 834);
    Object.defineProperty(navigator, "maxTouchPoints", {
      configurable: true,
      value: 5,
    });
    const viewport = Object.assign(new EventTarget(), {
      height: 834,
      offsetTop: 0,
      scale: 1,
    });
    vi.stubGlobal("visualViewport", viewport);
    document.body.innerHTML =
      '<main class="mobile-note-screen"><input class="rich-note-title"/><button>格式</button></main><input id="outside"/>';
    const hook = renderHook(({ enabled }) => useWebViewport(enabled), {
      initialProps: { enabled: true },
    });
    const resize = (height: number) =>
      act(() => {
        viewport.height = height;
        viewport.dispatchEvent(new Event("resize"));
      });
    return { ...hook, viewport, resize };
  }
  it("compacts focused landscape editing, retains it for tools, restores after the keyboard", () => {
    const { result, viewport, resize } = setup();
    resize(350);
    expect(result.current.compactEditing).toBe(false);
    act(() =>
      document.querySelector<HTMLInputElement>(".rich-note-title")!.focus(),
    );
    expect(result.current.compactEditing).toBe(true);
    act(() => document.querySelector("button")!.focus());
    expect(result.current.compactEditing).toBe(true);
    viewport.scale = 2;
    resize(180);
    expect(result.current.style).toMatchObject({
      "--web-viewport-height": "350px",
    });
    expect(result.current.compactEditing).toBe(true);
    viewport.scale = 1;
    resize(834);
    expect(result.current.compactEditing).toBe(false);
    resize(350);
    expect(result.current.compactEditing).toBe(false);
    act(() =>
      document.querySelector<HTMLInputElement>(".rich-note-title")!.focus(),
    );
    expect(result.current.compactEditing).toBe(true);
    act(() => document.querySelector<HTMLInputElement>("#outside")!.focus());
    expect(result.current.compactEditing).toBe(false);
  });
  it("ignores portrait, hardware keyboard, non-touch screens and small chrome changes", () => {
    const { result, viewport, rerender } = setup();
    act(() => document.querySelector("input")!.focus());
    expect(result.current.compactEditing).toBe(false);
    act(() => {
      viewport.height = 350;
      vi.stubGlobal("innerHeight", 480);
      fireEvent(window, new Event("resize"));
    });
    expect(result.current.compactEditing).toBe(false);
    act(() => {
      vi.stubGlobal("innerWidth", 834);
      vi.stubGlobal("innerHeight", 1194);
      fireEvent(window, new Event("resize"));
    });
    expect(result.current.compactEditing).toBe(false);
    act(() => {
      vi.stubGlobal("innerWidth", 1194);
      vi.stubGlobal("innerHeight", 834);
      Object.defineProperty(navigator, "maxTouchPoints", {
        configurable: true,
        value: 0,
      });
      fireEvent(window, new Event("resize"));
    });
    expect(result.current.compactEditing).toBe(false);
    rerender({ enabled: false });
    expect(result.current).toEqual({ style: {}, compactEditing: false });
  });
});
