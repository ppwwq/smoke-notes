import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type { Todo } from "@smoke-notes/core";
import { TodoComposer } from "../src/components/TodoComposer";
import { TodoWorkspace } from "../src/components/TodoWorkspace";

afterEach(cleanup);
const todo: Todo = {
  id: "todo-1",
  workspaceId: "workspace",
  text: "旧文字",
  completed: false,
  version: 1,
  rank: 1,
  updatedAt: "2026-09-24T12:00:00Z",
  deletedAt: null,
};
function handlers() {
  return {
    onCreate: vi.fn(async () => {}),
    onToggle: vi.fn(async () => {}),
    onUpdate: vi.fn(async () => {}),
    onTrash: vi.fn(async () => {}),
    onMove: vi.fn(async () => {}),
  };
}
it("retains the user draft and displays a failure when saving fails", async () => {
  const callbacks = handlers();
  callbacks.onUpdate.mockRejectedValueOnce(new Error("storage unavailable"));
  render(<TodoWorkspace todos={[todo]} {...callbacks} />);
  const input = screen.getByRole("textbox", { name: "编辑待办：旧文字" });
  fireEvent.change(input, { target: { value: "未保存草稿" } });
  fireEvent.blur(input);
  expect(await screen.findByRole("alert")).toHaveTextContent("保存失败");
  expect(input).toHaveValue("未保存草稿");
});

it("shows remote todo changes without writing the old value back on blur", () => {
  const callbacks = handlers();
  const view = render(<TodoWorkspace todos={[todo]} {...callbacks} />);
  view.rerender(
    <TodoWorkspace
      todos={[{ ...todo, text: "远端新文字", version: 2 }]}
      {...callbacks}
    />,
  );
  const input = screen.getByRole("textbox", { name: "编辑待办：远端新文字" });
  fireEvent.blur(input);
  expect(input).toHaveValue("远端新文字");
  expect(callbacks.onUpdate).not.toHaveBeenCalled();
});
it("keeps an actual user draft through a remote refresh and saves it on blur", async () => {
  const callbacks = handlers();
  const view = render(<TodoWorkspace todos={[todo]} {...callbacks} />);
  fireEvent.change(screen.getByRole("textbox", { name: "编辑待办：旧文字" }), {
    target: { value: "我的草稿" },
  });
  view.rerender(
    <TodoWorkspace
      todos={[{ ...todo, text: "远端新文字", version: 2 }]}
      {...callbacks}
    />,
  );
  const input = screen.getByRole("textbox", { name: "编辑待办：远端新文字" });
  expect(input).toHaveValue("我的草稿");
  fireEvent.blur(input);
  await waitFor(() =>
    expect(callbacks.onUpdate).toHaveBeenCalledWith(todo.id, "我的草稿"),
  );
});

it("does not create a todo when Enter confirms an IME composition", () => {
  const callbacks = handlers();
  render(<TodoComposer today="2026-10-20" onCreate={callbacks.onCreate} />);
  const input = screen.getByRole("textbox", { name: "新待办内容" });
  fireEvent.change(input, { target: { value: "中文" } });
  fireEvent.keyDown(input, { key: "Enter", isComposing: true });
  fireEvent.keyDown(input, { key: "Enter", keyCode: 229 });
  expect(callbacks.onCreate).not.toHaveBeenCalled();
});

it("submits once and preserves text typed while the new todo is saving", async () => {
  const callbacks = handlers();
  let finish!: () => void;
  callbacks.onCreate.mockImplementationOnce(
    () =>
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
  );
  render(<TodoComposer today="2026-10-20" onCreate={callbacks.onCreate} />);
  const input = screen.getByRole("textbox", { name: "新待办内容" });
  fireEvent.change(input, { target: { value: "第一件事" } });
  fireEvent.keyDown(input, { key: "Enter" });
  fireEvent.keyDown(input, { key: "Enter" });
  expect(callbacks.onCreate).toHaveBeenCalledTimes(1);
  fireEvent.change(input, { target: { value: "第二件事" } });
  finish();
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "添加" })).toBeEnabled(),
  );
  expect(input).toHaveValue("第二件事");
});

it("keeps the new todo draft and reports create failures", async () => {
  const callbacks = handlers();
  callbacks.onCreate.mockRejectedValueOnce(new Error("storage unavailable"));
  render(<TodoComposer today="2026-10-20" onCreate={callbacks.onCreate} />);
  const input = screen.getByRole("textbox", { name: "新待办内容" });
  fireEvent.change(input, { target: { value: "尚未保存" } });
  fireEvent.keyDown(input, { key: "Enter" });
  expect(await screen.findByRole("alert")).toHaveTextContent("添加失败");
  expect(input).toHaveValue("尚未保存");
});

