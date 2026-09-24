import { createRef } from "react";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, it } from "vitest";
import {
  LocalRepository,
  SmokeNotesDatabase,
  SyncEngine,
  type Note,
} from "@smoke-notes/core";
import {
  RichNoteEditor,
  type NoteEdit,
  type RichNoteEditorHandle,
} from "../src/components/RichNoteEditor";

let database: SmokeNotesDatabase;
let repository: LocalRepository;
let note: Note;
beforeEach(async () => {
  database = new SmokeNotesDatabase("editor-conflict-" + crypto.randomUUID());
  repository = new LocalRepository(database, {
    workspaceId: "workspace",
    deviceId: "desktop",
  });
  const book = await repository.createNotebook("笔记");
  note = await repository.createNote(book.id, {
    title: "原始标题",
    body: "原始正文",
  });
  await database.operations.clear();
});
afterEach(async () => {
  cleanup();
  await database.delete();
});
function remoteEngine(remote: Note) {
  return new SyncEngine(
    database,
    {
      push: async () => ({ status: "applied" }),
      pull: async () => ({
        changes: [{ entity: "note", record: remote }],
        cursor: "next",
      }),
    },
    { deviceId: "desktop" },
  );
}
it("preserves both edits when a remote title arrives while a local draft is dirty", async () => {
  const ref = createRef<RichNoteEditorHandle>();
  const onSave = (changes: NoteEdit) => repository.updateNote(note.id, changes);
  const view = render(<RichNoteEditor ref={ref} note={note} onSave={onSave} />);
  fireEvent.change(screen.getByRole("textbox", { name: "便签标题" }), {
    target: { value: "我的草稿" },
  });
  await remoteEngine({ ...note, title: "手机标题", version: 2 }).pull(null);
  view.rerender(
    <RichNoteEditor
      ref={ref}
      note={(await repository.getNote(note.id))!}
      onSave={onSave}
    />,
  );
  await act(async () => {
    await ref.current!.flushSave();
  });
  const notes = await repository.listNotes(note.notebookId);
  expect(notes.some((item) => item.title.startsWith("手机标题"))).toBe(true);
  expect(notes.some((item) => item.title.startsWith("我的草稿"))).toBe(true);
  expect(notes).toHaveLength(2);
  // Subsequent edits of the saved draft must not create copies repeatedly.
  fireEvent.change(screen.getByRole("textbox", { name: "便签标题" }), {
    target: { value: "继续编辑" },
  });
  await act(async () => {
    await ref.current!.flushSave();
  });
  expect(await repository.listNotes(note.notebookId)).toHaveLength(2);
});
it("advances the edit baseline when a remote update already matches the draft", async () => {
  const ref = createRef<RichNoteEditorHandle>();
  const onSave = (changes: NoteEdit) => repository.updateNote(note.id, changes);
  const view = render(<RichNoteEditor ref={ref} note={note} onSave={onSave} />);
  fireEvent.change(screen.getByRole("textbox", { name: "便签标题" }), {
    target: { value: "双方相同" },
  });
  await remoteEngine({ ...note, title: "双方相同", version: 2 }).pull(null);
  view.rerender(
    <RichNoteEditor
      ref={ref}
      note={(await repository.getNote(note.id))!}
      onSave={onSave}
    />,
  );
  fireEvent.change(screen.getByRole("textbox", { name: "便签标题" }), {
    target: { value: "继续输入" },
  });
  await act(async () => {
    await ref.current!.flushSave();
  });
  expect((await repository.getNote(note.id))?.title).toBe("继续输入");
  expect(await repository.listNotes(note.notebookId)).toHaveLength(1);
});

it("renders remotely merged rich text from the save result without waiting for another refresh", async () => {
  const ref = createRef<RichNoteEditorHandle>();
  const onSave = (changes: NoteEdit) => repository.updateNote(note.id, changes);
  render(<RichNoteEditor ref={ref} note={note} onSave={onSave} />);
  fireEvent.change(screen.getByRole("textbox", { name: "便签标题" }), {
    target: { value: "我的标题" },
  });
  const contentJson = {
    type: "doc" as const,
    content: [
      { type: "paragraph", content: [{ type: "text", text: "手机新正文" }] },
    ],
  };
  await remoteEngine({
    ...note,
    contentJson,
    body: "手机新正文",
    version: 2,
  }).pull(null);
  await act(async () => {
    await ref.current!.flushSave();
  });
  expect(screen.getByRole("textbox", { name: "便签正文" })).toHaveTextContent(
    "手机新正文",
  );
  expect(await repository.getNote(note.id)).toMatchObject({
    title: "我的标题",
    body: "手机新正文",
  });
  expect(await repository.listNotes(note.notebookId)).toHaveLength(1);
});

it("merges a remote edit that reaches storage before the editor refreshes", async () => {
  const ref = createRef<RichNoteEditorHandle>();
  const onSave = (changes: NoteEdit) => repository.updateNote(note.id, changes);
  render(<RichNoteEditor ref={ref} note={note} onSave={onSave} />);
  fireEvent.change(screen.getByRole("textbox", { name: "便签标题" }), {
    target: { value: "我的标题" },
  });
  await remoteEngine({ ...note, color: "rose", version: 2 }).pull(null);
  await act(async () => {
    await ref.current!.flushSave();
  });
  expect(await repository.getNote(note.id)).toMatchObject({
    title: "我的标题",
    color: "rose",
  });
  expect(screen.getByRole("button", { name: "便签颜色：rose" })).toHaveClass(
    "active",
  );
  expect(await repository.listNotes(note.notebookId)).toHaveLength(1);
});
