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
  todoColor,
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
  todoColor(todo: Todo): string;
}) {
  return (
    <div
      className={`calendar-month-grid density-${density}${showWeekNumbers ? " with-week-numbers" : ""}`}
      role="group"
      aria-label="月视图"
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
        return (
          <div className="calendar-month-week" key={dates[0]}>
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
    </div>
  );
}
