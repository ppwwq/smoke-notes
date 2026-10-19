import { flushSync } from "react-dom";

let active: ViewTransition | undefined;
let queued: { update: () => void; notebook: boolean } | undefined;

/** A progressive enhancement: navigation and saving never depend on animation. */
export function transitionWorkspace(update: () => void, notebook = false) {
  // Finish the current geometry change before taking another snapshot. Skipping
  // it mid-flight exposes the final layout for a frame before the next capture.
  if (active) {
    queued = { update, notebook };
    return;
  }
  if (
    !document.startViewTransition ||
    (notebook &&
      window.CSS?.supports?.("view-transition-class", "paper") === false) ||
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
  ) {
    update();
    return;
  }
  document.documentElement.classList.toggle("notebook-transition", notebook);
  const transition = document.startViewTransition(() => flushSync(update));
  active = transition;
  // A rejected ready promise (e.g. the tab becomes hidden) must not be an
  // unhandled rejection. The API still applies the update without animation.
  void transition.ready.catch(() => {});
  void transition.finished
    .catch(() => {})
    .then(() => {
      active = undefined;
      document.documentElement.classList.remove("notebook-transition");
      const next = queued;
      queued = undefined;
      if (next) transitionWorkspace(next.update, next.notebook);
    });
}
