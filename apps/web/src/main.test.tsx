import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const startup = vi.hoisted(() => ({
  render: vi.fn(),
  authenticate: vi.fn(() => new Promise<string>(() => {})),
  start: vi.fn(async () => {}),
}));

vi.mock("react-dom/client", () => ({
  createRoot: () => ({ render: startup.render }),
}));

vi.mock("@smoke-notes/core", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@smoke-notes/core")>();
  return {
    ...actual,
    SupabaseCloud: class {
      ensureAnonymousSession = startup.authenticate;
      syncAdapter = {};
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
});
