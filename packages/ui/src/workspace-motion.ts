import { flushSync } from "react-dom";

let active: ViewTransition | undefined;

/** A progressive enhancement: navigation and saving never depend on animation. */
export function transitionWorkspace(update: () => void) {
  if (
    !document.startViewTransition ||
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
  ) {
    update();
    return;
  }
  active?.skipTransition();
  active = document.startViewTransition(() => flushSync(update));
  void active.finished.catch(() => {});
}
