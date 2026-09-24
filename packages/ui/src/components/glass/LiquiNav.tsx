// Adapted from Liqui Tab Bar: the same clear bar, lens maps and press spring.
// Search/drag-to-select are omitted: these are two navigation buttons, not tabs.
import { useEffect, useRef, useState } from "react";
import { CheckCircle2, NotebookPen } from "lucide-react";
import { GlassSurface } from "./GlassSurface";
import { useGlass } from "./GlassContext";
import {
  buildLensMaps,
  createSpringLoop,
  LensFilter,
  LIP,
  spring,
  supportsRefraction,
  type LensMaps,
} from "./lens";
import { useId } from "react";

export default function LiquiNav({
  view,
  onChange,
}: {
  view: "notes" | "todos";
  onChange: (view: "notes" | "todos") => void;
}) {
  const { reduced } = useGlass();
  const row = useRef<HTMLDivElement>(null);
  const pill = useRef<HTMLSpanElement>(null);
  const displacement = useRef<SVGFEDisplacementMapElement>(null);
  const loop = useRef<ReturnType<typeof createSpringLoop> | null>(null);
  const press = useRef(spring(900, 46));
  const [maps, setMaps] = useState<LensMaps | null>(null);
  const [width, setWidth] = useState(0);
  const id = `web-pill-${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  useEffect(() => {
    const element = row.current;
    if (!element || typeof ResizeObserver === "undefined") return;
    const resize = () => setWidth(element.clientWidth / 2);
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    setMaps(null);
    if (reduced || !width) return;
    try {
      if (supportsRefraction())
        setMaps(
          buildLensMaps({
            width,
            height: 46,
            radius: 23,
            bezel: 0.413 * 23,
            surface: LIP,
            dpr: Math.min(window.devicePixelRatio || 1, 3),
          }),
        );
    } catch {
      /* CSS highlight remains usable without canvas. */
    }
  }, [width, reduced]);
  useEffect(() => {
    const s = press.current;
    const animation = createSpringLoop([s], () => {
      if (pill.current) pill.current.style.scale = String(1 + s.value * 0.16);
      displacement.current?.setAttribute(
        "scale",
        String(0.3196 * 46 * (0.14 + s.value * 0.86)),
      );
    });
    loop.current = animation;
    if (typeof window.matchMedia !== "function") return () => animation.stop();
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => {
      animation.reduced = motion.matches || reduced;
      if (animation.reduced) {
        animation.stop();
        s.target = 0;
        animation.snap();
      }
    };
    update();
    motion.addEventListener("change", update);
    const release = () => animation.settle(s, 0);
    window.addEventListener("pointerup", release);
    window.addEventListener("pointercancel", release);
    window.addEventListener("blur", release);
    return () => {
      animation.stop();
      motion.removeEventListener("change", update);
      window.removeEventListener("pointerup", release);
      window.removeEventListener("pointercancel", release);
      window.removeEventListener("blur", release);
    };
  }, [reduced]);
  return (
    <nav className="web-liqui-nav" aria-label="手机主导航">
      <GlassSurface kind="nav" />
      <div className="web-liqui-nav-row" ref={row}>
        {maps && !reduced && (
          <LensFilter
            id={id}
            maps={maps}
            width={width}
            height={46}
            scale={0.3196 * 46 * 0.14}
            blur={0}
            specularOpacity={0.42}
            specularSaturation={5}
            scaleRef={displacement}
          />
        )}
        <span
          ref={pill}
          className="web-liqui-pill"
          aria-hidden="true"
          style={{
            left: view === "notes" ? "0%" : "50%",
            ...(maps && !reduced
              ? {
                  backdropFilter: `url(#${id})`,
                  WebkitBackdropFilter: `url(#${id})`,
                }
              : {}),
          }}
        />
        {(["notes", "todos"] as const).map((item, index) => (
          <button
            key={item}
            type="button"
            aria-current={view === item ? "page" : undefined}
            onPointerDown={(event) => {
              if (event.button === 0 && item === view && !loop.current?.reduced)
                loop.current?.settle(press.current, 1);
            }}
            onPointerLeave={() => loop.current?.settle(press.current, 0)}
            onKeyDown={(event) => {
              if (
                ["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)
              ) {
                event.preventDefault();
                const target =
                  event.key === "Home"
                    ? 0
                    : event.key === "End"
                      ? 1
                      : 1 - index;
                row.current?.querySelectorAll("button")[target]?.focus();
              }
            }}
            onClick={() => onChange(item)}
          >
            {item === "notes" ? (
              <NotebookPen size={20} />
            ) : (
              <CheckCircle2 size={20} />
            )}
            <span>{item === "notes" ? "便签" : "待办"}</span>
          </button>
        ))}
      </div>
    </nav>
  );
}
