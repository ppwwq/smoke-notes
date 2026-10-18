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
      onCreate={vi.fn()}
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

it("keeps a failed creation draft and retries without submitting IME confirmation", async () => {
  const create = vi
    .fn()
    .mockRejectedValueOnce(new Error("offline failure"))
    .mockResolvedValue(undefined);
  render(
    <WebNotebookCollection
      notebooks={[]}
      onSelect={vi.fn()}
      onCreate={create}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "建立第一个便签本" }));
  const input = screen.getByRole("textbox", { name: "新便签本名称" });
  fireEvent.change(input, { target: { value: "阅读" } });
  fireEvent.keyDown(input, { key: "Enter", isComposing: true, keyCode: 229 });
  expect(create).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "创建" }));
  await screen.findByRole("alert");
  expect(input).toHaveValue("阅读");
  fireEvent.click(screen.getByRole("button", { name: "创建" }));
  await waitFor(() =>
    expect(
      screen.queryByRole("textbox", { name: "新便签本名称" }),
    ).not.toBeInTheDocument(),
  );
  expect(create).toHaveBeenCalledTimes(2);
});

it("prevents duplicate creates and retains a newer draft while a create is pending", async () => {
  let resolve!: () => void;
  const create = vi.fn(
    () =>
      new Promise<void>((done) => {
        resolve = done;
      }),
  );
  render(
    <WebNotebookCollection
      notebooks={notebooks}
      onSelect={vi.fn()}
      onCreate={create}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "建立新便签本" }));
  const input = screen.getByRole("textbox", { name: "新便签本名称" });
  fireEvent.change(input, { target: { value: "旧草稿" } });
  fireEvent.click(screen.getByRole("button", { name: "创建" }));
  fireEvent.submit(input.closest("form")!);
  expect(create).toHaveBeenCalledTimes(1);
  fireEvent.change(input, { target: { value: "新的草稿" } });
  resolve();
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "创建" })).toBeEnabled(),
  );
  expect(input).toHaveValue("新的草稿");
});
