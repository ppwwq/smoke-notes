import {
  useCalendarContext,
  type CalendarContextTarget,
} from "./useCalendarContext";
import { WebDialog } from "./glass/WebDialog";
import { CalendarPreferences } from "./CalendarPreferences";
import { CalendarMonth } from "./CalendarMonth";
import {
  useEffect,
  useMemo,
  useState,
  useRef,
  type ReactNode,
  lazy,
  Suspense,
} from "react";
import {
  DndContext,
  DragOverlay,
  pointerWithin,
  rectIntersection,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { DayPicker, type WeekNumberProps } from "@daypicker/react";
import { zhCN } from "@daypicker/react/locale";
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  Search,
  X,
  List,
  SlidersHorizontal,
  Upload,
} from "lucide-react";
import {
  addTodoDays,
  calendarMinute,
  calendarStamp,
  getTodoDate,
  getTodoRule,
  getTodoStatus,
  plannerTodoValue,
  projectTodoRange,
  projectCalendarEvents,
  plannerTypeVisible,
  convertCalendarTime,
  calendarWallTime,
  type CalendarEvent,
  type CalendarImportResult,
  type CalendarEventInput,
  type CalendarOccurrence,
  type Todo,
} from "@smoke-notes/core";
import {
  calendarDate,
  calendarDay,
  calendarRange,
  calendarWeekNumber,
} from "./calendar-dates";
import { WorkspaceSelect } from "./WorkspaceSelect";
import { SegmentedControl } from "./SegmentedControl";
import { CalendarEventEditor } from "./CalendarEventEditor";
import { CalendarTodoEditor } from "./CalendarTodoEditor";
import type { PlannerTypeActions } from "./PlannerTypeField";
import { CalendarTimeline } from "./CalendarCanvas";
import "@daypicker/react/style.css";
import "./calendar-todo-view.css";
import "./calendar-studio.css";

const CalendarImportDialog = lazy(() =>
  import("./CalendarImportDialog").then((module) => ({
    default: module.CalendarImportDialog,
  })),
);

