import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  LocalRepository,
  SmokeNotesDatabase,
  SyncEngine,
  migrateLegacyNoteContent,
  type Note,
  type RemoteRecord,
  type SyncOperation,
} from "../src/index";

describe("note conflict reconciliation", () => {
  let db: SmokeNotesDatabase;
  let repo: LocalRepository;
  let engine: SyncEngine;
  let note: Note;
  let server: Note;
  let beforeResponse: (() => Promise<void>) | undefined;
  let uploads: SyncOperation[];
  beforeEach(async () => {
    db = new SmokeNotesDatabase(`merge-${crypto.randomUUID()}`);
    repo = new LocalRepository(db, {
      workspaceId: "workspace",
      deviceId: "desktop",
    });
    const notebook = await repo.createNotebook("笔记");
    note = await repo.createNote(notebook.id, { title: "标题", body: "原文" });
    await db.operations.clear();
    server = structuredClone(note);
    beforeResponse = undefined;
    uploads = [];
    engine = new SyncEngine(
      db,
      {
        async push(operation) {
          uploads.push(structuredClone(operation));
          const response: RemoteRecord = structuredClone(server);
          if (beforeResponse) {
            const callback = beforeResponse;
            beforeResponse = undefined;
            await callback();
          }
          if (
            operation.entityId === note.id &&
            operation.baseVersion !== response.version
          )
            return { status: "conflict", record: response };
          if (operation.entityId === note.id)
            server = {
              ...operation.payload,
              version: response.version + 1,
            } as unknown as Note;
          return { status: "applied" };
        },
        pull: async () => ({
          changes: [{ entity: "note", record: structuredClone(server) }],
          cursor: "next",
        }),
      },
      { deviceId: "desktop" },
    );
  });
  afterEach(async () => db.delete());
  function editRemote(changes: Partial<Note>) {
    server = {
      ...server,
      ...changes,
      version: server.version + 1,
      ...(changes.body === undefined
        ? {}
        : { contentJson: migrateLegacyNoteContent(changes.body) }),
    };
  }
  it("merges a local color change with a remote text edit on the original note", async () => {
    await repo.updateNote(note.id, { title: note.title, color: "sky" });
    editRemote({ body: "手机正文" });
    expect(await engine.flush()).toMatchObject({ conflicts: 0, failed: 0 });
    expect(await repo.listNotes(note.notebookId)).toMatchObject([
      { id: note.id, body: "手机正文", color: "sky" },
    ]);
    await engine.flush();
    expect(server).toMatchObject({
      body: "手机正文",
      color: "sky",
      version: 3,
    });
    expect(await repo.listPendingOperations()).toEqual([]);
    expect(uploads[1].id).not.toBe(uploads[0].id);
  });
  it("does not enqueue or increment versions when saving unchanged content", async () => {
    expect(
      await repo.updateNote(note.id, {
        title: note.title,
        body: note.body,
        color: note.color,
      }),
    ).toEqual(note);
    expect(await repo.listPendingOperations()).toEqual([]);
  });
  it("preserves the first base through offline compaction and edits during upload", async () => {
    await repo.updateNote(note.id, { title: note.title, color: "rose" });
    await repo.updateNote(note.id, { title: note.title, color: "sky" });
    editRemote({ body: "手机正文" });
    beforeResponse = async () => {
      await repo.updateNote(note.id, { title: "上传时的新标题" });
    };
    expect(await engine.flush()).toMatchObject({ conflicts: 0, failed: 0 });
    await engine.flush();
    expect(server).toMatchObject({
      title: "上传时的新标题",
      body: "手机正文",
      color: "sky",
      version: 3,
    });
    expect(await repo.listNotes(note.notebookId)).toHaveLength(1);
    expect(await repo.listPendingOperations()).toEqual([]);
  });
  it("keeps both bodies when the same text field diverges", async () => {
    await repo.updateNote(note.id, { title: note.title, body: "电脑正文" });
    editRemote({ body: "手机正文" });
    expect(await engine.flush()).toMatchObject({ conflicts: 1, failed: 0 });
    expect(await repo.listNotes(note.notebookId)).toMatchObject([
      { id: note.id, body: "手机正文" },
      { conflictOf: note.id, body: "电脑正文" },
    ]);
  });
  it("keeps local text when the remote note was deleted", async () => {
    await repo.updateNote(note.id, { title: note.title, body: "电脑正文" });
    editRemote({ deletedAt: "2026-09-24T00:00:00Z" });
    expect(await engine.flush()).toMatchObject({ conflicts: 1, failed: 0 });
    expect(await repo.listNotes(note.notebookId)).toMatchObject([
      { conflictOf: note.id, body: "电脑正文", deletedAt: null },
    ]);
  });
  it("keeps a copy for legacy operations whose original fields are unknown", async () => {
    await repo.updateNote(note.id, { title: note.title, color: "sky" });
    const operation = (await repo.listPendingOperations())[0];
    const legacy = { ...operation };
    delete legacy.baseSnapshot;
    await db.operations.put(legacy);
    editRemote({ body: "手机正文" });
    expect(await engine.flush()).toMatchObject({ conflicts: 1, failed: 0 });
    expect(await repo.listNotes(note.notebookId)).toHaveLength(2);
  });
  it("deduplicates rich text whose JSON object keys have a different order", async () => {
    await repo.updateNote(note.id, { title: "新标题" });
    editRemote({ title: "新标题" });
    server.contentJson = {
      content: [
        { content: [{ text: "原文", type: "text" }], type: "paragraph" },
      ],
      type: "doc",
    };
    expect(await engine.flush()).toMatchObject({ conflicts: 0, failed: 0 });
    expect(await repo.listNotes(note.notebookId)).toHaveLength(1);
    expect(await repo.listPendingOperations()).toEqual([]);
  });
  it("does not mistake formatting changes for identical plain text", async () => {
    await repo.updateNote(note.id, {
      title: note.title,
      contentJson: {
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [
              { type: "text", text: "原文", marks: [{ type: "bold" }] },
            ],
          },
        ],
      },
    });
    editRemote({
      contentJson: {
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [
              { type: "text", text: "原文", marks: [{ type: "italic" }] },
            ],
          },
        ],
      },
    });
    expect(await engine.flush()).toMatchObject({ conflicts: 1, failed: 0 });
    expect(await repo.listNotes(note.notebookId)).toHaveLength(2);
  });
  it("reconciles another remote edit before the merged operation is uploaded", async () => {
    await repo.updateNote(note.id, { title: note.title, color: "sky" });
    editRemote({ body: "手机正文" });
    await engine.flush();
    editRemote({ title: "手机标题" });
    expect(await engine.flush()).toMatchObject({ conflicts: 0, failed: 0 });
    await engine.flush();
    expect(server).toMatchObject({
      title: "手机标题",
      body: "手机正文",
      color: "sky",
      version: 4,
    });
    expect(await repo.listPendingOperations()).toEqual([]);
  });
});
