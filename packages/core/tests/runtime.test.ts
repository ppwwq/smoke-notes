import { describe, expect, it, vi } from "vitest";
import { createSyncRuntime, type SyncStatus } from "../src/index";

describe("createSyncRuntime", () => {
  it.each([
    { failed: 0, pending: 0, rejected: 0, phase: "synced" },
    { failed: 1, pending: 1, rejected: 0, phase: "retrying" },
    { failed: 0, pending: 3, rejected: 0, phase: "retrying" },
    { failed: 0, pending: 0, rejected: 1, phase: "error" },
  ])(
    "reports $phase after flush with $pending pending and $rejected rejected",
    async ({ failed, pending, rejected, phase }) => {
      const states: SyncStatus[] = [];
      const runtime = createSyncRuntime({
        engine: {
          flush: async () => ({ applied: 1, conflicts: 0, failed }),
          pull: async () => "next",
          getQueueState: async () => ({ pending, rejected }),
        },
        cloud: { subscribe: () => () => {} },
        storage: { getItem: () => null, setItem: () => {} },
        notify: () =>
          window.dispatchEvent(new Event("smoke-notes:data-changed")),
        onStatusChange: (state) => states.push(state),
      });
      try {
        await runtime.start();
        expect(states[0]).toMatchObject({ phase: "syncing", initial: true });
        expect(states.at(-1)).toEqual({
          phase,
          pending,
          initial: phase !== "synced",
        });
        expect(states).toHaveLength(2);
      } finally {
        runtime.stop();
      }
    },
  );
  it("keeps initial sync visible until a slow pull finishes and reports pull failure", async () => {
    let reject!: (error: Error) => void;
    const states: SyncStatus[] = [];
    const runtime = createSyncRuntime({
      engine: {
        flush: async () => ({ applied: 0, conflicts: 0, failed: 0 }),
        pull: () =>
          new Promise<string>((_, fail) => {
            reject = fail;
          }),
      },
      cloud: { subscribe: () => () => {} },
      storage: { getItem: () => null, setItem: () => {} },
      notify: () => {},
      onStatusChange: (state) => states.push(state),
    });
    const starting = runtime.start();
    try {
      await Promise.resolve();
      expect(states).toEqual([{ phase: "syncing", pending: 0, initial: true }]);
      reject(new Error("pull unavailable"));
      await starting;
      expect(states.at(-1)?.phase).toBe("error");
    } finally {
      runtime.stop();
    }
  });
  it("reports offline at startup and only reports synced after reconnection succeeds", async () => {
    const online = vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    const states: SyncStatus[] = [];
    const flush = vi.fn(async () => ({ applied: 0, conflicts: 0, failed: 0 }));
    const runtime = createSyncRuntime({
      engine: {
        flush,
        pull: async () => "next",
        getQueueState: async () => ({ pending: 0, rejected: 0 }),
      },
      cloud: { subscribe: () => () => {} },
      storage: { getItem: () => null, setItem: () => {} },
      notify: () => {},
      onStatusChange: (state) => states.push(state),
    });
    try {
      await runtime.start();
      expect(states.at(-1)?.phase).toBe("offline");
      expect(flush).not.toHaveBeenCalled();
      online.mockReturnValue(true);
      window.dispatchEvent(new Event("online"));
      await vi.waitFor(() => expect(states.at(-1)?.phase).toBe("synced"));
      runtime.stop();
      const count = states.length;
      window.dispatchEvent(new Event("offline"));
      expect(states).toHaveLength(count);
    } finally {
      runtime.stop();
      online.mockRestore();
    }
  });
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
