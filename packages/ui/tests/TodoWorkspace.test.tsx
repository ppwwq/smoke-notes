import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type { Todo } from "@smoke-notes/core";
import { TodoWorkspace } from "../src/components/TodoWorkspace";

afterEach(cleanup);
const todo: Todo = {
  id: "todo-1",
  workspaceId: "workspace",
  text: "旧文字",
  completed: false,
  version: 1,
  rank: 1,
  updatedAt: "2026-09-24T12:00:00Z",
  deletedAt: null,
};
function handlers() {
  return {
    onCreate: vi.fn(async () => {}),
    onToggle: vi.fn(async () => {}),
    onUpdate: vi.fn(async () => {}),
    onTrash: vi.fn(async () => {}),
    onMove: vi.fn(async () => {}),
  };
}
it("retains the user draft and displays a failure when saving fails", async () => {
  const callbacks = handlers();
  callbacks.onUpdate.mockRejectedValueOnce(new Error("storage unavailable"));
  render(<TodoWorkspace todos={[todo]} {...callbacks} />);
  const input = screen.getByRole("textbox", { name: "编辑待办：旧文字" });
  fireEvent.change(input, { target: { value: "未保存草稿" } });
  fireEvent.blur(input);
  expect(await screen.findByRole("alert")).toHaveTextContent("保存失败");
  expect(input).toHaveValue("未保存草稿");
});

it("shows remote todo changes without writing the old value back on blur", () => {
  const callbacks = handlers();
  const view = render(<TodoWorkspace todos={[todo]} {...callbacks} />);
  view.rerender(
    <TodoWorkspace
      todos={[{ ...todo, text: "远端新文字", version: 2 }]}
      {...callbacks}
    />,
  );
  const input = screen.getByRole("textbox", { name: "编辑待办：远端新文字" });
  fireEvent.blur(input);
  expect(input).toHaveValue("远端新文字");
  expect(callbacks.onUpdate).not.toHaveBeenCalled();
});
it("keeps an actual user draft through a remote refresh and saves it on blur", async () => {
  const callbacks = handlers();
  const view = render(<TodoWorkspace todos={[todo]} {...callbacks} />);
  fireEvent.change(screen.getByRole("textbox", { name: "编辑待办：旧文字" }), {
    target: { value: "我的草稿" },
  });
  view.rerender(
    <TodoWorkspace
      todos={[{ ...todo, text: "远端新文字", version: 2 }]}
      {...callbacks}
    />,
  );
  const input = screen.getByRole("textbox", { name: "编辑待办：远端新文字" });
  expect(input).toHaveValue("我的草稿");
  fireEvent.blur(input);
  await waitFor(() =>
    expect(callbacks.onUpdate).toHaveBeenCalledWith(todo.id, "我的草稿"),
  );
});
