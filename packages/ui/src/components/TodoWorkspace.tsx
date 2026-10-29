import { plannerTodoValue, plannerTypeVisible } from "@smoke-notes/core";
import { calendarRange } from "./calendar-dates";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  RecordValidationError,
  TEXT_LIMITS,
  type Todo,
  type TodoRepeat,
  type TodoRuleChanges,
  type TodoStatus,
  addTodoDays,
  getTodoDay,
  getTodoDate,
  getTodoRule,
  getTodoStatus,
  projectTodoRange,
} from "@smoke-notes/core";
import { SlidersHorizontal, Repeat2, Sun, Plus } from "lucide-react";
import { RepeatFields, type RepeatChoice } from "./TodoRepeatFields";
import { SortableStack } from "./SortableStack";
import { RecordActions } from "./RecordActions";
import { SegmentedControl } from "./SegmentedControl";
import { PlannerDatePicker } from "./PlannerDatePicker";
import {
  CalendarTodoView,
  type CalendarEventActions,
} from "./CalendarTodoView";
import SpringCheck from "./spring-check/SpringCheck";
import { CalendarTodoEditor } from "./CalendarTodoEditor";

export type TodoFilter = "all" | "open" | "done";

interface TodoWorkspaceProps extends CalendarEventActions {
  web?: boolean;
  filter?: TodoFilter;
  onFilterChange?(filter: TodoFilter): void;
  todos: Todo[];
  today?: string;
  syncMessage?: string;
  series?: Todo[];
  onCreateRequest?(date?: string): void;
  deletedTodos?: Todo[];
  onPrepareTodo?(todo: Todo): Promise<void>;
  onCalendarDateChange?(date: string | null): void;
  showAllRequest?: number;
  onSetStatus?: (id: string, status: TodoStatus) => Promise<void>;
  onReschedule?: (id: string, date: string) => Promise<void>;
  onUpdateRule?: (id: string, changes: TodoRuleChanges) => Promise<void>;
  onPauseSeries?: (id: string, paused: boolean) => Promise<void>;
  onStopSeries?: (id: string) => Promise<void>;
  onToggle: (id: string) => Promise<void>;
  onUpdate: (id: string, text: string) => Promise<void>;
  onTrash: (id: string) => Promise<void>;
  onMove: (
    id: string,
    previous: number | null,
    next: number | null,
  ) => Promise<void>;
}

function TodoTextInput({
  todo,
  onUpdate,
}: Pick<TodoWorkspaceProps, "onUpdate"> & { todo: Todo }) {
  const [edit, setEdit] = useState<{
    base: string;
    text: string;
    revision: number;
  } | null>(null);
  const [error, setError] = useState("");
  const revision = useRef(0);
  const pending = useRef<Promise<void> | null>(null);
  const submitted = useRef<number | null>(null);
  return (
    <span className="todo-editable-label">
      <span className="todo-label-measure" aria-hidden="true">
        {edit?.text ?? todo.text}
      </span>
      <input
        aria-label={`编辑待办：${todo.text}`}
        maxLength={TEXT_LIMITS.todoText}
        value={edit?.text ?? todo.text}
        onChange={(event) => {
          const text = event.target.value;
          const nextRevision = ++revision.current;
          setEdit((current) => ({
            base: current?.base ?? todo.text,
            text,
            revision: nextRevision,
          }));
          setError("");
        }}
        onBlur={async () => {
          if (!edit || submitted.current === edit.revision) return;
          if (
            !pending.current &&
            (edit.text === edit.base || edit.text === todo.text)
          ) {
            setEdit(null);
            return;
          }
          submitted.current = edit.revision;
          // Preserve edit order, including returning to the original value while
          // an earlier write is pending. A failed write must not block a retry.
          const save = (pending.current ?? Promise.resolve())
            .catch(() => {})
            .then(() => onUpdate(todo.id, edit.text));
          pending.current = save;
          try {
            await save;
            setEdit((current) =>
              !current || current.revision === edit.revision
                ? null
                : { ...current, base: edit.text },
            );
            if (submitted.current === edit.revision) setError("");
          } catch (error) {
            if (submitted.current === edit.revision) {
              setError(
                error instanceof RecordValidationError
                  ? error.message
                  : "保存失败，请重试",
              );
            }
          } finally {
            if (pending.current === save) pending.current = null;
            if (submitted.current === edit.revision) submitted.current = null;
          }
        }}
      />
      {error && <span role="alert">{error}</span>}
    </span>
  );
}

