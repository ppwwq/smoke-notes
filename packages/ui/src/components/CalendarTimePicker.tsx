import { WorkspaceSelect } from "./WorkspaceSelect";

const hours = Array.from({ length: 24 }, (_, i) => ({
  value: String(i).padStart(2, "0"),
  label: `${String(i).padStart(2, "0")} 时`,
}));
const minutes = Array.from({ length: 60 }, (_, i) => ({
  value: String(i).padStart(2, "0"),
  label: `${String(i).padStart(2, "0")} 分`,
}));

/** Uses the same touch, keyboard, focus and collision handling as every choice menu. */
export function CalendarTimePicker({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange(value: string): void;
}) {
  const [hour, minute] = value.split(":");
  return (
    <div className="calendar-time-picker" role="group" aria-label={label}>
      <WorkspaceSelect
        label={`${label}小时`}
        value={hour}
        options={hours}
        onChange={(next) => onChange(`${next}:${minute}`)}
      />
      <span aria-hidden="true">:</span>
      <WorkspaceSelect
        label={`${label}分钟`}
        value={minute}
        options={minutes}
        onChange={(next) => onChange(`${hour}:${next}`)}
      />
    </div>
  );
}
