import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  LocalRepository,
  SmokeNotesDatabase,
  getTodoDate,
} from "@smoke-notes/core";
import { SmokeNotesApp } from "../src/SmokeNotesApp";

let database: SmokeNotesDatabase;
let repository: LocalRepository;
beforeEach(async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-20T15:59:00Z"));
  database = new SmokeNotesDatabase(
    `planner-integration-${crypto.randomUUID()}`,
  );
  repository = new LocalRepository(database, {
    workspaceId: "planner-workspace",
    deviceId: "planner-device",
  });
  await repository.createNotebook("计划测试");
});
afterEach(async () => {
  cleanup();
  await database.delete();
  vi.useRealTimers();
});

it("catches up on focus after Hong Kong midnight and retains the prior completed occurrence", async () => {
  await repository.createTodo("每天读书", { repeat: { kind: "daily" } });
  await repository.reconcileTodos();
  const yesterday = (await repository.listTodos())[0];
  await repository.setTodoStatus(yesterday.id, "completed");
  render(<SmokeNotesApp repository={repository} platform="web" />);
  await screen.findByText("计划测试", {
    selector: ".note-stack-caption strong",
  });
  fireEvent.click(
    within(screen.getByRole("navigation", { name: "主导航" })).getByRole(
      "button",
      { name: "待办" },
    ),
  );
  await screen.findByRole("heading", { name: "待办" });
  act(() => {
    vi.setSystemTime(new Date("2026-10-20T16:01:00Z"));
    fireEvent(window, new Event("focus"));
  });
  await waitFor(async () => {
    const todos = await repository.listTodos();
    expect(todos).toHaveLength(2);
    expect(
      todos.find((todo) => getTodoDate(todo) === "2026-10-20")?.completed,
    ).toBe(true);
    expect(
      todos.find((todo) => getTodoDate(todo) === "2026-10-21")?.completed,
    ).toBe(false);
  });
  await screen.findByRole("textbox", { name: "编辑待办：每天读书" });
});

it("persists the 04:00 setting and shows the real local-only sync state", async () => {
  render(<SmokeNotesApp repository={repository} platform="web" />);
  await screen.findByText("计划测试", {
    selector: ".note-stack-caption strong",
  });
  fireEvent.click(screen.getByRole("button", { name: "打开设置" }));
  fireEvent.click(screen.getByText("每日待办", { selector: "summary" }));
  fireEvent.change(screen.getByRole("combobox", { name: "待办换日时间" }), {
    target: { value: "4" },
  });
  await waitFor(async () =>
    expect((await repository.getTodoSettings()).dayBoundaryHour).toBe(4),
  );
  await waitFor(() =>
    expect(
      screen.getByRole("combobox", { name: "待办换日时间" }),
    ).toBeEnabled(),
  );
  fireEvent.click(screen.getByRole("button", { name: "关闭设置" }));
  fireEvent.click(screen.getByRole("button", { name: "待办" }));
  expect(
    await screen.findByText("已保存在本机 · 未启用云端同步"),
  ).toBeVisible();
});
