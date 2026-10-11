import { useEffect, useRef, useState, type KeyboardEvent } from "react";

export function useActionMenu() {
  const [open, setOpen] = useState(false);
  const controlRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const items = () =>
    Array.from(
      controlRef.current?.querySelectorAll<HTMLButtonElement>(
        '[role="menuitem"]:not(:disabled)',
      ) ?? [],
    );
  useEffect(() => {
    if (!open) return;
    controlRef.current
      ?.querySelector<HTMLElement>('[role="menuitem"]')
      ?.focus();
    const outside = (event: PointerEvent) => {
      if (
        event.target instanceof Node &&
        !controlRef.current?.contains(event.target)
      )
        setOpen(false);
    };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [open]);
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.nativeEvent.isComposing) return;
    if (!open && (event.key === "ArrowDown" || event.key === "ArrowUp")) {
      event.preventDefault();
      setOpen(true);
    } else if (
      open &&
      ["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)
    ) {
      event.preventDefault();
      const options = items();
      const current = options.indexOf(
        document.activeElement as HTMLButtonElement,
      );
      const index =
        event.key === "Home"
          ? 0
          : event.key === "End"
            ? options.length - 1
            : (current + (event.key === "ArrowUp" ? -1 : 1) + options.length) %
              options.length;
      options[index]?.focus();
    } else if (open && (event.key === "Escape" || event.key === "Tab")) {
      if (event.key === "Escape") event.preventDefault();
      setOpen(false);
      triggerRef.current?.focus();
    }
  };
  return { open, setOpen, controlRef, triggerRef, onKeyDown };
}