type TodoView = "today" | "all" | "calendar";
function repeatLabel(repeat?: TodoRepeat) {
  const weekdayLabels = ["日", "一", "二", "三", "四", "五", "六"];
  if (!repeat) return "一次性";
  if (repeat.kind === "daily") return "每天";
  if (repeat.kind === "weekdays") return "工作日";
  return `每周${(repeat.weekdays ?? []).map((day) => weekdayLabels[day]).join("、")}`;
}

function SeriesEditor({
  series,
  onSave,
}: {
  series: Todo;
  onSave(id: string, changes: TodoRuleChanges): Promise<void>;
}) {
  const rule = getTodoRule(series);
  const [draft, setDraft] = useState<{
    text: string;
    notes: string;
    repeat: RepeatChoice;
    days: number[];
  } | null>(null);
  const fields = draft ?? {
    text: rule?.text ?? series.text,
    notes: rule?.notes ?? "",
    repeat: rule?.repeat.kind ?? "daily",
    days: rule?.repeat.weekdays ?? [1, 2, 3, 4, 5],
  };
  const { text, notes, repeat, days } = fields;
  const revision = useRef(0);
  function edit(changes: Partial<typeof fields>) {
    revision.current += 1;
    setDraft((current) => ({ ...(current ?? fields), ...changes }));
  }
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const pending = useRef(false);
  return (
    <form
      className="planner-fields"
      onSubmit={async (event) => {
        event.preventDefault();
        if (pending.current) return;
        if (!text.trim()) {
          setMessage("请填写待办名称。");
          return;
        }
        if (repeat === "weekly" && !days.length) {
          setMessage("请至少选择一个星期。");
          return;
        }
        const savedRevision = revision.current;
        pending.current = true;
        setBusy(true);
        setMessage("");
        try {
          await onSave(series.id, {
            text,
            notes,
            repeat: {
              kind: repeat === "once" ? "daily" : repeat,
              ...(repeat === "weekly" ? { weekdays: days } : {}),
            },
          });
          if (revision.current === savedRevision) setDraft(null);
          setMessage("已保存，从明天起生效。过去的记录保持不变。");
        } catch {
          setMessage("保存失败，请重试。修改仍然保留。");
        } finally {
          pending.current = false;
          setBusy(false);
        }
      }}
    >
      <label>
        名称
        <input
          aria-label={`重复事项名称：${series.text}`}
          maxLength={TEXT_LIMITS.todoText}
          value={text}
          onChange={(event) => edit({ text: event.target.value })}
        />
      </label>
      <RepeatFields
        value={repeat}
        days={days}
        onChange={(value) => {
          if (value !== "once") edit({ repeat: value });
        }}
        onDaysChange={(days) => edit({ days })}
        label={`重复规则：${series.text}`}
        allowOnce={false}
      />
      <label>
        备注
        <textarea
          aria-label={`重复事项备注：${series.text}`}
          value={notes}
          maxLength={4000}
          onChange={(event) => edit({ notes: event.target.value })}
        />
      </label>
      <p className="planner-help">
        修改从明天起生效，不会更改今天及过去的记录。
      </p>
      <button className="planner-save" type="submit" disabled={busy}>
        {busy ? "正在保存…" : "保存规则"}
      </button>
      {message && <p role="status">{message}</p>}
    </form>
  );
}

