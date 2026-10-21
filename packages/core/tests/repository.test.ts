import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { LocalRepository, SmokeNotesDatabase } from "../src/index";

describe("LocalRepository", () => {
  let database: SmokeNotesDatabase;
  let repository: LocalRepository;
  let sequence = 0;

  beforeEach(() => {
    database = new SmokeNotesDatabase(
      `smoke-notes-test-${crypto.randomUUID()}`,
    );
    repository = new LocalRepository(database, {
      workspaceId: "workspace-1",
      deviceId: "desktop-1",
      now: () => new Date("2026-08-28T12:00:00.000Z"),
      createId: () => `id-${++sequence}`,
    });
  });

  afterEach(async () => {
    await database.delete();
  });

  it("stores a new notebook locally and queues it for sync", async () => {
    const notebook = await repository.createNotebook("工作");

    expect(await repository.listNotebooks()).toEqual([notebook]);
    expect(await repository.listPendingOperations()).toMatchObject([
      {
        entity: "notebook",
        entityId: notebook.id,
        action: "upsert",
        baseVersion: 0,
        attempts: 0,
      },
    ]);
  });

  it("serializes rank allocation for concurrently created records", async () => {
    const notebooks = await Promise.all([
      repository.createNotebook("一"),
      repository.createNotebook("二"),
      repository.createNotebook("三"),
    ]);
    const notes = await Promise.all([
      repository.createNote(notebooks[0].id, { title: "一" }),
      repository.createNote(notebooks[0].id, { title: "二" }),
      repository.createNote(notebooks[0].id, { title: "三" }),
    ]);
    const todos = await Promise.all([
      repository.createTodo("一"),
      repository.createTodo("二"),
      repository.createTodo("三"),
    ]);

    for (const records of [notebooks, notes, todos]) {
      expect(new Set(records.map((record) => record.rank)).size).toBe(3);
    }
  });

  it("allocates unused then least-used colours atomically with stable ties", async () => {
    const book = await repository.createNotebook("配色");
    const palette = ["amber", "rose", "sage", "sky", "violet", "graphite"];
    const first = await Promise.all(
      palette.map((title) => repository.createNote(book.id, { title })),
    );
    expect(first.map((note) => note.color)).toEqual(palette);
    const repeat = await repository.createNote(book.id, { title: "重复" });
    expect(repeat.color).toBe("amber");
    expect(
      (await repository.createNote(book.id, { title: "最少", kind: "todo" }))
        .color,
    ).toBe("rose");
    expect(await repository.getNote(first[0].id)).toEqual(first[0]);
    expect(
      (await repository.listPendingOperations()).find(
        (op) => op.entityId === repeat.id,
      )?.payload,
    ).toMatchObject({ color: "amber" });
  });

  it("scopes colour counts to live notes in this notebook and preserves explicit choices", async () => {
    const book = await repository.createNotebook("当前");
    const other = await repository.createNotebook("其他");
    await repository.createNote(other.id, { title: "不计入", color: "rose" });
    const amber = await repository.createNote(book.id, { title: "已有" });
    const rose = await repository.createNote(book.id, { title: "删除" });
    await repository.trashNote(rose.id);
    expect(
      (await repository.createNote(book.id, { title: "补空缺" })).color,
    ).toBe("rose");
    const explicit = await repository.createNote(book.id, {
      title: "指定",
      color: "graphite",
    });
    expect(explicit.color).toBe("graphite");
    await repository.updateNote(explicit.id, {
      title: explicit.title,
      color: "sky",
    });
    await repository.createNote(book.id, { title: "下一张" });
    expect((await repository.getNote(explicit.id))?.color).toBe("sky");
    expect(await repository.getNote(amber.id)).toEqual(amber);
  });

  it("rejects creating a note in a deleted or missing notebook", async () => {
    const notebook = await repository.createNotebook("即将删除");
    await repository.trashNotebook(notebook.id);
    await database.operations.clear();

    await expect(
      repository.createNote(notebook.id, { title: "不可见的便签" }),
    ).rejects.toThrow();
    await expect(
      repository.createNote("missing", { title: "孤立的便签" }),
    ).rejects.toThrow();

    expect(await database.notes.count()).toBe(0);
    expect(await repository.listPendingOperations()).toEqual([]);
  });

  it("updates a todo and keeps the change in the outbox", async () => {
    const todo = await repository.createTodo("交水费");
    const completed = await repository.toggleTodo(todo.id);

    expect(completed.completed).toBe(true);
    expect(completed.version).toBe(2);
    expect(await repository.listTodos()).toMatchObject([{ completed: true }]);
    expect(await repository.listPendingOperations()).toHaveLength(2);
  });

  it("preserves concurrent todo edits and completion changes", async () => {
    const todo = await repository.createTodo("旧文字");

    await Promise.all([
      repository.updateTodo(todo.id, { text: "新文字" }),
      repository.toggleTodo(todo.id),
    ]);

    expect(await database.todos.get(todo.id)).toMatchObject({
      text: "新文字",
      completed: true,
      version: 3,
    });
    expect(
      (await repository.listPendingOperations())
        .map((operation) => operation.baseVersion)
        .sort((a, b) => a - b),
    ).toEqual([0, 1, 2]);
  });

  it("moves a note using only the moved note rank", async () => {
    const notebook = await repository.createNotebook("灵感");
    const first = await repository.createNote(notebook.id, {
      title: "一",
      body: "",
    });
    const second = await repository.createNote(notebook.id, {
      title: "二",
      body: "",
    });
    const third = await repository.createNote(notebook.id, {
      title: "三",
      body: "",
    });

    await repository.moveNote(third.id, first.rank, second.rank);

    expect(
      (await repository.listNotes(notebook.id)).map((note) => note.title),
    ).toEqual(["一", "三", "二"]);
  });

  it("soft deletes legacy todos without irreversibly clearing their history after thirty days", async () => {
    const todo = await repository.createTodo("旧任务");
    await repository.trashTodo(todo.id);

    expect(await repository.listTodos()).toEqual([]);
    expect(await repository.listTrash()).toHaveLength(1);

    await database.todos.update(todo.id, {
      deletedAt: "2026-07-20T00:00:00.000Z",
    });
    expect(await repository.purgeExpiredTrash()).toBe(0);
    expect(await database.todos.get(todo.id)).toBeDefined();
    await repository.restore("todo", todo.id);
    expect((await repository.listTodos())[0].id).toBe(todo.id);
  });

  it("edits and restores records without losing their identity", async () => {
    const notebook = await repository.createNotebook("生活");
    const note = await repository.createNote(notebook.id, {
      title: "原题",
      body: "原文",
    });
    const changed = await repository.updateNote(note.id, {
      title: "新标题",
      body: "新正文",
    });
    await repository.trashNote(note.id);
    const restored = await repository.restore("note", note.id);

    expect(changed).toMatchObject({
      id: note.id,
      title: "新标题",
      body: "新正文",
      version: 2,
    });
    expect(restored.deletedAt).toBeNull();
    expect((await repository.listNotes(notebook.id))[0]).toMatchObject({
      id: note.id,
      title: "新标题",
    });
  });

  it("loads one note for an independent editor window", async () => {
    const notebook = await repository.createNotebook("桌面");
    const note = await repository.createNote(notebook.id, {
      title: "独立窗口",
      body: "正文",
    });

    expect(await repository.getNote(note.id)).toEqual(note);
    expect(await repository.getNote("missing")).toBeNull();
  });

  it("creates regular and todo notes with their kind in the sync payload", async () => {
    const notebook = await repository.createNotebook("分类");
    const regular = await repository.createNote(notebook.id, {
      title: "普通",
      body: "正文",
    });
    const todo = await repository.createNote(notebook.id, {
      title: "待办便签",
      body: "逐项完成",
      kind: "todo",
    });

    expect(regular.kind).toBe("note");
    expect(todo.kind).toBe("todo");
    expect(await repository.listNotes(notebook.id)).toMatchObject([
      { id: regular.id, kind: "note" },
      { id: todo.id, kind: "todo" },
    ]);
    expect(
      (await repository.listPendingOperations()).find(
        (operation) => operation.entityId === todo.id,
      )?.payload,
    ).toMatchObject({ kind: "todo" });
  });

  it("creates empty and multiline todo notes as unchecked task lists", async () => {
    const notebook = await repository.createNotebook("清单");
    const empty = await repository.createNote(notebook.id, {
      title: "空清单",
      kind: "todo",
    });
    const multiline = await repository.createNote(notebook.id, {
      title: "采购",
      body: "牛奶\n面包",
      kind: "todo",
    });

    expect(empty.contentJson).toEqual({
      type: "doc",
      content: [
        {
          type: "taskList",
          content: [
            {
              type: "taskItem",
              attrs: { checked: false },
              content: [{ type: "paragraph" }],
            },
          ],
        },
      ],
    });
    expect(multiline.contentJson).toEqual({
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
            {
              type: "taskItem",
              attrs: { checked: false },
              content: [
                {
                  type: "paragraph",
                  content: [{ type: "text", text: "面包" }],
                },
              ],
            },
          ],
        },
      ],
    });
    expect(multiline.body).toBe("牛奶\n面包");
  });

  it("preserves an intentionally empty note title in local storage and its outbox payload", async () => {
    const notebook = await repository.createNotebook("空标题");
    const created = await repository.createNote(notebook.id, {
      title: "",
      body: "",
    });
    const updated = await repository.updateNote(created.id, {
      title: "",
      body: "已编辑正文",
    });

    expect(created.title).toBe("");
    expect(updated.title).toBe("");
    expect(
      (await repository.listPendingOperations()).at(-1)?.payload,
    ).toMatchObject({
      title: "",
      body: "已编辑正文",
    });
  });

  it("preserves regular bullets and checked task items when saving", async () => {
    const notebook = await repository.createNotebook("格式");
    const regular = await repository.createNote(notebook.id, {
      title: "普通分点",
      contentJson: {
        type: "doc",
        content: [
          {
            type: "bulletList",
            content: [
              {
                type: "listItem",
                content: [
                  {
                    type: "paragraph",
                    content: [{ type: "text", text: "保持圆点" }],
                  },
                ],
              },
            ],
          },
        ],
      },
    });
    const todo = await repository.createNote(notebook.id, {
      title: "完成状态",
      kind: "todo",
    });
    const checked = await repository.updateNote(todo.id, {
      title: todo.title,
      contentJson: {
        type: "doc",
        content: [
          {
            type: "taskList",
            content: [
              {
                type: "taskItem",
                attrs: { checked: true },
                content: [{ type: "paragraph" }],
              },
            ],
          },
        ],
      },
    });

    expect(regular.contentJson.content[0]?.type).toBe("bulletList");
    expect(checked.contentJson.content[0]).toMatchObject({
      type: "taskList",
      content: [{ type: "taskItem", attrs: { checked: true } }],
    });
  });

  it("renames notebooks and edits todo text", async () => {
    const notebook = await repository.createNotebook("临时");
    const todo = await repository.createTodo("旧文字");

    expect(await repository.renameNotebook(notebook.id, "项目")).toMatchObject({
      name: "项目",
    });
    expect(
      await repository.updateTodo(todo.id, { text: "新文字" }),
    ).toMatchObject({ text: "新文字" });
  });

  it("moves notebooks and todos between their neighbours", async () => {
    const firstBook = await repository.createNotebook("一");
    const secondBook = await repository.createNotebook("二");
    const thirdBook = await repository.createNotebook("三");
    const firstTodo = await repository.createTodo("甲");
    const secondTodo = await repository.createTodo("乙");

    await repository.moveNotebook(
      thirdBook.id,
      firstBook.rank,
      secondBook.rank,
    );
    await repository.moveTodo(secondTodo.id, null, firstTodo.rank);

    expect((await repository.listNotebooks()).map((item) => item.name)).toEqual(
      ["一", "三", "二"],
    );
    expect((await repository.listTodos()).map((item) => item.text)).toEqual([
      "乙",
      "甲",
    ]);
  });

  it("moves a deleted notebook and its notes into trash together", async () => {
    const notebook = await repository.createNotebook("待删除");
    await repository.createNote(notebook.id, { title: "子便签", body: "" });

    await repository.trashNotebook(notebook.id);

    expect(await repository.listNotebooks()).toEqual([]);
    expect(await repository.listNotes(notebook.id)).toEqual([]);
    expect((await repository.listTrash()).map((item) => item.entity)).toEqual([
      "notebook",
      "note",
    ]);

    await repository.restore("notebook", notebook.id);
    expect(
      (await repository.listNotes(notebook.id)).map((note) => note.title),
    ).toEqual(["子便签"]);
  });

  it("restores only notes deleted with their notebook", async () => {
    const notebook = await repository.createNotebook("部分已删除");
    const oldTrash = await repository.createNote(notebook.id, {
      title: "早先单独删除",
    });
    const active = await repository.createNote(notebook.id, { title: "保留" });
    const deleted = await repository.trashNote(oldTrash.id);
    await database.notes.put({
      ...deleted,
      deletedAt: "2026-08-27T12:00:00.000Z",
    });

    await repository.trashNotebook(notebook.id);
    await repository.restore("notebook", notebook.id);

    expect(await repository.listNotes(notebook.id)).toMatchObject([
      { id: active.id },
    ]);
    expect((await database.notes.get(oldTrash.id))?.deletedAt).toBe(
      "2026-08-27T12:00:00.000Z",
    );
  });

  it("does not revive deleted children when restoring an active notebook", async () => {
    const notebook = await repository.createNotebook("现有便签本");
    const note = await repository.createNote(notebook.id, { title: "已删除" });
    await repository.trashNote(note.id);
    await database.operations.clear();

    expect(await repository.restore("notebook", notebook.id)).toEqual(notebook);
    expect(await repository.listNotes(notebook.id)).toEqual([]);
    expect(await repository.listPendingOperations()).toEqual([]);
  });

  it("restores the parent when recovering a single note from a deleted notebook", async () => {
    const notebook = await repository.createNotebook("已删除便签本");
    const note = await repository.createNote(notebook.id, {
      title: "恢复这张",
    });
    const sibling = await repository.createNote(notebook.id, {
      title: "继续保留删除",
    });
    await repository.trashNotebook(notebook.id);
    await database.operations.clear();

    await repository.restore("note", note.id);

    expect(await repository.listNotebooks()).toMatchObject([
      { id: notebook.id },
    ]);
    expect(await repository.listNotes(notebook.id)).toMatchObject([
      { id: note.id },
    ]);
    expect((await database.notes.get(sibling.id))?.deletedAt).not.toBeNull();
    expect(
      (await repository.listPendingOperations()).map(
        (operation) => operation.entity,
      ),
    ).toEqual(["notebook", "note"]);
  });

  it("preserves the actual stale editor draft when the original was deleted", async () => {
    const notebook = await repository.createNotebook("笔记");
    const original = await repository.createNote(notebook.id, {
      title: "原题",
      body: "旧正文",
    });
    const deleted = await repository.trashNote(original.id);
    await database.operations.clear();

    const saved = await repository.updateNote(original.id, {
      title: "未保存标题",
      body: "未保存正文",
      color: "sky",
      baseSnapshot: original,
    });

    expect(saved.id).not.toBe(original.id);
    expect(saved).toMatchObject({
      title: "未保存标题（冲突副本）",
      body: "未保存正文",
      color: "sky",
      conflictOf: original.id,
      deletedAt: null,
      version: 1,
    });
    expect(await database.notes.get(original.id)).toEqual(deleted);
    expect(await repository.listNotes(notebook.id)).toEqual([saved]);
    expect(await repository.listPendingOperations()).toMatchObject([
      { entityId: saved.id, baseVersion: 0, action: "upsert", payload: saved },
    ]);
  });

  it("does not preserve an unchanged stale editor as a conflict after deletion", async () => {
    const notebook = await repository.createNotebook("笔记");
    const original = await repository.createNote(notebook.id, {
      title: "原题",
      body: "原文",
    });
    const deleted = await repository.trashNote(original.id);
    await database.operations.clear();

    expect(
      await repository.updateNote(original.id, {
        title: original.title,
        body: original.body,
        baseSnapshot: original,
      }),
    ).toEqual(deleted);
    expect(await repository.listNotes(notebook.id)).toEqual([]);
    expect(await repository.listPendingOperations()).toEqual([]);
  });

  it("recovers editing that continues after an unchanged save returned the deleted snapshot", async () => {
    const notebook = await repository.createNotebook("笔记");
    const original = await repository.createNote(notebook.id, {
      title: "A",
      body: "原文",
    });
    const deleted = await repository.trashNote(original.id);
    await database.operations.clear();

    const unchanged = await repository.updateNote(original.id, {
      title: "A ",
      body: original.body,
      baseSnapshot: original,
    });
    expect(unchanged).toEqual(deleted);
    expect(await repository.listPendingOperations()).toEqual([]);

    const saved = await repository.updateNote(original.id, {
      title: "B",
      body: "等待保存时继续输入的正文",
      baseSnapshot: unchanged,
    });

    expect(saved.id).not.toBe(original.id);
    expect(saved).toMatchObject({
      title: "B（冲突副本）",
      body: "等待保存时继续输入的正文",
      deletedAt: null,
      conflictOf: original.id,
    });
    expect(await database.notes.get(original.id)).toEqual(deleted);
    expect(await repository.listNotes(notebook.id)).toEqual([saved]);
    expect(await repository.listPendingOperations()).toMatchObject([
      { entityId: saved.id, action: "upsert", payload: saved },
    ]);
  });

  it("does not recover an unchanged draft based on a deleted snapshot", async () => {
    const notebook = await repository.createNotebook("笔记");
    const original = await repository.createNote(notebook.id, { title: "A" });
    const deleted = await repository.trashNote(original.id);
    await database.operations.clear();

    expect(
      await repository.updateNote(original.id, {
        title: deleted.title,
        body: deleted.body,
        baseSnapshot: deleted,
      }),
    ).toEqual(deleted);
    expect(await repository.listNotes(notebook.id)).toEqual([]);
    expect(await repository.listPendingOperations()).toEqual([]);
  });

  it("keeps a late editor draft visible in a new notebook after the original notebook was deleted", async () => {
    const notebook = await repository.createNotebook("原便签本");
    const original = await repository.createNote(notebook.id, {
      title: "草稿",
      body: "旧正文",
    });
    const deletedNotebook = await repository.trashNotebook(notebook.id);
    const deletedNote = await database.notes.get(original.id);
    await database.operations.clear();
    const enqueued: string[] = [];
    database.operations.hook("creating", (_key, operation) => {
      enqueued.push(operation.entity);
    });

    const saved = await repository.updateNote(original.id, {
      title: original.title,
      body: "真正未保存的草稿",
      baseSnapshot: original,
    });

    expect(saved.notebookId).not.toBe(notebook.id);
    expect(saved.body).toBe("真正未保存的草稿");
    expect(await repository.listNotebooks()).toMatchObject([
      { id: saved.notebookId, name: "原便签本（恢复）", version: 1 },
    ]);
    expect(await repository.listNotes(saved.notebookId)).toEqual([saved]);
    expect(await database.notebooks.get(notebook.id)).toEqual(deletedNotebook);
    expect(await database.notes.get(original.id)).toEqual(deletedNote);
    expect(enqueued).toEqual(["notebook", "note"]);
  });

  it("rolls back the recovery notebook and copy when the draft is invalid", async () => {
    const notebook = await repository.createNotebook("原便签本");
    const original = await repository.createNote(notebook.id, {
      title: "草稿",
    });
    await repository.trashNotebook(notebook.id);
    await database.operations.clear();

    await expect(
      repository.updateNote(original.id, {
        title: "x".repeat(201),
        baseSnapshot: original,
      }),
    ).rejects.toThrow(/200/);

    expect(await database.notebooks.count()).toBe(1);
    expect(await database.notes.count()).toBe(1);
    expect(await repository.listPendingOperations()).toEqual([]);
  });
});
