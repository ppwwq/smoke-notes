import { afterEach, expect, it, vi } from "vitest";
import {
  LocalRepository,
  SmokeNotesDatabase,
  projectTodoRange,
  getTodoDate,
  getTodoStatus,
} from "../src/index";
const databases: SmokeNotesDatabase[] = [];
afterEach(async () => {
  await Promise.all(databases.map((db) => db.delete()));
  databases.length = 0;
});
function setup() {
  const db = new SmokeNotesDatabase(`planner-move-${crypto.randomUUID()}`);
  databases.push(db);
  return {
    db,
    repo: new LocalRepository(db, {
      workspaceId: "one",
      deviceId: "one",
      now: () => new Date("2026-10-24T04:00:00Z"),
    }),
  };
}
it("moves a completed one-off and preserves its label, notes and time; all-day drop clears time", async () => {
  const { repo, db } = setup();
  const type = await repo.savePlannerType("学习", "blue");
  const task = await repo.savePlannerTodo({
    text: "复习",
    notes: "保留备注",
    date: "2026-10-25",
    time: "09:30",
    typeId: type.id,
  });
  await repo.setTodoStatus(task.id, "completed");
  const moved = await repo.movePlannerTodo(task, "2026-10-26");
  expect(moved.id).toBe(task.id);
  expect(getTodoDate(moved)).toBe("2026-10-26");
  expect(getTodoStatus(moved)).toBe("completed");
  expect(moved.planning?.notes).toBe("保留备注");
  expect(await db.todoTypeLinks.get(`one:${task.id}`)).toMatchObject({
    typeId: type.id,
    time: "09:30",
  });
  await repo.movePlannerTodo(moved, "2026-10-27", null);
  expect(await db.todoTypeLinks.get(`one:${task.id}`)).toMatchObject({
    typeId: type.id,
    time: null,
  });
});
it("moves only one projected repeat occurrence and keeps the source skipped, future rule and completion", async () => {
  const { repo, db } = setup();
  const type = await repo.savePlannerType("运动", "green");
  const series = await repo.savePlannerTodo({
    text: "跑步",
    notes: "操场",
    date: "2026-10-25",
    time: "18:30",
    typeId: type.id,
    repeat: { kind: "daily" },
  });
  const [occurrence] = projectTodoRange(
    await db.todos.toArray(),
    "2026-10-25",
    "2026-10-25",
    "2026-10-24",
  );
  await repo.ensureTodoOccurrence(series.id, "2026-10-25");
  await repo.setTodoStatus(occurrence.id, "completed");
  const moved = await repo.movePlannerTodo(occurrence, "2026-10-27", "17:15");
  expect(moved.planning).toMatchObject({
    kind: "task",
    date: "2026-10-27",
    status: "completed",
    notes: "操场",
  });
  expect(await db.todoTypeLinks.get(`one:${moved.id}`)).toMatchObject({
    typeId: type.id,
    time: "17:15",
  });
  expect((await db.todos.get(occurrence.id))?.planning?.status).toBe("skipped");
  expect((await db.todos.get(occurrence.id))?.deletedAt).toBeNull();
  expect(await db.todos.get(series.id)).toEqual(series);
  const visible = projectTodoRange(
    await db.todos.toArray(),
    "2026-10-25",
    "2026-10-28",
    "2026-10-24",
  ).filter((todo) => getTodoStatus(todo) !== "skipped");
  expect(
    visible.filter((todo) => getTodoDate(todo) === "2026-10-25"),
  ).toHaveLength(0);
  expect(
    visible.filter((todo) => getTodoDate(todo) === "2026-10-27"),
  ).toHaveLength(2);
  await expect(repo.movePlannerTodo(occurrence, "2026-10-28")).rejects.toThrow(
    "待办已变更",
  );
});
it("rolls back the detached task if marking the source skipped fails, and rejects foreign targets", async () => {
  const { repo, db } = setup();
  await repo.savePlannerTodo({
    text: "阅读",
    notes: "",
    date: "2026-10-25",
    repeat: { kind: "daily" },
  });
  const [occurrence] = projectTodoRange(
    await db.todos.toArray(),
    "2026-10-25",
    "2026-10-25",
    "2026-10-24",
  );
  const before = await db.todos.toArray();
  const operations = await db.operations.count();
  vi.spyOn(repo, "setTodoStatus").mockRejectedValueOnce(
    new Error("storage failure"),
  );
  await expect(repo.movePlannerTodo(occurrence, "2026-10-26")).rejects.toThrow(
    "storage failure",
  );
  expect(await db.todos.toArray()).toEqual(before);
  expect(await db.operations.count()).toBe(operations);
  expect(await db.todoTypeLinks.count()).toBe(1);
  await expect(
    repo.movePlannerTodo({ ...occurrence, workspaceId: "other" }, "2026-10-26"),
  ).rejects.toThrow();
});
