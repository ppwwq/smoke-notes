import { useRef, useState } from "react";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { useCalendarContext } from "../src/components/useCalendarContext";
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});
function pointer(target: Element, type: string, id = 1, x = 20) {
  const e = new Event(type, { bubbles: true, cancelable: true });
  Object.assign(e, { pointerId: id, clientX: x, clientY: 20, button: 0 });
  fireEvent(target, e);
}
function Fixture({ choose }: { choose: () => void }) {
  const root = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  useCalendarContext(root, () => setOpen(true));
  return (
    <>
      <div ref={root}>
        <button data-calendar-event="event">日程</button>
      </div>
      {open && <button onClick={choose}>复制</button>}
    </>
  );
}
it("suppresses the touch-release click even when retargeted to the newly opened menu", () => {
  vi.useFakeTimers();
  const choose = vi.fn();
  render(<Fixture choose={choose} />);
  const event = screen.getByText("日程");
  pointer(event, "pointerdown");
  act(() => vi.advanceTimersByTime(600));
  pointer(event, "pointerup");
  const copy = screen.getByText("复制");
  fireEvent.click(copy, { detail: 1 });
  expect(choose).not.toHaveBeenCalled();
  pointer(copy, "pointerdown");
  pointer(copy, "pointerup");
  fireEvent.click(copy, { detail: 1 });
  expect(choose).toHaveBeenCalledOnce();
});
it("movement and a second pointer cancel the hold before opening actions", () => {
  vi.useFakeTimers();
  render(<Fixture choose={() => {}} />);
  const event = screen.getByText("日程");
  pointer(event, "pointerdown");
  pointer(event, "pointermove", 1, 40);
  act(() => vi.advanceTimersByTime(600));
  expect(screen.queryByText("复制")).toBeNull();
  pointer(event, "pointerup");
  pointer(event, "pointerdown");
  pointer(event, "pointerdown", 2);
  act(() => vi.advanceTimersByTime(600));
  expect(screen.queryByText("复制")).toBeNull();
});
it("supports keyboard context actions without swallowing keyboard activation", () => {
  const choose = vi.fn();
  render(<Fixture choose={choose} />);
  fireEvent.keyDown(screen.getByText("日程"), { key: "F10", shiftKey: true });
  fireEvent.click(screen.getByText("复制"), { detail: 0 });
  expect(choose).toHaveBeenCalledOnce();
});
