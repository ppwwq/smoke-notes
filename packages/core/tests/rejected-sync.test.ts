import { afterEach, beforeEach, expect, it } from "vitest";
import {
  LocalRepository,
  SmokeNotesDatabase,
  SyncEngine,
  type Note,
  type SyncOperation,
} from "../src/index";
let db: SmokeNotesDatabase;
let repo: LocalRepository;
let note: Note;
beforeEach(async () => {
  db = new SmokeNotesDatabase("rejected-sync-" + crypto.randomUUID());
  repo = new LocalRepository(db, {
    workspaceId: "workspace",
    deviceId: "desktop",
  });
  const book = await repo.createNotebook("笔记");
  note = await repo.createNote(book.id, { title: "原始标题", body: "" });
  await db.operations.clear();
});
afterEach(async () => db.delete());
it.each([
  ["notebook", 81, /80/],
  ["todo", 501, /500/],
  ["title", 201, /200/],
  ["body", 100001, /100000/],
] as const)(
  "rejects an oversized %s before changing local data or the outbox",
  async (field, length, message) => {
    const value = "x".repeat(length);
    const save =
      field === "notebook"
        ? repo.createNotebook(value)
        : field === "todo"
          ? repo.createTodo(value)
          : repo.updateNote(
              note.id,
              field === "title"
                ? { title: value }
                : { title: note.title, body: value },
            );
    await expect(save).rejects.toThrow(message);
    expect(await repo.getNote(note.id)).toEqual(note);
    expect(await repo.listNotebooks()).toHaveLength(1);
    expect(await repo.listTodos()).toHaveLength(0);
    expect(await repo.listPendingOperations()).toEqual([]);
  },
);

it("keeps the full 200-character title when preserving a conflict copy", async () => {
  const remoteTitle = "远".repeat(200);
  await repo.updateNote(note.id, { title: remoteTitle });
  await db.operations.clear();
  await repo.updateNote(note.id, { title: "我的标题", baseSnapshot: note });
  const notes = await repo.listNotes(note.notebookId);
  expect(
    notes.some(
      (item) => item.conflictOf === note.id && item.title === remoteTitle,
    ),
  ).toBe(true);
  expect(notes.some((item) => item.title === "我的标题")).toBe(true);
});

it("uploads a correction after an old oversized title was definitively rejected", async () => {
  // Simulate an outbox written by an older client, before input validation.
  const invalid = { ...note, title: "x".repeat(201), version: 2 };
  await db.notes.put(invalid);
  const now = new Date().toISOString();
  const oldId = crypto.randomUUID();
  await db.operations.add({
    id: oldId,
    deviceId: "desktop",
    entity: "note",
    entityId: note.id,
    action: "upsert",
    baseVersion: 1,
    baseSnapshot: note,
    payload: { ...invalid },
    attempts: 2,
    createdAt: now,
    nextAttemptAt: now,
  });
  const uploads: SyncOperation[] = [];
  let server = note;
  const engine = new SyncEngine(
    db,
    {
      push: async (operation) => {
        uploads.push(structuredClone(operation));
        if (String(operation.payload.title).length > 200)
          return { status: "rejected" as const, reason: "text_too_long" };
        if (operation.baseVersion !== server.version)
          return { status: "conflict", record: server };
        server = operation.payload as unknown as Note;
        return { status: "applied" };
      },
      pull: async () => ({ changes: [], cursor: "next" }),
    },
    { deviceId: "desktop" },
  );
  await engine.flush();
  await engine.flush();
  expect(uploads).toHaveLength(1);
  expect((await repo.getNote(note.id))?.title).toHaveLength(201);
  await repo.updateNote(note.id, { title: "已经改短" });
  await engine.flush();
  expect(server).toMatchObject({ title: "已经改短", version: 2 });
  expect(uploads[1].id).not.toBe(oldId);
  expect(await repo.listPendingOperations()).toEqual([]);
});
