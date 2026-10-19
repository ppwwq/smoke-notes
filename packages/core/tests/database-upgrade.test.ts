import Dexie from "dexie";
import { expect, it } from "vitest";
import { SmokeNotesDatabase } from "../src/database";

it("upgrades an old database without changing identities, deleted records or queued operations", async () => {
  const name = `release-migration-${crypto.randomUUID()}`;
  const legacy = new Dexie(name);
  legacy.version(1).stores({
    notebooks: "id, workspaceId, rank, deletedAt",
    notes: "id, notebookId, rank, deletedAt",
    todos: "id, workspaceId, rank, deletedAt",
    operations: "id, entity, entityId, createdAt, nextAttemptAt",
  });
  const note = {
    id: "old-note",
    notebookId: "old-book",
    title: "旧便签",
    body: "中文正文\n\n保留空行",
    version: 7,
    rank: 1024,
    updatedAt: "2026-01-01T00:00:00.000Z",
    deletedAt: null,
  };
  const operation = {
    id: "pending",
    entity: "note",
    entityId: note.id,
    action: "upsert",
    baseVersion: 6,
    createdAt: note.updatedAt,
    nextAttemptAt: note.updatedAt,
    attempts: 2,
    payload: note,
  };
  await legacy.table("notebooks").put({
    id: "old-book",
    workspaceId: "synthetic-workspace",
    name: "兼容测试",
    rank: 1024,
    version: 1,
    updatedAt: note.updatedAt,
    deletedAt: null,
  });
  await legacy
    .table("notes")
    .bulkPut([note, { ...note, id: "old-trash", deletedAt: note.updatedAt }]);
  await legacy.table("operations").put(operation);
  legacy.close();
  const upgraded = new SmokeNotesDatabase(name);
  try {
    await upgraded.open();
    expect(await upgraded.notes.get(note.id)).toMatchObject({
      ...note,
      kind: "note",
    });
    expect((await upgraded.notes.get(note.id))?.contentJson).toBeDefined();
    expect((await upgraded.notes.get("old-trash"))?.deletedAt).toBe(
      note.updatedAt,
    );
    expect(await upgraded.operations.get("pending")).toEqual(operation);
    upgraded.close();
    await upgraded.open();
    expect((await upgraded.notes.get(note.id))?.version).toBe(7);
    expect(await upgraded.notes.count()).toBe(2);
  } finally {
    await upgraded.delete();
  }
});
