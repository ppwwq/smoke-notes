// React Bits RubberSegment — Copyright (c) 2026 David Haz.
// MIT + Commons Clause, see LICENSE.md. Local changes: navigation semantics,
// keyboard/click fallback, gesture cancellation and bounded 26% stretch.
"use client";

import React, {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import {
  animate,
  motion,
  useMotionValue,
  useReducedMotion,
  useTransform,
  type MotionValue,
} from "motion/react";

import "./RubberSegment.css";

export type RubberSegmentSize = "sm" | "md" | "lg";
export type RubberSegmentItem =
  | string
  | { value: string; label: ReactNode; icon?: ReactNode; ariaLabel?: string };

export interface RubberSegmentProps {
  items: RubberSegmentItem[];
  value?: string;
  defaultValue?: string;
  onChange?: (value: string, index: number) => void;
  trackColor?: string;
  thumbColor?: string;
  textColor?: string;
  activeTextColor?: string;
  size?: RubberSegmentSize;
  radius?: number;
  inset?: number;
  equalSlots?: boolean;
  stretch?: number;
  squash?: number;
  speed?: number;
  glide?: number;
  draggable?: boolean;
  disabled?: boolean;
  className?: string;
  navigation?: boolean;
  "aria-label"?: string;
}

type Slot = { l: number; r: number };
type Sample = [number, number];
type Drag = {
  id: number;
  x0: number;
  y0: number;
  slot: number;
  onThumb: boolean;
  live: boolean;
  offset: number;
  w: number;
  hist: Sample[];
};

const EASE_OUT: [number, number, number, number] = [0.23, 1, 0.32, 1];
const SPRING_UI = { type: "spring" as const, duration: 0.3, bounce: 0 };
const SPRING_MOMENTUM = { type: "spring" as const, duration: 0.4, bounce: 0.2 };
const SPRING_RELAX = { type: "spring" as const, duration: 0.16, bounce: 0 };
const DILATE = 0.19;
const HANDOFF = 0.15;
const FLICK = 110;
const MAX_VELOCITY = 2000;
const DEADZONE = 4;
const SLOP = 10;
const RUBBER = 0.55;
const SIZES: Record<
  RubberSegmentSize,
  { height: number; font: number; pad: number; min: number }
> = {
  sm: { height: 28, font: 12, pad: 10, min: 36 },
  md: { height: 36, font: 13, pad: 14, min: 44 },
  lg: { height: 44, font: 14, pad: 18, min: 48 },
};

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));
const rubber = (over: number, dim: number) =>
  (over * dim * RUBBER) / (dim + RUBBER * Math.abs(over));
const project = (v: number, glide: number) => {
  const d = 1 - 0.1 * Math.pow(0.05, glide / 100);
  return ((v / 1000) * d) / (1 - d);
};
const velocityOf = (hist: Sample[], now: number) => {
  const recent = hist.filter(([t]) => now - t <= 100);
  if (recent.length < 2) return 0;
  const [t0, x0] = recent[0];
  const [t1, x1] = recent[recent.length - 1];
  return t1 - t0 >= 8 ? ((x1 - x0) / (t1 - t0)) * 1000 : 0;
};
const nearestSlot = (slots: Slot[], x: number) => {
  let best = 0;
  for (let i = 1; i < slots.length; i++) {
    if (
      Math.abs((slots[i].l + slots[i].r) / 2 - x) <
      Math.abs((slots[best].l + slots[best].r) / 2 - x)
    )
      best = i;
  }
  return best;
};

