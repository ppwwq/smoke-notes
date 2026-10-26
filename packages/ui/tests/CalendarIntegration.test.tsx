import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  LocalRepository,
  SmokeNotesDatabase,
  getTodoDate,
  todoOccurrenceId,
} from "@smoke-notes/core";
import { SmokeNotesApp } from "../src/SmokeNotesApp";
import { TodoComposer } from "../src/components/TodoComposer";
let db: SmokeNotesDatabase, repo: LocalRepository;
beforeEach(async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-20T04:00:00Z"));
  db = new SmokeNotesDatabase(`calendar-ui-${crypto.randomUUID()}`);
  repo = new LocalRepository(db, {
    workspaceId: "calendar-ui",
    deviceId: "one",
  });
  await repo.createNotebook("日历测试");
});
afterEach(async () => {
  cleanup();
  await db.delete();
  vi.useRealTimers();
});
async function openCalendar() {
  render(<SmokeNotesApp repository={repo} platform="web" />);
  await screen.findByText("日历测试", {
    selector: ".note-stack-caption strong",
  });
  fireEvent.click(
    within(screen.getByRole("navigation", { name: "主导航" })).getByRole(
      "button",
      { name: "待办" },
    ),
  );
  fireEvent.click(await screen.findByRole("button", { name: "日历" }));
}
it("keeps one global add entry and moves one day across month boundaries in every calendar scale", async () => {
  await openCalendar();
  expect(
    document.querySelector(".calendar-studio-top .calendar-new"),
  ).toBeNull();
  expect(screen.queryByRole("button", { name: "新建日程" })).toBeNull();
  for (const scale of ["日", "周", "月", "年"]) {
    fireEvent.click(
      within(screen.getByRole("group", { name: "日历显示方式" })).getByRole(
        "button",
        { name: scale },
      ),
    );
    fireEvent.click(
      within(
        document.querySelector<HTMLElement>(".calendar-month-controls")!,
      ).getByRole("button", { name: "今天" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "后一天" }));
    expect(
      screen
        .getByRole("region", { name: "选中日期的待办" })
        .querySelector("time"),
    ).toHaveAttribute("datetime", "2026-10-21");
    fireEvent.click(screen.getByRole("button", { name: "前一天" }));
    expect(
      screen
        .getByRole("region", { name: "选中日期的待办" })
        .querySelector("time"),
    ).toHaveAttribute("datetime", "2026-10-20");
  }
  fireEvent.click(
    within(screen.getByRole("group", { name: "日历显示方式" })).getByRole(
      "button",
      { name: "月" },
    ),
  );
  fireEvent.click(screen.getByRole("button", { name: /2026年10月31日/ }));
  fireEvent.click(screen.getByRole("button", { name: "后一天" }));
  expect(screen.getByRole("combobox", { name: "日历月份" })).toHaveTextContent(
    "11月",
  );
  fireEvent.click(screen.getByRole("button", { name: "新增安排" }));
  fireEvent.click(screen.getByRole("button", { name: "日期与时间" }));
  expect(
    screen.getByRole("button", { name: "日程开始日期" }),
  ).toHaveTextContent("2026/11/01");
  // This traverses all four views; shared CI runners can exceed the 5s default.
}, 15000);
it("creates events in the settings timezone without a timezone picker in the editor", async () => {
  await repo.savePlannerPreferences({
    ...(await repo.getPlannerPreferences()),
    timeZone: "Asia/Tokyo",
  });
  await openCalendar();
  fireEvent.click(screen.getByRole("button", { name: "新增安排" }));
  expect(screen.queryByRole("combobox", { name: "日程时区" })).toBeNull();
  expect(screen.queryByText("香港时间 · 保存在本机")).toBeNull();
  fireEvent.change(screen.getByRole("textbox", { name: "日程标题" }), {
    target: { value: "东京设置" },
  });
  fireEvent.click(screen.getByRole("button", { name: "保存日程" }));
  await waitFor(async () =>
    expect(await repo.listCalendarEvents()).toHaveLength(1),
  );
  expect((await repo.listCalendarEvents())[0]).toMatchObject({
    timeZone: "Asia/Tokyo",
    start: "2026-10-20T09:00",
  });
});
it("filters events and reminders consistently in the month, agenda, upcoming list and search", async () => {
  await repo.savePlannerTodo({
    text: "阅读筛选",
    date: "2026-10-20",
    notes: "",
  });
  await repo.saveCalendarEvent({
    title: "会议筛选",
    start: "2026-10-20T09:00",
    end: "2026-10-20T10:00",
    allDay: false,
    color: "purple",
    notes: "",
    location: "",
    url: "",
  });
  await openCalendar();
  const user = userEvent.setup();
  async function filter(label: string) {
    await user.click(screen.getByRole("combobox", { name: "显示安排" }));
    await user.click(await screen.findByRole("option", { name: label }));
  }
  await filter("只看日程");
  expect(screen.queryByRole("button", { name: "待办：阅读筛选" })).toBeNull();
  expect(screen.queryByRole("checkbox", { name: "完成：阅读筛选" })).toBeNull();
  await filter("只看待办");
  expect(
    screen.queryByRole("button", { name: "日程：会议筛选，09:00–10:00" }),
  ).toBeNull();
  expect(screen.getByRole("button", { name: "待办：阅读筛选" })).toBeVisible();
  await user.click(screen.getByRole("button", { name: "日程列表" }));
  expect(
    screen.getByRole("region", { name: "即将到来的日程" }),
  ).toHaveTextContent("阅读筛选");
  expect(
    screen.getByRole("region", { name: "即将到来的日程" }),
  ).not.toHaveTextContent("会议筛选");
  await user.type(screen.getByRole("searchbox", { name: "搜索日历" }), "筛选");
  const results = screen.getByRole("region", { name: "日历搜索结果" });
  expect(results).toHaveTextContent("阅读筛选");
  expect(results).not.toHaveTextContent("会议筛选");
  await filter("全部安排");
  expect(results).toHaveTextContent("会议筛选");
});
it("opens every compressed entry and expands a day with a return to its original calendar range", async () => {
  for (const title of ["早会", "午会", "下午会", "夜读会", "被压缩的晚会"])
    await repo.saveCalendarEvent({
      title,
      start: "2026-10-20T09:00",
      end: "2026-10-20T10:00",
      allDay: false,
      color: "purple",
      notes: "",
      location: "",
      url: "",
    });
  await openCalendar();
  const user = userEvent.setup();
  const more = screen.getByRole("button", {
    name: "查看2026-10-20的全部5项安排",
  });
  await user.click(more);
  let popup = await screen.findByRole("dialog", {
    name: /2026年10月20日/,
  });
  expect(
    within(popup).getByRole("button", { name: /被压缩的晚会/ }),
  ).toBeVisible();
  await user.keyboard("{Escape}");
  await waitFor(() => expect(more).toHaveFocus());
  await user.click(more);
  popup = await screen.findByRole("dialog", { name: /2026年10月20日/ });
  await user.click(within(popup).getByRole("button", { name: /被压缩的晚会/ }));
  const detail = await screen.findByRole("dialog", { name: "日程详情" });
  expect(
    within(detail).getByRole("heading", { name: "被压缩的晚会" }),
  ).toBeVisible();
  await user.click(within(detail).getByRole("button", { name: "完成" }));
  await user.click(more);
  await user.click(screen.getByRole("button", { name: "展开当天" }));
  const back = await screen.findByRole("button", { name: "返回月视图" });
  expect(document.querySelectorAll(".calendar-time-column")).toHaveLength(1);
  await user.click(back);
  await user.click(
    within(screen.getByRole("group", { name: "日历显示方式" })).getByRole(
      "button",
      { name: "周" },
    ),
  );
  await user.click(screen.getByRole("button", { name: "放大时间轴" }));
  await user.click(screen.getByRole("button", { name: "展开2026-10-21整天" }));
  expect(document.querySelectorAll(".calendar-time-column")).toHaveLength(1);
  expect(
    screen.getByRole("button", { name: "重置时间轴缩放" }),
  ).toHaveTextContent("125%");
  await user.click(screen.getByRole("button", { name: "返回周视图" }));
  expect(document.querySelectorAll(".calendar-time-column")).toHaveLength(7);
});
it("switches entry kinds without losing drafts, creates a labeled daily task and edits only that day", async () => {
  await openCalendar();
  fireEvent.click(screen.getByRole("button", { name: "新增安排" }));
  fireEvent.change(screen.getByRole("textbox", { name: "日程标题" }), {
    target: { value: "保留行程草稿" },
  });
  fireEvent.click(screen.getByRole("button", { name: "每日待办" }));
  fireEvent.change(screen.getByRole("textbox", { name: "每日待办内容" }), {
    target: { value: "每日阅读" },
  });
  fireEvent.click(screen.getByRole("button", { name: "行程" }));
  expect(screen.getByRole("textbox", { name: "日程标题" })).toHaveValue(
    "保留行程草稿",
  );
  fireEvent.click(screen.getByRole("button", { name: "每日待办" }));
  expect(screen.getByRole("textbox", { name: "每日待办内容" })).toHaveValue(
    "每日阅读",
  );
  fireEvent.click(screen.getByRole("button", { name: "编辑类型标签" }));
  expect(screen.queryByRole("textbox", { name: "类型名称" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "新增类型标签" }));
  expect(screen.getByRole("textbox", { name: "类型名称" })).toHaveFocus();
  fireEvent.change(screen.getByRole("textbox", { name: "类型名称" }), {
    target: { value: "学习" },
  });
  fireEvent.click(screen.getByRole("button", { name: "保存类型" }));
  await waitFor(() =>
    expect(screen.queryByRole("dialog", { name: "编辑类型标签" })).toBeNull(),
  );
  expect(screen.getByRole("textbox", { name: "每日待办内容" })).toHaveValue(
    "每日阅读",
  );
  expect(await repo.listTodoSeries()).toHaveLength(0);
  expect(await repo.listCalendarEvents()).toHaveLength(0);
  expect(screen.getByRole("combobox", { name: "类型标签" })).toHaveTextContent(
    "学习",
  );
  fireEvent.click(screen.getByRole("button", { name: "保存待办" }));
  await screen.findByRole("checkbox", { name: "完成：每日阅读" });
  expect(
    (await repo.listTodoSeries())[0].planning?.revisions?.[0].repeat?.kind,
  ).toBe("daily");
  fireEvent.click(screen.getByRole("button", { name: "编辑待办：每日阅读" }));
  fireEvent.change(screen.getByRole("textbox", { name: "每日待办内容" }), {
    target: { value: "今天读三十页" },
  });
  fireEvent.change(screen.getByRole("textbox", { name: "每日待办备注" }), {
    target: { value: "记下重点" },
  });
  fireEvent.click(screen.getByRole("button", { name: "保存待办" }));
  await screen.findByRole("checkbox", { name: "完成：今天读三十页" });
  expect(screen.getByText("记下重点")).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: /2026年10月21日/ }));
  expect(
    screen.getByRole("checkbox", { name: "完成：每日阅读" }),
  ).toBeVisible();
});
it("renames and removes a type from an existing event without deleting the event or submitting its edit form", async () => {
  const type = await repo.savePlannerType("工作", "blue");
  await repo.saveCalendarEvent({
    title: "会议",
    start: "2026-10-20T09:00",
    end: "2026-10-20T10:00",
    allDay: false,
    color: "blue",
    notes: "",
    location: "",
    url: "",
    typeId: type.id,
  });
  await openCalendar();
  fireEvent.click(
    screen.getByRole("button", { name: "日程：会议，09:00–10:00" }),
  );
  fireEvent.click(screen.getByRole("button", { name: "编辑日程" }));
  fireEvent.click(screen.getByRole("button", { name: "编辑类型标签" }));
  fireEvent.click(screen.getByRole("button", { name: "编辑类型：工作" }));
  fireEvent.change(screen.getByRole("textbox", { name: "类型名称" }), {
    target: { value: "项目" },
  });
  fireEvent.click(screen.getByRole("button", { name: "保存类型" }));
  await waitFor(() =>
    expect(screen.queryByRole("dialog", { name: "编辑类型标签" })).toBeNull(),
  );
  expect(screen.getByRole("combobox", { name: "类型标签" })).toHaveTextContent(
    "项目",
  );
  expect(screen.getByRole("textbox", { name: "日程标题" })).toHaveValue("会议");
  fireEvent.click(screen.getByRole("button", { name: "编辑类型标签" }));
  fireEvent.click(screen.getByRole("button", { name: "编辑类型：项目" }));
  fireEvent.click(screen.getByRole("button", { name: "删除标签" }));
  fireEvent.click(screen.getByRole("button", { name: "确认删除标签" }));
  await waitFor(async () =>
    expect(await repo.listPlannerTypes()).toHaveLength(0),
  );
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "关闭类型编辑" })).toBeEnabled(),
  );
  fireEvent.click(screen.getByRole("button", { name: "关闭类型编辑" }));
  expect(screen.getByRole("combobox", { name: "类型标签" })).toHaveTextContent(
    "未分类",
  );
  fireEvent.click(screen.getByRole("button", { name: "保存日程" }));
  await waitFor(() =>
    expect(screen.queryByRole("dialog", { name: "日程详情" })).toBeNull(),
  );
  expect(await repo.listCalendarEvents()).toHaveLength(1);
  expect((await repo.listCalendarEvents())[0].typeId).toBeNull();
});
it("creates a one-off task on the selected date through the unified editor and keeps the calendar", async () => {
  await openCalendar();
  fireEvent.click(screen.getByRole("button", { name: /2026年10月23日/ }));
  fireEvent.click(screen.getByRole("button", { name: "添加待办到2026-10-23" }));
  fireEvent.change(screen.getByRole("textbox", { name: "每日待办内容" }), {
    target: { value: "周五交材料" },
  });
  await userEvent.click(screen.getByRole("button", { name: "日期与时间" }));
  await userEvent.click(screen.getByRole("combobox", { name: "每日待办重复" }));
  await userEvent.click(screen.getByRole("option", { name: "不重复" }));
  fireEvent.click(screen.getByRole("button", { name: "保存待办" }));
  await waitFor(async () =>
    expect(
      (await repo.listTodos()).map((todo) => [todo.text, getTodoDate(todo)]),
    ).toEqual([["周五交材料", "2026-10-23"]]),
  );
  expect(await screen.findByRole("button", { name: "日历" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  expect(
    await screen.findByRole("checkbox", { name: "完成：周五交材料" }),
  ).toBeVisible();
  expect(
    screen.getByRole("button", { name: /2026年10月23日.*1项待办/ }),
  ).toBeVisible();
});
it("browses future repeats without writes, persists one completion, and respects deletion and undo", async () => {
  const series = await repo.createTodo("每日读书", {
    date: "2026-10-21",
    repeat: { kind: "daily" },
  });
  await openCalendar();
  const count = await db.todos.count();
  fireEvent.click(screen.getByRole("button", { name: "后一天" }));
  fireEvent.click(screen.getByRole("button", { name: "前一天" }));
  expect(await db.todos.count()).toBe(count);
  fireEvent.click(screen.getByRole("button", { name: /2026年10月23日/ }));
  fireEvent.click(screen.getByRole("checkbox", { name: "完成：每日读书" }));
  const id = todoOccurrenceId(series.id, "2026-10-23");
  await waitFor(async () =>
    expect((await db.todos.get(id))?.completed).toBe(true),
  );
  expect(await db.todos.count()).toBe(count + 1);
  fireEvent.click(screen.getByRole("button", { name: /2026年10月24日/ }));
  fireEvent.click(
    screen.getByRole("button", { name: "更多待办操作：每日读书" }),
  );
  fireEvent.click(screen.getByRole("button", { name: "删除待办：每日读书" }));
  await waitFor(() =>
    expect(
      screen.queryByRole("checkbox", { name: "完成：每日读书" }),
    ).toBeNull(),
  );
  fireEvent.click(await screen.findByRole("button", { name: "撤销删除" }));
  expect(
    await screen.findByRole("checkbox", { name: "完成：每日读书" }),
  ).toBeVisible();
  await act(async () => {
    fireEvent(window, new Event("focus"));
  });
  expect(
    screen.getByRole("button", { name: /2026年10月23日.*0项未完成/ }),
  ).toBeVisible();
});
it("preserves a draft date across calendar changes but uses the new date for the next draft", async () => {
  const create = vi.fn(async () => {}),
    user = userEvent.setup();
  const host = render(
    <TodoComposer
      today="2026-10-20"
      defaultDate="2026-10-23"
      onCreate={create}
    />,
  );
  await user.type(
    screen.getByRole("textbox", { name: "新待办内容" }),
    "已有草稿",
  );
  host.rerender(
    <TodoComposer
      today="2026-10-20"
      defaultDate="2026-10-25"
      onCreate={create}
    />,
  );
  await user.click(screen.getByRole("button", { name: "添加" }));
  expect(create).toHaveBeenLastCalledWith(
    "已有草稿",
    expect.objectContaining({ date: "2026-10-23" }),
  );
  await user.type(
    screen.getByRole("textbox", { name: "新待办内容" }),
    "新的安排",
  );
  await user.click(screen.getByRole("button", { name: "添加" }));
  expect(create).toHaveBeenLastCalledWith(
    "新的安排",
    expect.objectContaining({ date: "2026-10-25" }),
  );
});

it("persists timed calendar events, edits one recurrence, searches exceptions and restores deletion", async () => {
  await openCalendar();
  fireEvent.click(screen.getByRole("button", { name: "新增安排" }));
  fireEvent.change(screen.getByRole("textbox", { name: "日程标题" }), {
    target: { value: "项目会议" },
  });
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "日期与时间" }));
  await user.click(screen.getByRole("combobox", { name: "日程开始时间分钟" }));
  await user.click(await screen.findByRole("option", { name: "30 分" }));
  await user.click(screen.getByRole("combobox", { name: "日程结束时间小时" }));
  await user.click(await screen.findByRole("option", { name: "11 时" }));
  await user.click(screen.getByRole("combobox", { name: "日程结束时间分钟" }));
  await user.click(await screen.findByRole("option", { name: "00 分" }));
  await user.click(screen.getByRole("combobox", { name: "日程重复" }));
  await user.click(await screen.findByRole("option", { name: "每天" }));
  fireEvent.click(screen.getByRole("button", { name: "保存日程" }));
  await waitFor(async () =>
    expect(await repo.listCalendarEvents()).toHaveLength(1),
  );
  await waitFor(() =>
    expect(
      screen.queryByRole("dialog", { name: "新建日程" }),
    ).not.toBeInTheDocument(),
  );
  const agenda = screen.getByRole("region", { name: "选中日期的待办" });
  fireEvent.click(within(agenda).getByRole("button", { name: /项目会议/ }));
  expect(screen.getByText("2026-10-20 09:30 至 11:00")).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "编辑日程" }));
  fireEvent.change(screen.getByRole("textbox", { name: "日程标题" }), {
    target: { value: "只改今天" },
  });
  fireEvent.click(screen.getByRole("button", { name: "保存日程" }));
  await waitFor(async () =>
    expect(
      (await repo.listCalendarEvents())[0].exceptions["2026-10-20"]?.title,
    ).toBe("只改今天"),
  );
  await waitFor(() =>
    expect(
      screen.queryByRole("dialog", { name: "日程详情" }),
    ).not.toBeInTheDocument(),
  );
  fireEvent.change(screen.getByRole("searchbox", { name: "搜索日历" }), {
    target: { value: "只改今天" },
  });
  expect(
    screen.getByRole("region", { name: "日历搜索结果" }),
  ).toHaveTextContent("只改今天");
  fireEvent.click(
    within(screen.getByRole("region", { name: "日历搜索结果" })).getByRole(
      "button",
    ),
  );
  fireEvent.click(screen.getByRole("button", { name: "编辑日程" }));
  fireEvent.click(screen.getByRole("button", { name: "删除这一次" }));
  await waitFor(async () =>
    expect(
      (await repo.listCalendarEvents())[0].exceptions["2026-10-20"],
    ).toBeNull(),
  );
  fireEvent.click(await screen.findByRole("button", { name: "撤销删除日程" }));
  await waitFor(async () =>
    expect(
      (await repo.listCalendarEvents())[0].exceptions["2026-10-20"]?.title,
    ).toBe("只改今天"),
  );
  // Exercise the entire create/edit/search/delete/restore flow on slower CI.
}, 15000);

