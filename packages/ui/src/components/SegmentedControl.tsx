import RubberSegment from "./rubber-segment/RubberSegment";

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
  return (
    <RubberSegment
      className="planner-segments app-segments"
      aria-label={label}
      items={[...options]}
      value={value}
      onChange={(_, index) => onChange(options[index].value)}
      trackColor="var(--segment-track, var(--surface-soft))"
      thumbColor="var(--segment-thumb, var(--surface))"
      textColor="var(--segment-text, var(--muted))"
      activeTextColor="var(--segment-active-text, var(--ink))"
      size="lg"
      radius={28}
      inset={5}
      stretch={26}
    />
  );
}
