import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { PlannerCalendar } from "../src/components/PlannerCalendar";
import { PlannerDatePicker } from "../src/components/PlannerDatePicker";

afterEach(cleanup);

it("selects across a year boundary with the keyboard and emits a date-only value", async () => {
  const change = vi.fn();
  function Host() {
    const [value, setValue] = useState("2026-12-31");
    return (
      <PlannerCalendar
        value={value}
        today="2026-12-31"
        label="安排日历"
        onChange={(next) => {
          change(next);
          setValue(next);
        }}
      />
    );
  }
  render(<Host />);
  await userEvent.keyboard("{ArrowRight}{Enter}");
  expect(change).toHaveBeenCalledExactlyOnceWith("2027-01-01");
  expect(
    screen.getByRole("application", { name: "安排日历" }),
  ).toHaveTextContent("已选 2027/01/01");
});

it("keeps future days disabled in the history calendar", () => {
  render(
    <PlannerCalendar
      value="2026-10-23"
      today="2026-10-23"
      max="2026-10-23"
      label="历史日历"
      onChange={vi.fn()}
    />,
  );
  expect(screen.getByRole("button", { name: /2026年10月24日/ })).toBeDisabled();
  expect(screen.getByRole("button", { name: /2026年10月22日/ })).toBeEnabled();
});

it("selects in the popover, closes it and preserves the controlled date", async () => {
  const change = vi.fn();
  function Host() {
    const [value, setValue] = useState("2026-10-23");
    return (
      <PlannerDatePicker
        value={value}
        today="2026-10-23"
        label="改期"
        onChange={(next) => {
          change(next);
          setValue(next);
        }}
      />
    );
  }
  render(<Host />);
  fireEvent.click(screen.getByRole("button", { name: "改期" }));
  fireEvent.click(
    await screen.findByRole("button", { name: /2026年10月25日/ }),
  );
  expect(change).toHaveBeenCalledExactlyOnceWith("2026-10-25");
  expect(screen.getByRole("button", { name: "改期" })).toHaveTextContent(
    "2026/10/25",
  );
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
});