it("shows timed reminders on the timeline, persists completion and returns them to all-day when time is removed", async () => {
  await repo.savePlannerTodo({
    text: "定时读书",
    date: "2026-10-20",
    notes: "",
    time: "09:30",
    repeat: { kind: "daily" },
  });
  await openCalendar();
  const user = userEvent.setup();
  await user.click(
    within(screen.getByRole("group", { name: "日历显示方式" })).getByRole(
      "button",
      { name: "日" },
    ),
  );
  const column = document.querySelector<HTMLElement>(".calendar-time-column")!;
  expect(
    within(column).getByRole("button", { name: "编辑待办：定时读书" }),
  ).toHaveTextContent("09:30");
  await user.click(
    within(column).getByRole("checkbox", { name: "完成：定时读书" }),
  );
  await waitFor(() =>
    expect(
      within(column).getByRole("checkbox", { name: "恢复：定时读书" }),
    ).toBeChecked(),
  );
  await user.click(
    within(column).getByRole("button", { name: "编辑待办：定时读书" }),
  );
  await user.click(screen.getByRole("button", { name: "日期与时间" }));
  await user.click(screen.getByRole("checkbox", { name: "指定待办时间" }));
  await user.click(screen.getByRole("button", { name: "保存待办" }));
  await waitFor(() =>
    expect(
      within(column).queryByRole("button", { name: "编辑待办：定时读书" }),
    ).not.toBeInTheDocument(),
  );
  await waitFor(() =>
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
  );
  expect(
    within(document.querySelector<HTMLElement>(".calendar-all-day")!).getByRole(
      "button",
      { name: "编辑待办：定时读书" },
    ),
  ).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "后一天" }));
  expect(
    within(
      document.querySelector<HTMLElement>(".calendar-time-column")!,
    ).getByRole("button", { name: "编辑待办：定时读书" }),
  ).toHaveTextContent("09:30");
});
it("persists visibility and defaults and applies them to new events without deleting hidden content", async () => {
  const type = await repo.savePlannerType("学习", "green");
  await repo.saveCalendarEvent({
    title: "隐藏会议",
    start: "2026-10-20T09:00",
    end: "2026-10-20T10:00",
    allDay: false,
    color: "green",
    typeId: type.id,
    notes: "",
    location: "",
    url: "",
  });
  await openCalendar();
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "日历显示与默认设置" }));
  const dialog = screen.getByRole("dialog", { name: "日历显示与默认设置" });
  await user.click(within(dialog).getByRole("checkbox", { name: "学习" }));
  await user.click(within(dialog).getByRole("combobox", { name: "类型标签" }));
  await user.click(screen.getByRole("option", { name: "学习" }));
  await user.click(
    within(dialog).getByRole("combobox", { name: "默认日程时长" }),
  );
  await user.click(screen.getByRole("option", { name: "30 分钟" }));
  await user.click(
    within(dialog).getByRole("button", { name: "保存日历设置" }),
  );
  await waitFor(() =>
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
  );
  expect(screen.queryByText("隐藏会议")).not.toBeInTheDocument();
  expect(await repo.listCalendarEvents()).toHaveLength(1);
  await user.click(screen.getByRole("button", { name: "新增安排" }));
  await user.click(screen.getByRole("button", { name: "日期与时间" }));
  expect(screen.getByRole("combobox", { name: "类型标签" })).toHaveTextContent(
    "学习",
  );
  expect(
    screen.getByRole("combobox", { name: "日程结束时间小时" }),
  ).toHaveTextContent("09 时");
  expect(
    screen.getByRole("combobox", { name: "日程结束时间分钟" }),
  ).toHaveTextContent("30 分");
});
it("searches actual recurring dates and excludes deleted occurrences", async () => {
  const event = await repo.saveCalendarEvent({
    title: "晨会",
    start: "2026-10-20T09:00",
    end: "2026-10-20T10:00",
    allDay: false,
    color: "purple",
    notes: "",
    location: "",
    url: "",
    repeat: { frequency: "daily", interval: 1, count: 5 },
  });
  await repo.deleteCalendarEvent(event.id, "2026-10-21");
  await openCalendar();
  fireEvent.change(screen.getByRole("searchbox", { name: "搜索日历" }), {
    target: { value: "2026-10-22" },
  });
  const results = screen.getByRole("region", { name: "日历搜索结果" });
  expect(within(results).getByRole("button")).toHaveTextContent("晨会");
  fireEvent.click(within(results).getByRole("button"));
  expect(screen.getByRole("dialog", { name: "日程详情" })).toHaveTextContent(
    "2026-10-22",
  );
  fireEvent.click(screen.getByRole("button", { name: "完成" }));
  fireEvent.change(screen.getByRole("searchbox", { name: "搜索日历" }), {
    target: { value: "2026-10-21" },
  });
  expect(
    within(screen.getByRole("region", { name: "日历搜索结果" })).queryByRole(
      "button",
    ),
  ).not.toBeInTheDocument();
});

