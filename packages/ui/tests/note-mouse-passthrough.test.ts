import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  attachNoteMousePassthrough,
  isNoteInteractive,
} from "../src/note-mouse-passthrough";

describe("note mouse regions", () => {
  let root: HTMLDivElement;
  let tab: HTMLButtonElement;
  let disconnect: (() => void) | undefined;
  let resize: () => void;
  const setIgnore = vi.fn<(ignore: boolean) => Promise<void>>(
    async () => undefined,
  );
  const getPointer = vi.fn(async () => ({ x: 200, y: 100 }));

  const move = (x: number, y: number, buttons = 0) =>
    document.dispatchEvent(
      new MouseEvent("mousemove", { clientX: x, clientY: y, buttons }),
    );
  const transition = (type: string) => {
    const event = new Event(type, { bubbles: true });
    Object.defineProperty(event, "propertyName", { value: "width" });
    tab.dispatchEvent(event);
  };
  const attach = () => {
    // The controller uses only the two window-input bridge methods.
    disconnect = attachNoteMousePassthrough(root, {
      setNoteWindowMousePassthrough: setIgnore,
      getNoteWindowPointer: getPointer,
    });
  };

  beforeEach(() => {
    setIgnore.mockClear();
    getPointer.mockReset().mockResolvedValue({ x: 200, y: 100 });
    vi.stubGlobal(
      "ResizeObserver",
      class {
        constructor(callback: () => void) {
          resize = callback;
        }
        observe() {}
        disconnect() {}
      },
    );
    root = document.createElement("div");
    root.style.paddingLeft = "100px";
    tab = document.createElement("button");
    tab.className = "recent-note-tab";
    root.append(tab);
    document.body.append(root);
    vi.spyOn(root, "getBoundingClientRect").mockReturnValue(
      new DOMRect(0, 0, 460, 420),
    );
    vi.spyOn(tab, "getBoundingClientRect").mockReturnValue(
      new DOMRect(70, 52, 30, 30),
    );
  });

  afterEach(() => {
    disconnect?.();
    disconnect = undefined;
    root.remove();
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("uses fractional CSS coordinates and the actual padding and animated tab bounds", () => {
    expect(isNoteInteractive(root, { x: 69.9, y: 60 })).toBe(false);
    expect(isNoteInteractive(root, { x: 70, y: 60 })).toBe(true);
    expect(isNoteInteractive(root, { x: 80, y: 82 })).toBe(false);
    expect(isNoteInteractive(root, { x: 100, y: 400 })).toBe(true);
    expect(isNoteInteractive(root, { x: 460, y: 100 })).toBe(false);
    vi.mocked(tab.getBoundingClientRect).mockReturnValue(
      new DOMRect(22.5, 52, 77.5, 30),
    );
    expect(isNoteInteractive(root, { x: 22.5, y: 60 })).toBe(true);
    expect(isNoteInteractive(root, { x: 22.4, y: 60 })).toBe(false);
    root.style.paddingLeft = "120px";
    expect(isNoteInteractive(root, { x: 110, y: 100 })).toBe(false);
  });

  it("initializes with the real cursor without overwriting a newer mouse movement", async () => {
    attach();
    move(20, 120);
    await Promise.resolve();
    expect(setIgnore).toHaveBeenLastCalledWith(true);
    expect(setIgnore).toHaveBeenCalledTimes(1);
  });

  it("initializes a stationary cursor in the gutter", async () => {
    getPointer.mockResolvedValue({ x: 20, y: 120 });
    attach();
    await Promise.resolve();
    expect(setIgnore).toHaveBeenLastCalledWith(true);
  });

  it("keeps a drag interactive until release, including release outside the document", () => {
    attach();
    document.dispatchEvent(
      new MouseEvent("mousedown", { clientX: 200, clientY: 100, buttons: 1 }),
    );
    move(20, 120, 1);
    expect(setIgnore).not.toHaveBeenCalled();
    document.dispatchEvent(
      new MouseEvent("mouseup", { clientX: 20, clientY: 120, buttons: 0 }),
    );
    expect(setIgnore).toHaveBeenLastCalledWith(true);
    move(200, 100);
    document.dispatchEvent(
      new MouseEvent("mousedown", { clientX: 200, clientY: 100, buttons: 1 }),
    );
    move(20, 120, 0);
    expect(setIgnore).toHaveBeenLastCalledWith(true);
  });

  it("refreshes a stationary mouse during width animation and after resize", () => {
    vi.useFakeTimers();
    attach();
    move(40, 60);
    expect(setIgnore).toHaveBeenLastCalledWith(true);
    transition("transitionrun");
    vi.mocked(tab.getBoundingClientRect).mockReturnValue(
      new DOMRect(30, 52, 70, 30),
    );
    vi.advanceTimersByTime(20);
    expect(setIgnore).toHaveBeenLastCalledWith(false);
    vi.mocked(tab.getBoundingClientRect).mockReturnValue(
      new DOMRect(70, 52, 30, 30),
    );
    transition("transitioncancel");
    expect(setIgnore).toHaveBeenLastCalledWith(true);
    vi.mocked(tab.getBoundingClientRect).mockReturnValue(
      new DOMRect(0, 52, 100, 30),
    );
    resize();
    expect(setIgnore).toHaveBeenLastCalledWith(false);
  });

  it("updates when a recent tab is removed and resets on navigation/unmount", async () => {
    attach();
    move(80, 60);
    tab.remove();
    await Promise.resolve();
    expect(setIgnore).toHaveBeenLastCalledWith(true);
    disconnect!();
    disconnect = undefined;
    expect(setIgnore).toHaveBeenLastCalledWith(false);
    setIgnore.mockClear();
    move(20, 120);
    await Promise.resolve();
    expect(setIgnore).not.toHaveBeenCalled();
  });
});
