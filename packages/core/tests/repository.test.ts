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

  it("soft deletes immediately and purges records after thirty days", async () => {
    const todo = await repository.createTodo("旧任务");
    await repository.trashTodo(todo.id);

    expect(await repository.listTodos()).toEqual([]);
    expect(await repository.listTrash()).toHaveLength(1);

    await database.todos.update(todo.id, {
      deletedAt: "2026-07-20T00:00:00.000Z",
    });
    expect(await repository.purgeExpiredTrash()).toBe(1);
    expect(await database.todos.get(todo.id)).toBeUndefined();
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
});
