import { useEffect, useLayoutEffect, useRef, type PointerEvent } from "react";
import { CheckCircle2, Library, NotebookPen, Settings2 } from "../icons";

const destinations = [
  { label: "便签", text: "便签", Icon: NotebookPen },
  { label: "待办", text: "待办", Icon: CheckCircle2 },
  { label: "浏览便签本", text: "便签本", Icon: Library },
  { label: "打开设置", text: "设置", Icon: Settings2 },
];

interface Gesture {
  id: number;
  x: number;
  y: number;
  origin: number;
  position: number;
  pull: number;
  width: number;
  dragging: boolean;
}

/** Only the selection follows the pointer. Navigation commits on release. */
export function WorkspaceDock({
  selected,
  onSelect,
}: {
  selected: number;
  onSelect(index: number): void;
}) {
  const nav = useRef<HTMLElement>(null);
  const gesture = useRef<Gesture | null>(null);
  const suppressClick = useRef(false);
  const selectedRef = useRef(selected);

  function reset() {
    const element = nav.current;
    const current = gesture.current;
    gesture.current = null;
    if (!element) return;
    delete element.dataset.dragging;
    element.style.setProperty("--dock-index", String(selectedRef.current));
    element.style.setProperty("--dock-stretch", "1");
    element.style.setProperty("--dock-offset", "0");
    if (current && element.hasPointerCapture?.(current.id))
      element.releasePointerCapture(current.id);
  }

  useLayoutEffect(() => {
    selectedRef.current = selected;
    reset();
  }, [selected]);

  useEffect(() => {
    const keyboardFocus = () => {
      if (nav.current) delete nav.current.dataset.pointerFocus;
    };
    window.addEventListener("blur", reset);
    window.addEventListener("resize", reset);
    window.addEventListener("keydown", keyboardFocus);
    return () => {
      window.removeEventListener("blur", reset);
      window.removeEventListener("resize", reset);
      window.removeEventListener("keydown", keyboardFocus);
    };
  }, []);

  function move(event: PointerEvent<HTMLElement>) {
    const current = gesture.current;
    if (!current || current.id !== event.pointerId) return;
    const dx = event.clientX - current.x;
    const dy = event.clientY - current.y;
    if (!current.dragging) {
      if (Math.abs(dy) > 10 && Math.abs(dy) > Math.abs(dx)) {
        suppressClick.current = true;
        reset();
        return;
      }
      if (Math.abs(dx) < 6) return;
      current.dragging = true;
      suppressClick.current = true;
      event.currentTarget.setPointerCapture(event.pointerId);
      event.currentTarget.dataset.dragging = "true";
    }
    event.preventDefault();
    // Clamping avoids edge overshoot; no spring or velocity-based destination.
    const position = Math.max(
      0,
      Math.min(3, current.origin + dx / current.width),
    );
    const delta = position - current.position;
    if (delta !== 0) {
      // Build tension from travel, not event frequency. Reversing starts a new
      // pull immediately, including after dragging beyond either end.
      current.pull = Math.max(
        -0.6,
        Math.min(
          0.6,
          Math.sign(delta) === Math.sign(current.pull)
            ? current.pull + delta
            : delta,
        ),
      );
    }
    current.position = position;
    event.currentTarget.style.setProperty(
      "--dock-index",
      String(current.position),
    );
    const direction = Math.sign(current.pull);
    const room = direction > 0 ? position : 3 - position;
    const stretch = Math.min(0.3, Math.abs(current.pull) * 0.6, room);
    event.currentTarget.style.setProperty(
      "--dock-stretch",
      String(1 + stretch),
    );
    // Leave the leading edge with the finger's base capsule and extend the
    // tail behind its travel. CSS interpolates the tail when direction flips.
    event.currentTarget.style.setProperty(
      "--dock-offset",
      String((-direction * stretch) / 2),
    );
  }

  return (
    <nav
      ref={nav}
      className="web-dock"
      aria-label="主导航"
      onPointerDown={(event) => {
        if (gesture.current || !event.isPrimary || event.button !== 0) return;
        const button =
          event.target instanceof Element
            ? event.target.closest("button")
            : null;
        if (!button) return;
        event.currentTarget.dataset.pointerFocus = "true";
        suppressClick.current = false;
        const width = button.getBoundingClientRect().width;
        if (!width) return;
        const origin = Array.from(
          event.currentTarget.querySelectorAll("button"),
        ).indexOf(button);
        gesture.current = {
          id: event.pointerId,
          x: event.clientX,
          y: event.clientY,
          origin,
          position: origin,
          pull: 0,
          width,
          dragging: false,
        };
      }}
      onPointerMove={move}
      onPointerUp={(event) => {
        const current = gesture.current;
        if (!current || current.id !== event.pointerId) return;
        if (current.dragging) {
          // Include the release coordinate even if the last move was coalesced.
          move(event);
          const bounds = event.currentTarget.getBoundingClientRect();
          const inside =
            event.clientY >= bounds.top - 48 &&
            event.clientY <= bounds.bottom + 48;
          const destination = Math.round(current.position);
          reset();
          if (inside) {
            // Keyboard focus follows the committed destination, without scrolling.
            const button = nav.current?.querySelectorAll("button")[destination];
            button?.focus({ preventScroll: true });
            onSelect(destination);
          }
        } else reset();
      }}
      onPointerCancel={(event) => {
        if (gesture.current?.id === event.pointerId) reset();
      }}
      onLostPointerCapture={(event) => {
        // Touch starts with implicit capture on the button. Transferring it to
        // the nav emits a bubbling loss from that button, not a cancellation.
        if (
          event.target === event.currentTarget &&
          gesture.current?.id === event.pointerId
        )
          reset();
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape") reset();
      }}
      onClickCapture={(event) => {
        if (suppressClick.current && event.detail !== 0) {
          event.preventDefault();
          event.stopPropagation();
          suppressClick.current = false;
        }
      }}
    >
      <span className="dock-selection" aria-hidden="true" />
      {destinations.map(({ label, text, Icon }, index) => (
        <button
          key={label}
          type="button"
          aria-label={label}
          aria-current={selected === index ? "page" : undefined}
          onClick={() => onSelect(index)}
        >
          <Icon size={20} />
          <span>{text}</span>
        </button>
      ))}
    </nav>
  );
}
