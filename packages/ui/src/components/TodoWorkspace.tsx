import { useMemo, useState } from "react";
import type { Todo } from "@smoke-notes/core";
import { Plus, Trash2 } from "lucide-react";
import { SortableStack } from "./SortableStack";

type Filter = "all" | "open" | "done";

interface TodoWorkspaceProps {
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

export function TodoWorkspace(props: TodoWorkspaceProps) {
  const [text, setText] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
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
    if (!text.trim()) return;
    await props.onCreate(text);
    setText("");
  }

  return (
    <main className="todo-workspace">
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
      </header>

      <div className="todo-composer">
        <Plus size={17} />
        <input
          aria-label="新待办内容"
          placeholder="添加一件要完成的事"
          value={text}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") void addTodo();
          }}
        />
        <button type="button" onClick={() => void addTodo()}>
          添加
        </button>
      </div>

      <div className="filter-bar" aria-label="待办筛选">
        {(["all", "open", "done"] as const).map((value) => (
          <button
            type="button"
            key={value}
            className={filter === value ? "active" : ""}
            onClick={() => setFilter(value)}
          >
            {value === "all" ? "全部" : value === "open" ? "未完成" : "已完成"}
          </button>
        ))}
      </div>

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
                  aria-label={`${todo.completed ? "恢复" : "完成"}：${todo.text}`}
                  onClick={() => void props.onToggle(todo.id)}
                >
                  <span />
                </button>
                <input
                  aria-label={`编辑待办：${todo.text}`}
                  defaultValue={todo.text}
                  onBlur={(event) => {
                    if (event.target.value !== todo.text)
                      void props.onUpdate(todo.id, event.target.value);
                  }}
                />
                <button
                  type="button"
                  className="row-delete"
                  aria-label={`删除：${todo.text}`}
                  onClick={() => void props.onTrash(todo.id)}
                >
                  <Trash2 size={15} />
                </button>
              </article>
            )}
          />
        )}
      </div>
    </main>
  );
}
