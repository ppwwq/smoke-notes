import { afterEach, expect, it } from "vitest";
import {
  LocalRepository,
  SmokeNotesDatabase,
  projectTodoRange,
  getTodoDate,
  plannerTodoValue,
  NOTE_COLORS,
  type CalendarEventInput,
} from "../src/index";
import { parseCalendarImport } from "../src/calendar-import";
const databases: SmokeNotesDatabase[] = [];
afterEach(async () => {
  await Promise.all(databases.map((db) => db.delete()));
  databases.length = 0;
});
function setup() {
  const db = new SmokeNotesDatabase(`planner-types-${crypto.randomUUID()}`);
  databases.push(db);
  const repo = new LocalRepository(db, {
    workspaceId: "one",
    deviceId: "one",
    now: () => new Date("2028-02-27T04:00:00Z"),
  });
  const other = new LocalRepository(db, {
    workspaceId: "two",
    deviceId: "two",
  });
  return { db, repo, other };
}
const eventInput: CalendarEventInput = {
  title: "会议",
  start: "2028-02-28T09:00",
  end: "2028-02-28T10:00",
  allDay: false,
  color: "purple",
  notes: "",
  location: "",
  url: "",
};
it.each(NOTE_COLORS)(
  "persists and imports note palette color %s without changing legacy labels",
  async (color) => {
    const { repo, db } = setup();
    const legacy = await repo.savePlannerType("旧标签", "purple");
    const label = await repo.savePlannerType("新标签", color);
    const event = await repo.saveCalendarEvent({
      ...eventInput,
      color,
      typeId: label.id,
    });
    db.close();
    await db.open();
    expect(await repo.listPlannerTypes()).toEqual(
      expect.arrayContaining([legacy, label]),
    );
    expect(
      (await repo.listCalendarEvents()).find((item) => item.id === event.id)
        ?.color,
    ).toBe(color);
    const plan = parseCalendarImport(
      JSON.stringify({ version: 1, events: [{ ...eventInput, color }] }),
    );
    expect(plan.items[0]).toMatchObject({ kind: "event", input: { color } });
  },
);
it("renames shared labels and removes only classification, including event exceptions", async () => {
  const { repo, db } = setup();
  const type = await repo.savePlannerType("工作", "blue");
  const task = await repo.savePlannerTodo({
    text: "材料",
    notes: "",
    date: "2028-02-28",
    typeId: type.id,
  });
  const event = await repo.saveCalendarEvent({
    ...eventInput,
    typeId: type.id,
    repeat: { frequency: "daily", interval: 1 },
  });
  await repo.saveCalendarEvent(
    { ...eventInput, typeId: type.id, title: "例外" },
    event.id,
    "2028-02-29",
  );
  await repo.savePlannerType("项目", "green", type.id);
  expect((await repo.listPlannerTypes())[0]).toMatchObject({
    id: type.id,
    name: "项目",
    color: "green",
  });
  expect((await repo.listTodoTypeLinks())[0].typeId).toBe(type.id);
  const operations = await db.operations.count();
  await repo.deletePlannerType(type.id);
  expect(await repo.listPlannerTypes()).toEqual([]);
  expect((await repo.listTodoTypeLinks())[0].typeId).toBeNull();
  expect((await db.todos.get(task.id))?.deletedAt).toBeNull();
  const saved = (await repo.listCalendarEvents())[0];
  expect(saved.typeId).toBeNull();
  expect(saved.exceptions["2028-02-29"]?.typeId).toBeNull();
  expect(await db.operations.count()).toBe(operations);
});
it("rejects duplicate, foreign and stale labels without partially creating or editing a task", async () => {
  const { repo, other, db } = setup();
  const type = await other.savePlannerType("Work", "blue");
  await expect(other.savePlannerType(" work ", "green")).rejects.toThrow(
    "同名",
  );
  await expect(repo.savePlannerType("x", "green", type.id)).rejects.toThrow();
  await expect(repo.deletePlannerType(type.id)).rejects.toThrow();
  const input = {
    text: "任务",
    notes: "",
    date: "2028-02-28",
    typeId: type.id,
  };
  await expect(repo.savePlannerTodo(input)).rejects.toThrow("类型");
  await expect(
    repo.saveCalendarEvent({ ...eventInput, typeId: type.id }),
  ).rejects.toThrow("类型");
  expect(await db.todos.count()).toBe(0);
  expect(await db.operations.count()).toBe(0);
  const own = await repo.savePlannerType("个人", "orange");
  const todo = await repo.savePlannerTodo({ ...input, typeId: own.id });
  await repo.deletePlannerType(own.id);
  await expect(
    repo.savePlannerTodo({ ...input, text: "不应保存", typeId: own.id }, todo),
  ).rejects.toThrow("类型");
  expect((await db.todos.get(todo.id))?.text).toBe("任务");
});
it("creates real daily repeats and edits one projected day without changing future instances", async () => {
  const { repo, db } = setup();
  const type = await repo.savePlannerType("生活", "green");
  const series = await repo.savePlannerTodo({
    text: "读书",
    date: "2028-02-28",
    notes: "每天十页",
    repeat: { kind: "daily" },
    typeId: type.id,
  });
  const projected = projectTodoRange(
    await db.todos.toArray(),
    "2028-02-28",
    "2028-03-01",
    "2028-02-27",
  );
  expect(projected).toHaveLength(3);
  expect((await repo.listTodoTypeLinks())[0]).toMatchObject({
    todoId: series.id,
    typeId: type.id,
  });
  const edited = await repo.savePlannerTodo(
    { text: "今天读二十页", date: "2028-02-29", notes: "特例", typeId: null },
    projected[1],
  );
  const next = projectTodoRange(
    await db.todos.toArray(),
    "2028-02-28",
    "2028-03-01",
    "2028-02-27",
  );
  expect(next.map((t) => t.text)).toEqual(["读书", "今天读二十页", "读书"]);
  expect(
    (await repo.listTodoTypeLinks()).find((l) => l.todoId === edited.id)
      ?.typeId,
  ).toBeNull();
  await repo.setTodoStatus(edited.id, "completed");
  expect((await db.todos.get(edited.id))?.completed).toBe(true);
  expect(
    (await db.operations.toArray()).every(
      (op) => !JSON.stringify(op).includes("typeId"),
    ),
  ).toBe(true);
  const count = await db.todos.count();
  await expect(
    repo.savePlannerTodo(
      { text: "不能改期", date: "2028-03-02", notes: "" },
      projected[2],
    ),
  ).rejects.toThrow("日期");
  expect(await db.todos.count()).toBe(count);
});
it("reschedules one-off tasks and keeps edited notes after reopening", async () => {
  const { repo, db } = setup();
  const todo = await repo.savePlannerTodo({
    text: "材料",
    date: "2028-02-28",
    notes: "旧备注",
  });
  await repo.savePlannerTodo(
    { text: "新材料", date: "2028-03-01", notes: "新备注" },
    todo,
  );
  const saved = (await db.todos.get(todo.id))!;
  expect(getTodoDate(saved)).toBe("2028-03-01");
  expect(saved).toMatchObject({
    text: "新材料",
    planning: { notes: "新备注" },
  });
});

