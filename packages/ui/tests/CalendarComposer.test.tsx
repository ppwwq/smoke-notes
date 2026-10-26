import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import type { CalendarEventInput } from "@smoke-notes/core";
import { CalendarEventEditor } from "../src/components/CalendarEventEditor";

afterEach(cleanup);
const draft: CalendarEventInput = {
  title: "讨论发布",
  start: "2026-10-26T14:30",
  end: "2026-10-26T15:30",
  allDay: false,
  color: "purple",
  typeId: null,
  location: "会议室",
  notes: "保留备注",
  url: "https://example.com",
  timeZone: "Asia/Hong_Kong",
  repeat: { frequency: "weekly", interval: 2, weekdays: [1, 3], count: 8 },
};
function setup(save = vi.fn().mockResolvedValue(undefined)) {
  const close = vi.fn();
  render(
    <CalendarEventEditor
      date="2026-10-26"
      today="2026-10-26"
      initialInput={draft}
      onSave={save}
      onClose={close}
    />,
  );
  return { save, close };
}
it("keeps all saved fields and repeat rules when time controls are collapsed", async () => {
  const { save, close } = setup();
  expect(screen.getByRole("button", { name: "日期与时间" })).toHaveAttribute(
    "aria-expanded",
    "false",
  );
  expect(
    screen.queryByRole("combobox", { name: "日程开始时间小时" }),
  ).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "保存日程" }));
  await waitFor(() => expect(close).toHaveBeenCalledOnce());
  expect(save).toHaveBeenCalledWith(draft, undefined, undefined, false);
});
it("keeps duration and custom recurrence through expanding, changing time and collapsing", async () => {
  const { save } = setup();
  const user = userEvent.setup();
  const summary = screen.getByRole("button", { name: "日期与时间" });
  summary.focus();
  await user.keyboard("{Enter}");
  expect(summary).toHaveAttribute("aria-expanded", "true");
  await user.click(screen.getByRole("combobox", { name: "日程开始时间小时" }));
  await user.click(screen.getByRole("option", { name: "16 时" }));
  expect(summary).toHaveTextContent("16:30 – 17:30");
  await user.click(summary);
  expect(summary).toHaveAttribute("aria-expanded", "false");
  await user.click(screen.getByRole("button", { name: "保存日程" }));
  expect(save).toHaveBeenCalledWith(
    { ...draft, start: "2026-10-26T16:30", end: "2026-10-26T17:30" },
    undefined,
    undefined,
    false,
  );
});
it("preserves exclusive all-day end dates when saving from the collapsed summary", async () => {
  const { save } = setup();
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "日期与时间" }));
  await user.click(screen.getByRole("checkbox", { name: "全天日程" }));
  expect(
    screen.queryByRole("combobox", { name: "日程开始时间小时" }),
  ).toBeNull();
  await user.click(screen.getByRole("button", { name: "日期与时间" }));
  await user.click(screen.getByRole("button", { name: "保存日程" }));
  expect(save).toHaveBeenCalledWith(
    {
      ...draft,
      allDay: true,
      start: "2026-10-26T00:00",
      end: "2026-10-27T00:00",
    },
    undefined,
    undefined,
    false,
  );
});
it("blocks duplicate submissions and retains the complete draft after failure", async () => {
  let fail!: (reason: Error) => void;
  const save = vi.fn(
    () =>
      new Promise<void>((_, reject) => {
        fail = reject;
      }),
  );
  const { close } = setup(save);
  const button = screen.getByRole("button", { name: "保存日程" });
  fireEvent.click(button);
  fireEvent.click(button);
  expect(save).toHaveBeenCalledOnce();
  expect(button).toBeDisabled();
  fail(new Error("offline"));
  expect(await screen.findByRole("alert")).toHaveTextContent("保存失败");
  expect(close).not.toHaveBeenCalled();
  expect(screen.getByRole("textbox", { name: "日程备注" })).toHaveValue(
    draft.notes,
  );
  expect(screen.getByRole("button", { name: "日期与时间" })).toHaveTextContent(
    "14:30 – 15:30",
  );
  expect(button).not.toBeDisabled();
});
