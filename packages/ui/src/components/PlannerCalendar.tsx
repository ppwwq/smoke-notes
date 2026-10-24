import { DayPicker } from "@daypicker/react";
import { zhCN } from "@daypicker/react/locale";
import "@daypicker/react/style.css";
import "./planner-calendar.css";

function day(value: string) {
  const [year, month, date] = value.split("-").map(Number);
  return new Date(year, month - 1, date, 12);
}
function dayString(value: Date) {
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
}
export function PlannerCalendar({
  value,
  today,
  max,
  label,
  onChange,
}: {
  value: string;
  today: string;
  max?: string | undefined;
  label: string;
  onChange(value: string): void;
}) {
  return (
    <DayPicker
      className="planner-calendar"
      locale={zhCN}
      weekStartsOn={1}
      mode="single"
      required
      selected={value ? day(value) : undefined}
      defaultMonth={day(value || today)}
      today={day(today)}
      showOutsideDays
      autoFocus
      disabled={max ? { after: day(max) } : undefined}
      aria-label={label}
      role="application"
      onSelect={(selected) => onChange(dayString(selected))}
      footer={value ? `已选 ${value.replaceAll("-", "/")}` : "选择一个日期"}
    />
  );
}
