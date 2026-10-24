import { afterEach, expect, it } from "vitest";
import {
  LocalRepository,
  SmokeNotesDatabase,
  projectTodoRange,
  getTodoDate,
  getTodoStatus,
  todoOccurrenceId,
} from "../src/index";

const databases: SmokeNotesDatabase[] = [];
afterEach(async () => {
  await Promise.all(databases.map((db) => db.delete()));
  databases.length = 0;
});
function setup() {
  const db = new SmokeNotesDatabase(`calendar-${crypto.randomUUID()}`);
  databases.push(db);
  const repo = new LocalRepository(db, {
    workspaceId: "calendar",
    deviceId: "one",
    now: () => new Date("2028-02-27T04:00:00Z"),
  });
  return { db, repo };
}
it("projects a leap-day month without writes and only materializes the acted-on occurrence once", async () => {
  const { db, repo } = setup();
  const series = await repo.createTodo("读书", {
    date: "2028-02-28",
    repeat: { kind: "daily" },
  });
  const records = await db.todos.toArray(),
    operations = await db.operations.count();
  const projected = projectTodoRange(
    records,
    "2028-02-28",
    "2028-03-01",
    "2028-02-27",
  );
  expect(projected.map(getTodoDate)).toEqual([
    "2028-02-28",
    "2028-02-29",
    "2028-03-01",
  ]);
  expect(await db.todos.count()).toBe(1);
  expect(await db.operations.count()).toBe(operations);
  const [first, second] = await Promise.all([
    repo.ensureTodoOccurrence(series.id, "2028-02-29"),
    repo.ensureTodoOccurrence(series.id, "2028-02-29"),
  ]);
  expect(first.id).toBe(second.id);
  expect(await db.todos.count()).toBe(2);
  await repo.setTodoStatus(first.id, "completed");
  const result = projectTodoRange(
    await db.todos.toArray(),
    "2028-02-28",
    "2028-03-01",
    "2028-02-27",
  );
  expect(result.map(getTodoStatus)).toEqual(["open", "completed", "open"]);
});
it("honors future deletions and explicit completions when rules are paused or replaced", async () => {
  const { db, repo } = setup();
  const series = await repo.createTodo("散步", {
    date: "2028-02-28",
    repeat: { kind: "daily" },
  });
  const deleted = await repo.ensureTodoOccurrence(series.id, "2028-02-28");
  await repo.trashTodo(deleted.id);
  const done = await repo.ensureTodoOccurrence(series.id, "2028-02-29");
  await repo.setTodoStatus(done.id, "completed");
  await repo.ensureTodoOccurrence(series.id, "2028-03-01");
  await repo.pauseTodoSeries(series.id, true);
  const projected = projectTodoRange(
    await db.todos.toArray(),
    "2028-02-28",
    "2028-03-02",
    "2028-02-27",
  );
  expect(projected.map((todo) => todo.id)).toEqual([done.id]);
  await expect(
    repo.ensureTodoOccurrence(series.id, "2028-03-01"),
  ).rejects.toThrow("已改变");
  await expect(
    repo.ensureTodoOccurrence(series.id, "2028-02-28"),
  ).rejects.toThrow("已删除");
  await repo.pauseTodoSeries(series.id, false);
  expect(
    projectTodoRange(
      await db.todos.toArray(),
      "2028-02-28",
      "2028-03-02",
      "2028-02-27",
    ).map(getTodoDate),
  ).toEqual(["2028-02-29", "2028-03-01", "2028-03-02"]);
});
it("applies specified weekdays and future rule text without changing historical records", async () => {
  const { db, repo } = setup();
  const series = await repo.createTodo("旧名称", {
    date: "2028-02-25",
    repeat: { kind: "daily" },
  });
  await repo.reconcileTodos();
  await repo.updateTodoRule(series.id, {
    text: "新名称",
    repeat: { kind: "weekly", weekdays: [2] },
  });
  const records = await db.todos.toArray();
  const projected = projectTodoRange(
    records,
    "2028-02-25",
    "2028-03-01",
    "2028-02-27",
  );
  expect(projected.map(getTodoDate)).toEqual([
    "2028-02-25",
    "2028-02-26",
    "2028-02-27",
    "2028-02-29",
  ]);
  expect(projected[0].text).toBe("旧名称");
  expect(projected.at(-1)?.text).toBe("新名称");
  expect(projected.at(-1)?.id).toBe(todoOccurrenceId(series.id, "2028-02-29"));
  expect(() =>
    projectTodoRange(records, "2028-02-30", "2028-03-01", "2028-02-27"),
  ).toThrow();
});
