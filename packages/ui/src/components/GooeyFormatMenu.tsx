import { useEffect, useId, useRef, type ReactNode } from "react";
import { motion, useReducedMotion } from "motion/react";
import { Type } from "../icons";
import "./gooey-format-menu.css";

/** Original Smoke Notes interaction; no Skiper Pro source is included. */
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
  const filter = `format-goo-${useId().replace(/:/g, "")}`;
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const control = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();
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
        <svg
          width="0"
          height="0"
          aria-hidden="true"
          className="gooey-filter-definition"
        >
          <defs>
            <filter
              id={filter}
              x="-30%"
              y="-40%"
              width="160%"
              height="180%"
              colorInterpolationFilters="sRGB"
            >
              <feGaussianBlur
                in="SourceGraphic"
                stdDeviation="6"
                result="blur"
              />
              <feColorMatrix
                in="blur"
                mode="matrix"
                values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 20 -9"
              />
            </filter>
          </defs>
        </svg>
        <div
          className="gooey-format-bubbles"
          aria-hidden="true"
          style={{ filter: reduce ? undefined : `url(#${filter})` }}
        >
          <span className="gooey-format-base" />
          <motion.span
            className="gooey-format-bridge"
            animate={{ y: open ? -28 : 0, scale: open ? 1.15 : 0.6 }}
            transition={
              reduce
                ? { duration: 0 }
                : { type: "spring", stiffness: 380, damping: 25 }
            }
          />
        </div>
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
