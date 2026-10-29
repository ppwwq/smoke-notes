import { WorkspaceSelect } from "./WorkspaceSelect";
import { useRef, useState } from "react";
import {
  TEXT_LIMITS,
  RecordValidationError,
  type Notebook,
  type NoteKind,
  type TodoCreateOptions,
} from "@smoke-notes/core";
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
  triggerLabel,
  hidden,
  notebooks,
  selectedNotebookId,
  today,
  todoDate,
  allowNotebook = false,
  onCreateNote,
  onCreateNotebook,
  onCreateTodo,
  onShowTodos,
  onArrange,
}: {
  open: boolean;
  onOpenChange(open: boolean): void;
  mode: "note" | "todo" | "notebook";
  onModeChange(mode: "note" | "todo" | "notebook"): void;
  defaultMode: "note" | "todo" | "notebook";
  hidden: boolean;
  triggerLabel?: string;
  allowNotebook?: boolean;
  notebooks: Notebook[];
  selectedNotebookId: string | null;
  today: string;
  todoDate?: string | undefined;
  onCreateNote(
    kind: NoteKind,
    notebookId: string,
    body?: string,
  ): Promise<void>;
  onCreateNotebook(name: string): Promise<string>;
  onCreateTodo(text: string, options?: TodoCreateOptions): Promise<void>;
  onShowTodos(): void;
  onArrange?(): void;
}) {
  const [targetId, setTargetId] = useState("");
  const [name, setName] = useState("");
  const [draft, setDraft] = useState("");
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
      if (kind === "note" && draft.trim()) {
        await onCreateNote(kind, selected.id, draft);
        setDraft("");
      } else {
        await onCreateNote(kind, selected.id);
      }
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
        triggerText={triggerLabel}
        label={
          triggerLabel ??
          (defaultMode === "notebook"
            ? "新增"
            : defaultMode === "note"
              ? "新建便签"
              : "新建待办")
        }
        onOpenChange={(next) => {
          if (next) onModeChange(defaultMode);
          onOpenChange(next);
        }}
      >
        <SegmentedControl
          label="新建类型"
          value={mode}
          onChange={(next) => {
            if (next === "todo" && onArrange) onArrange();
            else onModeChange(next);
          }}
          options={[
            { value: "note", label: "便签" },
            { value: "todo", label: onArrange ? "安排" : "待办" },
            ...(allowNotebook
              ? [{ value: "notebook" as const, label: "便签本" }]
              : []),
          ]}
        />
        <section
          hidden={mode !== "note"}
          aria-label="新建便签内容"
          className="create-note-options"
        >
          {selected ? (
            <>
              <label className="quick-note-label">
                先记下来，稍后再整理
                <textarea
                  aria-label="快速记录内容"
                  placeholder="这一刻，想记下什么？"
                  rows={3}
                  value={draft}
                  disabled={busy}
                  data-create-focus={mode === "note" ? "" : undefined}
                  onChange={(event) => setDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (
                      (event.ctrlKey || event.metaKey) &&
                      event.key === "Enter" &&
                      !event.nativeEvent.isComposing &&
                      event.keyCode !== 229
                    ) {
                      event.preventDefault();
                      void create("note");
                    }
                  }}
                />
              </label>
              <details className="create-destination">
                <summary>
                  保存到「{selected.name}」<span>更换</span>
                </summary>
                <label className="create-notebook-field">
                  保存到便签本
                  <WorkspaceSelect<string>
                    label="新便签所属便签本"
                    value={selected.id}
                    disabled={busy}
                    onChange={setTargetId}
                    options={notebooks.map((book) => ({
                      value: book.id,
                      label: book.name,
                    }))}
                  />
                </label>
              </details>
              <button
                type="button"
                className="create-note-choice"
                disabled={busy}
                onClick={() => void create("note")}
              >
                <span className="create-kind-icon">
                  <StickyNote size={23} />
                </span>
                <span>
                  <strong>
                    {busy
                      ? "正在保存…"
                      : draft.trim()
                        ? "保存并继续写"
                        : "打开文字便签"}
                  </strong>
                  <small>
                    {draft.trim()
                      ? "保存到本机，再继续编辑"
                      : "直接书写，编辑时自动保存"}
                  </small>
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
              <p className="create-footnote">
                {onArrange
                  ? "日程或待办，选「安排」。"
                  : "清单留在便签本；按日期安排的事项选「待办」。"}
              </p>
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
        <section hidden={mode !== "notebook"} aria-label="新建便签本">
          <form
            className="create-first-notebook"
            onSubmit={async (event) => {
              event.preventDefault();
              if (pending.current || !name.trim()) return;
              pending.current = true;
              setBusy(true);
              setError("");
              try {
                setTargetId(await onCreateNotebook(name));
                setName("");
                onOpenChange(false);
              } catch (reason) {
                setError(
                  reason instanceof RecordValidationError
                    ? reason.message
                    : "便签本创建失败，请重试。名称已保留。",
                );
              } finally {
                pending.current = false;
                setBusy(false);
              }
            }}
          >
            <label>
              给这个空间起个名字
              <input
                aria-label="新便签本名称"
                data-create-focus={mode === "notebook" ? "" : undefined}
                maxLength={TEXT_LIMITS.notebookName}
                value={name}
                disabled={busy}
                placeholder="例如：旅行计划"
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => {
                  if (
                    e.key === "Enter" &&
                    (e.nativeEvent.isComposing || e.keyCode === 229)
                  )
                    e.preventDefault();
                }}
              />
            </label>
            <button className="create-submit" disabled={busy || !name.trim()}>
              {busy ? "正在建立…" : "建立便签本"}
            </button>
            {error && (
              <p className="create-error" role="alert">
                {error}
              </p>
            )}
          </form>
        </section>
        <section hidden={mode !== "todo"} aria-label="新建待办">
          <TodoComposer
            today={today}
            defaultDate={todoDate}
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
