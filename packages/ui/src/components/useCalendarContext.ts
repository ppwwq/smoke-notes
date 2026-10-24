import { useEffect, useLayoutEffect, useRef, type RefObject } from "react";

export interface CalendarContextTarget {
  eventId?: string;
  date?: string;
  time?: string;
}
/** A stationary hold opens actions; movement and a second finger retain drag/scroll/zoom. */
export function useCalendarContext(
  root: RefObject<HTMLDivElement | null>,
  onOpen: (target: CalendarContextTarget) => void,
) {
  const callback = useRef(onOpen);
  useLayoutEffect(() => {
    callback.current = onOpen;
  }, [onOpen]);
  useEffect(() => {
    const node = root.current;
    if (!node) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let press: {
      id: number;
      x: number;
      y: number;
      target: Element;
      held?: boolean;
    } | null = null;
    const pointers = new Set<number>();
    let suppress = 0;
    function resolve(
      target: EventTarget | null,
    ): CalendarContextTarget | undefined {
      if (
        !(target instanceof Element) ||
        !node!.contains(target) ||
        target.closest('[role="dialog"]')
      )
        return;
      const eventId = target.closest<HTMLElement>("[data-calendar-event]")
        ?.dataset.calendarEvent;
      if (eventId) return { eventId };
      if (
        target.closest("button, input, select, textarea") &&
        !target.closest(
          "[data-date], .calendar-time-slot, .calendar-column-heading, .calendar-all-day-add",
        )
      )
        return;
      const date = target.closest<HTMLElement>(
        "[data-calendar-date], [data-date]",
      );
      if (date)
        return {
          date: date.dataset.calendarDate ?? date.dataset.date,
          time: target.closest<HTMLElement>("[data-calendar-time]")?.dataset
            .calendarTime,
        };
    }
    function clear() {
      clearTimeout(timer);
      press = null;
    }
    function show(target: Element) {
      const value = resolve(target);
      clear();
      if (!value) return;
      // Cancel an activated stationary touch drag before opening a dialog.
      target.dispatchEvent(new Event("touchcancel", { bubbles: true }));
      suppress = performance.now() + 1200;

      callback.current(value);
    }
    function down(event: PointerEvent) {
      pointers.add(event.pointerId);
      if (pointers.size > 1 || event.button !== 0) {
        clear();
        return;
      }
      if (!resolve(event.target) || !(event.target instanceof Element)) return;
      press = {
        id: event.pointerId,
        x: event.clientX,
        y: event.clientY,
        target: event.target,
      };
      timer = setTimeout(() => {
        if (!press) return;
        // Keep an item lifted until release, so holding longer never steals a drag.
        if (resolve(press.target)?.eventId) press.held = true;
        else show(press.target);
      }, 550);
    }
    function move(event: PointerEvent) {
      if (
        press &&
        event.pointerId === press.id &&
        Math.hypot(event.clientX - press.x, event.clientY - press.y) > 8
      )
        clear();
    }
    function up(event: PointerEvent) {
      pointers.delete(event.pointerId);
      if (event.type === "pointerup" && press?.held) show(press.target);
      clear();
    }
    function nextPress() {
      suppress = 0;
    }
    function click(event: MouseEvent) {
      // Touch release can be retargeted to the newly opened menu under the finger.
      // Suppress that click globally; the next deliberate pointer-down clears this guard.
      if (performance.now() < suppress && event.detail > 0) {
        event.preventDefault();
        event.stopPropagation();
        suppress = 0;
      }
    }
    function context(event: MouseEvent) {
      if (!resolve(event.target) || !(event.target instanceof Element)) return;
      event.preventDefault();
      show(event.target);
    }
    function key(event: KeyboardEvent) {
      if (
        (event.key === "ContextMenu" ||
          (event.key === "F10" && event.shiftKey)) &&
        resolve(event.target) &&
        event.target instanceof Element
      ) {
        event.preventDefault();
        show(event.target);
      }
    }
    node.addEventListener("pointerdown", down, true);
    window.addEventListener("pointerdown", nextPress, true);
    window.addEventListener("click", click, true);
    node.addEventListener("contextmenu", context);
    node.addEventListener("keydown", key);
    window.addEventListener("pointermove", move, true);
    window.addEventListener("pointerup", up, true);
    window.addEventListener("pointercancel", up, true);
    window.addEventListener("scroll", clear, true);
    return () => {
      clear();
      node.removeEventListener("pointerdown", down, true);
      window.removeEventListener("pointerdown", nextPress, true);
      window.removeEventListener("click", click, true);
      node.removeEventListener("contextmenu", context);
      node.removeEventListener("keydown", key);
      window.removeEventListener("pointermove", move, true);
      window.removeEventListener("pointerup", up, true);
      window.removeEventListener("pointercancel", up, true);
      window.removeEventListener("scroll", clear, true);
    };
  }, [root]);
}
