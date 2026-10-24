import { useRef, useState } from "react";
import { Popover } from "@base-ui/react/popover";
import { CalendarDays, X } from "lucide-react";
import { PlannerCalendar } from "./PlannerCalendar";

export function PlannerDatePicker({
  label,
  value,
  today,
  max,
  disabled,
  placeholder = "选择日期",
  onChange,
}: {
  label: string;
  value: string;
  today: string;
  max?: string;
  disabled?: boolean;
  placeholder?: string;
  onChange(value: string): void;
}) {
  const [open, setOpen] = useState(false);
  const [container, setContainer] = useState<HTMLElement | null>(null);
  const root = useRef<HTMLSpanElement>(null);
  return (
    <span ref={root} className="planner-date-picker">
      <Popover.Root
        open={open}
        onOpenChange={(next) => {
          setContainer(
            root.current?.closest<HTMLElement>(".workspace-app") ?? null,
          );
          setOpen(next);
        }}
      >
        <Popover.Trigger
          className="planner-date-trigger"
          aria-label={label}
          disabled={disabled}
        >
          <CalendarDays size={16} />
          <span>{value ? value.replaceAll("-", "/") : placeholder}</span>
        </Popover.Trigger>
        <Popover.Portal container={container ?? undefined}>
          <Popover.Positioner
            sideOffset={8}
            className="planner-calendar-positioner"
            collisionPadding={12}
          >
            <Popover.Popup
              className="planner-calendar-popup"
              aria-label={`${label}日历`}
            >
              <div className="calendar-popup-heading">
                <span>{label}</span>
                <Popover.Close aria-label="关闭日历">
                  <X size={16} />
                </Popover.Close>
              </div>
              <PlannerCalendar
                value={value}
                today={today}
                max={max}
                label={`${label}选择日期`}
                onChange={(next) => {
                  onChange(next);
                  setOpen(false);
                }}
              />
            </Popover.Popup>
          </Popover.Positioner>
        </Popover.Portal>
      </Popover.Root>
    </span>
  );
}
