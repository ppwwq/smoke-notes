import Dexie from "dexie";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  LocalRepository,
  SmokeNotesDatabase,
  SyncEngine,
  addTodoDays,
  getTodoDay,
  getTodoRule,
  getTodoStatus,
  todoStableId,
  todoOccurrenceId,
  mergeTodoChanges,
  sameTodoContent,
  type RemoteSyncAdapter,
  type Todo,
  type SyncOperation,
} from "../src/index";

const databases: SmokeNotesDatabase[] = [];
afterEach(async () => {
  await Promise.all(databases.map((db) => db.delete()));
  databases.length = 0;
});
function setup(at = "2026-10-19T04:00:00Z", device = crypto.randomUUID()) {
  const db = new SmokeNotesDatabase(`planning-${crypto.randomUUID()}`);
  databases.push(db);
  let now = new Date(at);
  const repo = new LocalRepository(db, {
    workspaceId: "workspace-plan",
    deviceId: device,
    now: () => now,
  });
  return {
    db,
    repo,
    device,
    now: () => now,
    setTime: (date: string) => {
      now = new Date(date);
    },
  };
}
function server() {
  const records = new Map<string, Todo>();
  const adapter: RemoteSyncAdapter = {
    async push(op) {
      const current = records.get(op.entityId);
      if (current && current.version !== op.baseVersion)
        return { status: "conflict", record: structuredClone(current) };
      if (!current && op.baseVersion !== 0) throw new Error("missing");
      records.set(
        op.entityId,
        structuredClone({
          ...op.payload,
          version: op.baseVersion + 1,
        } as unknown as Todo),
      );
      return { status: "applied" };
    },
    async pull() {
      return {
        changes: [...records.values()].map((record) => ({
          entity: "todo" as const,
          record: structuredClone(record),
        })),
        cursor: "test",
      };
    },
  };
  return { records, adapter };
}
function engine(s: ReturnType<typeof setup>, adapter: RemoteSyncAdapter) {
  return new SyncEngine(s.db, adapter, { deviceId: s.device, now: s.now });
}
async function flushAll(e: SyncEngine, s: ReturnType<typeof setup>) {
  for (let i = 0; i < 8 && (await s.db.operations.count()); i++)
    await e.flush();
  expect(await s.db.operations.count()).toBe(0);
}

