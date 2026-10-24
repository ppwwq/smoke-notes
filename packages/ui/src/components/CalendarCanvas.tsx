import { calendarWeekNumber } from "./calendar-dates";
import { Minus, Plus } from "lucide-react";
import {
  useCalendarZoom,
  MIN_HOUR_HEIGHT,
  MAX_HOUR_HEIGHT,
} from "./useCalendarZoom";
import { eventColumns, calendarSpanRows } from "./calendar-layout";
import { useDraggable, useDroppable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useId,
  type CSSProperties,
  type ReactNode,
} from "react";
import {
  calendarMinute,
  calendarWallTime,
  calendarStamp,
  getTodoDate,
  getTodoStatus,
  plannerTodoValue,
  type Todo,
  type CalendarOccurrence,
} from "@smoke-notes/core";
import SpringCheck from "./spring-check/SpringCheck";

export function CalendarDrop({
  date,
  timed = false,
  allDay = false,
  children,
  className = "",
}: {
  date: string;
  timed?: boolean;
  allDay?: boolean;
  children: ReactNode;
  className?: string;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: `drop:${timed ? "time" : "date"}:${date}`,
    data: { date, timed, allDay },
  });
  return (
    <div
      ref={setNodeRef}
      className={`${className}${isOver ? " calendar-drop-over" : ""}`}
      data-calendar-date={date}
    >
      {children}
    </div>
  );
}
export function CalendarEventButton({
  event,
  onOpen,
  style,
  resize = false,
  spanStart,
  spanDays,
}: {
  event: CalendarOccurrence;
  onOpen(): void;
  style?: CSSProperties;
  resize?: boolean | "start";
  spanStart?: string;
  spanDays?: number;
}) {
  const instance = useId();
  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({
      id: `${instance}:${resize ? "resize" : "event"}:${event.id}`,
      data: { event, resize, spanStart, spanDays },
    });
  return (
    <button
      type="button"
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      data-calendar-event={resize ? undefined : event.id}
      onClick={onOpen}
      style={{
        ...style,
        transform: resize ? CSS.Translate.toString(transform) : undefined,
        zIndex: isDragging ? 40 : style?.zIndex,
      }}
      className={
        resize
          ? `calendar-resize${resize === "start" ? " calendar-resize-start" : ""}`
          : `calendar-event event-${event.color}${isDragging ? " dragging" : ""}`
      }
      aria-label={
        resize
          ? `${resize === "start" ? "调整开始时间" : "调整时长"}：${event.title}`
          : `日程：${event.title}，${event.allDay ? "全天" : event.start.slice(11) + "–" + event.end.slice(11)}`
      }
    >
      {resize ? (
        <span />
      ) : (
        <>
          <strong>{event.title}</strong>
          <small>
            {event.allDay ? "全天" : event.start.slice(11)}
            {event.location ? ` · ${event.location}` : ""}
          </small>
        </>
      )}
    </button>
  );
}
export function CalendarTodoButton({
  todo,
  color,
  onOpen,
  children,
  className = "",
  label,
}: {
  todo: Todo;
  color: string;
  onOpen(): void;
  children?: ReactNode;
  className?: string;
  label?: string;
}) {
  const instance = useId();
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `${instance}:todo:${todo.id}`,
    data: { todo, color },
  });
  return (
    <button
      type="button"
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      data-calendar-todo={todo.id}
      aria-label={label ?? `待办：${todo.text}`}
      className={`calendar-task-chip event-${color}${getTodoStatus(todo) === "completed" ? " is-done" : ""}${isDragging ? " dragging" : ""} ${className}`}
      onClick={onOpen}
    >
      {children ?? (
        <>
          {getTodoStatus(todo) === "completed" ? "✓ " : ""}
          {todo.text}
        </>
      )}
    </button>
  );
}
export function CalendarTimeline({
  dates,
  events,
  todos = [],
  todoTimes,
  todoColor = () => "purple",
  onOpenTodo,
  onToggleTodo,
  busyTodoIds = [],
  onOpen,
  onCreate,
  onSelect,
  today,
  timeZone = "Asia/Hong_Kong",
  showWeekNumbers = false,
  hourHeight,
  onHourHeightChange,
}: {
  todos?: Todo[];
  todoTimes?: Record<string, string | null>;
  todoColor?(todo: Todo): CalendarOccurrence["color"];
  onOpenTodo?(todo: Todo): void;
  onToggleTodo?(todo: Todo): Promise<void>;
  busyTodoIds?: string[];
  dates: string[];
  events: CalendarOccurrence[];
  onOpen(event: CalendarOccurrence): void;
  onCreate(date: string, time?: string): void;
  onSelect(date: string): void;
  today: string;
  timeZone?: string;
  showWeekNumbers?: boolean;
  hourHeight: number;
  onHourHeightChange(height: number): void;
}) {
  const timedTodos = new Map<string, Todo>();
  const todoSlots: CalendarOccurrence[] = [];
  for (const todo of todos) {
    const time = plannerTodoValue(todoTimes, todo);
    if (!time) continue;
    const id = `todo:${todo.id}`,
      start = `${getTodoDate(todo)}T${time}`;
    timedTodos.set(id, todo);
    // A reminder is a time point. Reserve a readable hit area, not an end time.
    todoSlots.push({
      id,
      eventId: id,
      occurrenceDate: getTodoDate(todo),
      recurring: false,
      title: todo.text,
      start,
      end: calendarStamp(
        calendarMinute(start) + Math.max(30, Math.ceil((48 * 60) / hourHeight)),
      ),
      allDay: false,
      color: todoColor(todo),
      notes: "",
      location: "",
      url: "",
    });
  }
  const reminder = (todo: Todo) => (
    <div
      className={`calendar-timeline-todo event-${todoColor(todo)}${getTodoStatus(todo) === "completed" ? " is-done" : ""}`}
    >
      <SpringCheck
        boxSize={18}
        boxRadius={6}
        fontSize={12}
        checked={getTodoStatus(todo) === "completed"}
        disabled={busyTodoIds.includes(todo.id) || !onToggleTodo}
        ariaLabel={`${getTodoStatus(todo) === "completed" ? "恢复" : "完成"}：${todo.text}`}
        onChange={() => void onToggleTodo?.(todo)}
        label={
          <CalendarTodoButton
            todo={todo}
            label={`编辑待办：${todo.text}`}
            color={todoColor(todo)}
            onOpen={() => onOpenTodo?.(todo)}
          >
            <strong>{todo.text}</strong>
            {plannerTodoValue(todoTimes, todo) && (
              <small>{plannerTodoValue(todoTimes, todo)}</small>
            )}
          </CalendarTodoButton>
        }
        editableLabel
        color="var(--event-ink)"
        fillColor="var(--event-ink)"
        checkColor="var(--event-bg)"
      />
    </div>
  );
  const scroll = useRef<HTMLDivElement>(null);
  const zoom = useCalendarZoom(scroll, hourHeight, onHourHeightChange);
  const heightRef = useRef(hourHeight);
  useLayoutEffect(() => {
    heightRef.current = hourHeight;
  }, [hourHeight]);
  const dateKey = dates.join(",");
  useEffect(() => {
    const node = scroll.current;
    const column = node?.querySelector<HTMLElement>(".calendar-time-column");
    const heading = node?.querySelector<HTMLElement>(
      ".calendar-column-heading",
    );
    if (node && column)
      node.scrollTop +=
        column.getBoundingClientRect().top -
        node.getBoundingClientRect().top +
        8 * heightRef.current -
        (heading?.offsetHeight ?? 0);
  }, [dateKey]);
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(timer);
  }, []);
  const allDaySpans = calendarSpanRows(
    events.filter((event) => event.allDay),
    [],
    dates,
  );
  const allDayRows = Math.max(0, ...allDaySpans.map((item) => item.row + 1));
  const localNow = calendarWallTime(now.getTime(), timeZone);
  const minute =
    Number(localNow.slice(11, 13)) * 60 + Number(localNow.slice(14, 16));
  return (
    <>
      <div
        className="calendar-zoom-controls"
        role="group"
        aria-label="时间轴缩放"
      >
        <span>双指缩放时间轴</span>
        <button
          type="button"
          aria-label="缩小时间轴"
          disabled={hourHeight <= MIN_HOUR_HEIGHT}
          onClick={() => zoom(hourHeight / 1.25)}
        >
          <Minus size={16} />
        </button>
        <button
          type="button"
          aria-label="重置时间轴缩放"
          onClick={() => zoom(60)}
        >
          {Math.round((hourHeight / 60) * 100)}%
        </button>
        <button
          type="button"
          aria-label="放大时间轴"
          disabled={hourHeight >= MAX_HOUR_HEIGHT}
          onClick={() => zoom(hourHeight * 1.25)}
        >
          <Plus size={16} />
        </button>
      </div>
      <div
        ref={scroll}
        className="calendar-timeline-scroll"
        style={{ "--calendar-hour-height": `${hourHeight}px` } as CSSProperties}
      >
        <div
          className="calendar-timeline"
          style={{ "--calendar-days": dates.length } as CSSProperties}
        >
          <div className="calendar-time-heading">
            {showWeekNumbers && (
              <span title="ISO 周数">
                第{" "}
                {
                  calendarWeekNumber(
                    dates.find(
                      (day) => new Date(day + "T12:00:00").getDay() === 4,
                    ) ?? dates[0],
                  ).week
                }{" "}
                周
              </span>
            )}
          </div>
          {dates.map((date) => (
            <button
              className={`calendar-column-heading${date === today ? " is-today" : ""}`}
              key={date}
              data-date={date}
              onClick={() => onSelect(date)}
              aria-label={dates.length > 1 ? `展开${date}整天` : undefined}
              title={dates.length > 1 ? "展开当天" : undefined}
            >
              <small>
                {new Intl.DateTimeFormat("zh-CN", { weekday: "short" }).format(
                  new Date(`${date}T12:00:00`),
                )}
              </small>
              <span>{Number(date.slice(8))}</span>
            </button>
          ))}
          <span className="calendar-all-day-label">全天</span>
          <div className="calendar-all-day-band">
            <div className="calendar-all-day-backgrounds">
              {dates.map((date) => (
                <CalendarDrop
                  key={date}
                  date={date}
                  allDay
                  className="calendar-all-day"
                >
                  <div style={{ height: allDayRows * 28 }} aria-hidden="true" />
                  {todos
                    .filter(
                      (todo) =>
                        getTodoDate(todo) === date &&
                        !plannerTodoValue(todoTimes, todo),
                    )
                    .map((todo) => (
                      <div key={todo.id}>{reminder(todo)}</div>
                    ))}
                  <button
                    className="calendar-all-day-add"
                    aria-label={`添加全天日程到${date}`}
                    onClick={() => onCreate(date)}
                  >
                    ＋
                  </button>
                </CalendarDrop>
              ))}
            </div>
            <div className="calendar-all-day-strips">
              {allDaySpans.map((item) => (
                <div
                  key={item.id}
                  className={`calendar-span-item${item.start.slice(0, 10) < dates[0] ? " continues-before" : ""}${item.end > calendarStamp(calendarMinute(dates.at(-1)! + "T00:00") + 1440) ? " continues-after" : ""}`}
                  style={{
                    gridColumn: `${item.first + 1} / ${item.last + 2}`,
                    gridRow: item.row + 1,
                  }}
                >
                  <CalendarEventButton
                    event={item.event!}
                    spanStart={dates[item.first]}
                    spanDays={item.last - item.first + 1}
                    onOpen={() => onOpen(item.event!)}
                  />
                </div>
              ))}
            </div>
          </div>
          <div className="calendar-hours">
            {Array.from({ length: 24 }, (_, hour) => (
              <span
                key={hour}
                style={{ top: `calc(${hour} * var(--calendar-hour-height))` }}
              >
                {String(hour).padStart(2, "0")}:00
              </span>
            ))}
          </div>
          {dates.map((date) => (
            <CalendarDrop
              key={date}
              date={date}
              timed
              className="calendar-time-column"
            >
              {date === localNow.slice(0, 10) && (
                <span
                  className="calendar-now-line"
                  style={{
                    top: `calc(${minute / 60} * var(--calendar-hour-height))`,
                  }}
                />
              )}
              {Array.from({ length: 48 }, (_, slot) => (
                <button
                  type="button"
                  key={slot}
                  className="calendar-time-slot"
                  data-calendar-time={`${String(Math.floor(slot / 2)).padStart(2, "0")}:${slot % 2 ? "30" : "00"}`}
                  aria-label={`${date} ${String(Math.floor(slot / 2)).padStart(2, "0")}:${slot % 2 ? "30" : "00"} 新建日程`}
                  style={{
                    top: `calc(${slot / 2} * var(--calendar-hour-height))`,
                  }}
                  onClick={() =>
                    onCreate(
                      date,
                      `${String(Math.floor(slot / 2)).padStart(2, "0")}:${slot % 2 ? "30" : "00"}`,
                    )
                  }
                />
              ))}
              {eventColumns(
                [...events.filter((e) => !e.allDay), ...todoSlots],
                date,
              ).map(({ event, start, end, column, count }) => (
                <div
                  key={event.id}
                  className="calendar-timed-wrap"
                  style={{
                    top: `calc(${start / 60} * var(--calendar-hour-height))`,
                    height: `max(${timedTodos.has(event.id) ? 48 : 18}px, calc(${(end - start) / 60} * var(--calendar-hour-height)))`,
                    left: `${(column / count) * 100}%`,
                    width: `${100 / count}%`,
                  }}
                >
                  {timedTodos.has(event.id) ? (
                    reminder(timedTodos.get(event.id)!)
                  ) : (
                    <>
                      <CalendarEventButton
                        event={event}
                        onOpen={() => onOpen(event)}
                      />
                      {event.start.slice(0, 10) === date && (
                        <CalendarEventButton
                          event={event}
                          resize="start"
                          onOpen={() => onOpen(event)}
                        />
                      )}
                      {event.end <= `${date}T23:59` ||
                      event.end ===
                        `${calendarStamp(calendarMinute(`${date}T00:00`) + 1440)}` ? (
                        <CalendarEventButton
                          event={event}
                          resize
                          onOpen={() => onOpen(event)}
                        />
                      ) : null}
                    </>
                  )}
                </div>
              ))}
            </CalendarDrop>
          ))}
        </div>
      </div>
    </>
  );
}
