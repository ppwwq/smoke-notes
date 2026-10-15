import { createRef } from "react";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, it } from "vitest";
import type { Editor } from "@tiptap/react";
import {
  LocalRepository,
  SmokeNotesDatabase,
  SyncEngine,
  migrateLegacyNoteContent,
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

it("keeps a conflict copy for a remote body arriving during Chinese composition", async () => {
  const ref = createRef<RichNoteEditorHandle>();
  const onSave = (changes: NoteEdit) => repository.updateNote(note.id, changes);
  const view = render(<RichNoteEditor ref={ref} note={note} onSave={onSave} />);
  const body = screen.getByRole("textbox", {
    name: "便签正文",
  }) as HTMLElement & { editor: Editor };
  fireEvent.compositionStart(body);
  act(() => {
    body.editor.commands.insertContent("中文草稿");
  });
  const localBody = body.editor.getText();
  await remoteEngine({
    ...note,
    version: 2,
    body: "手机正文",
    contentJson: migrateLegacyNoteContent("手机正文"),
  }).pull(null);
  view.rerender(
    <RichNoteEditor
      ref={ref}
      note={(await repository.getNote(note.id))!}
      onSave={onSave}
    />,
  );
  expect(body.editor.getText()).toBe(localBody);
  fireEvent.compositionEnd(body);
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  await act(async () => {
    await ref.current!.flushSave();
  });
  const notes = await repository.listNotes(note.notebookId);
  expect(notes).toHaveLength(2);
  expect(notes.some((item) => item.body === localBody)).toBe(true);
  expect(notes.some((item) => item.body === "手机正文")).toBe(true);
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

it("preserves a remotely merged body when typing continues during its save response", async () => {
  const ref = createRef<RichNoteEditorHandle>();
  let release!: () => void;
  let savedFirst!: (saved: Note) => void;
  const firstSaved = new Promise<Note>((resolve) => {
    savedFirst = resolve;
  });
  const waiting = new Promise<void>((resolve) => {
    release = resolve;
  });
  let saves = 0;
  const onSave = async (changes: NoteEdit) => {
    const saved = await repository.updateNote(note.id, changes);
    if (++saves === 1) {
      savedFirst(saved);
      await waiting;
    }
    return saved;
  };
  render(<RichNoteEditor ref={ref} note={note} onSave={onSave} />);
  fireEvent.change(screen.getByRole("textbox", { name: "便签标题" }), {
    target: { value: "我的标题" },
  });
  await remoteEngine({
    ...note,
    version: 2,
    body: "手机新正文",
    contentJson: migrateLegacyNoteContent("手机新正文"),
  }).pull(null);
  let flushing!: Promise<void>;
  act(() => {
    flushing = ref.current!.flushSave();
  });
  expect((await firstSaved).body).toBe("手机新正文");
  const body = screen.getByRole("textbox", {
    name: "便签正文",
  }) as HTMLElement & { editor: Editor };
  act(() => {
    body.editor.commands.setContent(migrateLegacyNoteContent("电脑新正文"));
  });
  await act(async () => {
    release();
    await flushing;
  });

  const notes = await repository.listNotes(note.notebookId);
  expect(notes.map((item) => item.body).sort()).toEqual([
    "手机新正文",
    "电脑新正文",
  ]);
  expect(body.editor.getText()).toBe("电脑新正文");
});

it("uses a remote body as the baseline after it was displayed before further typing", async () => {
  const ref = createRef<RichNoteEditorHandle>();
  let release!: () => void;
  let savedFirst!: (saved: Note) => void;
  const firstSaved = new Promise<Note>((resolve) => {
    savedFirst = resolve;
  });
  const waiting = new Promise<void>((resolve) => {
    release = resolve;
  });
  let saves = 0;
  const onSave = async (changes: NoteEdit) => {
    const saved = await repository.updateNote(note.id, changes);
    if (++saves === 1) {
      savedFirst(saved);
      await waiting;
    }
    return saved;
  };
  const view = render(<RichNoteEditor ref={ref} note={note} onSave={onSave} />);
  fireEvent.change(screen.getByRole("textbox", { name: "便签标题" }), {
    target: { value: "我的标题" },
  });
  await remoteEngine({
    ...note,
    version: 2,
    body: "手机新正文",
    contentJson: migrateLegacyNoteContent("手机新正文"),
  }).pull(null);
  let flushing!: Promise<void>;
  act(() => {
    flushing = ref.current!.flushSave();
  });
  view.rerender(
    <RichNoteEditor ref={ref} note={await firstSaved} onSave={onSave} />,
  );
  const body = screen.getByRole("textbox", {
    name: "便签正文",
  }) as HTMLElement & { editor: Editor };
  expect(body.editor.getText()).toBe("手机新正文");
  act(() => {
    body.editor.commands.insertContent("继续编辑");
  });
  await act(async () => {
    release();
    await flushing;
  });

  expect(await repository.listNotes(note.notebookId)).toHaveLength(1);
  expect((await repository.getNote(note.id))?.body).toBe(body.editor.getText());
});

it("keeps subsequent typing in one recovered copy when deletion wins a save race", async () => {
  const ref = createRef<RichNoteEditorHandle>();
  let release!: () => void;
  let savedFirst!: (saved: Note) => void;
  const firstSaved = new Promise<Note>((resolve) => {
    savedFirst = resolve;
  });
  const waiting = new Promise<void>((resolve) => {
    release = resolve;
  });
  let saves = 0;
  const onSave = async (changes: NoteEdit) => {
    const saved = await repository.updateNote(
      changes.baseSnapshot?.id ?? note.id,
      changes,
    );
    if (++saves === 1) {
      savedFirst(saved);
      await waiting;
    }
    return saved;
  };
  render(<RichNoteEditor ref={ref} note={note} onSave={onSave} />);
  fireEvent.change(screen.getByRole("textbox", { name: "便签标题" }), {
    target: { value: "保存中的草稿" },
  });
  await repository.trashNote(note.id);
  let flushing!: Promise<void>;
  act(() => {
    flushing = ref.current!.flushSave();
  });
  const copy = await firstSaved;
  expect(copy.id).not.toBe(note.id);
  fireEvent.change(screen.getByRole("textbox", { name: "便签标题" }), {
    target: { value: "保存时继续输入" },
  });
  await act(async () => {
    release();
    await flushing;
  });

  expect(await repository.listNotes(note.notebookId)).toMatchObject([
    { id: copy.id, title: "保存时继续输入" },
  ]);
  expect(await repository.getNote(note.id)).toBeNull();
});

it("recovers later input when an earlier normalized no-op save returns a tombstone", async () => {
  const ref = createRef<RichNoteEditorHandle>();
  let release!: () => void;
  let savedFirst!: (saved: Note) => void;
  const firstSaved = new Promise<Note>((resolve) => {
    savedFirst = resolve;
  });
  const waiting = new Promise<void>((resolve) => {
    release = resolve;
  });
  let saves = 0;
  const onSave = async (changes: NoteEdit) => {
    const saved = await repository.updateNote(
      changes.baseSnapshot?.id ?? note.id,
      changes,
    );
    if (++saves === 1) {
      savedFirst(saved);
      await waiting;
    }
    return saved;
  };
  const view = render(<RichNoteEditor ref={ref} note={note} onSave={onSave} />);
  fireEvent.change(screen.getByRole("textbox", { name: "便签标题" }), {
    target: { value: `${note.title} ` },
  });
  await repository.trashNote(note.id);
  let flushing!: Promise<void>;
  act(() => {
    flushing = ref.current!.flushSave();
  });
  const tombstone = await firstSaved;
  expect(tombstone.deletedAt).not.toBeNull();
  fireEvent.change(screen.getByRole("textbox", { name: "便签标题" }), {
    target: { value: "删除后继续输入" },
  });
  view.rerender(<RichNoteEditor ref={ref} note={tombstone} onSave={onSave} />);
  await act(async () => {
    release();
    await flushing;
  });

  const notes = await repository.listNotes(note.notebookId);
  expect(notes).toHaveLength(1);
  expect(notes[0]).toMatchObject({
    title: "删除后继续输入（冲突副本）",
    deletedAt: null,
    conflictOf: note.id,
  });
  expect(saves).toBe(2);
  expect(await repository.getNote(note.id)).toBeNull();
  expect(screen.getByRole("textbox", { name: "便签标题" })).toHaveValue(
    notes[0].title,
  );
});