it("copies a single occurrence through calendar actions and pastes a reviewed draft onto another day", async () => {
  await repo.saveCalendarEvent({
    title: "跨天复制",
    start: "2026-10-20T23:00",
    end: "2026-10-22T01:00",
    allDay: false,
    color: "purple",
    notes: "保留备注",
    location: "香港",
    url: "",
    repeat: { frequency: "weekly", interval: 1, weekdays: [2] },
  });
  await openCalendar();
  const original = screen.getAllByRole("button", {
    name: "日程：跨天复制，23:00–01:00",
  })[0];
  fireEvent.contextMenu(original);
  fireEvent.click(await screen.findByRole("button", { name: "复制这次日程" }));
  await waitFor(() =>
    expect(screen.queryByRole("dialog", { name: "日历操作" })).toBeNull(),
  );
  const date = document.querySelector('[data-date="2026-10-25"]')!;
  fireEvent.contextMenu(date);
  fireEvent.click(
    await screen.findByRole("button", { name: "粘贴日程：跨天复制" }),
  );
  expect(await screen.findByRole("textbox", { name: "日程标题" })).toHaveValue(
    "跨天复制",
  );
  fireEvent.click(screen.getByRole("button", { name: "保存日程" }));
  await waitFor(async () =>
    expect(await repo.listCalendarEvents()).toHaveLength(2),
  );
  const copy = (await repo.listCalendarEvents()).find((e) => !e.repeat)!;
  expect(copy).toMatchObject({
    start: "2026-10-25T23:00",
    end: "2026-10-27T01:00",
    notes: "保留备注",
    location: "香港",
  });
});
it("previews pasted planning, imports on confirmation, and reports duplicates", async () => {
  await openCalendar();
  fireEvent.click(screen.getByRole("button", { name: "导入日程规划" }));
  const text = JSON.stringify({
    version: 1,
    events: [
      {
        id: "plan-one",
        title: "导入的行程",
        start: "2026-10-20T09:00",
        end: "2026-10-20T10:00",
      },
    ],
  });
  fireEvent.change(
    await screen.findByRole("textbox", { name: "日程规划内容" }),
    { target: { value: text } },
  );
  fireEvent.click(screen.getByRole("button", { name: "检查并预览" }));
  expect(screen.getByRole("region", { name: "导入预览" })).toHaveTextContent(
    "导入的行程",
  );
  expect(await repo.listCalendarEvents()).toHaveLength(0);
  fireEvent.click(screen.getByRole("button", { name: "确认导入" }));
  await screen.findByText("已导入 1 项，跳过 0 项重复安排。");
  fireEvent.click(
    within(screen.getByRole("dialog", { name: "导入日程规划" })).getByRole(
      "button",
      { name: "完成" },
    ),
  );
  fireEvent.click(screen.getByRole("button", { name: "导入日程规划" }));
  fireEvent.change(
    await screen.findByRole("textbox", { name: "日程规划内容" }),
    { target: { value: text } },
  );
  fireEvent.click(screen.getByRole("button", { name: "检查并预览" }));
  fireEvent.click(screen.getByRole("button", { name: "确认导入" }));
  await screen.findByText("已导入 0 项，跳过 1 项重复安排。");
});

