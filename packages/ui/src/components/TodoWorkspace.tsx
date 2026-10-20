import { useEffect, useMemo, useRef, useState } from "react";
import {
  RecordValidationError,
  TEXT_LIMITS,
  type Todo,
  type TodoCreateOptions,
  type TodoRepeat,
  type TodoRuleChanges,
  type TodoStatus,
  addTodoDays,
  getTodoDay,
  getTodoDate,
  getTodoRule,
  getTodoStatus,
} from "@smoke-notes/core";
import { Plus, Trash2 } from "../icons";
import { SortableStack } from "./SortableStack";
import { RecordActions } from "./RecordActions";
import { SegmentedControl } from "./SegmentedControl";

export type TodoFilter = "all" | "open" | "done";

interface TodoWorkspaceProps {
  web?: boolean;
  filter?: TodoFilter;
  onFilterChange?(filter: TodoFilter): void;
  todos: Todo[];
  today?: string;
  syncMessage?: string;
  series?: Todo[];
  onCreate: (text: string, options?: TodoCreateOptions) => Promise<void>;
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
    <>
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
    </>
  );
}

type TodoView = "today" | "all" | "history";
type RepeatChoice = "once" | "daily" | "weekdays" | "weekly";
const weekdayLabels = ["日", "一", "二", "三", "四", "五", "六"];

function repeatLabel(repeat?: TodoRepeat) {
  if (!repeat) return "一次性";
  if (repeat.kind === "daily") return "每天";
  if (repeat.kind === "weekdays") return "工作日";
  return `每周${(repeat.weekdays ?? []).map((day) => weekdayLabels[day]).join("、")}`;
}

