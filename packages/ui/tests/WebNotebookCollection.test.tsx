import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { WebNotebookCollection } from "../src/components/WebNotebookCollection";
import type { Notebook } from "@smoke-notes/core";

afterEach(cleanup);
const notebooks: Notebook[] = [
  {
    id: "one",
    name: "工作",
    workspaceId: "space",
    rank: 1,
    version: 1,
    updatedAt: "2026-10-18T00:00:00.000Z",
    deletedAt: null,
  },
];

it("expands the same notebooks and opens the original notebook identity", () => {
  const select = vi.fn();
  render(
    <WebNotebookCollection
      notebooks={notebooks}
      onSelect={select}
      onRename={vi.fn()}
      onTrash={vi.fn()}
      onMove={vi.fn()}
    />,
  );
  const expand = screen.getByRole("button", { name: "展开卡片" });
  fireEvent.click(expand);
  expect(expand).toHaveAttribute("aria-expanded", "true");
  fireEvent.click(screen.getByRole("button", { name: "进入便签本：工作" }));
  expect(select).toHaveBeenCalledWith("one");
  fireEvent.click(expand);
  expect(expand).toHaveAttribute("aria-expanded", "false");
});

it("edits from the card menu without opening the notebook and retains failed input", async () => {
  const select = vi.fn(),
    rename = vi
      .fn()
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValue(undefined);
  render(
    <WebNotebookCollection
      notebooks={notebooks}
      onSelect={select}
      onRename={rename}
      onTrash={vi.fn()}
      onMove={vi.fn()}
    />,
  );
  expect(
    screen.queryByRole("button", { name: "建立新便签本" }),
  ).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "更多便签本操作：工作" }));
  fireEvent.click(screen.getByRole("button", { name: "编辑便签本" }));
  const input = await screen.findByRole("textbox", { name: "便签本名称" });
  fireEvent.change(input, { target: { value: "阅读" } });
  fireEvent.click(screen.getByRole("button", { name: "保存" }));
  await screen.findByRole("alert");
  expect(input).toHaveValue("阅读");
  expect(select).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "保存" }));
  await waitFor(() => expect(rename).toHaveBeenCalledWith("one", "阅读"));
});
it("deletes through the same record action flow", async () => {
  const trash = vi.fn(async () => {}),
    select = vi.fn();
  render(
    <WebNotebookCollection
      notebooks={notebooks}
      onSelect={select}
      onRename={vi.fn()}
      onTrash={trash}
      onMove={vi.fn()}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "更多便签本操作：工作" }));
  fireEvent.click(screen.getByRole("button", { name: "删除便签本：工作" }));
  await waitFor(() => expect(trash).toHaveBeenCalledWith("one"));
  expect(select).not.toHaveBeenCalled();
});
it("keeps each notebook cover through sorting, rename, new notebooks and remount", () => {
  const books = ["one", "two", "three", "four"].map((id, index) => ({
    ...notebooks[0],
    workspaceId: "cover-test",
    id,
    name: id,
    rank: index,
  }));
  localStorage.removeItem("smoke-notes:notebook-tones:cover-test");
  const callbacks = {
    onSelect: vi.fn(),
    onRename: vi.fn(),
    onTrash: vi.fn(),
    onMove: vi.fn(),
  };
  const { rerender, unmount } = render(
    <WebNotebookCollection notebooks={books} {...callbacks} />,
  );
  const cover = (name: string) =>
    screen.getByRole("button", { name: `进入便签本：${name}` }).className;
  expect(cover("four")).toContain("collection-tone-3");
  const reordered = [
    books[3],
    books[0],
    books[1],
    { ...books[2], name: "renamed" },
  ];
  rerender(<WebNotebookCollection notebooks={reordered} {...callbacks} />);
  expect(cover("four")).toContain("collection-tone-3");
  expect(cover("one")).toContain("collection-tone-0");
  expect(cover("renamed")).toContain("collection-tone-2");
  unmount();
  render(
    <WebNotebookCollection
      notebooks={[...reordered, { ...books[0], id: "new", name: "new" }]}
      {...callbacks}
    />,
  );
  expect(cover("four")).toContain("collection-tone-3");
  expect(cover("one")).toContain("collection-tone-0");
  localStorage.removeItem("smoke-notes:notebook-tones:cover-test");
});
