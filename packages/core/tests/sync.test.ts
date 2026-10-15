import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  LocalRepository,
  SmokeNotesDatabase,
  SyncEngine,
  migrateLegacyNoteContent,
  type PushResult,
  type FlushResult,
  type Note,
  type RemoteRecord,
  type RemoteSyncAdapter,
  type SyncOperation,
  type Todo,
} from "../src/index";

describe("SyncEngine", () => {
  let database: SmokeNotesDatabase;
  let repository: LocalRepository;

  beforeEach(() => {
    database = new SmokeNotesDatabase(`sync-test-${crypto.randomUUID()}`);
    let id = 0;
    repository = new LocalRepository(database, {
      workspaceId: "workspace-1",
      deviceId: "desktop-1",
      now: () => new Date("2026-08-28T12:00:00.000Z"),
      createId: () => `seed-${++id}`,
    });
  });

  afterEach(async () => {
    vi.unstubAllGlobals();
    await database.delete();
  });

  it("counts backed-off uploads and separates rejected operations", async () => {
    await repository.createTodo("等待重试");
    await repository.createTodo("被拒绝的记录");
    const operations = await database.operations.toArray();
    await database.operations.update(operations[0]!.id, {
      nextAttemptAt: "2099-01-01T00:00:00Z",
    });
    await database.operations.update(operations[1]!.id, {
      rejected: "text_too_long",
    });
    const engine = new SyncEngine(
      database,
      {
        push: async () => ({ status: "applied" }),
        pull: async () => ({ changes: [], cursor: "next" }),
      },
      { deviceId: "desktop-1" },
    );
    expect(await engine.getQueueState()).toEqual({ pending: 1, rejected: 1 });
  });

  it("removes successfully uploaded operations from the outbox", async () => {
    await repository.createTodo("同步我");
    const adapter: RemoteSyncAdapter = {
      push: vi.fn(async (): Promise<PushResult> => ({ status: "applied" })),
      pull: vi.fn(async () => ({ changes: [], cursor: "1" })),
    };
    const engine = new SyncEngine(database, adapter, {
      deviceId: "desktop-1",
      now: () => new Date("2026-08-28T12:00:00.000Z"),
      createId: () => "unused",
    });

    expect(await engine.flush()).toEqual({
      applied: 1,
      conflicts: 0,
      failed: 0,
    });
    expect(await repository.listPendingOperations()).toEqual([]);
  });

  it("serializes uploads from separate engines connected to the same database", async () => {
    await repository.createTodo("只上传一次");
    const otherDatabase = new SmokeNotesDatabase(database.name);
    const push = vi.fn<RemoteSyncAdapter["push"]>(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
      return { status: "applied" };
    });
    const adapter = { push, pull: async () => ({ changes: [], cursor: "1" }) };
    const first = new SyncEngine(database, adapter, { deviceId: "desktop-1" });
    const second = new SyncEngine(otherDatabase, adapter, {
      deviceId: "desktop-1",
    });
    try {
      const results = await Promise.all([first.flush(), second.flush()]);
      expect(push).toHaveBeenCalledTimes(1);
      expect(results.reduce((sum, result) => sum + result.applied, 0)).toBe(1);
    } finally {
      otherDatabase.close();
    }
  });

  it("waits for the browser's database-scoped lock before uploading", async () => {
    await repository.createTodo("等待其他标签页");
    let grant!: () => Promise<void>;
    const request = vi.fn(
      (_name: string, callback: () => Promise<FlushResult>) =>
        new Promise<FlushResult>((resolve) => {
          grant = async () => resolve(await callback());
        }),
    );
    vi.stubGlobal("navigator", { locks: { request } });
    const push = vi.fn<RemoteSyncAdapter["push"]>(async () => ({
      status: "applied",
    }));
    const engine = new SyncEngine(
      database,
      { push, pull: async () => ({ changes: [], cursor: "1" }) },
      { deviceId: "desktop-1" },
    );

    const flushing = engine.flush();
    expect(request).toHaveBeenCalledWith(
      `smoke-notes:flush:${database.name}`,
      expect.any(Function),
    );
    expect(push).not.toHaveBeenCalled();
    await grant();
    expect(await flushing).toEqual({ applied: 1, conflicts: 0, failed: 0 });
  });

  it.each(["note", "todo"] as const)(
    "ignores a stale %s conflict response after another tab reconciles the operation",
    async (entity) => {
      const notebook = await repository.createNotebook("笔记");
      const original =
        entity === "note"
          ? await repository.createNote(notebook.id, { title: "原文" })
          : await repository.createTodo("原文");
      await database.operations.clear();
      if (entity === "note")
        await repository.updateNote(original.id, { title: "本地修改" });
      else await repository.updateTodo(original.id, { text: "本地修改" });
      const table = entity === "note" ? database.notes : database.todos;
      const remote = {
        ...original,
        ...(entity === "note" ? { title: "远端修改" } : { text: "远端修改" }),
        version: 3,
      };
      const engine = new SyncEngine(
        database,
        {
          push: async (operation) => {
            // A different tab handles the same immutable upload first, then
            // the user edits the reconciled record before this response arrives.
            await database.operations.delete(operation.id);
            if (entity === "note") {
              await database.notes.put(remote as Note);
              await repository.updateNote(original.id, { title: "最新编辑" });
            } else {
              await database.todos.put(remote as Todo);
              await repository.updateTodo(original.id, { text: "最新编辑" });
            }
            return { status: "conflict", record: remote };
          },
          pull: async () => ({ changes: [], cursor: "1" }),
        },
        { deviceId: "desktop-1" },
      );

      expect(await engine.flush()).toEqual({
        applied: 0,
        conflicts: 0,
        failed: 0,
      });
      expect(await table.get(original.id)).toMatchObject(
        entity === "note" ? { title: "最新编辑" } : { text: "最新编辑" },
      );
      expect(await repository.listPendingOperations()).toMatchObject([
        { entityId: original.id, baseVersion: 3 },
      ]);
      expect(await database.notes.count()).toBe(entity === "note" ? 1 : 0);
    },
  );

  it("backs off failed operations without dropping them", async () => {
    await repository.createTodo("稍后再试");
    const adapter: RemoteSyncAdapter = {
      push: vi.fn(async () => {
        throw new Error("offline");
      }),
      pull: vi.fn(async () => ({ changes: [], cursor: "1" })),
    };
    const engine = new SyncEngine(database, adapter, {
      deviceId: "desktop-1",
      now: () => new Date("2026-08-28T12:00:00.000Z"),
      createId: () => "unused",
    });

    expect(await engine.flush()).toEqual({
      applied: 0,
      conflicts: 0,
      failed: 1,
    });
    expect(await repository.listPendingOperations()).toMatchObject([
      { attempts: 1, nextAttemptAt: "2026-08-28T12:00:02.000Z" },
    ]);
  });

  it.each([false, true])(
    "uploads a new notebook before its notes despite reversed IDs (parent failure: %s)",
    async (failParent) => {
      const notebook = await repository.createNotebook("新便签本");
      await repository.createNote(notebook.id, { title: "新便签" });
      const operations = await repository.listPendingOperations();
      await database.operations.clear();
      await database.operations.bulkAdd(
        operations.map((operation) => ({
          ...operation,
          id: operation.entity === "notebook" ? "z-parent" : "a-child",
        })),
      );
      let parentExists = false;
      let rejectParent = failParent;
      let now = new Date("2026-08-28T12:00:00.000Z");
      const push = vi.fn<RemoteSyncAdapter["push"]>(async (operation) => {
        if (operation.entity === "notebook") {
          if (rejectParent) throw new Error("temporarily unavailable");
          parentExists = true;
        } else if (!parentExists) throw new Error("missing notebook");
        return { status: "applied" };
      });
      const engine = new SyncEngine(
        database,
        { push, pull: async () => ({ changes: [], cursor: "next" }) },
        { deviceId: "desktop-1", now: () => now },
      );

      const first = await engine.flush();
      expect(push.mock.calls[0][0].entity).toBe("notebook");
      if (failParent) {
        expect(first).toEqual({ applied: 0, conflicts: 0, failed: 1 });
        expect(push).toHaveBeenCalledTimes(1);
        expect(await database.operations.get("a-child")).toMatchObject({
          attempts: 0,
        });
        rejectParent = false;
        now = new Date("2026-08-28T12:00:03.000Z");
        expect(await engine.flush()).toEqual({
          applied: 2,
          conflicts: 0,
          failed: 0,
        });
      } else expect(first).toEqual({ applied: 2, conflicts: 0, failed: 0 });
      expect(await repository.listPendingOperations()).toEqual([]);
    },
  );

  it("uploads only the latest offline state and rebases subsequent edits", async () => {
    const todo = await repository.createTodo("旧内容");
    for (let i = 0; i < 25; i++)
      await repository.updateTodo(todo.id, { text: `修改${i}` });
    const push = vi.fn(async (): Promise<PushResult> => ({
      status: "applied",
    }));
    const engine = new SyncEngine(
      database,
      { push, pull: async () => ({ changes: [], cursor: "1" }) },
      { deviceId: "desktop-1" },
    );
    await engine.flush();
    expect(push).toHaveBeenCalledTimes(1);
    expect(push.mock.calls[0]).toMatchObject([
      { baseVersion: 0, payload: { text: "修改24", version: 1 } },
    ]);
    await repository.updateTodo(todo.id, { text: "下一次" });
    expect(await repository.listPendingOperations()).toMatchObject([
      { baseVersion: 1, payload: { version: 2 } },
    ]);
  });

  it("does not delete an edit made during upload", async () => {
    const todo = await repository.createTodo("开始");
    await repository.updateTodo(todo.id, { text: "发送内容" });
    const engine = new SyncEngine(
      database,
      {
        push: async () => {
          await repository.updateTodo(todo.id, { text: "发送中继续编辑" });
          return { status: "applied" };
        },
        pull: async () => ({ changes: [], cursor: "1" }),
      },
      { deviceId: "desktop-1" },
    );
    await engine.flush();
    expect(await repository.listPendingOperations()).toMatchObject([
      { baseVersion: 1, payload: { text: "发送中继续编辑", version: 2 } },
    ]);
  });

  it("keeps a concurrent edit based on the version sent during compaction", async () => {
    const todo = await repository.createTodo("旧文字");
    await repository.updateTodo(todo.id, { text: "离线修改" });
    let serverRecord = { ...todo, version: 0 };
    const push = vi.fn(
      async (operation: SyncOperation): Promise<PushResult> => {
        if (operation.baseVersion !== serverRecord.version) {
          return { status: "conflict", record: serverRecord };
        }
        serverRecord = { ...serverRecord, ...operation.payload };
        return { status: "applied" };
      },
    );
    const engine = new SyncEngine(
      database,
      { push, pull: async () => ({ changes: [], cursor: "1" }) },
      { deviceId: "desktop-1" },
    );

    await Promise.all([
      repository.updateTodo(todo.id, { text: "同步时继续编辑" }),
      engine.flush(),
    ]);
    expect(await engine.flush()).toMatchObject({ conflicts: 0, failed: 0 });
    expect(serverRecord.text).toBe("同步时继续编辑");
    expect(await database.todos.get(todo.id)).toMatchObject({
      text: "同步时继续编辑",
    });
    expect(await repository.listPendingOperations()).toEqual([]);
  });

  it("retries the earliest version when later operation IDs sort first at the same time", async () => {
    const todo = await repository.createTodo("先上传");
    const first = (await repository.listPendingOperations())[0];
    await database.operations.delete(first.id);
    await database.operations.add({ ...first, id: "z-first", attempts: 1 });
    await repository.updateTodo(todo.id, { text: "随后上传" });
    const next = (await repository.listPendingOperations()).find(
      (operation) => operation.baseVersion === 1,
    )!;
    await database.operations.delete(next.id);
    await database.operations.add({ ...next, id: "a-next" });
    const push = vi.fn<RemoteSyncAdapter["push"]>(async () => ({
      status: "applied",
    }));
    const engine = new SyncEngine(
      database,
      { push, pull: async () => ({ changes: [], cursor: "1" }) },
      { deviceId: "desktop-1" },
    );

    expect(await engine.flush()).toEqual({
      applied: 1,
      conflicts: 0,
      failed: 0,
    });
    expect(push.mock.calls[0][0]).toMatchObject({
      id: "z-first",
      baseVersion: 0,
    });
    expect(await engine.flush()).toEqual({
      applied: 1,
      conflicts: 0,
      failed: 0,
    });
    expect(push.mock.calls[1][0]).toMatchObject({
      id: "a-next",
      baseVersion: 1,
    });
    expect(await repository.listPendingOperations()).toEqual([]);
  });

  it.each([
    "rename notebook",
    "edit note",
    "toggle todo",
    "move notebook",
    "move note",
    "move todo",
    "trash notebook",
    "trash note",
    "trash todo",
    "restore notebook",
    "restore note",
    "restore todo",
  ])(
    "preserves version continuity when %s overlaps queue compaction",
    async (mutation) => {
      const notebook = await repository.createNotebook("便签本");
      const note = await repository.createNote(notebook.id, { title: "便签" });
      const todo = await repository.createTodo("待办");
      await repository.renameNotebook(notebook.id, "离线便签本");
      await repository.updateNote(note.id, { title: "离线便签" });
      await repository.updateTodo(todo.id, { text: "离线待办" });
      if (mutation === "restore notebook")
        await repository.trashNotebook(notebook.id);
      if (mutation === "restore note") await repository.trashNote(note.id);
      if (mutation === "restore todo") await repository.trashTodo(todo.id);
      const serverRecords = new Map<string, RemoteRecord>(
        [notebook, note, todo].map((record) => [
          record.id,
          { ...record, version: 0 },
        ]),
      );
      const engine = new SyncEngine(
        database,
        {
          push: async (operation) => {
            const current = serverRecords.get(operation.entityId)!;
            if (operation.baseVersion !== current.version) {
              return { status: "conflict", record: current };
            }
            serverRecords.set(operation.entityId, {
              ...current,
              ...operation.payload,
            });
            return { status: "applied" };
          },
          pull: async () => ({ changes: [], cursor: "1" }),
        },
        { deviceId: "desktop-1" },
      );
      const mutate = () => {
        switch (mutation) {
          case "rename notebook":
            return repository.renameNotebook(notebook.id, "新名称");
          case "edit note":
            return repository.updateNote(note.id, { title: "新标题" });
          case "toggle todo":
            return repository.toggleTodo(todo.id);
          case "move notebook":
            return repository.moveNotebook(notebook.id, 100, 200);
          case "move note":
            return repository.moveNote(note.id, 100, 200);
          case "move todo":
            return repository.moveTodo(todo.id, 100, 200);
          case "trash notebook":
            return repository.trashNotebook(notebook.id);
          case "trash note":
            return repository.trashNote(note.id);
          case "trash todo":
            return repository.trashTodo(todo.id);
          case "restore notebook":
            return repository.restore("notebook", notebook.id);
          case "restore note":
            return repository.restore("note", note.id);
          case "restore todo":
            return repository.restore("todo", todo.id);
          default:
            throw new Error(`Unknown mutation: ${mutation}`);
        }
      };

      const [changed, firstFlush] = await Promise.all([
        mutate(),
        engine.flush(),
      ]);
      expect(firstFlush).toMatchObject({ conflicts: 0, failed: 0 });
      expect(await engine.flush()).toMatchObject({ conflicts: 0, failed: 0 });
      expect(await repository.listPendingOperations()).toEqual([]);
      const saved = serverRecords.get(changed.id)!;
      expect(saved).toEqual({ ...changed, version: saved.version });
      expect(await database.notebooks.get(notebook.id)).toEqual(
        serverRecords.get(notebook.id),
      );
      expect(await database.notes.get(note.id)).toEqual(
        serverRecords.get(note.id),
      );
      expect(await database.todos.get(todo.id)).toEqual(
        serverRecords.get(todo.id),
      );
    },
  );

  it("keeps uncertain uploads immutable and blocks later edits during backoff", async () => {
    const todo = await repository.createTodo("已尝试内容");
    const first = (await repository.listPendingOperations())[0];
    await database.operations.update(first.id, {
      attempts: 1,
      nextAttemptAt: "2099-01-01T00:00:00Z",
    });
    await repository.updateTodo(todo.id, { text: "后续修改" });
    const push = vi.fn(async (): Promise<PushResult> => ({
      status: "applied",
    }));
    const engine = new SyncEngine(
      database,
      { push, pull: async () => ({ changes: [], cursor: "1" }) },
      { deviceId: "desktop-1" },
    );
    await engine.flush();
    expect(push).not.toHaveBeenCalled();
    expect(await database.operations.get(first.id)).toMatchObject({
      payload: { text: "已尝试内容" },
    });
    expect(await database.operations.count()).toBe(2);
  });

  it("preserves a local edit started while a pulled change checks the outbox", async () => {
    const todo = await repository.createTodo("原文");
    await database.operations.clear();
    const engine = new SyncEngine(
      database,
      {
        push: async () => ({ status: "applied" }),
        pull: async () => ({
          changes: [
            {
              entity: "todo",
              record: { ...todo, text: "远端文字", version: 2 },
            },
          ],
          cursor: "next",
        }),
      },
      { deviceId: "desktop-1" },
    );

    const pulling = engine.pull(null);
    // Let pull receive the response and start its outbox check before the edit.
    await Promise.resolve();
    await Promise.all([
      pulling,
      repository.updateTodo(todo.id, { text: "最新本地编辑" }),
    ]);

    expect(await database.todos.get(todo.id)).toMatchObject({
      text: "最新本地编辑",
    });
    expect(await repository.listPendingOperations()).toMatchObject([
      { payload: { text: "最新本地编辑" } },
    ]);
  });

  it("does not replace a newer local version when a pull replays an older record", async () => {
    const original = await repository.createTodo("旧版本");
    const current = await repository.updateTodo(original.id, {
      text: "已同步新版本",
    });
    await database.operations.clear();
    const engine = new SyncEngine(
      database,
      {
        push: async () => ({ status: "applied" }),
        pull: async () => ({
          changes: [{ entity: "todo", record: original }],
          cursor: "next",
        }),
      },
      { deviceId: "desktop-1" },
    );

    expect(await engine.pull(null)).toBe("next");
    expect(await database.todos.get(original.id)).toEqual(current);
  });

  it("keeps a local note conflict as a separate copy", async () => {
    const notebook = await repository.createNotebook("工作");
    const note = await repository.createNote(notebook.id, {
      title: "方案",
      body: "本地改动",
    });
    await database.operations.where("entity").notEqual("note").delete();
    const serverRecord = {
      ...note,
      title: "方案",
      body: "手机改动",
      contentJson: migrateLegacyNoteContent("手机改动"),
      version: 5,
      updatedAt: "2026-08-28T12:01:00.000Z",
    };
    const adapter: RemoteSyncAdapter = {
      push: vi.fn(async (): Promise<PushResult> => ({
        status: "conflict",
        record: serverRecord,
      })),
      pull: vi.fn(async () => ({ changes: [], cursor: "1" })),
    };
    const engine = new SyncEngine(database, adapter, {
      deviceId: "desktop-1",
      now: () => new Date("2026-08-28T12:02:00.000Z"),
      createId: () => "conflict-copy-1",
    });

    expect(await engine.flush()).toEqual({
      applied: 0,
      conflicts: 1,
      failed: 0,
    });
    expect(await repository.listNotes(notebook.id)).toMatchObject([
      { id: note.id, body: "手机改动", version: 5 },
      {
        id: "conflict-copy-1",
        body: "本地改动",
        title: "方案（冲突副本）",
        conflictOf: note.id,
      },
    ]);
  });

  it("accepts identical note content at a newer server version without a copy", async () => {
    const notebook = await repository.createNotebook("工作");
    const note = await repository.createNote(notebook.id, {
      title: "同一内容",
      body: "正文",
    });
    await database.operations.clear();
    await repository.updateNote(note.id, { title: "更新标题" });
    const server = { ...(await repository.getNote(note.id))!, version: 9 };
    const engine = new SyncEngine(
      database,
      {
        push: async () => ({ status: "conflict", record: server }),
        pull: async () => ({ changes: [], cursor: "next" }),
      },
      { deviceId: "desktop-1" },
    );

    expect(await engine.flush()).toMatchObject({ conflicts: 0, failed: 0 });
    expect(await repository.listNotes(notebook.id)).toEqual([server]);
    expect(await repository.listPendingOperations()).toEqual([]);
  });
});
