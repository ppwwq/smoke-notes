import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import SpringCheck from "../src/components/spring-check/SpringCheck";

afterEach(cleanup);
it("supports a controlled checkbox without nesting the editable label inside a button", async () => {
  const onChange = vi.fn();
  const view = render(
    <SpringCheck
      checked={false}
      onChange={onChange}
      editableLabel
      label={<input aria-label="编辑待办" defaultValue="今天的计划" />}
      ariaLabel="完成：今天的计划"
    />,
  );
  const check = screen.getByRole("checkbox", { name: "完成：今天的计划" });
  expect(check).not.toContainElement(screen.getByRole("textbox"));
  check.focus();
  await userEvent.keyboard(" ");
  expect(onChange).toHaveBeenCalledExactlyOnceWith(true);
  expect(check).toHaveAttribute("aria-checked", "false");
  view.rerender(
    <SpringCheck
      checked
      onChange={onChange}
      editableLabel
      label={<input aria-label="编辑待办" defaultValue="今天的计划" />}
      ariaLabel="恢复：今天的计划"
    />,
  );
  expect(check).toHaveAttribute("aria-checked", "true");
});