it("saves a return to the original text after an earlier edit is still pending", async () => {
  const callbacks = handlers();
  let finish!: () => void;
  callbacks.onUpdate.mockImplementationOnce(
    () =>
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
  );
  render(<TodoWorkspace todos={[todo]} {...callbacks} />);
  const input = screen.getByRole("textbox", { name: "编辑待办：旧文字" });
  fireEvent.change(input, { target: { value: "中间文字" } });
  fireEvent.blur(input);
  await waitFor(() => expect(callbacks.onUpdate).toHaveBeenCalledTimes(1));
  fireEvent.change(input, { target: { value: "旧文字" } });
  fireEvent.blur(input);
  finish();
  await waitFor(() =>
    expect(callbacks.onUpdate).toHaveBeenLastCalledWith(todo.id, "旧文字"),
  );
});

it("blocks duplicate completion writes and reports a failed toggle without claiming success", async () => {
  let reject!: (error: Error) => void;
  const onToggle = vi.fn(
    () =>
      new Promise<void>((_resolve, fail) => {
        reject = fail;
      }),
  );
  render(
    <TodoWorkspace todos={[todo]} {...handlers()} web onToggle={onToggle} />,
  );
  const button = screen.getByRole("checkbox", {
    name: `完成：${todo.text}`,
  });
  fireEvent.click(button);
  fireEvent.click(button);
  expect(onToggle).toHaveBeenCalledTimes(1);
  expect(button).toBeDisabled();
  reject(new Error("write failed"));
  expect(await screen.findByRole("alert")).toHaveTextContent("更新失败");
  expect(button).toHaveAttribute("aria-checked", "false");
  expect(
    screen.getByRole("status", { name: "待办操作反馈" }),
  ).not.toHaveTextContent("做得好");
});

const today = "2026-10-20";
function planned(
  id: string,
  date: string,
  kind: "task" | "occurrence" = "task",
  status: "open" | "completed" | "skipped" = "open",
): Todo {
  return {
    ...todo,
    id,
    text: id,
    completed: status === "completed",
    planning: {
      version: 1,
      kind,
      date,
      status,
      ...(kind === "occurrence" ? { seriesId: "series-1" } : {}),
    },
  };
}

it("keeps past repeated misses only in history and offers one-time overdue rescheduling", async () => {
  const onReschedule = vi.fn(async () => {});
  render(
    <TodoWorkspace
      today={today}
      todos={[
        planned("旧一次性", "2026-10-18"),
        planned("旧重复", "2026-10-19", "occurrence"),
        planned("今天事项", today),
      ]}
      {...handlers()}
      onReschedule={onReschedule}
    />,
  );
  fireEvent.click(screen.getByText("之前未完成"));
  expect(
    screen.getByRole("textbox", { name: "编辑待办：旧一次性" }),
  ).toBeVisible();
  expect(
    screen.queryByRole("textbox", { name: "编辑待办：旧重复" }),
  ).not.toBeInTheDocument();
  fireEvent.click(
    screen.getByRole("button", { name: "更多待办操作：旧一次性" }),
  );
  fireEvent.click(screen.getAllByRole("button", { name: "移到明天" })[0]);
  await waitFor(() =>
    expect(onReschedule).toHaveBeenCalledWith("旧一次性", "2026-10-21"),
  );
  fireEvent.click(screen.getByRole("button", { name: "关闭操作" }));
  fireEvent.click(screen.getByRole("button", { name: "历史" }));
  expect(
    screen.getByRole("textbox", { name: "编辑待办：旧重复" }),
  ).toBeVisible();
  expect(
    screen.queryByRole("textbox", { name: "编辑待办：今天事项" }),
  ).not.toBeInTheDocument();
});

it("quick creates a dated task with one name and progressive options", async () => {
  const callbacks = handlers();
  render(<TodoComposer today={today} onCreate={callbacks.onCreate} />);
  fireEvent.change(screen.getByRole("textbox", { name: "新待办内容" }), {
    target: { value: "喝水" },
  });
  fireEvent.click(screen.getByRole("button", { name: "添加" }));
  await waitFor(() =>
    expect(callbacks.onCreate).toHaveBeenCalledWith("喝水", {
      date: today,
      notes: "",
    }),
  );
  expect(screen.getByText("重复与备注").closest("details")).not.toHaveAttribute(
    "open",
  );
});

