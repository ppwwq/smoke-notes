import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { waitFor } from "@testing-library/react";
import type { createSyncRuntime } from "@smoke-notes/core";

const startup = vi.hoisted(() => ({
  runtime: vi.fn<(options: Parameters<typeof createSyncRuntime>[0]) => void>(),
  start: vi.fn(async () => {}),
  stop: vi.fn(),
  enroll: vi.fn(async () => {}),
  render: vi.fn(),
}));
vi.mock("react-dom/client", () => ({
  createRoot: () => ({ render: startup.render }),
}));
vi.mock("@smoke-notes/ui/app", () => ({ SmokeNotesApp: () => null }));
vi.mock("@smoke-notes/ui/note-window", () => ({ NoteWindowApp: () => null }));
vi.mock("@smoke-notes/core", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@smoke-notes/core")>();
  return {
    ...actual,
    SupabaseCloud: class {
      client = {};
      syncAdapter = {};
      enrollLocalWorkspace = startup.enroll;
    },
    createSyncRuntime: (options: Parameters<typeof createSyncRuntime>[0]) => {
      startup.runtime(options);
      return { start: startup.start, stop: startup.stop };
    },
  };
});

describe("desktop calendar sync integration", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    localStorage.clear();
    window.history.replaceState({}, "", "/");
    vi.stubEnv("VITE_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("VITE_SUPABASE_PUBLISHABLE_KEY", "test-key");
    vi.stubEnv("VITE_WEB_APP_URL", "https://example.invalid");
    vi.stubGlobal("smokeDesktop", { getPreviewMode: async () => false });
    vi.stubGlobal(
      "BroadcastChannel",
      class {
        postMessage() {}
        close() {}
      },
    );
    document.body.innerHTML = '<div id="root"></div>';
  });
  afterEach(() => {
    window.dispatchEvent(new Event("beforeunload"));
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it("enrolls the workspace, syncs notes then calendar, and counts calendar changes", async () => {
    const core = await import("@smoke-notes/core");
    const pull = vi
      .spyOn(core.SyncEngine.prototype, "pull")
      .mockResolvedValue("cursor-next");
    const flush = vi
      .spyOn(core.SyncEngine.prototype, "flush")
      .mockResolvedValue({ applied: 0, conflicts: 0, failed: 0 });
    vi.spyOn(core.SyncEngine.prototype, "getQueueState").mockResolvedValue({
      pending: 3,
      rejected: 0,
    });
    const calendar = vi
      .spyOn(core.PlannerSyncEngine.prototype, "synchronize")
      .mockResolvedValue();
    vi.spyOn(
      core.PlannerSyncEngine.prototype,
      "pendingCount",
    ).mockResolvedValue(2);
    await import("./main");
    await waitFor(() => expect(startup.start).toHaveBeenCalledOnce());
    const { engine } = startup.runtime.mock.calls[0][0];
    await engine.flush();
    expect(startup.enroll).toHaveBeenCalledWith(
      localStorage.getItem("smoke-notes:workspace-id"),
    );
    expect(startup.enroll.mock.invocationCallOrder[0]).toBeLessThan(
      flush.mock.invocationCallOrder[0],
    );
    expect(await engine.pull("cursor-old")).toBe("cursor-next");
    expect(pull).toHaveBeenCalledWith("cursor-old");
    expect(calendar).toHaveBeenCalledOnce();
    expect(pull.mock.invocationCallOrder[0]).toBeLessThan(
      calendar.mock.invocationCallOrder[0],
    );
    expect(await engine.getQueueState?.()).toEqual({
      pending: 5,
      rejected: 0,
    });
  });

  it("does not acknowledge a cursor when calendar synchronization fails", async () => {
    const core = await import("@smoke-notes/core");
    vi.spyOn(core.SyncEngine.prototype, "pull").mockResolvedValue(
      "cursor-next",
    );
    vi.spyOn(core.PlannerSyncEngine.prototype, "synchronize").mockRejectedValue(
      new Error("offline"),
    );
    await import("./main");
    await waitFor(() => expect(startup.start).toHaveBeenCalledOnce());
    await expect(
      startup.runtime.mock.calls[0][0].engine.pull(null),
    ).rejects.toThrow("offline");
  });

  it("keeps separate note windows from starting a second calendar sync owner", async () => {
    window.history.replaceState({}, "", "/?noteId=isolated-note");
    await import("./main");
    await waitFor(() => expect(startup.render).toHaveBeenCalledOnce());
    expect(startup.runtime).not.toHaveBeenCalled();
  });
});
