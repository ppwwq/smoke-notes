import { useRef, useState } from "react";
import type { Notebook, NoteKind, TodoCreateOptions } from "@smoke-notes/core";
import { ArrowUpRight, CheckSquare2, StickyNote } from "lucide-react";
import FamilyButton from "./family-button/FamilyButton";
import { SegmentedControl } from "./SegmentedControl";
import { TodoComposer } from "./TodoComposer";

export function WorkspaceCreate({
  open,
  onOpenChange,
  mode,
  onModeChange,
  defaultMode,
  hidden,
  notebooks,
  selectedNotebookId,
  today,
  onCreateNote,
  onCreateNotebook,
  onCreateTodo,
  onShowTodos,
}: {
  open: boolean;
  onOpenChange(open: boolean): void;
  mode: "note" | "todo";
  onModeChange(mode: "note" | "todo"): void;
  defaultMode: "note" | "todo";
  hidden: boolean;
  notebooks: Notebook[];
  selectedNotebookId: string | null;
  today: string;
  onCreateNote(kind: NoteKind, notebookId: string): Promise<void>;
  onCreateNotebook(name: string): Promise<string>;
  onCreateTodo(text: string, options?: TodoCreateOptions): Promise<void>;
  onShowTodos(): void;
}) {
  const [targetId, setTargetId] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const pending = useRef(false);
  const selected =
    notebooks.find((book) => book.id === targetId) ??
    notebooks.find((book) => book.id === selectedNotebookId) ??
    notebooks[0];
  async function create(kind: NoteKind) {
    if (!selected || pending.current) return;
    pending.current = true;
    setBusy(true);
    setError("");
    try {
      await onCreateNote(kind, selected.id);
      onOpenChange(false);
    } catch {
      setError("新建失败，已有内容已保留，请重试。");
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }
  return (
    <div className="workspace-create" hidden={hidden}>
      <FamilyButton
        open={open}
        label={defaultMode === "note" ? "新建便签" : "新建待办"}
        onOpenChange={(next) => {
          if (next) onModeChange(defaultMode);
          onOpenChange(next);
        }}
      >
        <SegmentedControl
          label="新建类型"
          value={mode}
          onChange={onModeChange}
          options={[
            { value: "note", label: "便签" },
            { value: "todo", label: "待办" },
          ]}
        />
        <section
          hidden={mode !== "note"}
          aria-label="新建便签内容"
          className="create-note-options"
        >
          <p className="create-description">想法随手记，清单慢慢做。</p>
          {selected ? (
            <>
              <label className="create-notebook-field">
                保存到便签本
                <select
                  aria-label="新便签所属便签本"
                  value={selected.id}
                  onChange={(event) => setTargetId(event.target.value)}
                >
                  {notebooks.map((book) => (
                    <option key={book.id} value={book.id}>
                      {book.name}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                className="create-note-choice"
                data-create-focus={mode === "note" ? "" : undefined}
                disabled={busy}
                onClick={() => void create("note")}
              >
                <span className="create-kind-icon">
                  <StickyNote size={23} />
                </span>
                <span>
                  <strong>文字便签</strong>
                  <small>记灵感、摘录，或一段心情</small>
                </span>
                <ArrowUpRight size={18} />
              </button>
              <button
                type="button"
                className="create-note-choice checklist-choice"
                disabled={busy}
                onClick={() => void create("todo")}
              >
                <span className="create-kind-icon">
                  <CheckSquare2 size={23} />
                </span>
                <span>
                  <strong>清单便签</strong>
                  <small>保存在便签本里的勾选清单</small>
                </span>
                <ArrowUpRight size={18} />
              </button>
              <p className="create-footnote">创建后直接书写，内容自动保存。</p>
            </>
          ) : (
            <form
              className="create-first-notebook"
              onSubmit={async (event) => {
                event.preventDefault();
                if (!name.trim() || pending.current) return;
                pending.current = true;
                setBusy(true);
                setError("");
                try {
                  setTargetId(await onCreateNotebook(name));
                  setName("");
                } catch {
                  setError("便签本创建失败，请重试。名称已保留。");
                } finally {
                  pending.current = false;
                  setBusy(false);
                }
              }}
            >
              <label>
                先给便签一个家
                <input
                  data-create-focus={mode === "note" ? "" : undefined}
                  aria-label="第一个便签本名称"
                  placeholder="例如：日常灵感"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  onKeyDown={(event) => {
                    if (
                      event.key === "Enter" &&
                      (event.nativeEvent.isComposing || event.keyCode === 229)
                    )
                      event.preventDefault();
                  }}
                />
              </label>
              <button className="create-submit" disabled={busy || !name.trim()}>
                {busy ? "正在建立…" : "建立便签本"}
              </button>
            </form>
          )}
          {error && (
            <p className="create-error" role="alert">
              {error}
            </p>
          )}
        </section>
        <section hidden={mode !== "todo"} aria-label="新建每日待办">
          <TodoComposer
            today={today}
            active={mode === "todo"}
            onCreate={onCreateTodo}
            onShowTodos={() => {
              onOpenChange(false);
              onShowTodos();
            }}
          />
        </section>
      </FamilyButton>
    </div>
  );
}
