import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const startup = vi.hoisted(() => ({
  render: vi.fn(),
  authenticate: vi.fn(() => new Promise<string>(() => {})),
  start: vi.fn(async () => {}),
  redeem: vi.fn<(code: string) => Promise<string>>(),
}));

vi.mock("react-dom/client", () => ({
  createRoot: () => ({ render: startup.render }),
}));
// Startup tests inspect the root's public props; component interaction has its
// own UI tests, so do not import the entire editor and icon graph here.
vi.mock("@smoke-notes/ui/app", () => ({ SmokeNotesApp: () => null }));

vi.mock("@smoke-notes/core", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@smoke-notes/core")>();
  return {
    ...actual,
    SupabaseCloud: class {
      ensureAnonymousSession = startup.authenticate;
      syncAdapter = {};
      redeemPairing = startup.redeem;
    },
    createSyncRuntime: () => ({ start: startup.start, stop: vi.fn() }),
  };
});

describe("web startup while authentication is unavailable", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    localStorage.clear();
    vi.stubEnv("VITE_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("VITE_SUPABASE_PUBLISHABLE_KEY", "test-public-key");
    document.body.innerHTML = '<div id="root"></div>';
  });

  afterEach(() => {
    window.dispatchEvent(new Event("beforeunload"));
    localStorage.clear();
    vi.unstubAllEnvs();
  });

  it("renders an existing local workspace before network authentication", async () => {
    localStorage.setItem("smoke-notes:workspace-id", "existing-workspace");
    await import("./main");

    expect(startup.render).toHaveBeenCalledOnce();
    const app = startup.render.mock.calls[0][0].props.children;
    expect(app.props.platform).toBe("web");
    expect(app.props.repository).toBeDefined();
    expect(startup.start).toHaveBeenCalledOnce();
  });

  it("shows the pairing form without waiting for an anonymous session", async () => {
    await import("./main");

    expect(startup.render).toHaveBeenCalledOnce();
    const gate = startup.render.mock.calls[0][0].props.children;
    expect(gate.props.onRedeem).toBeTypeOf("function");
    expect(startup.authenticate).not.toHaveBeenCalled();
    expect(startup.start).not.toHaveBeenCalled();
  });

  it("skips pairing, remembers local mode and offers pairing in settings without starting sync", async () => {
    await import("./main");
    const gate = startup.render.mock.calls[0][0].props.children;
    expect(gate.props.onSkip).toBeTypeOf("function");
    await gate.props.onSkip();
    const app = startup.render.mock.lastCall![0].props.children;
    expect(app.props.repository).toBeDefined();
    expect(app.props.onRedeemPairing).toBeTypeOf("function");
    expect(localStorage.getItem("smoke-notes:local-only")).toBe(
      localStorage.getItem("smoke-notes:workspace-id"),
    );
    expect(startup.start).not.toHaveBeenCalled();
    vi.resetModules();
    await import("./main");
    expect(
      startup.render.mock.lastCall![0].props.children.props.repository,
    ).toBeDefined();
    expect(startup.start).not.toHaveBeenCalled();
  });

  it("keeps local mode after a failed code and starts sync only after successful pairing", async () => {
    await import("./main");
    await startup.render.mock.calls[0][0].props.children.props.onSkip();
    const localApp = startup.render.mock.lastCall![0].props.children;
    const originalWorkspace = localStorage.getItem("smoke-notes:workspace-id");
    startup.redeem.mockRejectedValueOnce(new Error("配对码已过期"));
    await expect(localApp.props.onRedeemPairing("123456")).rejects.toThrow(
      "配对码已过期",
    );
    expect(localStorage.getItem("smoke-notes:local-only")).toBe(
      originalWorkspace,
    );
    expect(startup.start).not.toHaveBeenCalled();
    startup.redeem.mockResolvedValueOnce("paired-workspace");
    await localApp.props.onRedeemPairing("654321");
    expect(localStorage.getItem("smoke-notes:workspace-id")).toBe(
      "paired-workspace",
    );
    expect(localStorage.getItem("smoke-notes:local-only")).toBeNull();
    expect(startup.start).toHaveBeenCalledOnce();
    expect(
      startup.render.mock.lastCall![0].props.children.props.pairingController,
    ).toBeDefined();
  });
});
