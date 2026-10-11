import { createRef } from "react";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type { Editor } from "@tiptap/react";
import {
  migrateLegacyNoteContent as plainTextToRichText,
  sameValue,
  type Note,
} from "@smoke-notes/core";
import {
  RichNoteEditor,
  type NoteEdit,
  type RichNoteEditorHandle,
} from "../src/components/RichNoteEditor";

const note: Note = {
  id: "one",
  notebookId: "book",
  kind: "note",
  title: "标题",
  body: "第一段文字\n第二段文字\n第三段文字",
  contentJson: plainTextToRichText("第一段文字\n第二段文字\n第三段文字"),
  color: "amber",
  rank: 1,
  version: 1,
  conflictOf: null,
  updatedAt: "2026-10-11T00:00:00Z",
  deletedAt: null,
};
function currentEditor() {
  return (
    screen.getByRole("textbox", { name: "便签正文" }) as HTMLElement & {
      editor: Editor;
    }
  ).editor;
}
function reorder(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(reorder);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value)
        .reverse()
        .map(([key, item]) => [key, reorder(item)]),
    );
  return value;
}
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

it("keeps the selection and DOM when JSONB only reorders object properties", () => {
  const onSave = vi.fn();
  const view = render(<RichNoteEditor note={note} onSave={onSave} />);
  const editor = currentEditor();
  act(() => {
    editor.commands.setTextSelection(5);
  });
  const paragraph = editor.view.dom.firstChild;
  view.rerender(
    <RichNoteEditor
      note={{
        ...note,
        version: 2,
        contentJson: reorder(note.contentJson) as Note["contentJson"],
      }}
      onSave={onSave}
    />,
  );
  expect(editor.state.selection.from).toBe(5);
  expect(editor.view.dom.firstChild).toBe(paragraph);
  expect(onSave).not.toHaveBeenCalled();
});

it("maps a selection through a real remote insertion and preserves the scroll offset", () => {
  const onSave = vi.fn();
  const view = render(<RichNoteEditor note={note} onSave={onSave} />);
  const editor = currentEditor();
  act(() => {
    editor.commands.setTextSelection({ from: 3, to: 5 });
  });
  const body = editor.view.dom.closest(".rich-note-body")!;
  body.scrollTop = 125;
  const text = "新" + note.body;
  view.rerender(
    <RichNoteEditor
      note={{
        ...note,
        version: 2,
        body: text,
        contentJson: plainTextToRichText(text),
      }}
      onSave={onSave}
    />,
  );
  expect(editor.state.selection.from).toBe(4);
  expect(editor.state.selection.to).toBe(6);
  expect(body.scrollTop).toBe(125);
  expect(onSave).not.toHaveBeenCalled();
});

it("ignores property order but retains text, array order, marks and checkbox differences", () => {
  expect(sameValue(note.contentJson, reorder(note.contentJson))).toBe(true);
  expect(sameValue({ content: ["a", "b"] }, { content: ["b", "a"] })).toBe(
    false,
  );
  expect(sameValue({ checked: true }, { checked: false })).toBe(false);
  expect(
    sameValue({ text: "a", marks: [{ type: "bold" }] }, { text: "a" }),
  ).toBe(false);
});

it("keeps the caret through an equivalent save response", async () => {
  const ref = createRef<RichNoteEditorHandle>();
  const onSave = vi.fn(async (changes: NoteEdit) => ({
    ...note,
    ...changes,
    version: 2,
    contentJson: reorder(changes.contentJson) as Note["contentJson"],
  }));
  render(<RichNoteEditor ref={ref} note={note} onSave={onSave} />);
  const editor = currentEditor();
  act(() => {
    editor.commands.setTextSelection(5);
    editor.commands.insertContent("X");
  });
  const position = editor.state.selection.from;
  await act(async () => {
    await ref.current!.flushSave();
  });
  expect(editor.state.selection.from).toBe(position);
  expect(onSave).toHaveBeenCalledOnce();
});

it("defers autosave and remote replacement until composition finishes", async () => {
  vi.useFakeTimers();
  const onSave = vi.fn();
  const view = render(<RichNoteEditor note={note} onSave={onSave} />);
  const body = screen.getByRole("textbox", { name: "便签正文" });
  fireEvent.compositionStart(body);
  act(() => {
    currentEditor().commands.insertContent("中文");
  });
  const local = body.textContent;
  const remote = {
    ...note,
    title: "远端标题",
    body: "远端正文",
    contentJson: plainTextToRichText("远端正文"),
    version: 2,
  };
  view.rerender(<RichNoteEditor note={remote} onSave={onSave} />);
  await act(async () => {
    await vi.advanceTimersByTimeAsync(700);
  });
  expect(onSave).not.toHaveBeenCalled();
  expect(body.textContent).toBe(local);
  expect(screen.getByRole("textbox", { name: "便签标题" })).toHaveValue(
    note.title,
  );
  fireEvent.compositionEnd(body);
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0);
  });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(500);
  });
  expect(body.textContent).toBe(local);
  expect(screen.getByRole("textbox", { name: "便签标题" })).toHaveValue(
    "远端标题",
  );
  expect(onSave).toHaveBeenCalledWith(
    expect.objectContaining({
      body: expect.stringContaining("中文"),
      baseSnapshot: expect.objectContaining({ body: note.body }),
    }),
  );
});

it("does not apply an old asynchronous save response after switching notes", async () => {
  const ref = createRef<RichNoteEditorHandle>();
  let resolve!: (saved: Note) => void;
  const oldSave = vi.fn(
    () =>
      new Promise<Note>((done) => {
        resolve = done;
      }),
  );
  const view = render(
    <RichNoteEditor ref={ref} note={note} onSave={oldSave} />,
  );
  fireEvent.change(screen.getByRole("textbox", { name: "便签标题" }), {
    target: { value: "草稿" },
  });
  let saving!: Promise<void>;
  act(() => {
    saving = ref.current!.flushSave();
  });
  const next = {
    ...note,
    id: "two",
    title: "另一张",
    body: "另一段",
    contentJson: plainTextToRichText("另一段"),
  };
  const newSave = vi.fn();
  view.rerender(<RichNoteEditor ref={ref} note={next} onSave={newSave} />);
  await act(async () => {
    resolve({
      ...note,
      title: "旧结果",
      contentJson: plainTextToRichText("旧结果"),
    });
    await saving;
  });
  expect(screen.getByRole("textbox", { name: "便签标题" })).toHaveValue(
    "另一张",
  );
  expect(currentEditor().getText()).toBe("另一段");
  expect(newSave).not.toHaveBeenCalled();
});