describe("todo calendar and identity", () => {
  it("uses the RFC4122 DNS UUIDv5 vector", () => {
    expect(todoStableId("www.widgets.com")).toBe(
      "21f7f8de-8051-5b89-8680-0195ef798b6a",
    );
    expect(todoOccurrenceId("series", "2026-10-19")).toBe(
      todoOccurrenceId("series", "2026-10-19"),
    );
    expect(todoOccurrenceId("series", "2026-10-20")).not.toBe(
      todoOccurrenceId("series", "2026-10-19"),
    );
  });
  it("changes days at Hong Kong midnight or 04:00 independent of host timezone", () => {
    expect(getTodoDay(new Date("2026-10-19T15:59:59.999Z"))).toBe("2026-10-19");
    expect(getTodoDay(new Date("2026-10-19T16:00:00Z"))).toBe("2026-10-20");
    expect(getTodoDay(new Date("2026-10-19T19:59:59.999Z"), 4)).toBe(
      "2026-10-19",
    );
    expect(getTodoDay(new Date("2026-10-19T20:00:00Z"), 4)).toBe("2026-10-20");
    expect(addTodoDays("2028-02-28", 1)).toBe("2028-02-29");
    expect(() => addTodoDays("2026-02-30", 1)).toThrow();
  });
  it("backfills every missed daily date once after days offline", async () => {
    const s = setup();
    const series = await s.repo.createTodo("吃药", {
      repeat: { kind: "daily" },
    });
    expect(await s.repo.reconcileTodos()).toBe(1);
    s.setTime("2026-10-23T04:00:00Z");
    expect(await s.repo.reconcileTodos()).toBe(4);
    const rows = await s.repo.listTodos();
    expect(rows.map((t) => t.planning?.date).sort()).toEqual([
      "2026-10-19",
      "2026-10-20",
      "2026-10-21",
      "2026-10-22",
      "2026-10-23",
    ]);
    expect(rows.every((t) => t.planning?.seriesId === series.id)).toBe(true);
    expect(await s.repo.reconcileTodos()).toBe(0);
    expect(await s.repo.listTodoSeries()).toHaveLength(1);
    const get = vi.spyOn(s.db.todos, "get");
    await s.repo.reconcileTodos();
    expect(get).toHaveBeenCalledTimes(1); // settings only, no per-date IndexedDB lookup
  });
  it("honors weekdays and custom weekdays without accumulating duplicate open rows", async () => {
    const s = setup();
    await s.repo.createTodo("工作日", { repeat: { kind: "weekdays" } });
    await s.repo.createTodo("周一周日", {
      repeat: { kind: "weekly", weekdays: [0, 1] },
    });
    s.setTime("2026-10-25T04:00:00Z");
    await s.repo.reconcileTodos();
    const todos = await s.repo.listTodos();
    expect(todos.filter((t) => t.text === "工作日")).toHaveLength(5);
    expect(
      todos
        .filter((t) => t.text === "周一周日")
        .map((t) => t.planning?.date)
        .sort(),
    ).toEqual(["2026-10-19", "2026-10-25"]);
    expect(todos.filter((t) => t.planning?.date === "2026-10-25")).toHaveLength(
      1,
    );
    await expect(
      s.repo.createTodo("无星期", { repeat: { kind: "weekly", weekdays: [] } }),
    ).rejects.toThrow();
  });
  it("respects 04:00 rollover and never duplicates a date after setting changes", async () => {
    const s = setup("2026-10-19T19:00:00Z");
    await s.repo.setTodoDayBoundary(4);
    await s.repo.createTodo("每日", { repeat: { kind: "daily" } });
    await s.repo.reconcileTodos();
    expect((await s.repo.listTodos())[0].planning?.date).toBe("2026-10-19");
    s.setTime("2026-10-19T20:00:00Z");
    expect(await s.repo.reconcileTodos()).toBe(1);
    await s.repo.setTodoDayBoundary(0);
    expect(await s.repo.listTodos()).toHaveLength(2);
    expect(await s.repo.getTodoSettings()).toEqual({
      timeZone: "Asia/Hong_Kong",
      dayBoundaryHour: 0,
    });
  });
  it("serializes simultaneous tab reconciliation", async () => {
    const s = setup();
    await s.repo.createTodo("一次", { repeat: { kind: "daily" } });
    const other = new SmokeNotesDatabase(s.db.name);
    const repo = new LocalRepository(other, {
      workspaceId: "workspace-plan",
      deviceId: "second",
      now: s.now,
    });
    try {
      const counts = await Promise.all([
        s.repo.reconcileTodos(),
        repo.reconcileTodos(),
      ]);
      expect(counts.reduce((a, b) => a + b)).toBe(1);
      expect(await s.repo.listTodos()).toHaveLength(1);
    } finally {
      other.close();
    }
  });
});

