import { createRef } from "react";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Note } from "@smoke-notes/core";
import {
  RichNoteEditor,
  type NoteEdit,
  type RichNoteEditorHandle,
} from "../src/index";

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

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

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

  it("keeps unsaved title, body and color through an unchanged background refresh", async () => {
    const user = userEvent.setup();
    const onSave = vi
      .fn<(changes: NoteEdit) => Promise<void>>()
      .mockResolvedValue(undefined);
    const { rerender } = render(<RichNoteEditor note={note} onSave={onSave} />);
    fireEvent.change(screen.getByRole("textbox", { name: "便签标题" }), {
      target: { value: "未保存标题" },
    });
    await user.type(screen.getByRole("textbox", { name: "便签正文" }), "草稿");
    fireEvent.click(screen.getByRole("button", { name: "便签颜色：rose" }));

    rerender(<RichNoteEditor note={structuredClone(note)} onSave={onSave} />);

    expect(screen.getByRole("textbox", { name: "便签标题" })).toHaveValue(
      "未保存标题",
    );
    expect(screen.getByRole("textbox", { name: "便签正文" })).toHaveTextContent(
      "草稿",
    );
    expect(screen.getByRole("button", { name: "便签颜色：rose" })).toHaveClass(
      "active",
    );
    await waitFor(
      () =>
        expect(onSave).toHaveBeenLastCalledWith(
          expect.objectContaining({
            title: "未保存标题",
            body: "草稿",
            color: "rose",
          }),
        ),
      { timeout: 1800 },
    );
  });

  it("merges untouched remote fields without overwriting a dirty local title", async () => {
    vi.useFakeTimers();
    const onSave = vi
      .fn<(changes: NoteEdit) => Promise<void>>()
      .mockResolvedValue(undefined);
    const { rerender } = render(<RichNoteEditor note={note} onSave={onSave} />);
    fireEvent.change(screen.getByRole("textbox", { name: "便签标题" }), {
      target: { value: "本机草稿" },
    });
    const remote: Note = {
      ...note,
      title: "远端标题",
      color: "rose",
      body: "远端正文",
      version: 2,
      contentJson: {
        type: "doc",
        content: [
          { type: "paragraph", content: [{ type: "text", text: "远端正文" }] },
        ],
      },
    };

    rerender(<RichNoteEditor note={remote} onSave={onSave} />);

    expect(screen.getByRole("textbox", { name: "便签标题" })).toHaveValue(
      "本机草稿",
    );
    expect(screen.getByRole("textbox", { name: "便签正文" })).toHaveTextContent(
      "远端正文",
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });
    expect(onSave).toHaveBeenLastCalledWith(
      expect.objectContaining({
        title: "本机草稿",
        body: "远端正文",
        color: "rose",
      }),
    );
  });

  it("flushes edits made during a pending save without letting the earlier response reset them", async () => {
    vi.useFakeTimers();
    let finishFirst!: () => void;
    const firstSave = new Promise<void>((resolve) => {
      finishFirst = resolve;
    });
    const onSave = vi
      .fn<(changes: NoteEdit) => Promise<void>>()
      .mockReturnValueOnce(firstSave)
      .mockResolvedValue(undefined);
    const ref = createRef<RichNoteEditorHandle>();
    const { rerender } = render(
      <RichNoteEditor ref={ref} note={note} onSave={onSave} />,
    );
    fireEvent.change(screen.getByRole("textbox", { name: "便签标题" }), {
      target: { value: "第一版" },
    });
    let flushing!: Promise<void>;
    act(() => {
      flushing = ref.current!.flushSave();
    });
    expect(onSave).toHaveBeenCalledTimes(1);
    fireEvent.change(screen.getByRole("textbox", { name: "便签标题" }), {
      target: { value: "第二版" },
    });

    rerender(
      <RichNoteEditor
        ref={ref}
        note={{ ...structuredClone(note), title: "第一版", version: 2 }}
        onSave={onSave}
      />,
    );

    expect(screen.getByRole("textbox", { name: "便签标题" })).toHaveValue(
      "第二版",
    );
    await act(async () => {
      finishFirst();
      await flushing;
    });
    expect(onSave).toHaveBeenCalledTimes(2);
    expect(onSave).toHaveBeenLastCalledWith(
      expect.objectContaining({ title: "第二版" }),
    );
  });

  it("waits for an existing autosave when explicitly flushing without duplicate writes", async () => {
    vi.useFakeTimers();
    let finishSave!: () => void;
    const pending = new Promise<void>((resolve) => {
      finishSave = resolve;
    });
    const onSave = vi
      .fn<(changes: NoteEdit) => Promise<void>>()
      .mockReturnValue(pending);
    const ref = createRef<RichNoteEditorHandle>();
    render(<RichNoteEditor ref={ref} note={note} onSave={onSave} />);
    fireEvent.change(screen.getByRole("textbox", { name: "便签标题" }), {
      target: { value: "保存中" },
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });
    let flushing!: Promise<void>;
    act(() => {
      flushing = ref.current!.flushSave();
    });

    expect(onSave).toHaveBeenCalledTimes(1);
    await act(async () => {
      finishSave();
      await flushing;
    });
    await act(async () => {
      await ref.current!.flushSave();
    });
    expect(onSave).toHaveBeenCalledTimes(1);
  });

  it("resets the draft on a note-ID change without saving the previous draft into the new note", async () => {
    vi.useFakeTimers();
    const oldSave = vi.fn(async () => undefined);
    const nextSave = vi.fn(async () => undefined);
    const { rerender } = render(
      <RichNoteEditor note={note} onSave={oldSave} />,
    );
    fireEvent.change(screen.getByRole("textbox", { name: "便签标题" }), {
      target: { value: "原便签草稿" },
    });

    rerender(
      <RichNoteEditor
        note={{ ...note, id: "note-2", title: "另一张便签" }}
        onSave={nextSave}
      />,
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });

    expect(screen.getByRole("textbox", { name: "便签标题" })).toHaveValue(
      "另一张便签",
    );
    expect(oldSave).not.toHaveBeenCalled();
    expect(nextSave).not.toHaveBeenCalled();
  });

  it("reports a failed autosave while retaining the draft for an explicit retry", async () => {
    vi.useFakeTimers();
    const onSave = vi
      .fn<(changes: NoteEdit) => Promise<void>>()
      .mockRejectedValueOnce(new Error("disk full"))
      .mockResolvedValue(undefined);
    const ref = createRef<RichNoteEditorHandle>();
    render(<RichNoteEditor ref={ref} note={note} onSave={onSave} />);
    fireEvent.change(screen.getByRole("textbox", { name: "便签标题" }), {
      target: { value: "保留草稿" },
    });
    expect(screen.queryByText("已自动保存")).not.toBeInTheDocument();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });

    expect(screen.getByText("保存失败")).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "便签标题" })).toHaveValue(
      "保留草稿",
    );
    await act(async () => {
      await ref.current!.flushSave();
    });
    expect(onSave).toHaveBeenCalledTimes(2);
    expect(onSave).toHaveBeenLastCalledWith(
      expect.objectContaining({ title: "保留草稿" }),
    );
    expect(screen.getByText("已自动保存")).toBeInTheDocument();
  });
});
