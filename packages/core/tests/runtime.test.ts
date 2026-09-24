import { describe, expect, it, vi } from "vitest";
import { createSyncRuntime } from "../src/index";

describe("createSyncRuntime", () => {
  it("flushes, pulls, persists the cursor and disposes its subscription", async () => {
    const storage = new Map<string, string>();
    const stopRealtime = vi.fn();
    const engine = {
      flush: vi.fn(async () => ({ applied: 1, conflicts: 0, failed: 0 })),
      pull: vi.fn(async () => "cursor-2"),
    };
    const cloud = { subscribe: vi.fn(() => stopRealtime) };
    const notify = vi.fn();
    const runtime = createSyncRuntime({
      engine,
      cloud,
      notify,
      intervalMs: 60_000,
      storage: {
        getItem: (key) => storage.get(key) ?? null,
        setItem: (key, value) => {
          storage.set(key, value);
        },
      },
    });

    await runtime.start();
    expect(engine.pull).toHaveBeenCalledWith(null);
    expect(storage.get("smoke-notes:sync-cursor")).toBe("cursor-2");
    expect(notify).toHaveBeenCalled();

    runtime.stop();
    expect(stopRealtime).toHaveBeenCalled();
  });
  it("syncs immediately on focus and reconnection and removes wake listeners on stop", async () => {
    const engine = {
      flush: vi.fn(async () => ({ applied: 0, conflicts: 0, failed: 0 })),
      pull: vi.fn(async () => "next"),
    };
    const runtime = createSyncRuntime({
      engine,
      cloud: { subscribe: () => () => {} },
      storage: { getItem: () => null, setItem: () => {} },
      notify: () => {},
      intervalMs: 60_000,
    });
    try {
      await runtime.start();
      window.dispatchEvent(new Event("focus"));
      await vi.waitFor(() => expect(engine.pull).toHaveBeenCalledTimes(2));
      window.dispatchEvent(new Event("online"));
      await vi.waitFor(() => expect(engine.pull).toHaveBeenCalledTimes(3));
      runtime.stop();
      window.dispatchEvent(new Event("focus"));
      await Promise.resolve();
      expect(engine.pull).toHaveBeenCalledTimes(3);
    } finally {
      runtime.stop();
    }
  });
});