describe("history and explicit intent", () => {
  it("keeps prior snapshots when editing future rules, pausing/resuming and stopping", async () => {
    const s = setup();
    const series = await s.repo.createTodo("旧名字", {
      notes: "旧备注",
      repeat: { kind: "daily" },
    });
    await s.repo.reconcileTodos();
    const original = (await s.repo.listTodos())[0];
    await s.repo.setTodoStatus(original.id, "completed");
    await s.repo.updateTodoRule(series.id, { text: "新名字", notes: "新备注" });
    expect((await s.db.todos.get(original.id))?.text).toBe("旧名字");
    s.setTime("2026-10-20T04:00:00Z");
    await s.repo.reconcileTodos();
    await s.repo.pauseTodoSeries(series.id, true);
    s.setTime("2026-10-22T04:00:00Z");
    await s.repo.reconcileTodos();
    expect(await s.repo.listTodos()).toHaveLength(2);
    await s.repo.pauseTodoSeries(series.id, false);
    s.setTime("2026-10-23T04:00:00Z");
    await s.repo.reconcileTodos();
    expect(
      (await s.repo.listTodos()).filter((t) => t.text === "新名字"),
    ).toHaveLength(2);
    await s.repo.stopTodoSeries(series.id);
    s.setTime("2026-10-29T04:00:00Z");
    await s.repo.reconcileTodos();
    expect(await s.repo.listTodos()).toHaveLength(3);
    expect(getTodoStatus((await s.db.todos.get(original.id))!)).toBe(
      "completed",
    );
    expect(getTodoRule((await s.repo.listTodoSeries())[0])?.stopped).toBe(true);
  });
  it("can skip today, undo completion, and retains both events even with a fixed clock", async () => {
    const s = setup();
    await s.repo.createTodo("重复", { repeat: { kind: "daily" } });
    await s.repo.reconcileTodos();
    const row = (await s.repo.listTodos())[0];
    await s.repo.setTodoStatus(row.id, "skipped");
    await s.repo.setTodoStatus(row.id, "completed");
    await s.repo.setTodoStatus(row.id, "open");
    const current = (await s.db.todos.get(row.id))!;
    expect(getTodoStatus(current)).toBe("open");
    expect(current.completed).toBe(false);
    expect(current.planning?.events?.map((e) => e.status)).toEqual([
      "skipped",
      "completed",
      "open",
    ]);
    expect(new Set(current.planning?.events?.map((e) => e.at)).size).toBe(3);
  });
  it("reschedules one-time work without duplicating records and refuses recurring identity changes", async () => {
    const s = setup();
    const task = await s.repo.createTodo("逾期", { date: "2026-10-17" });
    await s.repo.rescheduleTodo(task.id, "2026-10-20");
    expect((await s.db.todos.get(task.id))?.planning?.date).toBe("2026-10-20");
    expect(await s.repo.listTodos()).toHaveLength(1);
    await s.repo.createTodo("重复", { repeat: { kind: "daily" } });
    await s.repo.reconcileTodos();
    const occurrence = (await s.repo.listTodos()).find(
      (t) => t.planning?.kind === "occurrence",
    )!;
    await expect(
      s.repo.rescheduleTodo(occurrence.id, "2026-10-21"),
    ).rejects.toThrow();
  });
  it("keeps planned history recoverable after the old trash expiration window", async () => {
    const s = setup();
    const todo = await s.repo.createTodo("保留历史", {});
    await s.repo.trashTodo(todo.id);
    s.setTime("2027-01-01T00:00:00Z");
    expect(await s.repo.purgeExpiredTrash()).toBe(0);
    expect(await s.db.todos.get(todo.id)).toBeDefined();
    await s.repo.restore("todo", todo.id);
    expect(await s.repo.listTodos()).toHaveLength(1);
  });
  it("does not start a future rule early when edited before its first date", async () => {
    const s = setup();
    const series = await s.repo.createTodo("将来", {
      date: "2026-12-01",
      repeat: { kind: "daily" },
    });
    await s.repo.updateTodoRule(series.id, { text: "将来的新版" });
    s.setTime("2026-11-01T00:00:00Z");
    expect(await s.repo.reconcileTodos()).toBe(0);
  });
});