it("creates specified-weekday repeats with date and notes and validates no-day selection", async () => {
  const callbacks = handlers();
  render(<TodoComposer today={today} onCreate={callbacks.onCreate} />);
  fireEvent.click(screen.getByText("重复与备注"));
  fireEvent.change(screen.getByRole("textbox", { name: "新待办内容" }), {
    target: { value: "读书" },
  });
  fireEvent.click(screen.getByRole("button", { name: "选日期" }));
  fireEvent.click(screen.getByRole("button", { name: /2026年10月22日/ }));
  fireEvent.change(screen.getByRole("combobox", { name: "新待办重复" }), {
    target: { value: "weekly" },
  });
  for (const day of ["一", "二", "三", "四", "五"])
    fireEvent.click(screen.getByRole("checkbox", { name: `星期${day}` }));
  fireEvent.click(screen.getByRole("button", { name: "添加" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "至少选择一个星期",
  );
  expect(callbacks.onCreate).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("checkbox", { name: "星期六" }));
  fireEvent.change(screen.getByRole("textbox", { name: "新待办备注" }), {
    target: { value: "二十页" },
  });
  fireEvent.click(screen.getByRole("button", { name: "添加" }));
  await waitFor(() =>
    expect(callbacks.onCreate).toHaveBeenCalledWith("读书", {
      date: "2026-10-22",
      notes: "二十页",
      repeat: { kind: "weekly", weekdays: [6] },
    }),
  );
});

it("shows completion, unfinished and skipped records for one selected historical date", () => {
  render(
    <TodoWorkspace
      today={today}
      todos={[
        planned("已做", "2026-10-19", "occurrence", "completed"),
        planned("没做", "2026-10-19", "occurrence"),
        planned("跳过了", "2026-10-19", "occurrence", "skipped"),
      ]}
      {...handlers()}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "历史" }));
  expect(screen.getByRole("region", { name: "当日事项" })).toHaveTextContent(
    "当日事项 · 3",
  );
  expect(screen.getByRole("textbox", { name: "编辑待办：已做" })).toBeVisible();
  expect(
    screen.getByRole("textbox", { name: "编辑待办：跳过了" }),
  ).toBeVisible();
  expect(screen.getByLabelText("历史日期")).toHaveTextContent("2026/10/19");
});

it("separates completion and skipping from deletion, and can undo the saved status", async () => {
  const callbacks = handlers();
  const onSetStatus = vi.fn(async () => {});
  render(
    <TodoWorkspace
      today={today}
      todos={[planned("今日重复", today, "occurrence")]}
      {...callbacks}
      onSetStatus={onSetStatus}
    />,
  );
  fireEvent.click(
    screen.getByRole("button", { name: "更多待办操作：今日重复" }),
  );
  fireEvent.click(screen.getByRole("button", { name: "跳过今天" }));
  await waitFor(() =>
    expect(onSetStatus).toHaveBeenCalledWith("今日重复", "skipped"),
  );
  expect(callbacks.onTrash).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "关闭操作" }));
  fireEvent.click(screen.getByRole("button", { name: "撤销：今日重复" }));
  await waitFor(() =>
    expect(onSetStatus).toHaveBeenLastCalledWith("今日重复", "open"),
  );
  expect(callbacks.onToggle).not.toHaveBeenCalled();
});

it("shows real sync wording from its parent without claiming cloud availability", () => {
  render(
    <TodoWorkspace
      today={today}
      todos={[]}
      {...handlers()}
      syncMessage="已保存在本机 · 未启用云端同步"
    />,
  );
  expect(
    screen.getByRole("status", { name: "待办同步状态" }),
  ).toHaveTextContent("未启用云端同步");
});

it("retains keyboard access for the moving segment selection", () => {
  render(<TodoWorkspace today={today} todos={[]} {...handlers()} />);
  const button = screen.getByRole("button", { name: "今天" });
  button.focus();
  fireEvent.keyDown(button, { key: "ArrowRight" });
  expect(screen.getByRole("button", { name: "全部" })).toHaveFocus();
  expect(screen.getByRole("button", { name: "全部" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
});

it("requires separate confirmation to stop future repeats and preserves the history explanation", async () => {
  const onStopSeries = vi.fn(async () => {});
  const onPauseSeries = vi.fn(async () => {});
  const series: Todo = {
    ...todo,
    id: "series-1",
    text: "每天读书",
    planning: {
      version: 1,
      kind: "series",
      revisions: [
        {
          id: "rule-1",
          effectiveFrom: today,
          changedAt: todo.updatedAt,
          text: "每天读书",
          notes: "",
          repeat: { kind: "daily" },
          paused: false,
          stopped: false,
        },
      ],
    },
  };
  render(
    <TodoWorkspace
      today={today}
      todos={[]}
      series={[series]}
      {...handlers()}
      onStopSeries={onStopSeries}
      onPauseSeries={onPauseSeries}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "全部" }));
  fireEvent.click(screen.getByText("重复计划"));
  fireEvent.click(screen.getByText("每天读书"));
  fireEvent.click(screen.getByRole("button", { name: "暂停重复" }));
  await waitFor(() =>
    expect(onPauseSeries).toHaveBeenCalledWith("series-1", true),
  );
  fireEvent.click(screen.getByText("停止未来重复"));
  expect(onStopSeries).not.toHaveBeenCalled();
  expect(
    screen.getByText("停止明天及之后的安排。今天和过去的记录都会保留。"),
  ).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "确认停止未来" }));
  await waitFor(() => expect(onStopSeries).toHaveBeenCalledWith("series-1"));
});