const RubberSegment: React.FC<RubberSegmentProps> = ({
  items,
  value,
  defaultValue,
  onChange,
  trackColor = "#27272a",
  thumbColor = "#fafafa",
  textColor = "#fafafa",
  activeTextColor = "#18181b",
  size = "md",
  radius = 10,
  inset = 3,
  equalSlots = true,
  stretch = 100,
  squash = 3,
  speed = 1,
  glide = 75,
  draggable = true,
  disabled = false,
  className = "",
  navigation = false,
  "aria-label": ariaLabel = "Segmented control",
}) => {
  const list = items.map((item) =>
    typeof item === "string" ? { value: item, label: item } : item,
  );
  const [inner, setInner] = useState<string | undefined>(
    defaultValue ?? list[0]?.value,
  );
  const current = value !== undefined ? value : inner;
  const index = Math.max(
    0,
    list.findIndex((item) => item.value === current),
  );
  const reduce = useReducedMotion();

  const trackRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const slots = useRef<Slot[]>([]);
  const box = useRef<DOMRect | null>(null);
  const committed = useRef(index);
  const handoff = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const drag = useRef<Drag | null>(null);
  const gen = useRef(0);
  const suppressClick = useRef(false);

  const edgeL = useMotionValue(0);
  const edgeR = useMotionValue(0);
  const innerW = useMotionValue(0);
  const thumbRadius = Math.max(0, radius - inset);
  const getClipPath = () => {
    const width = innerW.get();
    const left = edgeL.get();
    const right = edgeR.get();
    // Before layout, keep the initial selection bounded instead of exposing
    // the entire highlight layer. Unequal slots wait for their measurement.
    if (width <= 0) {
      const count = Math.max(1, list.length);
      return equalSlots
        ? `inset(0 ${((count - index - 1) / count) * 100}% 0 ${(index / count) * 100}% round ${thumbRadius}px)`
        : "inset(0 100% 0 0)";
    }
    return `inset(0 ${Math.max(0, width - right)}px 0 ${Math.max(0, left)}px round ${thumbRadius}px)`;
  };
  const clipPath = useTransform(getClipPath);

  const t = (seconds: number) => seconds / Math.max(0.1, speed);

  const jumpTo = (i: number) => {
    const s = slots.current[i];
    if (!s) return;
    clearTimeout(handoff.current);
    gen.current += 1;
    edgeL.jump(s.l);
    edgeR.jump(s.r);
    // Initial layout runs before useTransform subscribes to these values.
    // Publish the measured clip explicitly; subsequent animation stays derived.
    clipPath.set(getClipPath());
  };

  const measure = () => {
    const track = trackRef.current;
    if (!track) return;
    if (drag.current) {
      const item = itemRefs.current[drag.current.slot];
      if (item) delete item.dataset.pressed;
      drag.current = null;
      delete track.dataset.held;
      suppressClick.current = true;
    }
    const rect = track.getBoundingClientRect();
    box.current = rect;
    slots.current = list.map((_, i) => {
      const el = itemRefs.current[i];
      if (!el) return { l: 0, r: 0 };
      // The expanding Family Button applies a temporary parent scale.
      // Measure layout coordinates so that scale cannot distort the thumb.
      const r = el.getBoundingClientRect();
      const l = el.offsetWidth
        ? el.offsetLeft - inset
        : r.left - rect.left - inset;
      return { l, r: l + (el.offsetWidth || r.width) };
    });
    innerW.set((track.clientWidth || rect.width) - inset * 2);
    jumpTo(committed.current);
  };

  const listKey = list.map((item) => item.value).join("|");
  useLayoutEffect(() => {
    measure();
    const frame = requestAnimationFrame(measure);
    const observer = new ResizeObserver(measure);
    if (trackRef.current) observer.observe(trackRef.current);
    if (typeof document !== "undefined" && document.fonts)
      document.fonts.ready.then(measure);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listKey, size, inset, equalSlots]);

  useEffect(() => {
    if (!drag.current && committed.current !== index) {
      committed.current = index;
      jumpTo(index);
    }
  });

  useEffect(
    () => () => {
      clearTimeout(handoff.current);
      edgeL.stop();
      edgeR.stop();
    },
    [edgeL, edgeR],
  );

  const commit = (i: number) => {
    committed.current = i;
    if (i === index) return;
    if (value === undefined) setInner(list[i].value);
    itemRefs.current[i]?.focus({ preventScroll: true });
    onChange?.(list[i].value, i);
  };

  const land = (
    to: number,
    v: number | null,
    flick: boolean,
    withSquash: boolean,
  ) => {
    const b = slots.current[to];
    if (!b) return;
    const g = ++gen.current;
    const dir =
      Math.sign((b.l + b.r) / 2 - (edgeL.get() + edgeR.get()) / 2) || 1;
    const [lead, leadTo, trail, trailTo] =
      dir > 0 ? [edgeR, b.r, edgeL, b.l] : [edgeL, b.l, edgeR, b.r];
    const velocityFor = (mv: MotionValue<number>) =>
      clamp(v === null ? mv.getVelocity() : v, -MAX_VELOCITY, MAX_VELOCITY);
    animate(lead, leadTo, {
      ...(flick ? SPRING_MOMENTUM : SPRING_UI),
      duration: t(flick ? 0.4 : 0.3),
      velocity: velocityFor(lead),
    });
    const trailVelocity = velocityFor(trail);
    if (!withSquash || squash <= 0) {
      animate(trail, trailTo, {
        ...SPRING_UI,
        duration: t(0.3),
        velocity: trailVelocity,
      });
      return;
    }
    animate(trail, trailTo + dir * squash, {
      ...SPRING_UI,
      duration: t(0.3),
      velocity: trailVelocity,
    }).then(() => {
      if (gen.current === g)
        animate(trail, trailTo, { ...SPRING_RELAX, duration: t(0.16) });
    });
  };

  const travel = (from: number, to: number) => {
    const a = slots.current[from];
    const b = slots.current[to];
    if (!a || !b) return;
    clearTimeout(handoff.current);
    gen.current += 1;
    if (reduce) {
      edgeL.jump(b.l);
      edgeR.jump(b.r);
      return;
    }
    const gap = Math.max(Math.abs(a.l - b.l), Math.abs(a.r - b.r));
    const u = Math.min(stretch / 100, gap ? ((b.r - b.l) * 0.26) / gap : 0);
    const tween = { duration: t(DILATE), ease: EASE_OUT };
    animate(edgeL, b.l + (Math.min(a.l, b.l) - b.l) * u, tween);
    animate(edgeR, b.r + (Math.max(a.r, b.r) - b.r) * u, tween);
    handoff.current = setTimeout(
      () => land(to, null, false, true),
      t(HANDOFF) * 1000,
    );
  };

  const localX = (e: { clientX: number }) => {
    const rect = box.current;
    const scale = rect?.width ? (innerW.get() + inset * 2) / rect.width : 1;
    return (e.clientX - (rect?.left ?? 0)) * scale - inset;
  };

  const handlePointerDown = (
    e: React.PointerEvent<HTMLButtonElement>,
    i: number,
  ) => {
    if (disabled || drag.current || e.button !== 0 || e.isPrimary === false)
      return;
    suppressClick.current = false;
    box.current = trackRef.current?.getBoundingClientRect() ?? null;
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* Detached controls cannot capture a pointer. */
    }
    const x = localX(e);
    const onThumb = draggable && x >= edgeL.get() && x <= edgeR.get();
    drag.current = {
      id: e.pointerId,
      x0: x,
      y0: e.clientY,
      slot: i,
      onThumb,
      live: false,
      offset: 0,
      w: 0,
      hist: [[e.timeStamp, x]],
    };
    if (onThumb) {
      clearTimeout(handoff.current);
      gen.current += 1;
      edgeL.stop();
      edgeR.stop();
    } else if (!reduce) {
      e.currentTarget.dataset.pressed = "";
    }
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || e.pointerId !== d.id) return;
    if (
      !d.live &&
      Math.abs(e.clientY - d.y0) > SLOP &&
      Math.abs(e.clientY - d.y0) > Math.abs(localX(e) - d.x0)
    ) {
      suppressClick.current = true;
      release();
      jumpTo(committed.current);
      return;
    }
    if (!d.onThumb) return;
    const x = localX(e);
    d.hist.push([e.timeStamp, x]);
    if (d.hist.length > 8) d.hist.shift();
    if (!d.live) {
      if (Math.abs(x - d.x0) < DEADZONE) return;
      d.live = true;
      d.offset = x - edgeL.get();
      d.w = edgeR.get() - edgeL.get();
      if (trackRef.current) trackRef.current.dataset.held = "";
    }
    const width = innerW.get();
    const l = x - d.offset;
    const maxL = width - d.w;
    if (reduce) {
      const c = clamp(l, 0, maxL);
      edgeL.set(c);
      edgeR.set(c + d.w);
    } else if (l < 0) {
      edgeL.set(0);
      edgeR.set(d.w - rubber(-l, d.w));
    } else if (l > maxL) {
      edgeR.set(width);
      edgeL.set(maxL + rubber(l - maxL, d.w));
    } else {
      edgeL.set(l);
      edgeR.set(l + d.w);
    }
  };

  const release = () => {
    const d = drag.current as Drag;
    drag.current = null;
    if (trackRef.current) delete trackRef.current.dataset.held;
    const el = itemRefs.current[d.slot];
    if (el) delete el.dataset.pressed;
    return d;
  };

  useEffect(() => {
    const cancel = () => {
      const d = drag.current;
      if (!d) return;
      drag.current = null;
      suppressClick.current = true;
      if (trackRef.current) delete trackRef.current.dataset.held;
      const el = itemRefs.current[d.slot];
      if (el) delete el.dataset.pressed;
      clearTimeout(handoff.current);
      gen.current += 1;
      const s = slots.current[committed.current];
      if (s) {
        edgeL.jump(s.l);
        edgeR.jump(s.r);
      }
    };
    window.addEventListener("blur", cancel);
    window.addEventListener("resize", cancel);
    return () => {
      window.removeEventListener("blur", cancel);
      window.removeEventListener("resize", cancel);
    };
  }, [edgeL, edgeR]);

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || e.pointerId !== d.id) return;
    release();
    suppressClick.current = true;
    const x = localX(e);
    const rect = box.current;
    if (
      rect &&
      (e.clientY < rect.top - SLOP || e.clientY > rect.bottom + SLOP)
    ) {
      jumpTo(committed.current);
      return;
    }
    if (!d.live) {
      if (Math.abs(x - d.x0) <= SLOP && d.slot !== committed.current) {
        const from = committed.current;
        commit(d.slot);
        travel(from, d.slot);
      }
      return;
    }
    const v = velocityOf(d.hist, e.timeStamp);
    const flick = Math.abs(v) > FLICK;
    let to = nearestSlot(
      slots.current,
      (edgeL.get() + edgeR.get()) / 2 + project(v, glide),
    );
    if (flick && to === committed.current)
      to = clamp(to + Math.sign(v), 0, list.length - 1);
    commit(to);
    if (reduce) jumpTo(to);
    else land(to, v, flick, flick);
  };

  const handlePointerCancel = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || e.pointerId !== d.id) return;
    release();
    suppressClick.current = true;
    if (!d.live) return;
    if (reduce) jumpTo(committed.current);
    else land(committed.current, null, false, false);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    if (disabled) return;
    if (e.key === "Escape" && drag.current) {
      release();
      suppressClick.current = true;
      jumpTo(committed.current);
      return;
    }
    suppressClick.current = false;
    const last = list.length - 1;
    let next: number | null = null;
    if (e.key === "ArrowRight" || e.key === "ArrowDown")
      next = Math.min(last, index + 1);
    else if (e.key === "ArrowLeft" || e.key === "ArrowUp")
      next = Math.max(0, index - 1);
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = last;
    if (next === null) return;
    e.preventDefault();
    if (next === index) return;
    commit(next);
    jumpTo(next);
    itemRefs.current[next]?.focus();
  };

  const preset = SIZES[size] || SIZES.md;

  return (
    <div
      ref={trackRef}
      role={navigation ? "navigation" : "group"}
      aria-label={ariaLabel}
      aria-disabled={disabled || undefined}
      data-equal={equalSlots ? "" : undefined}
      data-draggable={draggable && !disabled ? "" : undefined}
      className={`rubber-segment${className ? ` ${className}` : ""}`}
      style={
        {
          "--rs-track": trackColor,
          "--rs-thumb": thumbColor,
          "--rs-ink": textColor,
          "--rs-ink-active": activeTextColor,
          "--rs-radius": `${radius}px`,
          "--rs-inset": `${inset}px`,
          "--rs-thumb-radius": `${thumbRadius}px`,
          "--rs-h": `${preset.height}px`,
          "--rs-font": `${preset.font}px`,
          "--rs-pad": `${preset.pad}px`,
          "--rs-min": `${preset.min}px`,
        } as CSSProperties
      }
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerCancel}
      onLostPointerCapture={handlePointerCancel}
    >
      {list.map((item, i) => (
        <button
          key={item.value}
          ref={(el) => {
            itemRefs.current[i] = el;
          }}
          type="button"
          aria-label={"ariaLabel" in item ? item.ariaLabel : undefined}
          aria-current={navigation && i === index ? "page" : undefined}
          aria-pressed={!navigation ? i === index : undefined}
          tabIndex={i === index ? 0 : -1}
          disabled={disabled}
          className="rubber-segment__item"
          onPointerDown={(e) => handlePointerDown(e, i)}
          onKeyDown={handleKeyDown}
          onClick={() => {
            if (suppressClick.current) {
              suppressClick.current = false;
              return;
            }
            const from = committed.current;
            commit(i);
            travel(from, i);
          }}
        >
          {item.icon}
          {item.label}
        </button>
      ))}
      <motion.div
        className="rubber-segment__thumb"
        aria-hidden="true"
        style={{ clipPath }}
      >
        {list.map((item) => (
          <span
            key={item.value}
            className="rubber-segment__item rubber-segment__copy"
          >
            {item.icon}
            {item.label}
          </span>
        ))}
      </motion.div>
    </div>
  );
};

export default RubberSegment;
