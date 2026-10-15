import { afterEach, describe, expect, it, vi } from "vitest";
import { SaveBeforeQuit } from "./app-lifecycle";

afterEach(() => vi.useRealTimers());
function setup() {
  const participants = [1, 2].map((id) => ({
    id,
    prepare: vi.fn(),
    cancel: vi.fn(),
  }));
  const quit = vi.fn();
  const controller = new SaveBeforeQuit(() => participants, quit, 100);
  return { participants, quit, controller };
}

describe("save before quitting", () => {
  it("waits for every editor and coalesces repeated quit requests", async () => {
    const { controller, quit, participants } = setup();
    const result = controller.request();
    expect(controller.request()).toBe(result);
    expect(participants[0].prepare).toHaveBeenCalledOnce();
    controller.acknowledge(1, 1, true);
    controller.acknowledge(1, 99, true);
    expect(quit).not.toHaveBeenCalled();
    controller.acknowledge(1, 2, true);
    expect(await result).toBe(true);
    expect(quit).toHaveBeenCalledOnce();
  });

  it("unlocks every editor on failure and ignores late acknowledgements on retry", async () => {
    const { controller, quit, participants } = setup();
    const first = controller.request();
    controller.acknowledge(1, 1, true);
    controller.acknowledge(1, 2, false);
    expect(await first).toBe(false);
    expect(
      participants.every((item) => item.cancel.mock.calls.length === 1),
    ).toBe(true);
    const retry = controller.request();
    controller.acknowledge(1, 2, true);
    expect(quit).not.toHaveBeenCalled();
    controller.acknowledge(2, 1, true);
    controller.acknowledge(2, 2, true);
    expect(await retry).toBe(true);
  });

  it("cancels instead of discarding an unresponsive editor's draft", async () => {
    vi.useFakeTimers();
    const { controller, quit, participants } = setup();
    const result = controller.request();
    controller.acknowledge(1, 1, true);
    await vi.advanceTimersByTimeAsync(100);
    expect(await result).toBe(false);
    expect(quit).not.toHaveBeenCalled();
    expect(participants[0].cancel).toHaveBeenCalledWith(
      1,
      expect.stringContaining("超时"),
    );
  });

  it("keeps editors alive when saving native window state fails", async () => {
    const { controller, quit, participants } = setup();
    quit.mockImplementation(() => {
      throw new Error("disk full");
    });
    const result = controller.request();
    controller.acknowledge(1, 1, true);
    controller.acknowledge(1, 2, true);
    expect(await result).toBe(false);
    expect(participants[1].cancel).toHaveBeenCalledOnce();
  });

  it("does not omit a window that appeared during preparation", async () => {
    const { controller, quit, participants } = setup();
    const result = controller.request();
    participants.push({ id: 3, prepare: vi.fn(), cancel: vi.fn() });
    controller.acknowledge(1, 1, true);
    controller.acknowledge(1, 2, true);
    expect(await result).toBe(false);
    expect(quit).not.toHaveBeenCalled();
  });
});
