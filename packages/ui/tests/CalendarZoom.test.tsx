import { useState } from "react";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { CalendarTimeline } from "../src/components/CalendarCanvas";
afterEach(cleanup);
function setup() {
  const onCreate = vi.fn(),
    onOpen = vi.fn();
  function Harness() {
    const [height, setHeight] = useState(60);
    return (
      <CalendarTimeline
        dates={["2026-10-24"]}
        today="2026-10-24"
        events={[]}
        onSelect={() => {}}
        onCreate={onCreate}
        onOpen={onOpen}
        hourHeight={height}
        onHourHeightChange={setHeight}
      />
    );
  }
  const host = render(<Harness />);
  const node = host.container.querySelector<HTMLDivElement>(
    ".calendar-timeline-scroll",
  )!;
  return { node, onCreate, onOpen, ...host };
}
function touch(
  target: Element,
  type: string,
  points: { identifier: number; clientX: number; clientY: number }[],
) {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperty(event, "touches", { value: points });
  fireEvent(target, event);
  return event;
}
const point = (identifier: number, y: number) => ({
  identifier,
  clientX: 100,
  clientY: y,
});
it("pinches proportionally, ignores extra fingers, suppresses accidental creation and resumes after cancellation", async () => {
  const { node, onCreate } = setup();
  const slot = screen.getByRole("button", {
    name: "2026-10-24 09:00 新建日程",
  });
  const cancel = vi.fn();
  slot.addEventListener("touchcancel", cancel);
  expect(touch(slot, "touchstart", [point(1, 200)]).defaultPrevented).toBe(
    false,
  );
  expect(
    touch(node, "touchstart", [point(1, 200), point(2, 300)]).defaultPrevented,
  ).toBe(true);
  expect(cancel).toHaveBeenCalledOnce();
  touch(node, "touchmove", [point(1, 150), point(2, 350), point(3, 900)]);
  await waitFor(() =>
    expect(
      screen.getByRole("button", { name: "重置时间轴缩放" }),
    ).toHaveTextContent("200%"),
  );
  touch(node, "touchend", [point(1, 150)]);
  fireEvent.click(slot);
  expect(onCreate).not.toHaveBeenCalled();
  touch(node, "touchcancel", []);
  expect(node).not.toHaveAttribute("data-pinching");
  await act(() => new Promise((resolve) => setTimeout(resolve, 510)));
  fireEvent.click(slot);
  expect(onCreate).toHaveBeenCalledWith("2026-10-24", "09:00");
});
it("bounds zoom and leaves ordinary scrolling alone, with a keyboard-operable reset", async () => {
  const { node } = setup();
  const normal = new WheelEvent("wheel", {
    deltaY: -50,
    bubbles: true,
    cancelable: true,
  });
  fireEvent(node, normal);
  expect(normal.defaultPrevented).toBe(false);
  fireEvent.wheel(node, { deltaY: -200, ctrlKey: true, clientY: 250 });
  expect(screen.getByRole("button", { name: "放大时间轴" })).toBeDisabled();
  expect(
    screen.getByRole("button", { name: "重置时间轴缩放" }),
  ).toHaveTextContent("300%");
  fireEvent.wheel(node, { deltaY: 200, ctrlKey: true, clientY: 250 });
  expect(screen.getByRole("button", { name: "缩小时间轴" })).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "重置时间轴缩放" }));
  expect(
    screen.getByRole("button", { name: "重置时间轴缩放" }),
  ).toHaveTextContent("100%");
  expect(node.style.getPropertyValue("--calendar-hour-height")).toBe("60px");
});
