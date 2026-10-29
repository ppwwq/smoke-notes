import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type { Todo } from "@smoke-notes/core";
import { CalendarTodoEditor } from "../src/components/CalendarTodoEditor";

afterEach(cleanup);
const todo: Todo = {
  id: "day",
  workspaceId: "test",
  text: "读书",
  completed: false,
  rank: 0,
  version: 1,
  updatedAt: "2026-10-28T00:00:00Z",
  deletedAt: null,
  planning: {
    version: 1,
    kind: "occurrence",
    seriesId: "series",
    date: "2026-10-28",
    notes: "十页",
  },
};
it.each(["one", "following"] as const)(
  "saves the selected recurring todo scope: %s",
  async (scope) => {
    const save = vi.fn().mockResolvedValue(undefined);
    render(
      <CalendarTodoEditor
        todo={todo}
        date="2026-10-28"
        today="2026-10-28"
        onClose={vi.fn()}
        onSavePlannerTodo={save}
      />,
    );
    expect(screen.getByRole("button", { name: "仅此次" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    if (scope === "following")
      fireEvent.click(screen.getByRole("button", { name: "此后全部" }));
    fireEvent.change(screen.getByRole("textbox", { name: "待办内容" }), {
      target: { value: "读二十页" },
    });
    fireEvent.click(screen.getByRole("button", { name: "保存待办" }));
    await waitFor(() =>
      expect(save).toHaveBeenCalledWith(
        expect.objectContaining({
          text: "读二十页",
          scope,
          date: "2026-10-28",
        }),
        todo,
      ),
    );
  },
);
