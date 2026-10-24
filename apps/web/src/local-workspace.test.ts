import { afterEach, expect, it } from "vitest";
import { LocalRepository, SmokeNotesDatabase } from "@smoke-notes/core";
import { adoptLocalWorkspace } from "./local-workspace";

const database = new SmokeNotesDatabase(`local-pairing-${crypto.randomUUID()}`);
afterEach(async () => {
  await database.delete();
});

it("keeps edited notes, completed todos, trash and daily settings when a local workspace is paired", async () => {
  const local = new LocalRepository(database, {
    workspaceId: "local",
    deviceId: "device",
  });
  const book = await local.createNotebook("本地记录");
  const note = await local.createNote(book.id, {
    title: "草稿",
    body: "未配对也可保存",
  });
  await local.updateNote(note.id, { title: "已编辑" });
  const todo = await local.createTodo("保存我的完成记录");
  await local.toggleTodo(todo.id);
  const trashed = await local.createTodo("可恢复的内容");
  await local.trashTodo(trashed.id);
  await local.setTodoDayBoundary(4);
  await adoptLocalWorkspace(database, "local", "paired", "device");
  const paired = new LocalRepository(database, {
    workspaceId: "paired",
    deviceId: "device",
  });
  expect((await paired.getNote(note.id))?.title).toBe("已编辑");
  expect((await paired.listNotebooks())[0]).toMatchObject({
    id: book.id,
    workspaceId: "paired",
  });
  expect((await paired.listTodos())[0]).toMatchObject({
    id: todo.id,
    completed: true,
    workspaceId: "paired",
  });
  expect((await paired.getTodoSettings()).dayBoundaryHour).toBe(4);
  expect(
    (await paired.listTrash()).some((item) => item.record.id === trashed.id),
  ).toBe(true);
  const queue = await paired.listPendingOperations();
  expect(queue).toHaveLength(5);
  expect(
    queue.every((op) => op.baseVersion === 0 && op.payload.version === 1),
  ).toBe(true);
  expect(queue.find((op) => op.entityId === note.id)?.payload.title).toBe(
    "已编辑",
  );
  expect(queue.some((op) => op.payload.workspaceId === "local")).toBe(false);
});