describe("multi-device synchronization", () => {
  it("compares PostgreSQL JSONB key order semantically without requeue loops", async () => {
    const s = setup();
    const row = await s.repo.createTodo("顺序", {});
    const reorder = (value: unknown): unknown =>
      Array.isArray(value)
        ? value.map(reorder)
        : value && typeof value === "object"
          ? Object.fromEntries(
              Object.entries(value)
                .reverse()
                .map(([key, v]) => [key, reorder(v)]),
            )
          : value;
    const remote = reorder(row) as Todo;
    expect(sameTodoContent(mergeTodoChanges(row, remote), remote)).toBe(true);
  });
  it("converges a duplicated daily generation without losing an explicit completion", async () => {
    const a = setup(),
      b = setup();
    const remote = server();
    const ae = engine(a, remote.adapter),
      be = engine(b, remote.adapter);
    await a.repo.createTodo("每日同一条", { repeat: { kind: "daily" } });
    await flushAll(ae, a);
    await be.pull(null);
    await Promise.all([a.repo.reconcileTodos(), b.repo.reconcileTodos()]);
    const ar = (await a.repo.listTodos())[0],
      br = (await b.repo.listTodos())[0];
    expect(ar.id).toBe(br.id);
    await a.repo.setTodoStatus(ar.id, "completed");
    await flushAll(ae, a);
    await flushAll(be, b);
    await ae.pull(null);
    await be.pull(null);
    expect(remote.records.size).toBe(2);
    expect(getTodoStatus((await b.repo.listTodos())[0])).toBe("completed");
    expect(getTodoStatus((await a.repo.listTodos())[0])).toBe("completed");
  });
  it("merges a completion and an independent offline text edit", async () => {
    const a = setup(),
      b = setup();
    const remote = server();
    const ae = engine(a, remote.adapter),
      be = engine(b, remote.adapter);
    const task = await a.repo.createTodo("旧名字", { notes: "备注" });
    await flushAll(ae, a);
    await be.pull(null);
    await a.repo.setTodoStatus(task.id, "completed");
    await b.repo.updateTodo(task.id, { text: "新名字", notes: "新备注" });
    await flushAll(ae, a);
    await flushAll(be, b);
    await ae.pull(null);
    const merged = (await a.db.todos.get(task.id))!;
    expect(merged.text).toBe("新名字");
    expect(merged.planning?.notes).toBe("新备注");
    expect(getTodoStatus(merged)).toBe("completed");
  });
  it("retains conflicting explicit status events and converges deterministically", async () => {
    const a = setup(),
      b = setup();
    const remote = server();
    const ae = engine(a, remote.adapter),
      be = engine(b, remote.adapter);
    const task = await a.repo.createTodo("并发", {});
    await flushAll(ae, a);
    await be.pull(null);
    await a.repo.setTodoStatus(task.id, "completed");
    await b.repo.setTodoStatus(task.id, "skipped");
    const local = (await a.db.todos.get(task.id))!,
      other = (await b.db.todos.get(task.id))!;
    expect(mergeTodoChanges(local, other).planning?.status).toBe(
      mergeTodoChanges(other, local).planning?.status,
    );
    await flushAll(ae, a);
    await flushAll(be, b);
    await ae.pull(null);
    const resolved = (await a.db.todos.get(task.id))!;
    expect(resolved.planning?.events).toHaveLength(2);
    expect(getTodoStatus(resolved)).toBe(
      getTodoStatus((await b.db.todos.get(task.id))!),
    );
  });
  it("reconciles stale offline generation to a newer rule without rewriting completed snapshots", async () => {
    const a = setup(),
      b = setup();
    const remote = server();
    const ae = engine(a, remote.adapter),
      be = engine(b, remote.adapter);
    const series = await a.repo.createTodo("旧名字", {
      repeat: { kind: "daily" },
    });
    await a.repo.reconcileTodos();
    await flushAll(ae, a);
    await be.pull(null);
    await a.repo.updateTodoRule(series.id, {
      text: "新名字",
      repeat: { kind: "weekdays" },
    });
    await flushAll(ae, a);
    // B remained offline and materializes Tuesday..Saturday using its old rule.
    b.setTime("2026-10-24T04:00:00Z");
    await b.repo.reconcileTodos();
    const tuesday = (await b.repo.listTodos()).find(
      (t) => t.planning?.date === "2026-10-20",
    )!;
    await b.repo.setTodoStatus(tuesday.id, "completed");
    await flushAll(be, b);
    await be.pull(null);
    await b.repo.reconcileTodos();
    await flushAll(be, b);
    const rows = await b.repo.listTodos();
    expect(rows.find((t) => t.planning?.date === "2026-10-20")?.text).toBe(
      "旧名字",
    );
    expect(rows.find((t) => t.planning?.date === "2026-10-21")?.text).toBe(
      "新名字",
    );
    expect(
      getTodoStatus(rows.find((t) => t.planning?.date === "2026-10-24")!),
    ).toBe("skipped");
    await ae.pull(null);
    a.setTime("2026-10-24T04:00:00Z");
    await a.repo.reconcileTodos();
    await flushAll(ae, a);
    await be.pull(null);
    expect(getTodoStatus((await b.db.todos.get(tuesday.id))!)).toBe(
      "completed",
    );
    expect((await b.db.todos.get(tuesday.id))?.text).toBe("旧名字");
  });

  it("keeps same-millisecond undo newer than completion through another device", async () => {
    const a = setup(),
      b = setup();
    const remote = server();
    const ae = engine(a, remote.adapter),
      be = engine(b, remote.adapter);
    const task = await a.repo.createTodo("撤销", {});
    await flushAll(ae, a);
    await be.pull(null);
    await a.repo.setTodoStatus(task.id, "completed");
    await flushAll(ae, a);
    await be.pull(null);
    await a.repo.setTodoStatus(task.id, "open");
    await b.repo.updateTodo(task.id, { text: "另一端改名字" });
    await flushAll(be, b);
    await flushAll(ae, a);
    await be.pull(null);
    expect(getTodoStatus((await b.db.todos.get(task.id))!)).toBe("open");
    expect((await b.db.todos.get(task.id))?.text).toBe("另一端改名字");
    expect((await b.db.todos.get(task.id))?.planning?.events).toHaveLength(2);
    const counts = await a.db.operations.count();
    await ae.pull(null);
    await be.pull(null);
    expect(counts).toBe(0);
    expect(await b.db.operations.count()).toBe(0);
  });

  it("keeps both devices' future rule revisions and past snapshots", async () => {
    const a = setup(),
      b = setup();
    const remote = server();
    const ae = engine(a, remote.adapter),
      be = engine(b, remote.adapter);
    const series = await a.repo.createTodo("原规则", {
      repeat: { kind: "daily" },
    });
    await a.repo.reconcileTodos();
    await flushAll(ae, a);
    await be.pull(null);
    await a.repo.updateTodoRule(series.id, { notes: "设备A备注" });
    await b.repo.updateTodoRule(series.id, { text: "设备B名字" });
    await flushAll(ae, a);
    await flushAll(be, b);
    await ae.pull(null);
    expect((await a.repo.listTodoSeries())[0].planning?.revisions).toHaveLength(
      3,
    );
    expect((await a.repo.listTodos())[0].text).toBe("原规则");
  });
});

