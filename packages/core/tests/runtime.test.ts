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
});
