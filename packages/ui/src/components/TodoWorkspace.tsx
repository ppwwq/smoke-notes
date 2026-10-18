import { useMemo, useRef, useState } from "react";
import {
  RecordValidationError,
  TEXT_LIMITS,
  type Todo,
} from "@smoke-notes/core";
import { Plus, Trash2 } from "../icons";
import { SortableStack } from "./SortableStack";
import { RecordActions } from "./RecordActions";

export type TodoFilter = "all" | "open" | "done";

interface TodoWorkspaceProps {
  web?: boolean;
  filter?: TodoFilter;
  onFilterChange?(filter: TodoFilter): void;
  todos: Todo[];
  onCreate: (text: string) => Promise<void>;
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

export function TodoWorkspace(props: TodoWorkspaceProps) {
  const [text, setText] = useState("");
  const [arranging, setArranging] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState("");
  const createPending = useRef(false);
  const draftRevision = useRef(0);
  const [actionError, setActionError] = useState("");
  const [feedback, setFeedback] = useState("");
  const togglePending = useRef(new Set<string>());
  const [busyIds, setBusyIds] = useState<string[]>([]);
  async function toggle(todo: Todo) {
    if (togglePending.current.has(todo.id)) return;
    togglePending.current.add(todo.id);
    setBusyIds((current) => [...current, todo.id]);
    setActionError("");
    setFeedback("");
    try {
      await props.onToggle(todo.id);
      setFeedback(todo.completed ? "已放回待办清单。" : "做得好，又完成一件。");
    } catch {
      setActionError("更新失败，请重试。内容已保留。");
    } finally {
      togglePending.current.delete(todo.id);
      setBusyIds((current) => current.filter((id) => id !== todo.id));
    }
  }
  const [localFilter, setLocalFilter] = useState<TodoFilter>("all");
  const filter = props.filter ?? localFilter;
  const visible = useMemo(
    () =>
      props.todos.filter(
        (todo) =>
          filter === "all" ||
          (filter === "done" ? todo.completed : !todo.completed),
      ),
    [props.todos, filter],
  );
  const completed = props.todos.filter((todo) => todo.completed).length;

  async function addTodo() {
    if (!text.trim() || createPending.current) return;
    createPending.current = true;
    const revision = draftRevision.current;
    setCreating(true);
    setCreateError("");
    try {
      await props.onCreate(text);
      if (revision === draftRevision.current) setText("");
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

  return (
    <main
      className={`todo-workspace${props.web && arranging ? " arranging" : ""}`}
    >
      <header className="todo-hero">
        <div>
          <p className="eyebrow">TODAY · FOCUS</p>
          <h1>待办</h1>
          <p>
            {props.todos.length
              ? `完成 ${completed} / ${props.todos.length}`
              : "从一件小事开始。"}
          </p>
        </div>
        {!props.web && (
          <div
            className="progress-orbit"
            aria-label={`完成 ${completed} 项，共 ${props.todos.length} 项`}
          >
            <span>
              {props.todos.length
                ? Math.round((completed / props.todos.length) * 100)
                : 0}
            </span>
            <small>%</small>
          </div>
        )}
      </header>

      {props.web && (
        <section
          className={`web-progress-card${props.todos.length && completed / props.todos.length >= 0.75 ? " nearly-done" : ""}`}
          aria-label="待办进度"
        >
          <div>
            <p>一步一步，慢慢完成。</p>
            <h2>
              {props.todos.length && completed === props.todos.length
                ? "今天的清单，\n完成了。"
                : "每一件小事，\n都算数。"}
            </h2>
            <span>
              {props.todos.length - completed} 件待完成 · {completed} 件已完成
            </span>
          </div>
          <strong
            aria-label={`完成 ${completed} 项，共 ${props.todos.length} 项`}
          >
            {props.todos.length
              ? Math.round((completed / props.todos.length) * 100)
              : 0}
            <small>%</small>
          </strong>
          <progress
            value={completed}
            max={props.todos.length || 1}
            aria-label="完成进度"
          />
        </section>
      )}

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
            if (event.nativeEvent.isComposing || event.keyCode === 229) return;
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
      {createError && <p role="alert">{createError}</p>}

      <div className="filter-bar" aria-label="待办筛选">
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
            {value === "all" ? "全部" : value === "open" ? "未完成" : "已完成"}
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
      {props.web && (
        <p
          className="todo-feedback"
          role="status"
          aria-label="待办操作反馈"
          aria-live="polite"
        >
          {feedback}
        </p>
      )}
      <div className="todo-list-scroll">
        {visible.length === 0 ? (
          <div className="todo-empty">
            <span>○</span>
            <p>这一栏现在很安静。</p>
          </div>
        ) : (
          <SortableStack
            items={visible}
            label={(todo) => todo.text}
            onMove={props.onMove}
            className="todo-stack"
            renderItem={(todo) => (
              <article
                className={`todo-row${todo.completed ? " completed" : ""}`}
              >
                <button
                  type="button"
                  className="completion-ring"
                  aria-pressed={todo.completed}
                  aria-label={`${todo.completed ? "恢复" : "完成"}：${todo.text}`}
                  disabled={busyIds.includes(todo.id)}
                  onClick={() => void toggle(todo)}
                >
                  <span />
                </button>
                <TodoTextInput todo={todo} onUpdate={props.onUpdate} />
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
                    onClick={() => void props.onTrash(todo.id)}
                  >
                    <Trash2 size={15} />
                  </button>
                )}
              </article>
            )}
          />
        )}
      </div>
    </main>
  );
}
