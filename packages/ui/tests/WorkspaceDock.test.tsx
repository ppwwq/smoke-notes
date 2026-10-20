import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { WorkspaceDock } from "../src/components/WorkspaceDock";

afterEach(cleanup);

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
  const nav = screen.getByRole("navigation");
  const buttons = screen.getAllByRole("button");
  for (const button of buttons)
    vi.spyOn(button, "getBoundingClientRect").mockReturnValue({
      width: 80,
    } as DOMRect);
  vi.spyOn(nav, "getBoundingClientRect").mockReturnValue({
    top: 0,
    bottom: 60,
  } as DOMRect);
  nav.setPointerCapture = vi.fn();
  nav.hasPointerCapture = vi.fn(() => false);
  function pointer(type: string, x: number, y = 30, id = 1) {
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
  return { selected, nav, buttons, pointer };
}

describe("WorkspaceDock", () => {
  it("moves only the capsule while held, reverses, then commits once on release", () => {
    const { selected, nav, buttons, pointer } = setup();
    pointer("pointerdown", 40);
    pointer("pointermove", 260);
    expect(selected).not.toHaveBeenCalled();
    expect(buttons[0]).toHaveAttribute("aria-current", "page");
    expect(Number(nav.style.getPropertyValue("--dock-index"))).toBeCloseTo(
      2.75,
    );
    const transfer = new MouseEvent("lostpointercapture", { bubbles: true });
    Object.defineProperty(transfer, "pointerId", { value: 1 });
    fireEvent(buttons[0], transfer);
    expect(nav).toHaveAttribute("data-dragging", "true");
    pointer("pointermove", 120);
    pointer("pointerup", 120);
    expect(selected).toHaveBeenCalledExactlyOnceWith(1);
    expect(buttons[1]).toHaveFocus();
    fireEvent.click(buttons[0], { detail: 1 });
    expect(selected).toHaveBeenCalledTimes(1);
    expect(buttons[1]).toHaveAttribute("aria-current", "page");
  });

  it("scrubs from another button to the option under the releasing finger", () => {
    const { selected, buttons, pointer } = setup();
    const down = new MouseEvent("pointerdown", {
      bubbles: true,
      clientX: 200,
      clientY: 30,
      button: 0,
    });
    Object.defineProperties(down, {
      pointerId: { value: 1 },
      isPrimary: { value: true },
    });
    fireEvent(buttons[2], down);
    pointer("pointermove", 280);
    expect(selected).not.toHaveBeenCalled();
    pointer("pointerup", 280);
    expect(selected).toHaveBeenCalledExactlyOnceWith(3);
  });

  it.each([
    "pointercancel",
    "lostpointercapture",
    "escape",
    "blur",
    "resize",
    "outside",
  ])("cancels %s without navigation or a synthetic click", (cancel) => {
    const { selected, nav, buttons, pointer } = setup();
    pointer("pointerdown", 40);
    pointer("pointermove", 200);
    if (cancel === "escape") fireEvent.keyDown(nav, { key: "Escape" });
    else if (cancel === "blur" || cancel === "resize")
      fireEvent(window, new Event(cancel));
    else if (cancel === "outside") pointer("pointerup", 200, 200);
    else pointer(cancel, 200);
    pointer("pointerup", 200);
    fireEvent.click(buttons[0], { detail: 1 });
    expect(selected).not.toHaveBeenCalled();
    expect(nav.style.getPropertyValue("--dock-index")).toBe("0");
    expect(nav.style.getPropertyValue("--dock-stretch")).toBe("1");
    expect(nav.style.getPropertyValue("--dock-offset")).toBe("0");
  });

  it("stretches toward travel, reverses immediately, and relaxes on release", () => {
    const { nav, pointer, selected } = setup();
    const value = (name: string) =>
      Number(nav.style.getPropertyValue(`--dock-${name}`));
    pointer("pointerdown", 40);
    pointer("pointermove", 80);
    expect(value("stretch")).toBeGreaterThan(1.2);
    expect(value("stretch")).toBeLessThanOrEqual(1.28);
    expect(value("offset")).toBeGreaterThan(0);
    // A hold or coalesced release must not lose the direction/tension.
    const held = nav.getAttribute("style");
    pointer("pointermove", 80);
    expect(nav.getAttribute("style")).toBe(held);
    pointer("pointermove", 160);
    pointer("pointermove", 120);
    expect(value("offset")).toBeLessThan(0);
    expect(value("stretch")).toBeGreaterThan(1.2);
    expect(selected).not.toHaveBeenCalled();
    pointer("pointerup", 120);
    expect(selected).toHaveBeenCalledExactlyOnceWith(1);
    expect(value("stretch")).toBe(1);
    expect(value("offset")).toBe(0);
  });

  it("keeps both capsule edges inside the dock, even beyond either boundary", () => {
    const { nav, pointer, selected } = setup();
    pointer("pointerdown", 40);
    for (const x of [
      48, 70, 120, 200, 268, 279, 280, 900, 260, 120, 45, -500,
    ]) {
      pointer("pointermove", x);
      const index = Number(nav.style.getPropertyValue("--dock-index"));
      const extra = Number(nav.style.getPropertyValue("--dock-stretch")) - 1;
      const offset = Number(nav.style.getPropertyValue("--dock-offset"));
      expect(extra).toBeGreaterThanOrEqual(0);
      expect(extra).toBeLessThanOrEqual(0.28 + Number.EPSILON);
      expect(index + offset - extra / 2).toBeGreaterThanOrEqual(-1e-10);
      expect(index + offset + extra / 2).toBeLessThanOrEqual(3 + 1e-10);
    }
    expect(selected).not.toHaveBeenCalled();
    pointer("pointerup", -500);
    expect(selected).toHaveBeenCalledExactlyOnceWith(0);
  });

  it("uses distance rather than event frequency for slow and fast pulls", () => {
    const { nav, pointer } = setup();
    pointer("pointerdown", 40);
    for (const x of [48, 56, 64, 72, 80]) pointer("pointermove", x);
    const slow = nav.getAttribute("style");
    pointer("pointercancel", 80);
    pointer("pointerdown", 40);
    pointer("pointermove", 80);
    expect(nav.getAttribute("style")).toBe(slow);
  });

  it("ignores vertical gestures and secondary touches; retains taps and keyboard", async () => {
    const { selected, buttons, pointer } = setup();
    pointer("pointerdown", 40);
    pointer("pointermove", 43, 60);
    pointer("pointerup", 43, 60);
    fireEvent.click(buttons[0], { detail: 1 });
    expect(selected).not.toHaveBeenCalled();
    pointer("pointerdown", 40, 30, 2);
    pointer("pointermove", 280, 30, 2);
    pointer("pointerup", 280, 30, 2);
    expect(selected).not.toHaveBeenCalled();
    pointer("pointerdown", 40);
    pointer("pointerup", 42);
    fireEvent.click(buttons[0], { detail: 1 });
    expect(selected).toHaveBeenCalledExactlyOnceWith(0);
    buttons[2].focus();
    await userEvent.keyboard("{Enter}");
    expect(buttons[2]).toHaveAttribute("aria-current", "page");
  });
});