it("persists calendar defaults per workspace and clears deleted default labels without losing content", async () => {
  const { repo, other, db } = setup();
  const type = await repo.savePlannerType("日常", "green");
  const preferences = {
    ...(await repo.getPlannerPreferences()),
    hiddenTypeIds: [type.id],
    defaultTypeId: type.id,
    defaultDuration: 30,
    showReminders: false,
  };
  await repo.savePlannerPreferences(preferences);
  expect(await repo.getPlannerPreferences()).toEqual(preferences);
  expect((await other.getPlannerPreferences()).showReminders).toBe(true);
  await expect(other.savePlannerPreferences(preferences)).rejects.toThrow(
    "类型",
  );
  await expect(
    repo.savePlannerPreferences({ ...preferences, defaultDuration: 0 }),
  ).rejects.toThrow();
  expect(await db.operations.count()).toBe(0);
  await repo.deletePlannerType(type.id);
  expect(await repo.getPlannerPreferences()).toMatchObject({
    defaultTypeId: null,
    hiddenTypeIds: [],
    defaultDuration: 30,
  });
});
it("inherits scheduled times but lets one recurring reminder become all-day, with invalid times rejected atomically", async () => {
  const { repo, db } = setup();
  const series = await repo.savePlannerTodo({
    text: "读书",
    date: "2028-02-28",
    notes: "",
    repeat: { kind: "daily" },
    time: "09:30",
  });
  const projected = projectTodoRange(
    await db.todos.toArray(),
    "2028-02-28",
    "2028-02-29",
    "2028-02-27",
  );
  let times = Object.fromEntries(
    (await repo.listTodoTypeLinks()).map((link) => [link.todoId, link.time]),
  );
  expect(plannerTodoValue(times, projected[0])).toBe("09:30");
  await repo.savePlannerTodo(
    { text: "今日不限时间", date: "2028-02-28", notes: "", time: null },
    projected[0],
  );
  times = Object.fromEntries(
    (await repo.listTodoTypeLinks()).map((link) => [link.todoId, link.time]),
  );
  expect(times[series.id]).toBe("09:30");
  expect(plannerTodoValue(times, projected[0])).toBeNull();
  expect(plannerTodoValue(times, projected[1])).toBe("09:30");
  const operations = await db.operations.count();
  for (const time of ["24:00", "09:60", "9:30", "09:30:00"]) {
    await expect(
      repo.savePlannerTodo(
        { text: "错误时间", date: "2028-02-29", notes: "", time },
        projected[1],
      ),
    ).rejects.toThrow("时间");
  }
  expect(await db.operations.count()).toBe(operations);
  expect(
    (await db.operations.toArray()).every(
      (op) => !JSON.stringify(op).includes('"time":'),
    ),
  ).toBe(true);
});

