import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { WorkspaceDock } from "../src/components/WorkspaceDock";

beforeEach(() => {
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
    function (this: HTMLElement) {
      const index = Array.from(
        this.parentElement?.querySelectorAll(":scope > button") ?? [],
      ).indexOf(this);
      return {
        left: index < 0 ? 0 : 8 + index * 88,
        right: index < 0 ? 368 : 96 + index * 88,
        top: 0,
        bottom: 64,
        width: index < 0 ? 368 : 88,
        height: 64,
        x: 0,
        y: 0,
        toJSON() {},
      } as DOMRect;
    },
  );
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
function setup() {
  const selected = vi.fn();
  function Host() {
    const [index, setIndex] = useState(0);
    return (
      <WorkspaceDock
        selected={index}
        onSelect={(next) => {
          selected(next);
          setIndex(next);
        }}
      />
    );
  }
  render(<Host />);
  const nav = screen.getByRole("navigation", { name: "主导航" });
  const buttons = screen.getAllByRole("button");
  function pointer(type: string, x: number, y = 32, id = 1) {
    const event = new MouseEvent(type, {
      bubbles: true,
      cancelable: true,
      clientX: x,
      clientY: y,
      button: 0,
    });
    Object.defineProperties(event, {
      pointerId: { value: id },
      isPrimary: { value: id === 1 },
    });
    fireEvent(type === "pointerdown" ? buttons[0] : nav, event);
  }
  return { nav, buttons, pointer, selected };
}
describe("WorkspaceDock / RubberSegment", () => {
  it("bounds the initial highlight to the selected item without interaction", async () => {
    render(<WorkspaceDock selected={2} onSelect={vi.fn()} />);
    const nav = screen.getByRole("navigation", { name: "主导航" });
    const thumb = nav.querySelector<HTMLElement>(".rubber-segment__thumb")!;
    await waitFor(() => {
      expect(thumb.style.clipPath).toBe("inset(0 88px 0 176px round 32px)");
    });
    expect(screen.getByRole("button", { name: "浏览便签本" })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });
  it("retains named destinations and activates a click once", async () => {
    const { selected, buttons } = setup();
    await userEvent.click(buttons[1]);
    expect(selected).toHaveBeenCalledExactlyOnceWith(1);
    expect(buttons[1]).toHaveAttribute("aria-current", "page");
    expect(screen.getAllByRole("button")).toHaveLength(4);
  });
  it("supports arrows, Home, End and keyboard activation", async () => {
    const { buttons } = setup();
    buttons[0].focus();
    await userEvent.keyboard("{ArrowRight}");
    expect(buttons[1]).toHaveFocus();
    expect(buttons[1]).toHaveAttribute("aria-current", "page");
    await userEvent.keyboard("{End}");
    expect(buttons[3]).toHaveFocus();
    await userEvent.keyboard("{Home}");
    expect(buttons[0]).toHaveFocus();
    buttons[2].focus();
    await userEvent.keyboard("{Enter}");
    expect(buttons[2]).toHaveAttribute("aria-current", "page");
  });
  it("drags only the thumb while held and commits once on release", () => {
    const { nav, buttons, pointer, selected } = setup();
    pointer("pointerdown", 52);
    pointer("pointermove", 60);
    pointer("pointermove", 290);
    expect(selected).not.toHaveBeenCalled();
    expect(nav).toHaveAttribute("data-held");
    pointer("pointerup", 290);
    expect(selected).toHaveBeenCalledTimes(1);
    expect(nav).not.toHaveAttribute("data-held");
    fireEvent.click(buttons[0], { detail: 1 });
    expect(selected).toHaveBeenCalledTimes(1);
  });
  it.each([
    "pointercancel",
    "lostpointercapture",
    "escape",
    "blur",
    "resize",
    "outside",
  ])("cancels %s without navigation", (cancel) => {
    const { nav, buttons, pointer, selected } = setup();
    pointer("pointerdown", 52);
    pointer("pointermove", 65);
    pointer("pointermove", 250);
    if (cancel === "escape") fireEvent.keyDown(buttons[0], { key: "Escape" });
    else if (cancel === "blur" || cancel === "resize")
      fireEvent(window, new Event(cancel));
    else if (cancel === "outside") pointer("pointerup", 250, 250);
    else pointer(cancel, 250);
    pointer("pointerup", 250);
    fireEvent.click(buttons[0], { detail: 1 });
    expect(selected).not.toHaveBeenCalled();
    expect(nav).not.toHaveAttribute("data-held");
    expect(buttons[0]).toHaveAttribute("aria-current", "page");
  });
  it("allows vertical scrolling and ignores secondary touches", () => {
    const { selected, pointer } = setup();
    pointer("pointerdown", 52);
    pointer("pointermove", 54, 90);
    pointer("pointerup", 54, 90);
    pointer("pointerdown", 52, 32, 2);
    pointer("pointermove", 300, 32, 2);
    pointer("pointerup", 300, 32, 2);
    expect(selected).not.toHaveBeenCalled();
  });
});
