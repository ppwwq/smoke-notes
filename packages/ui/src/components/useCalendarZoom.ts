import { useEffect, useLayoutEffect, useRef, type RefObject } from "react";

export const MIN_HOUR_HEIGHT = 36;
export const MAX_HOUR_HEIGHT = 180;
export const clampHourHeight = (value: number) =>
  Math.min(MAX_HOUR_HEIGHT, Math.max(MIN_HOUR_HEIGHT, value));

/** Own only two-finger gestures; one finger retains native scrolling and long-press drag. */
export function useCalendarZoom(
  scroll: RefObject<HTMLDivElement | null>,
  hourHeight: number,
  onChange: (height: number) => void,
) {
  const current = useRef({ hourHeight, onChange });
  useLayoutEffect(() => {
    current.current = { hourHeight, onChange };
  }, [hourHeight, onChange]);
  const zoomAt = useRef<(height: number) => void>(() => {});
  useEffect(() => {
    const node = scroll.current;
    if (!node) return;
    let firstTarget: EventTarget | null = null;
    let gesture: {
      ids: number[];
      distance: number;
      height: number;
      minute: number;
    } | null = null;
    let suppressClickUntil = 0;
    let frame = 0;
    const column = () =>
      node.querySelector<HTMLElement>(".calendar-time-column");
    function apply(height: number, y: number, minute: number) {
      const next = clampHourHeight(height);
      // Update geometry before correcting scroll, so the same time stays beneath the midpoint.
      node!.style.setProperty("--calendar-hour-height", `${next}px`);
      const col = column();
      if (col)
        node!.scrollTop +=
          col.getBoundingClientRect().top + (minute * next) / 60 - y;
      current.current.hourHeight = next;
      current.current.onChange(next);
    }
    zoomAt.current = (height) => {
      const col = column();
      if (!col) return;
      const y = node.getBoundingClientRect().top + node.clientHeight / 2;
      apply(
        height,
        y,
        ((y - col.getBoundingClientRect().top) * 60) /
          current.current.hourHeight,
      );
    };
    function consume(event: TouchEvent) {
      if (event.cancelable) event.preventDefault();
      event.stopPropagation();
    }
    function start(event: TouchEvent) {
      if (event.touches.length === 1 && !gesture) firstTarget = event.target;
      if (event.touches.length < 2) return;
      if (!gesture) {
        const col = column();
        if (!col) return;
        const [a, b] = Array.from(event.touches);
        // Cancel the pending/active one-finger sensor when the interaction becomes a pinch.
        // dnd-kit listens on the original touch target and clears its activation timer on cancel.
        firstTarget?.dispatchEvent(new Event("touchcancel", { bubbles: true }));
        gesture = {
          ids: [a.identifier, b.identifier],
          distance: Math.max(
            1,
            Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY),
          ),
          height: current.current.hourHeight,
          minute:
            (((a.clientY + b.clientY) / 2 - col.getBoundingClientRect().top) *
              60) /
            current.current.hourHeight,
        };
        node!.dataset.pinching = "true";
      }
      suppressClickUntil = performance.now() + 500;
      consume(event);
    }
    function move(event: TouchEvent) {
      if (!gesture) return;
      consume(event);
      const touches = Array.from(event.touches),
        a = touches.find((t) => t.identifier === gesture!.ids[0]),
        b = touches.find((t) => t.identifier === gesture!.ids[1]);
      if (!a || !b) return;
      const height =
        (gesture.height *
          Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY)) /
        gesture.distance;
      const y = (a.clientY + b.clientY) / 2,
        minute = gesture.minute;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => apply(height, y, minute));
    }
    function end(event: TouchEvent) {
      if (!gesture) return;
      consume(event);
      suppressClickUntil = performance.now() + 500;
      // Do not turn the remaining finger into a tap or a drag.
      if (!event.touches?.length) {
        gesture = null;
        firstTarget = null;
        delete node!.dataset.pinching;
      }
    }
    function click(event: MouseEvent) {
      if (gesture || performance.now() < suppressClickUntil) {
        event.preventDefault();
        event.stopPropagation();
      }
    }
    function wheel(event: WheelEvent) {
      // Trackpads report pinch as Ctrl+wheel. Plain two-finger scrolling stays native.
      if (!event.ctrlKey || gesture) return;
      const col = column();
      if (!col) return;
      event.preventDefault();
      const delta =
        event.deltaY *
        (event.deltaMode === 1
          ? 16
          : event.deltaMode === 2
            ? node!.clientHeight
            : 1);
      apply(
        current.current.hourHeight *
          Math.exp(-Math.max(-200, Math.min(200, delta)) * 0.01),
        event.clientY,
        ((event.clientY - col.getBoundingClientRect().top) * 60) /
          current.current.hourHeight,
      );
    }
    node.addEventListener("touchstart", start, {
      passive: false,
      capture: true,
    });
    node.addEventListener("touchmove", move, { passive: false, capture: true });
    node.addEventListener("touchend", end, { passive: false, capture: true });
    node.addEventListener("touchcancel", end, {
      passive: false,
      capture: true,
    });
    node.addEventListener("click", click, true);
    node.addEventListener("wheel", wheel, { passive: false });
    return () => {
      cancelAnimationFrame(frame);
      node.removeEventListener("touchstart", start, true);
      node.removeEventListener("touchmove", move, true);
      node.removeEventListener("touchend", end, true);
      node.removeEventListener("touchcancel", end, true);
      node.removeEventListener("click", click, true);
      node.removeEventListener("wheel", wheel);
    };
  }, [scroll]);
  return (height: number) => zoomAt.current(height);
}
