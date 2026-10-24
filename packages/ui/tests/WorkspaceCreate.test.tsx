import { useState } from "react";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import type { Notebook } from "@smoke-notes/core";
import { WorkspaceCreate } from "../src/components/WorkspaceCreate";

afterEach(cleanup);
const book: Notebook = {
  id: "book-1",
  workspaceId: "ws",
  name: "日常",
  rank: 1,
  version: 1,
  deletedAt: null,
  updatedAt: "2026-10-23T00:00:00Z",
};
function setup(defaultMode: "note" | "todo" = "todo", notebooks = [book]) {
  const callbacks = {
    onCreateNote: vi.fn(async () => {}),
    onCreateNotebook: vi.fn(async () => "new-book"),
    onCreateTodo: vi.fn(async () => {}),
    onShowTodos: vi.fn(),
  };
  function Host() {
    const [open, setOpen] = useState(false);
    const [mode, setMode] = useState(defaultMode);
    return (
      <WorkspaceCreate
        open={open}
        onOpenChange={setOpen}
        mode={mode}
        onModeChange={setMode}
        defaultMode={defaultMode}
        hidden={false}
        notebooks={notebooks}
        selectedNotebookId="book-1"
        today="2026-10-23"
        {...callbacks}
      />
    );
  }
  render(<Host />);
  return callbacks;
}

it("keeps an unsaved draft across Escape, reopening and mode changes", async () => {
  setup();
  const user = userEvent.setup();
  const trigger = screen.getByRole("button", { name: "新建待办" });
  await user.click(trigger);
  const input = await screen.findByRole("textbox", { name: "新待办内容" });
  await waitFor(() => expect(input).toHaveFocus());
  await user.type(input, "留着明天做");
  await user.keyboard("{Escape}");
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect(trigger).toHaveFocus();
  await user.click(trigger);
  expect(screen.getByRole("textbox", { name: "新待办内容" })).toHaveValue(
    "留着明天做",
  );
  await user.click(
    within(screen.getByRole("group", { name: "新建类型" })).getByRole(
      "button",
      { name: "便签" },
    ),
  );
  expect(screen.queryByRole("textbox", { name: "新待办内容" })).toBeNull();
  await user.click(
    within(screen.getByRole("group", { name: "新建类型" })).getByRole(
      "button",
      { name: "待办" },
    ),
  );
  expect(screen.getByRole("textbox", { name: "新待办内容" })).toHaveValue(
    "留着明天做",
  );
});

it("creates tomorrow's task once, clears only the submitted draft and offers its destination", async () => {
  const callbacks = setup();
  fireEvent.click(screen.getByRole("button", { name: "新建待办" }));
  fireEvent.change(screen.getByRole("textbox", { name: "新待办内容" }), {
    target: { value: "去散步" },
  });
  fireEvent.click(screen.getByRole("button", { name: "明天" }));
  fireEvent.click(screen.getByRole("button", { name: "添加" }));
  await waitFor(() =>
    expect(callbacks.onCreateTodo).toHaveBeenCalledExactlyOnceWith("去散步", {
      date: "2026-10-24",
      notes: "",
    }),
  );
  expect(screen.getByRole("textbox", { name: "新待办内容" })).toHaveValue("");
  expect(
    screen.getByRole("status", { name: "新建待办反馈" }),
  ).toHaveTextContent("明天");
  fireEvent.click(screen.getByRole("button", { name: "查看待办" }));
  expect(callbacks.onShowTodos).toHaveBeenCalledOnce();
});

it("creates a checklist note in the chosen notebook without creating a daily task", async () => {
  const callbacks = setup("note", [
    book,
    { ...book, id: "book-2", name: "工作" },
  ]);
  fireEvent.click(screen.getByRole("button", { name: "新建便签" }));
  fireEvent.change(screen.getByRole("combobox", { name: "新便签所属便签本" }), {
    target: { value: "book-2" },
  });
  fireEvent.click(screen.getByRole("button", { name: /清单便签/ }));
  await waitFor(() =>
    expect(callbacks.onCreateNote).toHaveBeenCalledExactlyOnceWith(
      "todo",
      "book-2",
    ),
  );
  expect(callbacks.onCreateTodo).not.toHaveBeenCalled();
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
});

it("retains failed note creation in the panel for retry", async () => {
  const callbacks = setup("note");
  callbacks.onCreateNote.mockRejectedValueOnce(new Error("disk unavailable"));
  fireEvent.click(screen.getByRole("button", { name: "新建便签" }));
  fireEvent.click(screen.getByRole("button", { name: /文字便签/ }));
  expect(await screen.findByRole("alert")).toHaveTextContent("新建失败");
  expect(screen.getByRole("dialog")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: /文字便签/ }));
  await waitFor(() => expect(callbacks.onCreateNote).toHaveBeenCalledTimes(2));
});

it("can establish the first notebook without leaving the creation flow", async () => {
  const callbacks = setup("note", []);
  fireEvent.click(screen.getByRole("button", { name: "新建便签" }));
  fireEvent.change(screen.getByRole("textbox", { name: "第一个便签本名称" }), {
    target: { value: "日常灵感" },
  });
  fireEvent.click(screen.getByRole("button", { name: "建立便签本" }));
  await waitFor(() =>
    expect(callbacks.onCreateNotebook).toHaveBeenCalledExactlyOnceWith(
      "日常灵感",
    ),
  );
});
