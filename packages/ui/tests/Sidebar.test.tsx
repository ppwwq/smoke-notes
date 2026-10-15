import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type { Notebook } from "@smoke-notes/core";
import { Sidebar } from "../src/components/Sidebar";

afterEach(cleanup);
const notebook: Notebook = {
  id: "notebook-1",
  workspaceId: "workspace",
  name: "工作",
  rank: 1,
  version: 1,
  updatedAt: "2026-09-24T12:00:00Z",
  deletedAt: null,
};
function props() {
  return {
    notebooks: [notebook],
    selectedNotebookId: notebook.id,
    view: "notes" as const,
    onSelectNotebook: vi.fn(),
    onShowTodos: vi.fn(),
    onOpenSettings: vi.fn(),
    onCreateNotebook: vi
      .fn<(name: string) => Promise<void>>()
      .mockResolvedValue(undefined),
    onRenameNotebook: vi
      .fn<(id: string, name: string) => Promise<void>>()
      .mockResolvedValue(undefined),
    onTrashNotebook: vi.fn(async () => {}),
    onMoveNotebook: vi.fn(async () => {}),
  };
}

it("does not duplicate creates or discard a new name typed during saving", async () => {
  const callbacks = props();
  let finish!: () => void;
  callbacks.onCreateNotebook.mockImplementationOnce(
    () =>
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
  );
  render(<Sidebar {...callbacks} />);
  fireEvent.click(screen.getByRole("button", { name: "新建便签本" }));
  const input = screen.getByRole("textbox", { name: "便签本名称" });
  fireEvent.change(input, { target: { value: "第一本" } });
  fireEvent.keyDown(input, { key: "Enter" });
  fireEvent.keyDown(input, { key: "Enter" });
  expect(callbacks.onCreateNotebook).toHaveBeenCalledTimes(1);
  fireEvent.change(input, { target: { value: "第二本" } });
  await act(async () => finish());
  expect(screen.getByRole("textbox", { name: "便签本名称" })).toHaveValue(
    "第二本",
  );
});

it("retains the notebook name and reports create failure", async () => {
  const callbacks = props();
  callbacks.onCreateNotebook.mockRejectedValueOnce(new Error("disk full"));
  render(<Sidebar {...callbacks} />);
  fireEvent.click(screen.getByRole("button", { name: "新建便签本" }));
  const input = screen.getByRole("textbox", { name: "便签本名称" });
  fireEvent.change(input, { target: { value: "草稿本" } });
  fireEvent.keyDown(input, { key: "Enter" });
  expect(await screen.findByRole("alert")).toHaveTextContent("新建失败");
  expect(input).toHaveValue("草稿本");
});

it("does not close a newer rename draft when an earlier rename completes", async () => {
  const callbacks = props();
  let finish!: () => void;
  callbacks.onRenameNotebook.mockImplementationOnce(
    () =>
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
  );
  render(<Sidebar {...callbacks} />);
  fireEvent.click(screen.getByRole("button", { name: "重命名便签本：工作" }));
  const input = screen.getByRole("textbox", { name: "重命名：工作" });
  fireEvent.change(input, { target: { value: "工作一" } });
  fireEvent.keyDown(input, { key: "Enter" });
  fireEvent.keyDown(input, { key: "Enter" });
  expect(callbacks.onRenameNotebook).toHaveBeenCalledTimes(1);
  fireEvent.change(input, { target: { value: "工作二" } });
  await act(async () => finish());
  expect(screen.getByRole("textbox", { name: "重命名：工作" })).toHaveValue(
    "工作二",
  );
});