it("uses the saved week start, density and week numbers in month, week and year views", async () => {
  await repo.savePlannerPreferences({
    ...(await repo.getPlannerPreferences()),
    weekStartsOn: 0,
    showWeekNumbers: true,
    monthDensity: "comfortable",
  });
  await openCalendar();
  expect(document.querySelectorAll(".calendar-month-week")).toHaveLength(5);
  expect(document.querySelector(".calendar-month-grid")).toHaveClass(
    "density-comfortable",
    "with-week-numbers",
  );
  expect(
    document.querySelector(".calendar-date-number")?.getAttribute("data-date"),
  ).toBe("2026-09-27");
  expect(document.querySelector(".calendar-week-heading")?.textContent).toBe(
    "周日一二三四五六",
  );
  const view = screen.getByRole("group", { name: "日历显示方式" });
  fireEvent.click(within(view).getByRole("button", { name: "周" }));
  expect(
    document
      .querySelector(".calendar-column-heading")
      ?.getAttribute("data-date"),
  ).toBe("2026-10-18");
  expect(document.querySelector(".calendar-column-expand")).toBeNull();
  expect(document.querySelector(".calendar-time-heading")).toHaveTextContent(
    "第 43 周",
  );
  fireEvent.click(screen.getByRole("button", { name: "展开2026-10-20整天" }));
  expect(document.querySelectorAll(".calendar-time-column")).toHaveLength(1);
  fireEvent.click(within(view).getByRole("button", { name: "年" }));
  expect(document.querySelector(".rdp-week_number")).toBeInTheDocument();
});
