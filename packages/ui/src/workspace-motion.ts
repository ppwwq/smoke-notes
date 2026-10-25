import { flushSync } from "react-dom";

let active: ViewTransition | undefined;
type TransitionKind = boolean | "note-return";
let queued: { update: () => void; kind: TransitionKind } | undefined;

/** A progressive enhancement: navigation and saving never depend on animation. */
export function transitionWorkspace(
  update: () => void,
  kind: TransitionKind = false,
) {
  // Finish the current geometry change before taking another snapshot. Skipping
  // it mid-flight exposes the final layout for a frame before the next capture.
  if (active) {
    queued = { update, kind };
    return;
  }
  if (
    !document.startViewTransition ||
    (kind === true &&
      window.CSS?.supports?.("view-transition-class", "paper") === false) ||
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
  ) {
    update();
    return;
  }
  document.documentElement.classList.toggle(
    "notebook-transition",
    kind === true,
  );
  document.documentElement.classList.toggle(
    "note-return-transition",
    kind === "note-return",
  );
  let returnCard: Element | null = null;
  const transition = document.startViewTransition(() => {
    flushSync(update);
    if (kind === "note-return") {
      returnCard = document.activeElement?.closest(".sticky-card") ?? null;
      if (returnCard) {
        const style = getComputedStyle(returnCard);
        document.documentElement.style.setProperty(
          "--return-note-color",
          style.backgroundColor,
        );
        document.documentElement.style.setProperty(
          "--return-note-radius",
          style.borderRadius,
        );
        document.documentElement.style.setProperty(
          "--return-note-shadow",
          style.boxShadow,
        );
        document.documentElement.style.setProperty(
          "--return-note-height",
          `${returnCard.getBoundingClientRect().height}px`,
        );
        // Capture only the card's ink. Its paper and shadow belong to the
        // resizing shell, otherwise the snapshot leaves a second bottom edge.
        returnCard.setAttribute("data-note-return-snapshot", "");
      }
    }
  });
  active = transition;
  // A rejected ready promise (e.g. the tab becomes hidden) must not be an
  // unhandled rejection. The API still applies the update without animation.
  void transition.ready.catch(() => {});
  void transition.finished
    .catch(() => {})
    .then(() => {
      active = undefined;
      document.documentElement.classList.remove("notebook-transition");
      document.documentElement.classList.remove("note-return-transition");
      returnCard?.removeAttribute("data-note-return-snapshot");
      document.documentElement.style.removeProperty("--return-note-color");
      document.documentElement.style.removeProperty("--return-note-radius");
      document.documentElement.style.removeProperty("--return-note-shadow");
      document.documentElement.style.removeProperty("--return-note-height");
      const next = queued;
      queued = undefined;
      if (next) transitionWorkspace(next.update, next.kind);
    });
}
