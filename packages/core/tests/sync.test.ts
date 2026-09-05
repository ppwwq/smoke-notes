import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  LocalRepository,
  SmokeNotesDatabase,
  SyncEngine,
  type PushResult,
  type RemoteRecord,
  type RemoteSyncAdapter,
  type SyncOperation,
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

  afterEach(async () => database.delete());

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
});
