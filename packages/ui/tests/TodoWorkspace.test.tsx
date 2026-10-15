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

it("does not create a todo when Enter confirms an IME composition", () => {
  const callbacks = handlers();
  render(<TodoWorkspace todos={[]} {...callbacks} />);
  const input = screen.getByRole("textbox", { name: "新待办内容" });
  fireEvent.change(input, { target: { value: "中文" } });
  fireEvent.keyDown(input, { key: "Enter", isComposing: true });
  fireEvent.keyDown(input, { key: "Enter", keyCode: 229 });
  expect(callbacks.onCreate).not.toHaveBeenCalled();
});

it("submits once and preserves text typed while the new todo is saving", async () => {
  const callbacks = handlers();
  let finish!: () => void;
  callbacks.onCreate.mockImplementationOnce(
    () =>
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
  );
  render(<TodoWorkspace todos={[]} {...callbacks} />);
  const input = screen.getByRole("textbox", { name: "新待办内容" });
  fireEvent.change(input, { target: { value: "第一件事" } });
  fireEvent.keyDown(input, { key: "Enter" });
  fireEvent.keyDown(input, { key: "Enter" });
  expect(callbacks.onCreate).toHaveBeenCalledTimes(1);
  fireEvent.change(input, { target: { value: "第二件事" } });
  finish();
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "添加" })).toBeEnabled(),
  );
  expect(input).toHaveValue("第二件事");
});

it("keeps the new todo draft and reports create failures", async () => {
  const callbacks = handlers();
  callbacks.onCreate.mockRejectedValueOnce(new Error("storage unavailable"));
  render(<TodoWorkspace todos={[]} {...callbacks} />);
  const input = screen.getByRole("textbox", { name: "新待办内容" });
  fireEvent.change(input, { target: { value: "尚未保存" } });
  fireEvent.keyDown(input, { key: "Enter" });
  expect(await screen.findByRole("alert")).toHaveTextContent("添加失败");
  expect(input).toHaveValue("尚未保存");
});

it("saves a return to the original text after an earlier edit is still pending", async () => {
  const callbacks = handlers();
  let finish!: () => void;
  callbacks.onUpdate.mockImplementationOnce(
    () =>
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
  );
  render(<TodoWorkspace todos={[todo]} {...callbacks} />);
  const input = screen.getByRole("textbox", { name: "编辑待办：旧文字" });
  fireEvent.change(input, { target: { value: "中间文字" } });
  fireEvent.blur(input);
  await waitFor(() => expect(callbacks.onUpdate).toHaveBeenCalledTimes(1));
  fireEvent.change(input, { target: { value: "旧文字" } });
  fireEvent.blur(input);
  finish();
  await waitFor(() =>
    expect(callbacks.onUpdate).toHaveBeenLastCalledWith(todo.id, "旧文字"),
  );
});
