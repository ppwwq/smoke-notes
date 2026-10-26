import { useEffect, useRef, type ReactNode } from "react";
import { Type } from "../icons";
import "./gooey-format-menu.css";

/** Original Jotday interaction; no Skiper Pro source is included. */
export function GooeyFormatMenu({
  children,
  open,
  compact,
  enabled,
  onHoverChange,
  onToggle,
}: {
  children: ReactNode;
  open: boolean;
  compact: boolean;
  enabled: boolean;
  onHoverChange(open: boolean): void;
  onToggle(): void;
}) {
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const control = useRef<HTMLDivElement>(null);
  useEffect(() => () => clearTimeout(timer.current), []);
  if (!enabled || compact) return children;
  const leave = () => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      if (!control.current?.contains(document.activeElement))
        onHoverChange(false);
    }, 180);
  };
  return (
    <div className="gooey-format-entry">
      <div
        ref={control}
        className="gooey-format-control"
        data-open={open || undefined}
        onPointerEnter={(event) => {
          clearTimeout(timer.current);
          if (event.pointerType === "mouse") onHoverChange(true);
        }}
        onPointerLeave={leave}
        onBlur={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget)) leave();
        }}
      >
        <button
          type="button"
          className="gooey-format-trigger"
          data-format-toggle
          aria-label="格式"
          aria-expanded={open}
          onPointerDown={(event) => event.preventDefault()}
          onClick={onToggle}
          onKeyDown={(event) => {
            if (event.key === "ArrowUp" || event.key === "ArrowDown") {
              event.preventDefault();
              onHoverChange(true);
              requestAnimationFrame(() =>
                control.current
                  ?.querySelector<HTMLButtonElement>('[role="toolbar"] button')
                  ?.focus(),
              );
            }
          }}
        >
          <Type size={19} />
          <span>文字格式</span>
        </button>
        {children}
      </div>
      <span className="gooey-format-hint">自动保存到本机</span>
    </div>
  );
}
