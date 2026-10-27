import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { SyncIndicator } from "../src/components/SyncIndicator";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});
it("shows first sync immediately, delays later syncs by 300 ms and hides on success", async () => {
  vi.useFakeTimers();
  const view = render(
    <SyncIndicator status={{ phase: "syncing", initial: true, pending: 0 }} />,
  );
  expect(view.container.querySelector(".diamond-grid")).not.toBeNull();
  view.rerender(
    <SyncIndicator status={{ phase: "synced", initial: false, pending: 0 }} />,
  );
  expect(view.container.querySelector(".diamond-grid")).toBeNull();
  view.rerender(
    <SyncIndicator status={{ phase: "syncing", initial: false, pending: 0 }} />,
  );
  await act(async () => {
    await vi.advanceTimersByTimeAsync(299);
  });
  expect(view.container.querySelector(".diamond-grid")).toBeNull();
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1);
  });
  expect(view.container.querySelector(".diamond-grid")).not.toBeNull();
});
it.each(["offline", "retrying", "error"] as const)(
  "shows a static accessible circle for %s",
  (phase) => {
    const view = render(
      <SyncIndicator status={{ phase, initial: false, pending: 2 }} />,
    );
    expect(view.container.querySelector(".sync-ring")).not.toBeNull();
    expect(view.container.querySelector(".diamond-grid")).toBeNull();
    expect(screen.getByRole("status", { name: "同步状态" })).toHaveTextContent(
      "2 项待同步",
    );
  },
);
it("renders nothing without cloud configuration", () => {
  const view = render(<SyncIndicator />);
  expect(view.container).toBeEmptyDOMElement();
});
it("says how many notes could not be uploaded", () => {
  render(
    <SyncIndicator
      status={{ phase: "synced", initial: false, pending: 0, rejected: 2 }}
    />,
  );
  expect(screen.getByRole("status", { name: "同步状态" })).toHaveTextContent(
    "有 2 条内容未能上传",
  );
  expect(document.querySelector(".sync-ring")).not.toBeNull();
});
it("says the calendar is waiting when only the calendar failed", () => {
  render(
    <SyncIndicator
      status={{
        phase: "synced",
        initial: false,
        pending: 0,
        calendarFailed: true,
      }}
    />,
  );
  expect(screen.getByRole("status", { name: "同步状态" })).toHaveTextContent(
    "便签已同步，日历稍后重试",
  );
  expect(document.querySelector(".sync-ring")).not.toBeNull();
});
