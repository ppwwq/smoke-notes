import { useEffect, useRef, useState } from "react";

export function useMobileSidebar(open: boolean, close: () => void) {
  const panelRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [mobile, setMobile] = useState(
    () =>
      window.matchMedia?.("(max-width: 760px)").matches ??
      window.innerWidth <= 760,
  );
  useEffect(() => {
    if (!window.matchMedia) return;
    const media = window.matchMedia("(max-width: 760px)");
    const update = () => setMobile(media.matches);
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  useEffect(() => {
    if (!mobile || !open) return;
    const panel = panelRef.current;
    const trigger = triggerRef.current;
    const controls = () =>
      Array.from(
        panel?.querySelectorAll<HTMLElement>(
          'button:not(:disabled), input:not(:disabled), [tabindex="0"]',
        ) ?? [],
      ).filter((element) => !element.closest("[inert]"));
    panel?.querySelector<HTMLElement>(".sidebar button")?.focus();
    const keydown = (event: KeyboardEvent) => {
      if (event.isComposing) return;
      if (event.key === "Escape") {
        event.preventDefault();
        close();
      } else if (event.key === "Tab") {
        const items = controls();
        const first = items[0];
        const last = items.at(-1);
        const active = document.activeElement;
        if (event.shiftKey && (active === first || !panel?.contains(active))) {
          event.preventDefault();
          last?.focus();
        } else if (
          !event.shiftKey &&
          (active === last || !panel?.contains(active))
        ) {
          event.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener("keydown", keydown);
    return () => {
      document.removeEventListener("keydown", keydown);
      trigger?.focus({ preventScroll: true });
    };
  }, [mobile, open, close]);
  return { mobile, panelRef, triggerRef };
}
