import type { DesktopBridge } from "./types";

type Point = { x: number; y: number };

function contains(rect: DOMRect, point: Point) {
  return (
    point.x >= rect.left &&
    point.x < rect.right &&
    point.y >= rect.top &&
    point.y < rect.bottom
  );
}

/** Use CSS pixels throughout: both DOM geometry and mouse coordinates are zoom-aware. */
export function isNoteInteractive(root: HTMLElement, point: Point): boolean {
  const bounds = root.getBoundingClientRect();
  if (!contains(bounds, point)) return false;
  const inset = Number.parseFloat(getComputedStyle(root).paddingLeft) || 100;
  if (point.x >= bounds.left + inset) return true;
  return Array.from(
    root.querySelectorAll<HTMLElement>(".recent-note-tab"),
  ).some((tab) => contains(tab.getBoundingClientRect(), point));
}

export function attachNoteMousePassthrough(
  root: HTMLElement,
  bridge: Pick<
    DesktopBridge,
    "setNoteWindowMousePassthrough" | "getNoteWindowPointer"
  >,
) {
  let point: Point | null = null;
  let held = false;
  let ignored = false;
  let disposed = false;
  let revision = 0;
  let frame = 0;
  const transitions = new Set<EventTarget>();

  const setIgnored = (value: boolean) => {
    if (ignored === value) return;
    ignored = value;
    void bridge.setNoteWindowMousePassthrough(value).catch(() => {
      // Retry on the next position update if the window was temporarily unavailable.
      if (!disposed && ignored === value) ignored = !value;
    });
  };
  const update = () => {
    setIgnored(Boolean(point && !held && !isNoteInteractive(root, point)));
  };
  const refreshPointer = () => {
    const requested = ++revision;
    void bridge
      .getNoteWindowPointer()
      .then((position) => {
        if (disposed || revision !== requested) return;
        point = position;
        update();
      })
      .catch(() => {
        /* A closing window no longer needs a position update. */
      });
  };
  const move = (event: MouseEvent) => {
    ++revision;
    point = { x: event.clientX, y: event.clientY };
    if (!event.buttons) held = false;
    update();
  };
  const down = (event: MouseEvent) => {
    ++revision;
    point = { x: event.clientX, y: event.clientY };
    held = isNoteInteractive(root, point);
    update();
  };
  const up = (event: MouseEvent) => {
    held = event.buttons !== 0 && held;
    move(event);
  };
  const blur = () => {
    held = false;
    refreshPointer();
  };
  const animate = () => {
    update();
    frame = transitions.size ? requestAnimationFrame(animate) : 0;
  };
  const transitionStart = (event: TransitionEvent) => {
    if (
      !(event.target instanceof Element) ||
      !event.target.matches(".recent-note-tab") ||
      event.propertyName !== "width"
    )
      return;
    transitions.add(event.target);
    if (!frame) frame = requestAnimationFrame(animate);
  };
  const transitionEnd = (event: TransitionEvent) => {
    if (event.propertyName !== "width" || !event.target) return;
    transitions.delete(event.target);
    update();
  };
  const observer = new ResizeObserver(update);
  const observeTabs = () => {
    observer.disconnect();
    observer.observe(root);
    root
      .querySelectorAll(".recent-note-tab")
      .forEach((tab) => observer.observe(tab));
    transitions.forEach((tab) => {
      if (tab instanceof Node && !root.contains(tab)) transitions.delete(tab);
    });
    update();
  };
  const mutations = new MutationObserver(observeTabs);
  mutations.observe(root, { childList: true, subtree: true });
  observeTabs();
  document.addEventListener("mousemove", move, true);
  document.addEventListener("mousedown", down, true);
  document.addEventListener("mouseup", up, true);
  window.addEventListener("blur", blur);
  window.addEventListener("focus", refreshPointer);
  window.addEventListener("resize", refreshPointer);
  root.addEventListener("transitionrun", transitionStart);
  root.addEventListener("transitionend", transitionEnd);
  root.addEventListener("transitioncancel", transitionEnd);
  refreshPointer();

  return () => {
    disposed = true;
    observer.disconnect();
    mutations.disconnect();
    cancelAnimationFrame(frame);
    document.removeEventListener("mousemove", move, true);
    document.removeEventListener("mousedown", down, true);
    document.removeEventListener("mouseup", up, true);
    window.removeEventListener("blur", blur);
    window.removeEventListener("focus", refreshPointer);
    window.removeEventListener("resize", refreshPointer);
    root.removeEventListener("transitionrun", transitionStart);
    root.removeEventListener("transitionend", transitionEnd);
    root.removeEventListener("transitioncancel", transitionEnd);
    void bridge.setNoteWindowMousePassthrough(false).catch(() => {});
  };
}
