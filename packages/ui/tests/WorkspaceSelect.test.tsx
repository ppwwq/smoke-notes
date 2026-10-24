import { useState } from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { WorkspaceSelect } from "../src/components/WorkspaceSelect";
import { WebDialog } from "../src/components/glass/WebDialog";
import { PlannerDatePicker } from "../src/components/PlannerDatePicker";

afterEach(cleanup);

it("previews color choices on hover without saving until a choice is clicked", async () => {
  const changed = vi.fn();
  render(
    <WorkspaceSelect
      label="配色预览"
      value="purple"
      options={[
        {
          value: "purple",
          label: "薰衣草",
          swatch: "#ddd5fb",
          swatchInk: "#382757",
        },
        {
          value: "blue",
          label: "天空",
          swatch: "#d5e7f4",
          swatchInk: "#24445d",
        },
      ]}
      onChange={changed}
    />,
  );
  const user = userEvent.setup();
  // Open via the keyboard to avoid zero-sized JSDOM pointer geometry closing
  // the popup on release; real pointer interaction is covered in the browser.
  screen.getByRole("combobox", { name: "配色预览" }).focus();
  await user.keyboard("{ArrowDown}");
  const blue = await screen.findByRole("option", { name: "天空" });
  await user.hover(blue);
  expect(blue).toHaveAttribute("data-color");
  expect(blue.style.getPropertyValue("--option-color")).toBe("#d5e7f4");
  expect(changed).not.toHaveBeenCalled();
  await user.click(blue);
  expect(changed).toHaveBeenCalledExactlyOnceWith("blue");
});

it("chooses with the keyboard and returns focus without closing the parent workflow", async () => {
  const changed = vi.fn();
  function Host() {
    const [value, setValue] = useState("a");
    return (
      <WorkspaceSelect<string>
        label="目标便签本"
        value={value}
        options={[
          { value: "a", label: "日常" },
          { value: "b", label: "工作" },
        ]}
        onChange={(next) => {
          setValue(next);
          changed(next);
        }}
      />
    );
  }
  render(<Host />);
  const user = userEvent.setup();
  const trigger = screen.getByRole("combobox", { name: "目标便签本" });
  trigger.focus();
  await user.keyboard("{ArrowDown}");
  await screen.findByRole("option", { name: "日常" });
  await user.keyboard("{End}{Enter}");
  await waitFor(() => expect(trigger).toHaveTextContent("工作"));
  expect(changed).toHaveBeenCalledExactlyOnceWith("b");
  await waitFor(() => expect(trigger).toHaveFocus());
  await user.click(trigger);
  await screen.findByRole("option", { name: "工作" });
  await user.keyboard("{Escape}");
  await waitFor(() => expect(screen.queryByRole("listbox")).toBeNull());
  expect(trigger).toHaveFocus();
  expect(changed).toHaveBeenCalledTimes(1);
});

it("blocks selection while a setting is being saved", async () => {
  const changed = vi.fn();
  render(
    <WorkspaceSelect
      label="保存中"
      value="a"
      disabled
      options={[{ value: "a", label: "日常" }]}
      onChange={changed}
    />,
  );
  const trigger = screen.getByRole("combobox", { name: "保存中" });
  expect(trigger).toBeDisabled();
  await userEvent.setup().click(trigger);
  expect(screen.queryByRole("listbox")).toBeNull();
  expect(changed).not.toHaveBeenCalled();
});

it("closes a nested choice menu with Escape without dismissing its dialog", async () => {
  const close = vi.fn();
  render(
    <WebDialog web kind="actions" label="日程编辑" onClose={close}>
      <WorkspaceSelect
        label="测试小时"
        value="09"
        options={[
          { value: "09", label: "09 时" },
          { value: "10", label: "10 时" },
        ]}
        onChange={() => {}}
      />
    </WebDialog>,
  );
  const user = userEvent.setup();
  const trigger = screen.getByRole("combobox", { name: "测试小时" });
  await user.click(trigger);
  await screen.findByRole("option", { name: "09 时" });
  await user.keyboard("{Escape}");
  await waitFor(() => expect(screen.queryByRole("listbox")).toBeNull());
  expect(close).not.toHaveBeenCalled();
  expect(trigger).toHaveFocus();
  await user.keyboard("{Escape}");
  expect(close).toHaveBeenCalledOnce();
});

it("opens an unset date at today and chooses a valid date", async () => {
  const changed = vi.fn();
  render(
    <PlannerDatePicker
      label="未设置的日期"
      value=""
      today="2026-10-24"
      placeholder="永不"
      onChange={changed}
    />,
  );
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "未设置的日期" }));
  const day = await screen.findByRole("button", { name: /2026年10月25日/ });
  await user.click(day);
  expect(changed).toHaveBeenCalledWith("2026-10-25");
});
