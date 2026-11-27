import {
  useEffect,
  useRef,
  type CSSProperties,
  type PointerEvent,
} from "react";
import {
  addTodoDays,
  getTodoDate,
  getTodoStatus,
  type CalendarOccurrence,
  type Todo,
} from "@smoke-notes/core";
import {
  CalendarDrop,
  CalendarEventButton,
  CalendarTodoButton,
} from "./CalendarCanvas";
import { CalendarDayOverflow } from "./CalendarDayOverflow";
import { calendarDay, calendarWeekNumber } from "./calendar-dates";
import { calendarSpanRows } from "./calendar-layout";

const MAX_ROW_EXTENSION = 56;
const clampRowExtension = (value: number) =>
  Math.max(0, Math.min(MAX_ROW_EXTENSION, value));

export function CalendarMonth({
  from,
  weeks = 6,
  weekStartsOn = 1,
  showWeekNumbers = false,
  density = "compact",
  date,
  month,
  today,
  events,
  todos,
  onSelect,
  onCreate,
  onOpen,
  onOpenTodo,
  onExpand,
  onSwipeMonth,
  todoColor,
  rowExtension,
  onRowExtensionChange,
}: {
  from: string;
  weeks?: number;
  weekStartsOn?: number;
  showWeekNumbers?: boolean;
  density?: "compact" | "comfortable";
  date: string;
  month: string;
  today: string;
  events: CalendarOccurrence[];
  todos: Todo[];
  onSelect(day: string): void;
  onCreate(day: string, time?: string): void;
  onOpen(event: CalendarOccurrence): void;
  onOpenTodo(todo: Todo): void;
  onExpand(day: string): void;
  onSwipeMonth?(delta: -1 | 1): void;
  todoColor(todo: Todo): string;
  rowExtension: number;
  onRowExtensionChange(value: number): void;
}) {
  const swipe = useRef<{ x: number; y: number; at: number } | null>(null);
  const grid = useRef<HTMLDivElement>(null);
  const grip = useRef<HTMLDivElement>(null);
  const drag = useRef<{ id: number; y: number; frame: number } | null>(null);

  useEffect(() => () => cancelAnimationFrame(drag.current?.frame ?? 0), []);

  function showHeight(value: number) {
    grid.current?.style.setProperty(
      "--calendar-month-row-extension",
      `${value}px`,
    );
  }

  function finishResize(event: PointerEvent<HTMLDivElement>, commit: boolean) {
    const current = drag.current;
    if (!current || current.id !== event.pointerId) return;
    drag.current = null;
    cancelAnimationFrame(current.frame);
    delete event.currentTarget.dataset.resizing;
    event.currentTarget.style.removeProperty("--calendar-month-pull");
    const value = commit
      ? clampRowExtension(
          Math.round(rowExtension + (event.clientY - current.y) / weeks),
        )
      : rowExtension;
    showHeight(value);
    if (value !== rowExtension) onRowExtensionChange(value);
  }

  return (
    <div
      className={`calendar-month-grid density-${density}${showWeekNumbers ? " with-week-numbers" : ""}`}
      ref={grid}
      role="group"
      aria-label="月视图"
      style={
        {
          "--calendar-month-row-extension": `${rowExtension}px`,
        } as CSSProperties
      }
      onTouchStart={(event) => {
        if (
          !onSwipeMonth ||
          event.target === grip.current ||
          event.touches.length !== 1
        ) {
          swipe.current = null;
          return;
        }
        swipe.current = {
          x: event.touches[0].clientX,
          y: event.touches[0].clientY,
          at: Date.now(),
        };
      }}
      onTouchCancel={() => {
        swipe.current = null;
      }}
      onTouchEnd={(event) => {
        const start = swipe.current;
        swipe.current = null;
        if (!onSwipeMonth || !start || event.changedTouches.length !== 1)
          return;
        const dx = event.changedTouches[0].clientX - start.x;
        const dy = event.changedTouches[0].clientY - start.y;
        if (
          Date.now() - start.at < 450 &&
          Math.abs(dx) > 64 &&
          Math.abs(dx) > Math.abs(dy) * 1.6
        ) {
          onSwipeMonth(dx < 0 ? 1 : -1);
        }
      }}
    >
      <div className="calendar-week-heading">
        {showWeekNumbers && (
          <span className="calendar-week-number-heading" title="ISO 周数">
            周
          </span>
        )}
        {Array.from(
          { length: 7 },
          (_, index) => "日一二三四五六"[(weekStartsOn + index) % 7],
        ).map((day) => (
          <span key={day}>{day}</span>
        ))}
      </div>
      {Array.from({ length: weeks }, (_, week) => {
        const dates = Array.from({ length: 7 }, (_, day) =>
          addTodoDays(from, week * 7 + day),
        );
        const rows = calendarSpanRows(events, todos, dates);
        const shown = rows.filter((row) => row.row < 4);
        const lanes = shown.reduce(
          (count, item) => Math.max(count, item.row + 1),
          0,
        );
        return (
          <div
            className="calendar-month-week"
            key={dates[0]}
            style={{ "--calendar-month-lanes": lanes } as CSSProperties}
          >
            {showWeekNumbers && (
              <span
                className="calendar-week-number"
                aria-label={`${calendarWeekNumber(dates[(4 - weekStartsOn + 7) % 7]).year}年第${calendarWeekNumber(dates[(4 - weekStartsOn + 7) % 7]).week}周`}
              >
                {calendarWeekNumber(dates[(4 - weekStartsOn + 7) % 7]).week}
              </span>
            )}
            <div className="calendar-month-cells">
              {dates.map((day, index) => {
                const items = events.filter(
                    (event) =>
                      event.start.slice(0, 10) <= day &&
                      event.end > day + "T00:00",
                  ),
                  tasks = todos.filter((todo) => getTodoDate(todo) === day),
                  count = items.length + tasks.length;
                const label = new Intl.DateTimeFormat("zh-CN", {
                  year: "numeric",
                  month: "long",
                  day: "numeric",
                  weekday: "long",
                }).format(calendarDay(day));
                return (
                  <CalendarDrop
                    key={day}
                    date={day}
                    className={`calendar-month-cell${day === date ? " is-selected" : ""}${day === today ? " is-today" : ""}${day.slice(0, 7) !== month.slice(0, 7) ? " is-outside" : ""}`}
                  >
                    <button
                      type="button"
                      className="calendar-date-number"
                      data-date={day}
                      tabIndex={day === date ? 0 : -1}
                      aria-pressed={day === date}
                      aria-label={`${label}，${count}项安排，${tasks.length}项待办，${tasks.filter((todo) => getTodoStatus(todo) === "open").length}项未完成`}
                      onClick={() => onSelect(day)}
                      onDoubleClick={() => onCreate(day, "09:00")}
                      onKeyDown={(event) => {
                        const offset = (
                          {
                            ArrowLeft: -1,
                            ArrowRight: 1,
                            ArrowUp: -7,
                            ArrowDown: 7,
                          } as Record<string, number>
                        )[event.key];
                        if (offset) {
                          event.preventDefault();
                          const next = addTodoDays(day, offset);
                          const root = event.currentTarget.closest(
                            ".calendar-month-grid",
                          );
                          onSelect(next);
                          requestAnimationFrame(() =>
                            root
                              ?.querySelector<HTMLButtonElement>(
                                `[data-date="${next}"]`,
                              )
                              ?.focus(),
                          );
                        }
                      }}
                    >
                      {Number(day.slice(8))}
                    </button>
                    <CalendarDayOverflow
                      date={day}
                      events={items}
                      todos={tasks}
                      visibleCount={
                        shown.filter(
                          (item) => item.first <= index && item.last >= index,
                        ).length
                      }
                      onOpenEvent={onOpen}
                      onOpenTodo={onOpenTodo}
                      onExpand={() => onExpand(day)}
                    />
                  </CalendarDrop>
                );
              })}
            </div>
            <div className="calendar-month-strips">
              {shown.map((item) => (
                <div
                  key={item.id}
                  className={`calendar-span-item${item.start.slice(0, 10) < dates[0] ? " continues-before" : ""}${item.end > addTodoDays(dates[6], 1) + "T00:00" ? " continues-after" : ""}`}
                  style={{
                    gridColumn: `${item.first + 1} / ${item.last + 2}`,
                    gridRow: item.row + 1,
                  }}
                >
                  {item.event ? (
                    <CalendarEventButton
                      event={item.event}
                      spanStart={dates[item.first]}
                      spanDays={item.last - item.first + 1}
                      onOpen={() => onOpen(item.event!)}
                    />
                  ) : (
                    <CalendarTodoButton
                      todo={item.todo!}
                      color={todoColor(item.todo!)}
                      onOpen={() => onOpenTodo(item.todo!)}
                    />
                  )}
                </div>
              ))}
            </div>
          </div>
        );
      })}
      <div
        ref={grip}
        className="calendar-month-resize"
        role="slider"
        tabIndex={0}
        aria-label="调整月历高度"
        aria-orientation="vertical"
        aria-valuemin={0}
        aria-valuemax={MAX_ROW_EXTENSION}
        aria-valuenow={rowExtension}
        onPointerDown={(event) => {
          if (event.button !== 0 || drag.current) return;
          drag.current = { id: event.pointerId, y: event.clientY, frame: 0 };
          event.currentTarget.dataset.resizing = "true";
          event.currentTarget.setPointerCapture?.(event.pointerId);
        }}
        onPointerMove={(event) => {
          const current = drag.current;
          if (!current || current.id !== event.pointerId) return;
          const raw = rowExtension + (event.clientY - current.y) / weeks;
          const value = clampRowExtension(raw);
          const pull = Math.max(-12, Math.min(12, (raw - value) * weeks * 0.2));
          cancelAnimationFrame(current.frame);
          current.frame = requestAnimationFrame(() => {
            showHeight(value);
            grip.current?.style.setProperty(
              "--calendar-month-pull",
              `${pull}px`,
            );
          });
        }}
        onPointerUp={(event) => finishResize(event, true)}
        onPointerCancel={(event) => finishResize(event, false)}
        onLostPointerCapture={(event) => finishResize(event, false)}
        onKeyDown={(event) => {
          const values = {
            ArrowUp: rowExtension + 8,
            ArrowDown: rowExtension - 8,
            Home: 0,
            End: MAX_ROW_EXTENSION,
          };
          if (!(event.key in values)) return;
          event.preventDefault();
          onRowExtensionChange(
            clampRowExtension(values[event.key as keyof typeof values]),
          );
        }}
      />
    </div>
  );
}