it("persists calendar layout per workspace and defaults older preferences without losing their settings", async () => {
  const { repo, other, db } = setup();
  const original = await repo.getPlannerPreferences();
  await repo.savePlannerPreferences({
    ...original,
    weekStartsOn: 0,
    showWeekNumbers: true,
    monthDensity: "comfortable",
  });
  expect(await repo.getPlannerPreferences()).toMatchObject({
    weekStartsOn: 0,
    showWeekNumbers: true,
    monthDensity: "comfortable",
  });
  expect(await other.getPlannerPreferences()).toMatchObject({
    weekStartsOn: 1,
    showWeekNumbers: false,
    monthDensity: "compact",
  });
  for (const invalid of [
    { weekStartsOn: 7 },
    { weekStartsOn: 1.5 },
    { monthDensity: "invalid" },
    { showWeekNumbers: "yes" },
  ])
    await expect(
      repo.savePlannerPreferences({
        ...original,
        ...invalid,
      } as typeof original),
    ).rejects.toThrow("设置");
  const legacy = { ...original };
  delete legacy.weekStartsOn;
  delete legacy.showWeekNumbers;
  delete legacy.monthDensity;
  await db.plannerPreferences.put({ ...legacy, defaultDuration: 30 });
  await repo.savePlannerPreferences(await repo.getPlannerPreferences());
  expect(await repo.getPlannerPreferences()).toMatchObject({
    weekStartsOn: 1,
    showWeekNumbers: false,
    monthDensity: "compact",
    defaultDuration: 30,
  });
});

it("edits a recurring todo from the selected date and preserves earlier days and exceptions", async () => {
  const { repo, db } = setup();
  const series = await repo.savePlannerTodo({
    text: "原计划",
    date: "2028-02-28",
    notes: "旧备注",
    repeat: { kind: "daily" },
  });
  const days = projectTodoRange(
    await db.todos.toArray(),
    "2028-02-28",
    "2028-03-02",
    "2028-02-27",
  );
  await repo.savePlannerTodo(
    { text: "单次例外", date: "2028-03-01", notes: "保留" },
    days[2],
  );
  await repo.savePlannerTodo(
    {
      text: "新计划",
      date: "2028-02-29",
      notes: "新备注",
      scope: "following",
      repeat: { kind: "daily" },
    },
    days[1],
  );
  const next = projectTodoRange(
    await db.todos.toArray(),
    "2028-02-28",
    "2028-03-02",
    "2028-02-27",
  );
  expect(next.map((t) => [getTodoDate(t), t.text, t.planning?.notes])).toEqual([
    ["2028-02-28", "原计划", "旧备注"],
    ["2028-02-29", "新计划", "新备注"],
    ["2028-03-01", "单次例外", "保留"],
    ["2028-03-02", "新计划", "新备注"],
  ]);
  expect(
    (await repo.listTodoSeries()).find((t) => t.id === series.id)?.planning
      ?.revisions,
  ).toHaveLength(2);
});

it("changes frequency from a past selected day, preserves completed days and replaces later scheduled rules", async () => {
  const { repo, db } = setup();
  const series = await repo.savePlannerTodo({
    text: "每天",
    date: "2028-02-24",
    notes: "",
    repeat: { kind: "daily" },
  });
  await repo.reconcileTodos();
  const days = await repo.listTodos();
  const selected = days.find((t) => getTodoDate(t) === "2028-02-25")!;
  const completed = days.find((t) => getTodoDate(t) === "2028-02-26")!;
  await repo.setTodoStatus(completed.id, "completed");
  await repo.updateTodoRule(series.id, { text: "原定未来修改" });
  await repo.savePlannerTodo(
    {
      text: "只在工作日",
      date: "2028-02-25",
      notes: "新规则",
      repeat: { kind: "weekdays" },
      scope: "following",
    },
    selected,
  );
  const stored = await db.todos.toArray();
  expect(stored.find((t) => t.id === completed.id)).toMatchObject({
    text: "每天",
    completed: true,
  });
  expect(
    stored.find(
      (t) =>
        getTodoDate(t) === "2028-02-24" && t.planning?.kind === "occurrence",
    )?.text,
  ).toBe("每天");
  expect(
    stored.find(
      (t) =>
        getTodoDate(t) === "2028-02-27" && t.planning?.kind === "occurrence",
    )?.planning?.ruleSkipped,
  ).toBe(true);
  expect(
    projectTodoRange(stored, "2028-02-28", "2028-03-05", "2028-02-27").map(
      (t) => [getTodoDate(t), t.text],
    ),
  ).toEqual([
    ["2028-02-28", "只在工作日"],
    ["2028-02-29", "只在工作日"],
    ["2028-03-01", "只在工作日"],
    ["2028-03-02", "只在工作日"],
    ["2028-03-03", "只在工作日"],
  ]);
});
