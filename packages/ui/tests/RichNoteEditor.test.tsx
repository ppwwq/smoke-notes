import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Note } from "@smoke-notes/core";
import { RichNoteEditor, type NoteEdit } from "../src/index";

const note: Note = {
  id: "note-1",
  notebookId: "book-1",
  kind: "note",
  title: "标注示例",
  body: "",
  contentJson: { type: "doc", content: [{ type: "paragraph" }] },
  color: "amber",
  rank: 1024,
  version: 1,
  conflictOf: null,
  updatedAt: "2026-08-28T12:00:00.000Z",
  deletedAt: null,
};

afterEach(cleanup);

describe("RichNoteEditor", () => {
  it("shows legacy default titles as an untouched empty input", () => {
    const onSave = vi.fn();
    render(
      <RichNoteEditor note={{ ...note, title: "主标题" }} onSave={onSave} />,
    );

    expect(screen.getByRole("textbox", { name: "便签标题" })).toHaveValue("");
    expect(screen.getByPlaceholderText("输入标题")).toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled();
  });
  it("shows the Windows-style formatting and marking controls", () => {
    render(<RichNoteEditor note={note} onSave={vi.fn()} />);

    expect(screen.getByRole("button", { name: "粗体" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "斜体" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "下划线" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "删除线" })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "待办清单" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "项目符号" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "字体颜色" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "荧光标注" }),
    ).toBeInTheDocument();
  });

  it("renders task items as checkboxes and autosaves their checked state", async () => {
    const user = userEvent.setup();
    const onSave = vi
      .fn<(changes: NoteEdit) => Promise<void>>()
      .mockResolvedValue(undefined);
    const taskNote: Note = {
      ...note,
      kind: "todo",
      title: "采购清单",
      body: "牛奶",
      contentJson: {
        type: "doc",
        content: [
          {
            type: "taskList",
            content: [
              {
                type: "taskItem",
                attrs: { checked: false },
                content: [
                  {
                    type: "paragraph",
                    content: [{ type: "text", text: "牛奶" }],
                  },
                ],
              },
            ],
          },
        ],
      },
    };
    render(<RichNoteEditor note={taskNote} onSave={onSave} />);

    const checkbox = screen.getByRole("checkbox");
    expect(checkbox.closest("li")).toHaveClass("task-list-item");
    expect(checkbox).not.toBeChecked();
    await user.click(checkbox);

    await waitFor(() => expect(onSave).toHaveBeenCalled(), { timeout: 1800 });
    expect(onSave.mock.lastCall?.[0].contentJson.content[0]).toMatchObject({
      type: "taskList",
      content: [
        expect.objectContaining({
          type: "taskItem",
          attrs: { checked: true },
        }),
      ],
    });
    expect(checkbox.closest("li")).toHaveAttribute("data-checked", "true");
  });

  it("autosaves the title and plain-text preview after editing", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn(async () => undefined);
    render(<RichNoteEditor note={note} onSave={onSave} />);

    const title = screen.getByRole("textbox", { name: "便签标题" });
    await user.clear(title);
    await user.type(title, "新的标题");
    const editor = screen.getByRole("textbox", { name: "便签正文" });
    await user.click(editor);
    await user.type(editor, "重点内容");

    await waitFor(
      () =>
        expect(onSave).toHaveBeenLastCalledWith(
          expect.objectContaining({
            title: "新的标题",
            body: "重点内容",
          }),
        ),
      { timeout: 1800 },
    );
  });

  it("reloads an externally updated version of the same note", async () => {
    const { rerender } = render(
      <RichNoteEditor note={note} onSave={vi.fn()} />,
    );
    const remoteNote: Note = {
      ...note,
      title: "手机改动",
      body: "已从手机同步",
      contentJson: {
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [{ type: "text", text: "已从手机同步" }],
          },
        ],
      },
      version: 2,
    };

    rerender(<RichNoteEditor note={remoteNote} onSave={vi.fn()} />);

    await waitFor(() =>
      expect(screen.getByRole("textbox", { name: "便签标题" })).toHaveValue(
        "手机改动",
      ),
    );
    expect(screen.getByRole("textbox", { name: "便签正文" })).toHaveTextContent(
      "已从手机同步",
    );
  });
});