it("preserves an edited recurrence rule when a remote revision arrives", async () => {
  const onUpdateRule = vi.fn(async () => {});
  const rule = {
    id: "rule-1",
    effectiveFrom: today,
    changedAt: todo.updatedAt,
    text: "读书",
    notes: "旧备注",
    repeat: { kind: "daily" as const },
    paused: false,
    stopped: false,
  };
  const series: Todo = {
    ...todo,
    id: "series-1",
    text: "读书",
    planning: { version: 1, kind: "series", revisions: [rule] },
  };
  const callbacks = handlers();
  const rendered = render(
    <TodoWorkspace
      today={today}
      todos={[]}
      series={[series]}
      {...callbacks}
      onUpdateRule={onUpdateRule}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "全部" }));
  fireEvent.click(screen.getByText("重复计划"));
  fireEvent.click(screen.getByText("读书"));
  fireEvent.change(
    screen.getByRole("textbox", { name: "重复事项名称：读书" }),
    { target: { value: "我的新名称" } },
  );
  rendered.rerender(
    <TodoWorkspace
      today={today}
      todos={[]}
      series={[
        {
          ...series,
          planning: {
            ...series.planning!,
            revisions: [
              rule,
              {
                ...rule,
                id: "rule-remote",
                changedAt: "2026-10-20T01:00:00Z",
                effectiveFrom: "2026-10-21",
                text: "远端名称",
              },
            ],
          },
        },
      ]}
      {...callbacks}
      onUpdateRule={onUpdateRule}
    />,
  );
  expect(
    screen.getByRole("textbox", { name: "重复事项名称：读书" }),
  ).toHaveValue("我的新名称");
  fireEvent.click(screen.getByRole("button", { name: "保存规则" }));
  await waitFor(() =>
    expect(onUpdateRule).toHaveBeenCalledWith("series-1", {
      text: "我的新名称",
      notes: "旧备注",
      repeat: { kind: "daily" },
    }),
  );
});

it("places legacy unfinished records in overdue and legacy completions on their original historical date", () => {
  const callbacks = handlers();
  const originalDate = "2026-10-18T17:00:00Z"; // October 19 in Hong Kong.
  const oldOpen: Todo = {
    ...todo,
    id: "legacy-open",
    text: "旧未完成",
    updatedAt: originalDate,
  };
  const oldCompleted: Todo = {
    ...todo,
    id: "legacy-completed",
    text: "旧已完成",
    completed: true,
    updatedAt: originalDate,
  };
  render(
    <TodoWorkspace
      today={today}
      todos={[oldOpen, oldCompleted]}
      {...callbacks}
    />,
  );
  const unfinished = screen.getByRole("textbox", {
    name: "编辑待办：旧未完成",
  });
  expect(unfinished.closest(".planner-overdue")).toBeInTheDocument();
  expect(
    screen.queryByRole("textbox", { name: "编辑待办：旧已完成" }),
  ).not.toBeInTheDocument();
  expect(
    screen.getByRole("progressbar", { name: "今天完成进度" }),
  ).toHaveAttribute("value", "0");
  fireEvent.click(screen.getByRole("button", { name: "历史" }));
  expect(screen.getByLabelText("历史日期")).toHaveTextContent("2026/10/19");
  expect(
    screen.getByRole("textbox", { name: "编辑待办：旧已完成" }),
  ).toBeVisible();
  expect(
    screen.getByRole("textbox", { name: "编辑待办：旧未完成" }),
  ).toBeVisible();
  expect(oldOpen.updatedAt).toBe(originalDate);
  expect(oldCompleted.updatedAt).toBe(originalDate);
  expect(callbacks.onUpdate).not.toHaveBeenCalled();
});