export interface CalendarEventActions extends PlannerTypeActions {
  onEditorOpenChange?(open: boolean): void;
  events?: CalendarEvent[];
  onImportPlan?(text: string, timeZone: string): Promise<CalendarImportResult>;
  onSaveEvent?(
    input: CalendarEventInput,
    id?: string,
    occurrenceDate?: string,
    following?: boolean,
  ): Promise<void>;
  onDeleteEvent?(
    id: string,
    occurrenceDate?: string,
    following?: boolean,
  ): Promise<void>;
  onUndoEvent?(): Promise<void>;
  canUndoEvent?: boolean;
}
function MiniWeekNumber({ week, ...props }: WeekNumberProps) {
  const thursday =
    week.days.find((day) => day.date.getDay() === 4) ?? week.days[0];
  const number = calendarWeekNumber(calendarDate(thursday.date));
  return (
    <th {...props} aria-label={`${number.year}年第${number.week}周`}>
      {number.week}
    </th>
  );
}
function projectReminders(
  records: Todo[],
  from: string,
  to: string,
  today: string,
) {
  const result: Todo[] = [];
  for (let start = from; start <= to; start = addTodoDays(start, 60)) {
    const end = addTodoDays(start, 59);
    result.push(
      ...projectTodoRange(records, start, end < to ? end : to, today),
    );
  }
  return result.filter((todo) => getTodoStatus(todo) !== "skipped");
}
type Scale = "day" | "week" | "month" | "year";
export function CalendarTodoView({
  month,
  date,
  today,
  todos: suppliedTodos,
  todoRecords,
  selectedTodos,
  onMonthChange,
  onDateChange,
  onCreate,
  children,
  events = [],
  onSaveEvent,
  onImportPlan,
  onDeleteEvent,
  onUndoEvent,
  canUndoEvent,
  types = [],
  todoTypeIds,
  todoTimes,
  preferences,
  onSavePreferences,
  onToggleTodo,
  busyTodoIds,
  onSaveType,
  onDeleteType,
  onSavePlannerTodo,
  onMovePlannerTodo,
  onEditorOpenChange,
}: CalendarEventActions & {
  onToggleTodo?(todo: Todo): Promise<void>;
  busyTodoIds?: string[];
  month: string;
  date: string;
  today: string;
  todos: Todo[];
  todoRecords?: Todo[];
  selectedTodos: Todo[];
  onMonthChange(value: string): void;
  onDateChange(value: string): void;
  onCreate?(): void;
  children: ReactNode;
}) {
  const timeZone = preferences?.timeZone ?? "Asia/Hong_Kong";
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60000);
    return () => clearInterval(timer);
  }, []);
  const viewToday = calendarWallTime(now, timeZone).slice(0, 10);
  const [importOpen, setImportOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [hourHeight, setHourHeight] = useState(60);
  const [scale, setScale] = useState<Scale>("month");
  const [expandedFrom, setExpandedFrom] = useState<{
    scale: "month" | "week";
    date: string;
    month: string;
  } | null>(null);
  const [showList, setShowList] = useState(false);
  const [entryKind, setEntryKind] = useState<"all" | "events" | "todos">("all");
  const [dragPreview, setDragPreview] = useState<{
    title: string;
    color: string;
    width: number;
    height: number;
  } | null>(null);
  const landedTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  useEffect(() => () => clearTimeout(landedTimer.current), []);
  function landed(target: string) {
    clearTimeout(landedTimer.current);
    root.current?.setAttribute("data-calendar-landed", target);
    root.current
      ?.querySelectorAll(".calendar-drop-landed")
      .forEach((el) => el.classList.remove("calendar-drop-landed"));
    root.current
      ?.querySelectorAll(`[data-calendar-date="${target}"]`)
      .forEach((el) => el.classList.add("calendar-drop-landed"));
    landedTimer.current = setTimeout(
      () =>
        root.current
          ?.querySelectorAll(".calendar-drop-landed")
          .forEach((el) => el.classList.remove("calendar-drop-landed")),
      500,
    );
  }
  const [query, setQuery] = useState("");
  const [todoEditor, setTodoEditor] = useState<Todo | null>(null);
  const typeActions = {
    types,
    todoTypeIds,
    todoTimes,
    preferences,
    onSavePreferences,
    onSaveType,
    onDeleteType,
    onSavePlannerTodo,
  };
  function todoColor(todo: Todo) {
    const typeId = Object.hasOwn(todoTypeIds ?? {}, todo.id)
      ? todoTypeIds?.[todo.id]
      : todoTypeIds?.[todo.planning?.seriesId ?? ""];
    return types.find((type) => type.id === typeId)?.color ?? "purple";
  }
  const coloredEvents = useMemo(
    () =>
      (entryKind === "todos" ? [] : events).map((event) => ({
        ...event,
        color: types.find((t) => t.id === event.typeId)?.color ?? event.color,
        exceptions: Object.fromEntries(
          Object.entries(event.exceptions).map(([day, value]) => [
            day,
            value
              ? {
                  ...value,
                  color:
                    types.find((t) => t.id === value.typeId)?.color ??
                    value.color,
                }
              : null,
          ]),
        ),
      })),
    [events, types, entryKind],
  );
  const [editor, setEditor] = useState<{
    date: string;
    time?: string;
    occurrence?: CalendarOccurrence;
    initialKind?: "event" | "todo";
    initialInput?: CalendarEventInput;
  } | null>(null);
  const editorOpen = !!editor || !!todoEditor;
  useEffect(() => {
    onEditorOpenChange?.(editorOpen);
    return () => onEditorOpenChange?.(false);
  }, [editorOpen, onEditorOpenChange]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const dragSpanOffset = useRef(0);
  const dragTimeOffset = useRef(0);
  const root = useRef<HTMLDivElement>(null);
  const [context, setContext] = useState<CalendarContextTarget | null>(null);
  const [clipboard, setClipboard] = useState<CalendarEventInput | null>(null);
  const [notice, setNotice] = useState("");
  useCalendarContext(root, setContext);
  const current = calendarDay(month),
    year = current.getFullYear(),
    monthIndex = current.getMonth();
  const weekStartsOn = preferences?.weekStartsOn ?? 1;
  const { from, to, weeks } = calendarRange(month, weekStartsOn);
  const weekStart = addTodoDays(
    date,
    -((calendarDay(date).getDay() - weekStartsOn + 7) % 7),
  );
  const rangeFrom = showList
    ? date
    : scale === "year"
      ? `${year}-01-01`
      : scale === "week"
        ? weekStart
        : scale === "day"
          ? date
          : from;
  const rangeTo = showList
    ? addTodoDays(date, 365)
    : scale === "year"
      ? `${year}-12-31`
      : scale === "week"
        ? addTodoDays(weekStart, 6)
        : scale === "day"
          ? date
          : to;
  const todos = useMemo(
    () =>
      entryKind === "events"
        ? []
        : (todoRecords
            ? projectReminders(todoRecords, rangeFrom, rangeTo, today)
            : suppliedTodos
          ).filter(
            (todo) =>
              getTodoStatus(todo) !== "skipped" &&
              plannerTypeVisible(
                plannerTodoValue(todoTypeIds, todo),
                preferences,
              ),
          ),
    [
      entryKind,
      todoRecords,
      suppliedTodos,
      rangeFrom,
      rangeTo,
      today,
      todoTypeIds,
      preferences,
    ],
  );
  const occurrences = useMemo(
    () =>
      projectCalendarEvents(coloredEvents, rangeFrom, rangeTo, timeZone).filter(
        (event) => plannerTypeVisible(event.typeId, preferences),
      ),
    [coloredEvents, rangeFrom, rangeTo, preferences, timeZone],
  );
  const agenda = useMemo(
    () =>
      projectCalendarEvents(coloredEvents, date, date, timeZone).filter(
        (event) => plannerTypeVisible(event.typeId, preferences),
      ),
    [coloredEvents, date, preferences, timeZone],
  );
  // Recurrence is expanded in a bounded, clearly displayed interval, including exceptions.
  const searchYear = Number(
    query.match(/\b(19\d{2}|20\d{2}|2100)\b/)?.[0] ?? year,
  );
  const searchFrom = `${Math.max(1900, searchYear - 1)}-01-01`;
  const searchTo = `${Math.min(2100, searchYear + 1)}-12-31`;
  const matches = useMemo(() => {
    if (!query.trim()) return [];
    const q = query.trim().toLocaleLowerCase();
    const projected = Array.from(
      {
        length:
          Number(searchTo.slice(0, 4)) - Number(searchFrom.slice(0, 4)) + 1,
      },
      (_, index) => {
        const y = Number(searchFrom.slice(0, 4)) + index;
        return projectCalendarEvents(
          coloredEvents,
          `${y}-01-01`,
          `${y}-12-31`,
          timeZone,
        );
      },
    ).flat();
    // Keep saved historical/future one-offs and exceptions searchable outside the recurrence window.
    for (const event of coloredEvents) {
      for (const day of new Set([
        event.start.slice(0, 10),
        ...Object.values(event.exceptions).flatMap((value) =>
          value ? [value.start.slice(0, 10)] : [],
        ),
      ])) {
        if (day < searchFrom || day > searchTo)
          projected.push(...projectCalendarEvents([event], day, day, timeZone));
      }
    }
    return [...new Map(projected.map((event) => [event.id, event])).values()]
      .sort((a, b) => a.start.localeCompare(b.start))
      .filter((event) => plannerTypeVisible(event.typeId, preferences))
      .filter((event) =>
        `${event.title} ${event.location} ${event.notes} ${event.start} ${types.find((type) => type.id === event.typeId)?.name ?? ""}`
          .toLocaleLowerCase()
          .includes(q),
      );
  }, [
    coloredEvents,
    query,
    searchFrom,
    searchTo,
    preferences,
    types,
    timeZone,
  ]);
  const todoMatches = useMemo(() => {
    if (!query.trim() || entryKind === "events") return [];
    const q = query.trim().toLocaleLowerCase();
    return (
      todoRecords
        ? projectReminders(todoRecords, searchFrom, searchTo, today)
        : suppliedTodos
    )
      .filter(
        (todo) =>
          getTodoStatus(todo) !== "skipped" &&
          plannerTypeVisible(plannerTodoValue(todoTypeIds, todo), preferences),
      )
      .filter((todo) =>
        `${todo.text} ${todo.planning?.notes ?? ""} ${getTodoDate(todo)} ${types.find((type) => type.id === plannerTodoValue(todoTypeIds, todo))?.name ?? ""}`
          .toLocaleLowerCase()
          .includes(q),
      );
  }, [
    query,
    entryKind,
    todoRecords,
    suppliedTodos,
    searchFrom,
    searchTo,
    today,
    todoTypeIds,
    preferences,
    types,
  ]);
  const sensors = useSensors(
    useSensor(MouseSensor, {
      activationConstraint: { delay: 250, tolerance: 8 },
    }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 300, tolerance: 8 },
    }),
  );
  function select(next: string) {
    onDateChange(next);
    if (next.slice(0, 7) !== month.slice(0, 7))
      onMonthChange(`${next.slice(0, 7)}-01`);
  }
  function navigate(delta: number) {
    select(addTodoDays(date, delta));
  }
  async function move(event: DragEndEvent) {
    const data = event.active.data.current,
      drop = event.over?.data.current;
    if (
      data?.todo &&
      drop?.date &&
      onMovePlannerTodo &&
      !pending.current &&
      !context
    ) {
      if (event.delta.x === 0 && event.delta.y === 0) return;
      let time: string | null | undefined;
      if (drop.timed) {
        const top =
          event.active.rect.current.translated?.top ?? event.over!.rect.top;
        const minute = Math.max(
          0,
          Math.min(
            1425,
            Math.round(
              (top - dragTimeOffset.current - event.over!.rect.top) /
                (event.over!.rect.height / 1440) /
                15,
            ) * 15,
          ),
        );
        time = `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;
      } else if (drop.allDay) time = null;
      pending.current = true;
      setBusy(true);
      setError("");
      try {
        await onMovePlannerTodo(data.todo as Todo, drop.date, time);
        select(drop.date);
        landed(drop.date);
        setNotice(
          `已将“${(data.todo as Todo).text}”移至 ${drop.date}${time ? ` ${time}` : ""}${(data.todo as Todo).planning?.kind === "occurrence" ? "，仅调整这一次" : ""}。`,
        );
      } catch {
        setError("改期失败，原待办已保留，请重试。");
      } finally {
        pending.current = false;
        setBusy(false);
      }
      return;
    }
    if (event.delta.x === 0 && event.delta.y === 0) return;
    if (
      !data?.event ||
      !drop?.date ||
      !onSaveEvent ||
      pending.current ||
      context
    )
      return;
    const occurrence = data.event as CalendarOccurrence,
      target = drop.date as string;
    let targetStart = target;
    if (!drop.timed && data.spanStart && data.spanDays) {
      targetStart = addTodoDays(target, -dragSpanOffset.current);
    }
    let start = targetStart + occurrence.start.slice(10),
      end: string;
    if (drop.timed) {
      const top =
        (data.resize && data.resize !== "start"
          ? event.active.rect.current.translated?.bottom
          : event.active.rect.current.translated?.top) ?? event.over!.rect.top;
      const minutes = Math.max(
        0,
        Math.min(
          1440,
          Math.round(
            (top - event.over!.rect.top) /
              (event.over!.rect.height / 1440) /
              15,
          ) * 15,
        ),
      );
      const at = calendarMinute(`${target}T00:00`) + minutes;
      if (data.resize === "start") {
        end = occurrence.end;
        start = calendarStamp(Math.min(calendarMinute(end) - 15, at));
      } else if (data.resize) {
        start = occurrence.start;
        end = calendarStamp(Math.max(calendarMinute(start) + 15, at));
      } else {
        start = calendarStamp(at);
        end = calendarStamp(
          at +
            (occurrence.allDay
              ? 60
              : calendarMinute(occurrence.end) -
                calendarMinute(occurrence.start)),
        );
      }
    } else {
      if (data.resize) return;
      if (drop.allDay) {
        start = `${targetStart}T00:00`;
        end = `${addTodoDays(targetStart, Math.max(1, Math.ceil((calendarMinute(occurrence.end) - calendarMinute(occurrence.start)) / 1440)))}T00:00`;
      } else
        end = calendarStamp(
          calendarMinute(start) +
            calendarMinute(occurrence.end) -
            calendarMinute(occurrence.start),
        );
    }
    pending.current = true;
    setBusy(true);
    setError("");
    try {
      await onSaveEvent(
        {
          ...occurrence,
          start:
            !drop.allDay && !occurrence.allDay
              ? convertCalendarTime(
                  start,
                  timeZone,
                  occurrence.source?.timeZone ?? "Asia/Hong_Kong",
                )
              : start,
          end:
            !drop.allDay && !occurrence.allDay
              ? convertCalendarTime(
                  end,
                  timeZone,
                  occurrence.source?.timeZone ?? "Asia/Hong_Kong",
                )
              : end,
          timeZone:
            !drop.allDay && !occurrence.allDay
              ? (occurrence.source?.timeZone ?? "Asia/Hong_Kong")
              : timeZone,
          allDay: drop.timed ? false : drop.allDay ? true : occurrence.allDay,
        },
        occurrence.eventId,
        occurrence.recurring ? occurrence.occurrenceDate : undefined,
      );
      select(target);
      landed(target);
      setNotice(`已将“${occurrence.title}”移至 ${target}。`);
    } catch {
      setError("改期失败，原日程已保留，请重试。");
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  function expandDay(next: string) {
    if (scale === "week" || scale === "month")
      setExpandedFrom({ scale, date, month });
    select(next);
    setScale("day");
  }
  const open = (occurrence: CalendarOccurrence) =>
    setEditor({ date: occurrence.start.slice(0, 10), occurrence });
  const create = (next: string, time?: string) =>
    setEditor({ date: next, time });
  const contextEvent = context?.eventId
    ? [...occurrences, ...agenda, ...matches].find(
        (event) => event.id === context.eventId,
      )
    : undefined;
  function paste() {
    if (!clipboard || !context?.date) return;
    const source = clipboard.allDay
      ? clipboard
      : {
          ...clipboard,
          start: convertCalendarTime(
            clipboard.start,
            clipboard.timeZone ?? timeZone,
            timeZone,
          ),
          end: convertCalendarTime(
            clipboard.end,
            clipboard.timeZone ?? timeZone,
            timeZone,
          ),
          timeZone,
        };
    const start = `${context.date}T${source.allDay ? "00:00" : (context.time ?? source.start.slice(11))}`;
    const initialInput = {
      ...source,
      start,
      end: calendarStamp(
        calendarMinute(start) +
          calendarMinute(source.end) -
          calendarMinute(source.start),
      ),
      repeat: undefined,
    };
    setEditor({ date: context.date, initialInput });
    setContext(null);
  }
  const fullDate = new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "long",
  }).format(calendarDay(date));
  return (
    <div
      ref={root}
      className={`calendar-studio scale-${scale}`}
      aria-busy={busy}
    >
      <div className="calendar-studio-top">
        <SegmentedControl<Scale>
          label="日历显示方式"
          value={scale}
          onChange={(next) => {
            setShowList(false);
            setScale(next);
            setExpandedFrom(null);
            onMonthChange(`${date.slice(0, 7)}-01`);
          }}
          options={[
            { value: "day", label: "日" },
            { value: "week", label: "周" },
            { value: "month", label: "月" },
            { value: "year", label: "年" },
          ]}
        />
        <button
          type="button"
          className="calendar-list-toggle"
          aria-label="日程列表"
          aria-pressed={showList}
          onClick={() => setShowList(!showList)}
        >
          <List size={20} />
        </button>
        {onSavePreferences && (
          <button
            type="button"
            className="calendar-list-toggle"
            aria-label="日历显示与默认设置"
            aria-pressed={settingsOpen}
            onClick={() => setSettingsOpen(true)}
          >
            <SlidersHorizontal size={20} />
          </button>
        )}
        {onImportPlan && (
          <button
            type="button"
            className="calendar-list-toggle"
            aria-label="导入日程规划"
            onClick={() => setImportOpen(true)}
          >
            <Upload size={20} />
          </button>
        )}
        <label className="calendar-search">
          <Search size={17} />
          <input
            type="search"
            aria-label="搜索日历"
            placeholder="搜索日程与待办"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {query && (
            <button aria-label="清除日历搜索" onClick={() => setQuery("")}>
              <X size={16} />
            </button>
          )}
        </label>
        <div className="calendar-entry-filter">
          <WorkspaceSelect<"all" | "events" | "todos">
            label="显示安排"
            value={entryKind}
            onChange={setEntryKind}
            options={[
              { value: "all", label: "全部安排" },
              { value: "events", label: "只看日程" },
              { value: "todos", label: "只看待办" },
            ]}
          />
        </div>
      </div>
      <div className="calendar-month-toolbar">
        <div className="calendar-month-selects">
          <WorkspaceSelect<number>
            label="日历年份"
            value={year}
            options={Array.from({ length: 201 }, (_, i) => ({
              value: 1900 + i,
              label: `${1900 + i}年`,
            }))}
            onChange={(next) => {
              const value = calendarDate(new Date(next, monthIndex, 1, 12));
              onMonthChange(value);
              onDateChange(value);
            }}
          />
          {scale !== "year" && (
            <WorkspaceSelect<number>
              label="日历月份"
              value={monthIndex}
              options={Array.from({ length: 12 }, (_, i) => ({
                value: i,
                label: `${i + 1}月`,
              }))}
              onChange={(next) => {
                const value = calendarDate(new Date(year, next, 1, 12));
                onMonthChange(value);
                onDateChange(value);
              }}
            />
          )}
        </div>
        <div className="calendar-month-controls">
          <button
            aria-label="前一天"
            title="前一天"
            disabled={date <= "1900-01-01"}
            onClick={() => navigate(-1)}
          >
            <ChevronLeft size={18} />
          </button>
          <button
            onClick={() => {
              onMonthChange(`${viewToday.slice(0, 7)}-01`);
              onDateChange(viewToday);
            }}
          >
            今天
          </button>
          <button
            aria-label="后一天"
            title="后一天"
            disabled={date >= "2100-12-31"}
            onClick={() => navigate(1)}
          >
            <ChevronRight size={18} />
          </button>
        </div>
      </div>
      {error && <p role="alert">{error}</p>}
      {canUndoEvent && (
        <button
          className="calendar-undo"
          onClick={() =>
            void onUndoEvent?.().catch(() => setError("撤销失败，请重试。"))
          }
        >
          撤销删除日程
        </button>
      )}
      {query.trim() ? (
        <section className="calendar-search-results" aria-label="日历搜索结果">
          <p>
            {matches.length + todoMatches.length} 个匹配安排 · 重复实例范围{" "}
            {searchFrom} 至 {searchTo}
            {matches.length > 300
              ? " · 显示前 300 项，请缩小关键词或输入日期"
              : ""}
          </p>
          {matches.slice(0, 300).map((event) => (
            <button
              key={event.id}
              onClick={() => {
                setQuery("");
                select(event.start.slice(0, 10));
                open(event);
              }}
            >
              <strong>{event.title}</strong>
              <span>
                {event.start.slice(0, 10)} ·{" "}
                {event.allDay ? "全天" : event.start.slice(11)}
                {event.repeat ? " · 重复日程" : ""}
              </span>
            </button>
          ))}
          {todoMatches.slice(0, 300).map((todo) => (
            <button
              key={todo.id}
              onClick={() => {
                setQuery("");
                select(getTodoDate(todo));
                setTodoEditor(todo);
              }}
            >
              <strong>{todo.text}</strong>
              <span>
                {getTodoDate(todo)} · 待办
                {plannerTodoValue(todoTimes, todo)
                  ? ` · ${plannerTodoValue(todoTimes, todo)}`
                  : ""}
              </span>
            </button>
          ))}
          {!matches.length && !todoMatches.length && (
            <p>
              这段时间没有找到安排，试试名称、地点、标签或日期（如
              2028-03-15）。
            </p>
          )}
        </section>
      ) : showList ? (
        <section className="calendar-upcoming" aria-label="即将到来的日程">
          <p>
            {rangeFrom} 至 {rangeTo} · {occurrences.length} 项日程 ·{" "}
            {todos.length} 项待办
          </p>
          {!occurrences.length && !todos.length && (
            <p>这段时间还没有安排，点击右上角添加。</p>
          )}
          {[
            ...new Set([
              ...occurrences.map((e) => e.start.slice(0, 10)),
              ...todos.map(getTodoDate),
            ]),
          ]
            .sort()
            .map((day) => (
              <section key={day}>
                <h3>{day}</h3>
                {todos
                  .filter((todo) => getTodoDate(todo) === day)
                  .map((todo) => (
                    <button
                      key={todo.id}
                      className={`calendar-agenda-event event-${todoColor(todo)}`}
                      onClick={() => setTodoEditor(todo)}
                    >
                      <span>
                        {plannerTodoValue(todoTimes, todo) ?? "全天"} · 待办
                      </span>
                      <strong>{todo.text}</strong>
                    </button>
                  ))}
                {occurrences
                  .filter((e) => e.start.slice(0, 10) === day)
                  .map((event) => (
                    <button
                      key={event.id}
                      data-calendar-event={event.id}
                      className={`calendar-agenda-event event-${event.color}`}
                      onClick={() => open(event)}
                    >
                      <span>
                        {event.allDay
                          ? "全天"
                          : `${event.start.slice(11)}–${event.end.slice(11)}`}
                      </span>
                      <strong>{event.title}</strong>
                      {event.location && <small>{event.location}</small>}
                    </button>
                  ))}
              </section>
            ))}
        </section>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={(args) => {
            const hits = pointerWithin(args);
            return hits.length ? hits : rectIntersection(args);
          }}
          onDragStart={({ active, activatorEvent }) => {
            const data = active.data.current;
            if (!data || data.resize || pending.current) return;
            // Snapshot the pressed segment before the overlay mounts or the list scrolls.
            const rect =
              (activatorEvent.target instanceof Element
                ? activatorEvent.target
                    .closest("button")
                    ?.getBoundingClientRect()
                : undefined) ?? active.rect.current.initial;
            const timeBlock =
              activatorEvent.target instanceof Element
                ? activatorEvent.target
                    .closest(".calendar-timed-wrap")
                    ?.getBoundingClientRect()
                : undefined;
            dragTimeOffset.current =
              rect && timeBlock ? rect.top - timeBlock.top : 0;
            dragSpanOffset.current = 0;
            if (data.spanStart && data.spanDays && rect) {
              const x =
                "clientX" in activatorEvent
                  ? Number(activatorEvent.clientX)
                  : "touches" in activatorEvent
                    ? (activatorEvent as TouchEvent).touches[0]?.clientX
                    : undefined;
              const column =
                x === undefined
                  ? 0
                  : Math.max(
                      0,
                      Math.min(
                        data.spanDays - 1,
                        Math.floor(
                          ((x - rect.left) / rect.width) * data.spanDays,
                        ),
                      ),
                    );
              const grabbed = addTodoDays(data.spanStart, column);
              dragSpanOffset.current =
                (calendarMinute(grabbed + "T00:00") -
                  calendarMinute(data.event.start.slice(0, 10) + "T00:00")) /
                1440;
            }
            setDragPreview({
              title: data.todo?.text ?? data.event.title,
              color: data.color ?? data.event.color,
              width: rect?.width ?? 120,
              height: rect?.height ?? 26,
            });
          }}
          onDragCancel={() => setDragPreview(null)}
          onDragEnd={(event) => {
            setDragPreview(null);
            void move(event);
          }}
        >
          <div
            className={`calendar-planner-layout${scale !== "month" ? " calendar-wide" : ""}`}
          >
            <section className="calendar-month-panel" aria-label="待办月历">
              {scale === "month" && (
                <CalendarMonth
                  from={from}
                  weeks={weeks}
                  weekStartsOn={weekStartsOn}
                  showWeekNumbers={preferences?.showWeekNumbers}
                  density={preferences?.monthDensity}
                  date={date}
                  month={month}
                  today={viewToday}
                  events={occurrences}
                  todos={todos}
                  onSelect={select}
                  onCreate={create}
                  onOpen={open}
                  onOpenTodo={(todo) => {
                    select(getTodoDate(todo));
                    if (onSavePlannerTodo) setTodoEditor(todo);
                  }}
                  onExpand={expandDay}
                  todoColor={todoColor}
                />
              )}
              {scale === "year" && (
                <div className="calendar-year-grid">
                  {Array.from({ length: 12 }, (_, i) => {
                    const value = calendarDate(new Date(year, i, 1, 12));
                    return (
                      <section key={value} className="calendar-mini-month">
                        <button
                          className="calendar-mini-title"
                          onClick={() => {
                            onMonthChange(value);
                            onDateChange(value);
                            setScale("month");
                          }}
                        >
                          {i + 1}月
                        </button>
                        <DayPicker
                          locale={zhCN}
                          weekStartsOn={weekStartsOn}
                          showWeekNumber={preferences?.showWeekNumbers}
                          components={{ WeekNumber: MiniWeekNumber }}
                          month={calendarDay(value)}
                          hideNavigation
                          mode="single"
                          selected={calendarDay(date)}
                          today={calendarDay(viewToday)}
                          onSelect={(next) => {
                            if (next) {
                              select(calendarDate(next));
                              setScale("day");
                            }
                          }}
                          modifiers={{
                            hasEvent: (day) =>
                              todos.some(
                                (todo) =>
                                  getTodoDate(todo) === calendarDate(day),
                              ) ||
                              occurrences.some(
                                (e) =>
                                  e.start.slice(0, 10) <= calendarDate(day) &&
                                  e.end > `${calendarDate(day)}T00:00`,
                              ),
                          }}
                          modifiersClassNames={{ hasEvent: "mini-has-event" }}
                        />
                      </section>
                    );
                  })}
                </div>
              )}
              {(scale === "day" || scale === "week") && (
                <>
                  {expandedFrom && scale === "day" && (
                    <button
                      type="button"
                      className="calendar-return-view"
                      onClick={() => {
                        onMonthChange(expandedFrom.month);
                        onDateChange(expandedFrom.date);
                        setScale(expandedFrom.scale);
                        setExpandedFrom(null);
                      }}
                    >
                      <ChevronLeft size={16} />
                      返回{expandedFrom.scale === "week" ? "周" : "月"}视图
                    </button>
                  )}
                  <CalendarTimeline
                    showWeekNumbers={preferences?.showWeekNumbers}
                    hourHeight={hourHeight}
                    onHourHeightChange={setHourHeight}
                    dates={
                      scale === "day"
                        ? [date]
                        : Array.from({ length: 7 }, (_, i) =>
                            addTodoDays(weekStart, i),
                          )
                    }
                    events={occurrences}
                    todos={todos}
                    todoTimes={todoTimes}
                    todoColor={todoColor}
                    onOpenTodo={(todo) => setTodoEditor(todo)}
                    onToggleTodo={onToggleTodo}
                    busyTodoIds={busyTodoIds}
                    onOpen={open}
                    onCreate={create}
                    onSelect={expandDay}
                    today={viewToday}
                    timeZone={timeZone}
                  />
                </>
              )}
            </section>
            <section className="calendar-agenda" aria-label="选中日期的待办">
              <header className="calendar-agenda-heading">
                <time dateTime={date}>{fullDate}</time>
                <p>
                  {agenda.length} 项日程 ·{" "}
                  {entryKind === "events"
                    ? 0
                    : selectedTodos.filter(
                        (todo) => getTodoStatus(todo) !== "skipped",
                      ).length}{" "}
                  项待办
                </p>
                <div className="calendar-agenda-actions">
                  {onSaveEvent && (
                    <button
                      className="calendar-add"
                      onClick={() => create(date, "09:00")}
                    >
                      <Plus size={17} />
                      添加日程
                    </button>
                  )}
                  {onCreate && (
                    <button
                      className="calendar-add calendar-add-todo"
                      aria-label={`添加待办到${date}`}
                      onClick={() =>
                        onSavePlannerTodo && onSaveEvent
                          ? setEditor({
                              date,
                              time: "09:00",
                              initialKind: "todo",
                            })
                          : onCreate?.()
                      }
                    >
                      <Plus size={17} />
                      添加待办
                    </button>
                  )}
                </div>
              </header>
              <div className="calendar-agenda-events">
                {agenda.map((event) => (
                  <button
                    data-calendar-event={event.id}
                    className={`calendar-agenda-event event-${event.color}`}
                    key={event.id}
                    onClick={() => open(event)}
                  >
                    <span>
                      {event.allDay
                        ? "全天"
                        : `${event.start.slice(11)}–${event.end.slice(11)}`}
                    </span>
                    <strong>{event.title}</strong>
                    {event.location && <small>{event.location}</small>}
                  </button>
                ))}
              </div>
              {entryKind !== "events" && children}
            </section>
          </div>
          <DragOverlay dropAnimation={null} zIndex={90}>
            {dragPreview && (
              <div
                className={`calendar-drag-preview event-${dragPreview.color}`}
                style={{
                  width: dragPreview.width,
                  minHeight: Math.min(dragPreview.height, 96),
                }}
              >
                {dragPreview.title}
              </div>
            )}
          </DragOverlay>
        </DndContext>
      )}
      <p className="calendar-local-hint">
        日程保存在本机 · {timeZone} · 长按提起后拖动改期；长按日程后松开可复制
      </p>
      {notice && (
        <p role="status" className="calendar-local-hint">
          {notice}
        </p>
      )}
      {context && (
        <WebDialog
          web
          kind="actions"
          label="日历操作"
          onClose={() => setContext(null)}
        >
          <section className="calendar-context-actions">
            <header>
              <h2>{contextEvent?.title ?? context.date}</h2>
              <button
                type="button"
                aria-label="关闭日历操作"
                onClick={() => setContext(null)}
              >
                <X size={20} />
              </button>
            </header>
            {contextEvent ? (
              <>
                <button
                  type="button"
                  onClick={() => {
                    setContext(null);
                    open(contextEvent);
                  }}
                >
                  查看／编辑日程
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setClipboard({ ...contextEvent, repeat: undefined });
                    setContext(null);
                    setNotice("已复制这一次日程，长按目标日期即可粘贴。");
                  }}
                >
                  复制这次日程
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => {
                    create(context.date!, context.time);
                    setContext(null);
                  }}
                >
                  新建日程
                </button>
                {onSavePlannerTodo && (
                  <button
                    type="button"
                    onClick={() => {
                      setEditor({
                        date: context.date!,
                        time: context.time,
                        initialKind: "todo",
                      });
                      setContext(null);
                    }}
                  >
                    新建待办
                  </button>
                )}
                <button type="button" disabled={!clipboard} onClick={paste}>
                  粘贴日程{clipboard ? `：${clipboard.title}` : ""}
                </button>
              </>
            )}
          </section>
        </WebDialog>
      )}
      {importOpen && onImportPlan && (
        <Suspense fallback={<p role="status">正在打开导入…</p>}>
          <CalendarImportDialog
            date={date}
            timeZone={timeZone}
            onImport={onImportPlan}
            onClose={() => setImportOpen(false)}
          />
        </Suspense>
      )}
      {settingsOpen && (
        <CalendarPreferences
          {...typeActions}
          onClose={() => setSettingsOpen(false)}
        />
      )}
      {editor && onSaveEvent && (
        <CalendarEventEditor
          {...typeActions}
          key={editor.occurrence?.id ?? `${editor.date}:${editor.time}`}
          {...editor}
          source={events.find((e) => e.id === editor.occurrence?.eventId)}
          today={today}
          onClose={() => setEditor(null)}
          onSave={onSaveEvent}
          onDelete={onDeleteEvent}
        />
      )}
      {todoEditor && onSavePlannerTodo && (
        <CalendarTodoEditor
          {...typeActions}
          todo={todoEditor}
          seriesRepeat={
            getTodoRule(
              (todoRecords ?? []).find(
                (record) => record.id === todoEditor.planning?.seriesId,
              ) ?? todoEditor,
              todoEditor.planning?.date,
            )?.repeat
          }
          date={date}
          today={today}
          onClose={() => setTodoEditor(null)}
        />
      )}
    </div>
  );
}
