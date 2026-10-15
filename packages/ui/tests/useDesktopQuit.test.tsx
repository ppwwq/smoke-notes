import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useDesktopQuit } from "../src/useDesktopQuit";
import type { DesktopBridge } from "../src/types";

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function setup(flushSave: () => Promise<void>) {
  let prepare!: () => Promise<void>;
  let cancel!: (message: string) => void;
  const removePrepare = vi.fn();
  const removeCancel = vi.fn();
  const bridge: Pick<DesktopBridge, "onPrepareQuit" | "onQuitCancelled"> = {
    onPrepareQuit: (listener) => {
      prepare = listener;
      return removePrepare;
    },
    onQuitCancelled: (listener) => {
      cancel = listener;
      return removeCancel;
    },
  };
  const editor = { current: { flushSave } };
  function Window() {
    const { preparingQuit, quitError } = useDesktopQuit(bridge, editor);
    return (
      <div data-testid="window" inert={preparingQuit}>
        {quitError}
      </div>
    );
  }
  const view = render(<Window />);
  return {
    ...view,
    prepare: () => prepare(),
    cancel: (message: string) => cancel(message),
    removePrepare,
    removeCancel,
  };
}

afterEach(cleanup);

describe("renderer quit preparation", () => {
  it("allows composition to finish, locks before acknowledgement, and waits for the final save", async () => {
    const composition = deferred();
    const finalSave = deferred();
    const save = vi
      .fn()
      .mockImplementationOnce(() => composition.promise)
      .mockImplementationOnce(() => {
        expect(screen.getByTestId("window")).toHaveAttribute("inert");
        return finalSave.promise;
      });
    const window = setup(save);
    const acknowledged = vi.fn();
    let pending!: Promise<void>;
    act(() => {
      pending = window.prepare().then(acknowledged);
    });
    expect(screen.getByTestId("window")).not.toHaveAttribute("inert");
    await act(async () => composition.resolve());
    expect(screen.getByTestId("window")).toHaveAttribute("inert");
    expect(acknowledged).not.toHaveBeenCalled();
    await act(async () => {
      finalSave.resolve();
      await pending;
    });
    expect(acknowledged).toHaveBeenCalledOnce();
    act(() => window.cancel("另一个窗口保存失败"));
    expect(screen.getByTestId("window")).not.toHaveAttribute("inert");
    expect(screen.getByText("另一个窗口保存失败")).toBeVisible();
  });

  it("does not relock after a timed-out composition finishes", async () => {
    const composition = deferred();
    const save = vi
      .fn()
      .mockImplementationOnce(() => composition.promise)
      .mockResolvedValue(undefined);
    const window = setup(save);
    let pending!: Promise<void>;
    act(() => {
      pending = window.prepare();
    });
    const rejected = expect(pending).rejects.toThrow("Quit cancelled");
    act(() => window.cancel("超时"));
    await act(async () => {
      composition.resolve();
      await rejected;
    });
    expect(screen.getByTestId("window")).not.toHaveAttribute("inert");
    expect(save).toHaveBeenCalledTimes(1);
    await act(async () => window.prepare());
    expect(screen.getByTestId("window")).toHaveAttribute("inert");
    expect(screen.queryByText("超时")).not.toBeInTheDocument();
  });

  it("reports save failure and remains editable after cancellation", async () => {
    const save = vi
      .fn()
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error("disk full"));
    const window = setup(save);
    await act(async () => {
      await expect(window.prepare()).rejects.toThrow("disk full");
    });
    act(() => window.cancel("保存失败，退出已取消"));
    expect(screen.getByTestId("window")).not.toHaveAttribute("inert");
    expect(screen.getByText("保存失败，退出已取消")).toBeVisible();
  });

  it("unregisters on unmount and rejects obsolete acknowledgements", async () => {
    const saving = deferred();
    const window = setup(() => saving.promise);
    let pending!: Promise<void>;
    act(() => {
      pending = window.prepare();
    });
    const rejected = expect(pending).rejects.toThrow("Quit cancelled");
    window.unmount();
    await act(async () => {
      saving.resolve();
      await rejected;
    });
    expect(window.removePrepare).toHaveBeenCalledOnce();
    expect(window.removeCancel).toHaveBeenCalledOnce();
  });
});