it("upgrades legacy todo rows/tombstones and attempted outbox entries without rewriting them", async () => {
  const name = `legacy-plans-${crypto.randomUUID()}`;
  const legacy = new Dexie(name);
  legacy.version(3).stores({
    notebooks: "id, workspaceId, rank, deletedAt",
    notes: "id, notebookId, rank, deletedAt, color, kind",
    todos: "id, workspaceId, rank, deletedAt",
    operations: "id, entity, entityId, createdAt, nextAttemptAt",
  });
  const row: Todo = {
    id: "legacy",
    workspaceId: "workspace-plan",
    text: "旧待办",
    completed: true,
    rank: 1024,
    version: 7,
    updatedAt: "2026-01-01T00:00:00Z",
    deletedAt: null,
  };
  const op: SyncOperation = {
    id: "pending",
    deviceId: "old",
    entity: "todo",
    entityId: row.id,
    action: "upsert",
    baseVersion: 6,
    payload: { ...row },
    attempts: 2,
    nextAttemptAt: row.updatedAt,
    createdAt: row.updatedAt,
  };
  await legacy
    .table("todos")
    .bulkPut([row, { ...row, id: "trash", deletedAt: row.updatedAt }]);
  await legacy.table("operations").put(op);
  legacy.close();
  const db = new SmokeNotesDatabase(name);
  databases.push(db);
  await db.open();
  expect(await db.todos.get(row.id)).toEqual(row);
  expect(await db.todos.get("trash")).toEqual({
    ...row,
    id: "trash",
    deletedAt: row.updatedAt,
  });
  expect(await db.operations.get(op.id)).toEqual(op);
});