function RepeatFields({
  value,
  days,
  onChange,
  onDaysChange,
  label,
  allowOnce = true,
}: {
  value: RepeatChoice;
  days: number[];
  onChange(value: RepeatChoice): void;
  onDaysChange(days: number[]): void;
  label: string;
  allowOnce?: boolean;
}) {
  return (
    <>
      <label>
        重复
        <select
          aria-label={label}
          value={value}
          onChange={(event) => onChange(event.target.value as RepeatChoice)}
        >
          {allowOnce && <option value="once">不重复</option>}
          <option value="daily">每天</option>
          <option value="weekdays">工作日（周一至周五）</option>
          <option value="weekly">指定星期</option>
        </select>
      </label>
      {value === "weekly" && (
        <fieldset className="planner-weekdays">
          <legend>每周哪几天</legend>
          {[1, 2, 3, 4, 5, 6, 0].map((day) => (
            <label key={day}>
              <input
                type="checkbox"
                checked={days.includes(day)}
                aria-label={`星期${weekdayLabels[day]}`}
                onChange={(event) =>
                  onDaysChange(
                    event.target.checked
                      ? [...days, day].sort()
                      : days.filter((item) => item !== day),
                  )
                }
              />
              <span>{weekdayLabels[day]}</span>
            </label>
          ))}
        </fieldset>
      )}
    </>
  );
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
  const today = props.today ?? getTodoDay();
  const [view, setView] = useState<TodoView>("today");
  const [historyDate, setHistoryDate] = useState(addTodoDays(today, -1));
  const [text, setText] = useState("");
  const [date, setDate] = useState("");
  const [notes, setNotes] = useState("");
  const [repeat, setRepeat] = useState<RepeatChoice>("once");
  const [days, setDays] = useState<number[]>([1, 2, 3, 4, 5]);
  const [arranging, setArranging] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState("");
  const createPending = useRef(false);
  const draftRevision = useRef(0);
  const [actionError, setActionError] = useState("");
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
    const combined = props.todos.map((todo) => moving.get(todo.id) ?? todo);
    for (const todo of leaving)
      if (!combined.some((item) => item.id === todo.id)) combined.push(todo);
    return combined;
  }, [props.todos, leaving]);
  const scoped = displayTodos.filter((todo) =>
    view === "today"
      ? todoDate(todo) === today
      : view === "history"
        ? todoDate(todo) === historyDate
        : todo.planning?.kind !== "occurrence" || todoDate(todo) >= today,
  );
  const visible = scoped.filter(
    (todo) =>
      filter === "all" ||
      (filter === "done"
        ? getTodoStatus(todo) === "completed"
        : getTodoStatus(todo) === "open"),
  );
  const open = visible.filter((todo) => getTodoStatus(todo) === "open");
  const done = visible.filter((todo) => getTodoStatus(todo) === "completed");
  const skipped = visible.filter((todo) => getTodoStatus(todo) === "skipped");
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
      await action();
      setFeedback(message);
      return true;
    } catch {
      setActionError("更新失败，请重试。内容已保留。");
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
          ? "今天已跳过，记录已保留。"
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
        }, 180);
        timers.current.add(timer);
      }
    }
  }

  async function addTodo() {
    if (!text.trim() || createPending.current) return;
    if (repeat === "weekly" && !days.length) {
      setCreateError("请至少选择一个星期。");
      return;
    }
    createPending.current = true;
    const revision = draftRevision.current;
    setCreating(true);
    setCreateError("");
    try {
      const options: TodoCreateOptions = {
        date: date || today,
        notes,
        ...(repeat !== "once"
          ? {
              repeat: {
                kind: repeat,
                ...(repeat === "weekly" ? { weekdays: days } : {}),
              },
            }
          : {}),
      };
      await props.onCreate(text, options);
      if (revision === draftRevision.current) {
        setText("");
        setNotes("");
      }
      setFeedback("已添加，保存在本机。");
    } catch (error) {
      setCreateError(
        error instanceof RecordValidationError
          ? error.message
          : "添加失败，请重试",
      );
    } finally {
      createPending.current = false;
      setCreating(false);
    }
  }

  function renderTodo(todo: Todo, past = false) {
    const status = getTodoStatus(todo);
    const busy = busyIds.includes(todo.id);
    const recurring = todo.planning?.kind === "occurrence";
    const isLeaving = leaving.some((item) => item.id === todo.id);
    return (
      <article
        className={`todo-row planner-todo-row${status === "completed" ? " completed" : ""}${isLeaving ? " is-completing" : ""}`}
      >
        <button
          type="button"
          className={`completion-ring${status === "skipped" ? " skipped" : ""}`}
          aria-pressed={status === "completed"}
          aria-label={`${status === "completed" ? "恢复" : "完成"}：${todo.text}`}
          disabled={busy || isLeaving}
          onClick={() =>
            void changeStatus(
              todo,
              status === "completed" ? "open" : "completed",
            )
          }
        >
          <span />
        </button>
        <div className="planner-todo-copy">
          <TodoTextInput todo={todo} onUpdate={props.onUpdate} />
          <div className="planner-todo-meta">
            {view === "all" && (
              <time dateTime={todoDate(todo)}>
                {todoDate(todo) === today ? "今天" : todoDate(todo)}
              </time>
            )}
            {recurring && <span>重复事项</span>}
            {status === "skipped" && <span>已跳过</span>}
          </div>
          {todo.planning?.notes && (
            <p className="planner-todo-note">{todo.planning.notes}</p>
          )}
        </div>
        {props.web ? (
          <RecordActions
            name={todo.text}
            kind="待办"
            onTrash={() => props.onTrash(todo.id)}
          />
        ) : (
          <button
            type="button"
            className="row-delete"
            aria-label={`删除：${todo.text}`}
            onClick={() =>
              void act(
                todo.id,
                () => props.onTrash(todo.id),
                "已移入最近删除。可以恢复。",
              )
            }
          >
            <Trash2 size={15} />
          </button>
        )}
        {!past && (props.onReschedule || (recurring && props.onSetStatus)) && (
          <details className="planner-disclosure planner-row-options">
            <summary>安排与更多</summary>
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
                      {status === "skipped" ? "恢复今天" : "跳过今天"}
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
                        <input
                          type="date"
                          aria-label={`安排日期：${todo.text}`}
                          value={todoDate(todo)}
                          disabled={busy}
                          onChange={(event) => {
                            const next = event.target.value;
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
          </details>
        )}
      </article>
    );
  }

  function list(items: Todo[], past = false) {
    return (
      <SortableStack
        items={items}
        label={(todo) => todo.text}
        onMove={props.onMove}
        className="todo-stack"
        renderItem={(todo) => renderTodo(todo, past)}
      />
    );
  }

  return (
    <main
      className={`todo-workspace todo-planner${props.web && arranging ? " arranging" : ""}`}
    >
      <header className="todo-hero">
        <div>
          <p className="eyebrow">TODAY · FOCUS</p>
          <h1>待办</h1>
          <p>
            今天完成 {completed} / {currentTodos.length}
            {currentTodos.length === 0 ? " · 从一件小事开始。" : ""}
          </p>
          {props.syncMessage && (
            <p
              className="planner-sync-message"
              role="status"
              aria-label="待办同步状态"
            >
              {props.syncMessage}
            </p>
          )}
        </div>
        <div
          className="planner-today-count"
          aria-label={`今天完成 ${completed} 项，共 ${currentTodos.length} 项`}
        >
          <strong>{completed}</strong>
          <span>今日完成</span>
        </div>
      </header>
      <SegmentedControl<TodoView>
        label="待办视图"
        value={view}
        onChange={setView}
        options={[
          { value: "today", label: "今天" },
          { value: "all", label: "全部" },
          { value: "history", label: "历史" },
        ]}
      />
      {view !== "history" && (
        <div className="planner-create">
          <div className="todo-composer">
            <Plus size={17} />
            <input
              aria-label="新待办内容"
              maxLength={TEXT_LIMITS.todoText}
              placeholder="添加一件要完成的事"
              value={text}
              onChange={(event) => {
                draftRevision.current += 1;
                setText(event.target.value);
                setCreateError("");
              }}
              onKeyDown={(event) => {
                if (event.nativeEvent.isComposing || event.keyCode === 229)
                  return;
                if (event.key === "Enter") void addTodo();
              }}
            />
            <button
              type="button"
              disabled={creating}
              onClick={() => void addTodo()}
            >
              添加
            </button>
          </div>
          <details className="planner-disclosure planner-create-options">
            <summary>日期、重复与备注</summary>
            <div className="planner-fields">
              <label>
                日期
                <input
                  aria-label="新待办日期"
                  type="date"
                  value={date || today}
                  onChange={(event) => {
                    draftRevision.current += 1;
                    setDate(event.target.value);
                  }}
                />
              </label>
              <RepeatFields
                value={repeat}
                days={days}
                onChange={(value) => {
                  draftRevision.current += 1;
                  setRepeat(value);
                }}
                onDaysChange={(value) => {
                  draftRevision.current += 1;
                  setDays(value);
                }}
                label="新待办重复"
              />
              <label>
                备注
                <textarea
                  aria-label="新待办备注"
                  value={notes}
                  maxLength={4000}
                  placeholder="可选，写下一点提醒"
                  onChange={(event) => {
                    draftRevision.current += 1;
                    setNotes(event.target.value);
                  }}
                />
              </label>
            </div>
          </details>
          {createError && <p role="alert">{createError}</p>}
        </div>
      )}
      {view === "history" && (
        <section className="planner-history-picker" aria-label="按日查看历史">
          <button
            type="button"
            aria-label="前一天"
            onClick={() => setHistoryDate(addTodoDays(historyDate, -1))}
          >
            ‹
          </button>
          <label>
            记录日期
            <input
              aria-label="历史日期"
              type="date"
              max={today}
              value={historyDate}
              onChange={(event) => {
                if (event.target.value) setHistoryDate(event.target.value);
              }}
            />
          </label>
          <button
            type="button"
            aria-label="后一天"
            disabled={historyDate >= today}
            onClick={() => setHistoryDate(addTodoDays(historyDate, 1))}
          >
            ›
          </button>
        </section>
      )}
      <div className="filter-bar planner-filter-bar" aria-label="待办筛选">
        {(["all", "open", "done"] as const).map((value) => (
          <button
            type="button"
            key={value}
            className={filter === value ? "active" : ""}
            aria-pressed={filter === value}
            onClick={() => {
              setLocalFilter(value);
              props.onFilterChange?.(value);
            }}
          >
            {value === "all"
              ? "全部状态"
              : value === "open"
                ? "未完成"
                : "已完成"}
          </button>
        ))}
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
        {view === "today" && filter !== "done" && overdue.length > 0 && (
          <details className="planner-disclosure planner-overdue" open>
            <summary>
              之前未完成 <span>{overdue.length}</span>
            </summary>
            <div>{list(overdue)}</div>
          </details>
        )}
        {open.length > 0 && (
          <section
            className="planner-open"
            aria-label={view === "history" ? "当日未完成" : "未完成事项"}
          >
            {view === "history" && <h2>未完成 · {open.length}</h2>}
            {list(open, view === "history")}
          </section>
        )}
        {done.length > 0 && (
          <details
            className="planner-disclosure planner-completed"
            open={filter === "done" || view === "history" ? true : undefined}
          >
            <summary>
              已完成 <span>{done.length}</span>
            </summary>
            <div>{list(done, view === "history")}</div>
          </details>
        )}
        {skipped.length > 0 && (
          <details
            className="planner-disclosure planner-skipped"
            open={view === "history" ? true : undefined}
          >
            <summary>
              已跳过 <span>{skipped.length}</span>
            </summary>
            <div>{list(skipped, view === "history")}</div>
          </details>
        )}
        {visible.length === 0 && (
          <div className="todo-empty">
            <span>○</span>
            <p>
              {view === "history" ? "这一天没有记录。" : "这一栏现在很安静。"}
            </p>
          </div>
        )}
        {view === "today" && openToday === 0 && currentTodos.length > 0 && (
          <p className="planner-help">
            今天的事项已安排妥当。休息一下，也很好。
          </p>
        )}
        {view === "all" && (props.series?.length ?? 0) > 0 && (
          <section className="planner-series" aria-label="重复计划">
            <h2>重复计划</h2>
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
          </section>
        )}
      </div>
    </main>
  );
}
