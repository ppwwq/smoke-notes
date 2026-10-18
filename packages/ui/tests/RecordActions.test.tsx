import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { RecordActions } from "../src/components/RecordActions";
import { SettingsPanel } from "../src/components/SettingsPanel";

afterEach(cleanup);

it("keeps failed deletes in the action dialog, blocks duplicate writes, and permits retry", async () => {
  let reject!: (error: Error) => void;
  const onTrash = vi
    .fn<() => Promise<void>>()
    .mockImplementationOnce(
      () =>
        new Promise((_, fail) => {
          reject = fail;
        }),
    )
    .mockResolvedValue(undefined);
  render(<RecordActions kind="便签" name="保留内容" onTrash={onTrash} />);
  const trigger = screen.getByRole("button", {
    name: "更多便签操作：保留内容",
  });
  trigger.focus();
  fireEvent.click(trigger);
  const remove = screen.getByRole("button", { name: "删除便签：保留内容" });
  fireEvent.click(remove);
  fireEvent.click(remove);
  expect(onTrash).toHaveBeenCalledTimes(1);
  expect(remove).toBeDisabled();
  expect(screen.getByRole("button", { name: "关闭操作" })).toBeDisabled();
  await act(async () => reject(new Error("disk full")));
  expect(screen.getByRole("alert")).toHaveTextContent("内容仍然保留");
  expect(remove).toBeEnabled();
  fireEvent.click(remove);
  await waitFor(() =>
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
  );
  expect(onTrash).toHaveBeenCalledTimes(2);
  await waitFor(() => expect(trigger).toHaveFocus());
});

it("exposes existing restore and pairing paths through settings sections and retains failed restores", async () => {
  const restore = vi
    .fn()
    .mockRejectedValueOnce(new Error("disk full"))
    .mockResolvedValue(undefined);
  const pairing = vi.fn();
  render(
    <SettingsPanel
      webBackground="default"
      onClose={vi.fn()}
      onOpenPairing={pairing}
      onRestore={restore}
      trash={[
        {
          entity: "todo",
          record: {
            id: "todo-1",
            workspaceId: "w",
            text: "可恢复待办",
            completed: false,
            rank: 1,
            version: 2,
            updatedAt: "2026-10-18T00:00:00Z",
            deletedAt: "2026-10-18T00:00:00Z",
          },
        },
      ]}
    />,
  );
  expect(
    screen.queryByRole("button", { name: "恢复" }),
  ).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: /最近删除/ }));
  fireEvent.click(screen.getByRole("button", { name: "恢复" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("恢复失败");
  expect(screen.getByText("可恢复待办")).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "恢复" }));
  await waitFor(() => expect(restore).toHaveBeenCalledTimes(2));
  fireEvent.click(screen.getByRole("button", { name: "返回设置" }));
  fireEvent.click(screen.getByRole("button", { name: /手机与同步/ }));
  fireEvent.click(screen.getByRole("button", { name: "连接手机" }));
  expect(pairing).toHaveBeenCalledOnce();
});
