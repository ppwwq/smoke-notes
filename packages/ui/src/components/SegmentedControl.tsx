import { useRef, type CSSProperties } from "react";

/** A shared soft selection background. Labels never scale with the capsule. */
export function SegmentedControl<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: ReadonlyArray<{ value: T; label: string }>;
  onChange(value: T): void;
}) {
  const buttons = useRef<Array<HTMLButtonElement | null>>([]);
  const selected = Math.max(
    0,
    options.findIndex((option) => option.value === value),
  );
  return (
    <div
      className="planner-segments"
      role="group"
      aria-label={label}
      style={
        {
          "--segment-count": options.length,
          "--segment-index": selected,
        } as CSSProperties
      }
    >
      <span className="planner-segment-selection" aria-hidden="true" />
      {options.map((option, index) => (
        <button
          ref={(element) => {
            buttons.current[index] = element;
          }}
          key={option.value}
          type="button"
          aria-pressed={value === option.value}
          onClick={() => onChange(option.value)}
          onKeyDown={(event) => {
            const destination =
              event.key === "Home"
                ? 0
                : event.key === "End"
                  ? options.length - 1
                  : event.key === "ArrowRight"
                    ? (index + 1) % options.length
                    : event.key === "ArrowLeft"
                      ? (index - 1 + options.length) % options.length
                      : null;
            if (destination === null) return;
            event.preventDefault();
            onChange(options[destination].value);
            buttons.current[destination]?.focus();
          }}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