export function TodoWorkspace(props: TodoWorkspaceProps) {
  const [editingTodo, setEditingTodo] = useState<Todo | null>(null);
  const today = props.today ?? getTodoDay();
  const [view, setView] = useState<TodoView>(
    props.showAllRequest ? "all" : "today",
  );
  const [selectedDate, setSelectedDate] = useState(today);
  const [calendarMonth, setCalendarMonth] = useState(`${today.slice(0, 7)}-01`);
  const calendarRecords = useMemo(
    () => [
      ...props.todos,
      ...(props.series ?? []),
      ...(props.deletedTodos ?? []),
    ],
    [props.todos, props.series, props.deletedTodos],
  );
  const visibleCalendarRecords = useMemo(() => {
    if (props.preferences?.showReminders === false) return [];
    return calendarRecords;
  }, [calendarRecords, props.preferences?.showReminders]);
  const calendarTodos = useMemo(() => {
    const { from, to } = calendarRange(
      calendarMonth,
      props.preferences?.weekStartsOn ?? 1,
    );
    const selectedFrom = addTodoDays(selectedDate, -6),
      selectedTo = addTodoDays(selectedDate, 6);
    return projectTodoRange(
      visibleCalendarRecords,
      from < selectedFrom ? from : selectedFrom,
      to > selectedTo ? to : selectedTo,
      today,
    ).filter(
      (todo) =>
        getTodoStatus(todo) !== "skipped" &&
        plannerTypeVisible(
          plannerTodoValue(props.todoTypeIds, todo),
          props.preferences,
        ),
    );
  }, [
    visibleCalendarRecords,
    calendarMonth,
    selectedDate,
    today,
    props.todoTypeIds,
    props.preferences,
  ]);
  const selectedTodos = useMemo(
    () =>
      projectTodoRange(
        visibleCalendarRecords,
        selectedDate,
        selectedDate,
        today,
      ).filter(
        (todo) =>
          getTodoStatus(todo) !== "skipped" &&
          plannerTypeVisible(
            plannerTodoValue(props.todoTypeIds, todo),
            props.preferences,
          ),
      ),
    [
      visibleCalendarRecords,
      selectedDate,
      today,
      props.todoTypeIds,
      props.preferences,
    ],
  );
  const { onCalendarDateChange } = props;
  useEffect(() => {
    onCalendarDateChange?.(view === "calendar" ? selectedDate : null);
  }, [view, selectedDate, onCalendarDateChange]);
  function prepareTodo(id: string) {
    const todo = [...selectedTodos, ...calendarTodos, ...props.todos].find(
      (item) => item.id === id,
    );
    if (
      todo?.planning?.kind === "occurrence" &&
      todo.planning.generated &&
      getTodoDate(todo) > today
    )
      return props.onPrepareTodo?.(todo);
  }

  const [arranging, setArranging] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [lastShowAllRequest, setLastShowAllRequest] = useState(
    props.showAllRequest,
  );
  const [actionError, setActionError] = useState("");
  const [errorId, setErrorId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState("");
  const pending = useRef(new Set<string>());
  const [busyIds, setBusyIds] = useState<string[]>([]);
  const [leaving, setLeaving] = useState<Todo[]>([]);
  const [undo, setUndo] = useState<{
    id: string;
    status: TodoStatus;
    text: string;
  } | null>(null);
  const timers = useRef(new Set<ReturnType<typeof setTimeout>>());
  useEffect(
    () => () => {
      for (const timer of timers.current) clearTimeout(timer);
    },
    [],
  );
  const [localFilter, setLocalFilter] = useState<TodoFilter>("all");
  if (props.showAllRequest !== lastShowAllRequest) {
    setLastShowAllRequest(props.showAllRequest);
    setView(props.showAllRequest ? "all" : "today");
    setLocalFilter("all");
  }
  const filter = props.filter ?? localFilter;
  // Legacy records keep their original Hong Kong date without a writeback.
  const todoDate = getTodoDate;
  const currentTodos = props.todos.filter((todo) => todoDate(todo) === today);
  const completed = currentTodos.filter(
    (todo) => getTodoStatus(todo) === "completed",
  ).length;
  const openToday = currentTodos.filter(
    (todo) => getTodoStatus(todo) === "open",
  ).length;
  const displayTodos = useMemo(() => {
    const moving = new Map(leaving.map((todo) => [todo.id, todo]));
    const combined = (view === "calendar" ? selectedTodos : props.todos).map(
      (todo) => moving.get(todo.id) ?? todo,
    );
    for (const todo of leaving)
      if (!combined.some((item) => item.id === todo.id)) combined.push(todo);
    return combined;
  }, [props.todos, leaving, view, selectedTodos]);
  const scoped = displayTodos.filter((todo) =>
    view === "calendar"
      ? todoDate(todo) === selectedDate
      : view === "today"
        ? todoDate(todo) === today
        : true,
  );
  const visible = scoped.filter(
    (todo) =>
      filter === "all" ||
      (filter === "done"
        ? getTodoStatus(todo) === "completed"
        : getTodoStatus(todo) === "open"),
  );
  const overdue = displayTodos.filter(
    (todo) =>
      todoDate(todo) < today &&
      todo.planning?.kind !== "occurrence" &&
      getTodoStatus(todo) === "open",
  );

  async function act(id: string, action: () => Promise<void>, message: string) {
    if (pending.current.has(id)) return false;
    pending.current.add(id);
    setBusyIds((current) => [...current, id]);
    setActionError("");
    try {
      const preparation = prepareTodo(id);
      if (preparation) await preparation;
      await action();
      setFeedback(message);
      return true;
    } catch (error) {
      setErrorId(id);
      setActionError(
        error instanceof RecordValidationError
          ? error.message
          : "更新失败，请重试。内容已保留。",
      );
      return false;
    } finally {
      pending.current.delete(id);
      setBusyIds((current) => current.filter((item) => item !== id));
    }
  }

  async function changeStatus(todo: Todo, status: TodoStatus) {
    if (pending.current.has(todo.id)) return;
    const previous = getTodoStatus(todo);
    const animate =
      previous === "open" &&
      status === "completed" &&
      !window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (animate)
      setLeaving((current) => [
        ...current.filter((item) => item.id !== todo.id),
        todo,
      ]);
    const success = await act(
      todo.id,
      () =>
        props.onSetStatus
          ? props.onSetStatus(todo.id, status)
          : props.onToggle(todo.id),
      status === "completed"
        ? "做得好，又完成一件。"
        : status === "skipped"
          ? "这次已跳过，记录已保留。"
          : "已放回待办清单。",
    );
    if (success) setUndo({ id: todo.id, status: previous, text: todo.text });
    if (animate) {
      if (!success)
        setLeaving((current) => current.filter((item) => item.id !== todo.id));
      else {
        const timer = setTimeout(() => {
          setLeaving((current) =>
            current.filter((item) => item.id !== todo.id),
          );
          timers.current.delete(timer);
        }, 320);
        timers.current.add(timer);
      }
    }
  }

  function renderTodo(todo: Todo, past = false) {
    const status = getTodoStatus(todo);
    const busy = busyIds.includes(todo.id);
    const recurring = todo.planning?.kind === "occurrence";
    const isLeaving = leaving.some((item) => item.id === todo.id);
    const typeId = Object.hasOwn(props.todoTypeIds ?? {}, todo.id)
      ? props.todoTypeIds?.[todo.id]
      : props.todoTypeIds?.[todo.planning?.seriesId ?? ""];
    const type = props.types?.find((t) => t.id === typeId);
    const time = plannerTodoValue(props.todoTimes, todo);
    return (
      <article
        className={`todo-row planner-todo-row${status === "completed" ? " completed" : ""}${isLeaving ? " is-completing" : ""}`}
      >
        <SpringCheck
          className="todo-spring-check"
          checked={status === "completed" || isLeaving}
          ariaLabel={`${status === "completed" ? "恢复" : "完成"}：${todo.text}`}
          disabled={busy || isLeaving}
          onChange={() =>
            void changeStatus(
              todo,
              status === "completed" ? "open" : "completed",
            )
          }
          editableLabel
          label={
            props.onSavePlannerTodo ? (
              <button
                type="button"
                className="planner-todo-open"
                aria-label={`编辑待办：${todo.text}`}
                onClick={() => setEditingTodo(todo)}
              >
                {todo.text}
              </button>
            ) : (
              <TodoTextInput
                todo={todo}
                onUpdate={async (id, text) => {
                  await prepareTodo(id);
                  await props.onUpdate(id, text);
                }}
              />
            )
          }
          color="var(--ink, #2f2b27)"
          fillColor="var(--ink, #2f2b27)"
          checkColor="var(--surface, #fbfaf8)"
          boxSize={24}
          boxRadius={8}
          fontSize={14}
          doneOpacity={0.58}
          bounce={0.2}
          strikeLag={0.12}
        />
        <div className="planner-todo-copy">
          <div className="planner-todo-meta">
            {time && <span>{time}</span>}
            {view === "all" && (
              <time dateTime={todoDate(todo)}>
                {todoDate(todo) === today ? "今天" : todoDate(todo)}
              </time>
            )}
            {recurring && <span>重复事项</span>}
            {type && (
              <span className={`planner-type-badge event-${type.color}`}>
                {type.name}
              </span>
            )}
            {status === "skipped" && <span>已跳过</span>}
          </div>
          {todo.planning?.notes && (
            <p className="planner-todo-note">{todo.planning.notes}</p>
          )}
        </div>
        <RecordActions
          name={todo.text}
          kind="待办"
          onRename={
            props.onSavePlannerTodo ? () => setEditingTodo(todo) : undefined
          }
          renameLabel="编辑待办"
          onTrash={async () => {
            await prepareTodo(todo.id);
            await props.onTrash(todo.id);
          }}
        >
          {errorId === todo.id && actionError && (
            <p className="action-error" role="alert">
              {actionError}
            </p>
          )}
          {!past &&
            (props.onReschedule || (recurring && props.onSetStatus)) && (
              <section className="planner-row-options" aria-label="安排待办">
                <div className="planner-row-options-content">
                  {recurring
                    ? props.onSetStatus && (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() =>
                            void changeStatus(
                              todo,
                              status === "skipped" ? "open" : "skipped",
                            )
                          }
                        >
                          {status === "skipped" ? "恢复这一次" : "跳过这一次"}
                        </button>
                      )
                    : props.onReschedule && (
                        <>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() =>
                              void act(
                                todo.id,
                                () => props.onReschedule!(todo.id, today),
                                "已移到今天。",
                              )
                            }
                          >
                            移到今天
                          </button>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() =>
                              void act(
                                todo.id,
                                () =>
                                  props.onReschedule!(
                                    todo.id,
                                    addTodoDays(today, 1),
                                  ),
                                "已移到明天。",
                              )
                            }
                          >
                            移到明天
                          </button>
                          <label>
                            指定日期
                            <PlannerDatePicker
                              label={`安排日期：${todo.text}`}
                              today={today}
                              value={todoDate(todo)}
                              disabled={busy}
                              onChange={(next) => {
                                if (next)
                                  void act(
                                    todo.id,
                                    () => props.onReschedule!(todo.id, next),
                                    "日期已更新。",
                                  );
                              }}
                            />
                          </label>
                        </>
                      )}
                </div>
              </section>
            )}
        </RecordActions>
      </article>
    );
  }

  function list(items: Todo[], past = false) {
    return (
      <SortableStack
        items={items}
        label={(todo) => todo.text}
        onMove={async (id, previous, next) => {
          await prepareTodo(id);
          await props.onMove(id, previous, next);
        }}
        className="todo-stack"
        renderItem={(todo) => renderTodo(todo, past)}
      />
    );
  }

  return (
    <main
      className={`todo-workspace todo-planner${view === "calendar" ? " calendar-view" : ""}${props.web && arranging ? " arranging" : ""}`}
    >
      {editingTodo && props.onSavePlannerTodo && (
        <CalendarTodoEditor
          {...props}
          todo={editingTodo}
          date={todoDate(editingTodo)}
          today={today}
          onClose={() => setEditingTodo(null)}
        />
      )}
      <header className="todo-hero">
        <div>
          <p className="eyebrow">ONE THING AT A TIME</p>
          <h1>
            {view === "calendar"
              ? "日历"
              : view === "today"
                ? "今天，慢慢完成"
                : "所有安排"}
          </h1>
          <p className="planner-date">
            <Sun size={15} aria-hidden="true" />
            <time dateTime={today}>
              {new Intl.DateTimeFormat("zh-CN", {
                month: "long",
                day: "numeric",
                weekday: "long",
                timeZone: "UTC",
              }).format(new Date(`${today}T12:00:00Z`))}
            </time>
          </p>
        </div>
      </header>
      <section className="planner-daily-progress" aria-label="今日进度">
        <div>
          <span>
            今天完成 <strong>{completed}</strong> / {currentTodos.length}
          </span>
          <span>
            {openToday > 0
              ? `还剩 ${openToday} 件`
              : currentTodos.length
                ? "今天已安排妥当"
                : "从一件小事开始"}
          </span>
        </div>
        <progress
          aria-label="今天完成进度"
          value={completed}
          max={currentTodos.length || 1}
        />
      </section>
      <div className="planner-navigation">
        <SegmentedControl<TodoView>
          label="待办视图"
          value={view}
          onChange={setView}
          options={[
            { value: "today", label: "今天" },
            { value: "calendar", label: "日历" },
            { value: "all", label: "全部" },
          ]}
        />
        <button
          className="planner-filter-toggle"
          type="button"
          aria-expanded={filtersOpen}
          onClick={() => setFiltersOpen(!filtersOpen)}
        >
          <SlidersHorizontal size={16} />
          {filter === "all" ? "筛选" : filter === "open" ? "未完成" : "已完成"}
        </button>
      </div>
      <div className="filter-bar planner-filter-bar" hidden={!filtersOpen}>
        <SegmentedControl<TodoFilter>
          label="待办筛选"
          value={filter}
          options={[
            { value: "all", label: "全部状态" },
            { value: "open", label: "未完成" },
            { value: "done", label: "已完成" },
          ]}
          onChange={(value) => {
            setLocalFilter(value);
            props.onFilterChange?.(value);
          }}
        />
        {props.web && (
          <button
            type="button"
            className="arrange-todos"
            aria-pressed={arranging}
            onClick={() => setArranging(!arranging)}
          >
            {arranging ? "完成整理" : "整理待办"}
          </button>
        )}
      </div>
      {actionError && <p role="alert">{actionError}</p>}
      <div className="planner-feedback-row">
        <p
          className="todo-feedback"
          role="status"
          aria-label="待办操作反馈"
          aria-live="polite"
        >
          {feedback}
        </p>
        {undo && (
          <button
            type="button"
            className="planner-undo"
            aria-label={`撤销：${undo.text}`}
            disabled={busyIds.includes(undo.id)}
            onClick={async () => {
              const previous = undo;
              if (
                await act(
                  previous.id,
                  () =>
                    props.onSetStatus
                      ? props.onSetStatus(previous.id, previous.status)
                      : props.onToggle(previous.id),
                  "已撤销上次操作。",
                )
              )
                setUndo(null);
            }}
          >
            撤销
          </button>
        )}
      </div>
      <div className="todo-list-scroll">
        {view === "calendar" && (
          <CalendarTodoView
            types={props.types}
            todoTypeIds={props.todoTypeIds}
            todoTimes={props.todoTimes}
            preferences={props.preferences}
            onSavePreferences={props.onSavePreferences}
            onToggleTodo={(todo) =>
              changeStatus(
                todo,
                getTodoStatus(todo) === "completed" ? "open" : "completed",
              )
            }
            busyTodoIds={busyIds}
            onSaveType={props.onSaveType}
            onDeleteType={props.onDeleteType}
            onSavePlannerTodo={props.onSavePlannerTodo}
            onMovePlannerTodo={props.onMovePlannerTodo}
            events={props.events}
            onImportPlan={props.onImportPlan}
            onEditorOpenChange={props.onEditorOpenChange}
            onSaveEvent={props.onSaveEvent}
            onDeleteEvent={props.onDeleteEvent}
            onUndoEvent={props.onUndoEvent}
            canUndoEvent={props.canUndoEvent}
            month={calendarMonth}
            date={selectedDate}
            today={today}
            todos={calendarTodos}
            todoRecords={visibleCalendarRecords}
            selectedTodos={selectedTodos}
            onMonthChange={setCalendarMonth}
            onDateChange={setSelectedDate}
            onCreate={
              props.onCreateRequest
                ? () => props.onCreateRequest?.(selectedDate)
                : undefined
            }
          >
            {visible.length ? (
              list(visible)
            ) : (
              <p className="calendar-empty">
                {filter === "all"
                  ? "留一点空白，也可以安排一件小事。"
                  : "这个筛选下没有事项。"}
              </p>
            )}
          </CalendarTodoView>
        )}
        {view !== "calendar" && visible.length > 0 && (
          <section className="planner-open" aria-label="待办事项">
            <h2>
              {view === "today" ? "今天的事" : "全部事项"}{" "}
              <span>· {visible.length}</span>
            </h2>
            {list(visible)}
          </section>
        )}
        {view === "today" && filter !== "done" && overdue.length > 0 && (
          <details className="planner-disclosure planner-overdue">
            <summary>
              之前未完成 <span>{overdue.length}</span>
            </summary>
            <div>{list(overdue)}</div>
          </details>
        )}
        {view !== "calendar" && visible.length === 0 && (
          <div className="todo-empty">
            <Sun size={28} aria-hidden="true" />
            <p>
              {filter !== "all"
                ? "这个筛选下没有事项。"
                : "留一点空白，给今天的小计划。"}
            </p>
            {filter === "all" && props.onCreateRequest && (
              <button
                type="button"
                className="planner-empty-add"
                onClick={() => props.onCreateRequest?.()}
              >
                <Plus size={16} />
                添加一件事
              </button>
            )}
          </div>
        )}
        {view === "today" && openToday === 0 && currentTodos.length > 0 && (
          <p className="planner-help">
            今天的事项已安排妥当。休息一下，也很好。
          </p>
        )}
        {(props.series?.length ?? 0) > 0 && (
          <details
            className="planner-series planner-disclosure"
            aria-label="重复计划"
          >
            <summary>
              <Repeat2 size={16} />
              重复计划 <span>{props.series?.length}</span>
            </summary>
            {props.series?.map((series) => {
              const rule = getTodoRule(series);
              const busy = busyIds.includes(series.id);
              return (
                <details
                  className="planner-disclosure planner-series-item"
                  key={series.id}
                >
                  <summary>
                    <span>
                      {rule?.text ?? series.text}
                      <small>
                        {repeatLabel(rule?.repeat)} ·{" "}
                        {rule?.stopped
                          ? "已停止未来安排"
                          : rule?.paused
                            ? "明天起暂停"
                            : "按计划重复"}
                      </small>
                    </span>
                  </summary>
                  <div>
                    <div className="planner-series-actions">
                      {!rule?.stopped && props.onPauseSeries && (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() =>
                            void act(
                              series.id,
                              () =>
                                props.onPauseSeries!(series.id, !rule?.paused),
                              rule?.paused
                                ? "明天起恢复重复。"
                                : "明天起暂停重复。今天可以单独跳过。",
                            )
                          }
                        >
                          {rule?.paused ? "恢复重复" : "暂停重复"}
                        </button>
                      )}
                      {!rule?.stopped && props.onStopSeries && (
                        <details className="planner-stop-confirm">
                          <summary>停止未来重复</summary>
                          <p>
                            停止明天及之后的安排。今天和过去的记录都会保留。
                          </p>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() =>
                              void act(
                                series.id,
                                () => props.onStopSeries!(series.id),
                                "已停止未来重复，历史记录仍保留。",
                              )
                            }
                          >
                            确认停止未来
                          </button>
                        </details>
                      )}
                    </div>
                    {!rule?.stopped && props.onUpdateRule && (
                      <SeriesEditor
                        series={series}
                        onSave={props.onUpdateRule}
                      />
                    )}
                    {rule?.stopped && (
                      <p className="planner-help">
                        历史仍可在「历史」按日期查看；删除历史需要单独移入最近删除，可以恢复。
                      </p>
                    )}
                  </div>
                </details>
              );
            })}
          </details>
        )}
      </div>
      {props.syncMessage && (
        <p
          className="planner-sync-message"
          role="status"
          aria-label="待办同步状态"
        >
          {props.syncMessage}
        </p>
      )}
    </main>
  );
}
