import { useRef, useState } from "react";
import { Popover } from "@base-ui/react/popover";
import { Expand, X } from "lucide-react";
import {
  getTodoStatus,
  type CalendarOccurrence,
  type Todo,
} from "@smoke-notes/core";

export function CalendarDayOverflow({
  date,
  visibleCount = 2,
  events,
  todos,
  onOpenEvent,
  onOpenTodo,
  onExpand,
}: {
  date: string;
  visibleCount?: number;
  events: CalendarOccurrence[];
  todos: Todo[];
  onOpenEvent(event: CalendarOccurrence): void;
  onOpenTodo(todo: Todo): void;
  onExpand(): void;
}) {
  const count = events.length + todos.length;
  const [open, setOpen] = useState(false);
  const [container, setContainer] = useState<HTMLElement | null>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const title = new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "long",
  }).format(new Date(`${date}T12:00:00`));
  function choose(action: () => void) {
    setOpen(false);
    // Let focus return to the calendar before opening its detail dialog.
    requestAnimationFrame(action);
  }
  if (!count) return null;
  return (
    <Popover.Root
      open={open}
      onOpenChange={(value) => {
        setContainer(
          trigger.current?.closest<HTMLElement>(".workspace-app") ?? null,
        );
        setOpen(value);
      }}
    >
      <Popover.Trigger
        ref={trigger}
        className={`calendar-more calendar-overflow-trigger${count <= visibleCount ? " calendar-overflow-mobile-only" : ""}`}
        aria-label={`查看${date}的全部${count}项安排`}
      >
        <span className="calendar-overflow-desktop">
          还有 {Math.max(0, count - visibleCount)} 项
        </span>
        <span className="calendar-overflow-mobile">
          +{Math.max(0, count - visibleCount)}
        </span>
      </Popover.Trigger>
      <Popover.Portal container={container ?? undefined}>
        <Popover.Positioner
          sideOffset={8}
          collisionPadding={12}
          className="calendar-overflow-positioner"
        >
          <Popover.Popup className="calendar-overflow-popup">
            <header>
              <Popover.Title>{title}</Popover.Title>
              <Popover.Close aria-label="收起当天安排">
                <X size={18} />
              </Popover.Close>
            </header>
            <div className="calendar-overflow-items">
              {events.map((event) => (
                <button
                  type="button"
                  key={event.id}
                  className={`calendar-overflow-item event-${event.color}`}
                  onClick={() => choose(() => onOpenEvent(event))}
                >
                  <strong>{event.title}</strong>
                  <span>
                    {event.allDay
                      ? "全天"
                      : `${event.start.slice(11)}–${event.end.slice(11)}`}
                    {event.location ? ` · ${event.location}` : ""}
                  </span>
                </button>
              ))}
              {todos.map((todo) => (
                <button
                  type="button"
                  key={todo.id}
                  className="calendar-overflow-item"
                  onClick={() => choose(() => onOpenTodo(todo))}
                >
                  <strong>{todo.text}</strong>
                  <span>
                    待办 ·{" "}
                    {getTodoStatus(todo) === "completed" ? "已完成" : "未完成"}
                  </span>
                </button>
              ))}
            </div>
            <button
              type="button"
              className="calendar-expand-day"
              onClick={() => choose(onExpand)}
            >
              <Expand size={16} />
              展开当天
            </button>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}
