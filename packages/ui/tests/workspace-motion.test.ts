import { afterEach, describe, expect, it, vi } from "vitest";

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

afterEach(() => {
  vi.restoreAllMocks();
  Reflect.deleteProperty(document, "startViewTransition");
  Reflect.deleteProperty(window, "matchMedia");
  document.documentElement.classList.remove("notebook-transition");
});

describe("workspace motion lifecycle", () => {
  it("finishes a snapshot before the latest queued intent, without skipping to an end frame", async () => {
    vi.resetModules();
    const first = deferred();
    const second = deferred();
    const skip = vi.fn();
    let count = 0;
    const start = vi.fn((update: () => void) => {
      update();
      return {
        ready: Promise.resolve(),
        finished: ++count === 1 ? first.promise : second.promise,
        skipTransition: skip,
      } as unknown as ViewTransition;
    });
    document.startViewTransition = start;
    const { transitionWorkspace } = await import("../src/workspace-motion");
    const open = vi.fn(),
      superseded = vi.fn(),
      close = vi.fn();
    transitionWorkspace(open, true);
    transitionWorkspace(superseded, true);
    transitionWorkspace(close, true);
    expect(open).toHaveBeenCalledOnce();
    expect(close).not.toHaveBeenCalled();
    first.resolve();
    await vi.waitFor(() => expect(close).toHaveBeenCalledOnce());
    expect(superseded).not.toHaveBeenCalled();
    expect(skip).not.toHaveBeenCalled();
    second.resolve();
    await vi.waitFor(() =>
      expect(document.documentElement).not.toHaveClass("notebook-transition"),
    );
  });

  it.each(["unavailable", "reduced"])(
    "updates immediately when %s",
    async (mode) => {
      vi.resetModules();
      const start = vi.fn();
      if (mode === "reduced") {
        document.startViewTransition = start;
        window.matchMedia = vi.fn(() => ({ matches: true }) as MediaQueryList);
      }
      const { transitionWorkspace } = await import("../src/workspace-motion");
      const update = vi.fn();
      transitionWorkspace(update, true);
      expect(update).toHaveBeenCalledOnce();
      expect(start).not.toHaveBeenCalled();
    },
  );

  it("cleans up rejected captures and still drains the next update", async () => {
    vi.resetModules();
    const finished = deferred();
    document.startViewTransition = vi.fn((update: () => void) => {
      update();
      return {
        ready: Promise.reject(new Error("hidden tab")),
        finished: finished.promise,
      } as ViewTransition;
    });
    const { transitionWorkspace } = await import("../src/workspace-motion");
    transitionWorkspace(vi.fn(), true);
    const next = vi.fn();
    transitionWorkspace(next, true);
    Reflect.deleteProperty(document, "startViewTransition");
    finished.resolve();
    await vi.waitFor(() => expect(next).toHaveBeenCalledOnce());
    expect(document.documentElement).not.toHaveClass("notebook-transition");
  });
});
