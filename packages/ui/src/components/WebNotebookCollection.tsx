import { useRef, useState } from "react";
import { Layers, X } from "../icons";
import {
  RecordValidationError,
  TEXT_LIMITS,
  type Note,
  type Notebook,
} from "@smoke-notes/core";
import { SortableStack } from "./SortableStack";
import { useNotebookTones } from "./useNotebookTones";
import { RecordActions } from "./RecordActions";
import { WebDialog } from "./glass/WebDialog";
import "./notebook-collection.css";

interface Props {
  notebooks: Notebook[];
  notebookNotes?: Record<string, Note[]>;
  onSelect(id: string): void;
  onRename(id: string, name: string): Promise<void>;
  onTrash(id: string): Promise<void>;
  onMove(
    id: string,
    previous: number | null,
    next: number | null,
  ): Promise<void>;
}
export function WebNotebookCollection({
  notebooks,
  notebookNotes = {},
  onSelect,
  onRename,
  onTrash,
  onMove,
}: Props) {
  const [editing, setEditing] = useState<Notebook | null>(null);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const pending = useRef(false);
  const tones = useNotebookTones(notebooks);
  function cover(notebook: Notebook) {
    const notes = notebookNotes[notebook.id] ?? [];
    const updatedAt = notes.reduce(
      (latest, note) => (note.updatedAt > latest ? note.updatedAt : latest),
      notebook.updatedAt,
    );
    return (
      <>
        <strong>{notebook.name}</strong>
        <span className="collection-card-bottom">
          {notes.length} 张便签
          <time dateTime={updatedAt}>
            更新于{" "}
            {new Date(updatedAt).toLocaleDateString("zh-CN", {
              month: "short",
              day: "numeric",
            })}
          </time>
        </span>
      </>
    );
  }
  return (
    <main className="web-notebook-collection">
      <header className="notes-board-header">
        <div>
          <h1>便签本</h1>
          <span>{notebooks.length} 个便签本</span>
        </div>
      </header>
      <h2 className="sr-only">全部便签本</h2>
      {notebooks.length > 1 && (
        <p className="collection-hint">长按便签本可调整顺序</p>
      )}
      <div id="notebook-collection-cards">
        <SortableStack
          wholeCard
          layout="stack"
          itemKind="便签本"
          items={notebooks}
          label={(book) => book.name}
          onMove={onMove}
          renderDragOverlay={(notebook) => (
            <div className="collection-drag-overlay" aria-hidden="true" inert>
              <div
                className={`collection-card collection-tone-${tones[notebook.id]}`}
              >
                {cover(notebook)}
              </div>
            </div>
          )}
          className="collection-cards"
          renderItem={(notebook) => (
            <div className="collection-card-shell">
              <button
                type="button"
                data-sortable-open
                className={`collection-card collection-tone-${tones[notebook.id]}`}
                aria-label={`进入便签本：${notebook.name}`}
                onClick={() => onSelect(notebook.id)}
              >
                {cover(notebook)}
              </button>
              <RecordActions
                kind="便签本"
                name={notebook.name}
                renameLabel="编辑便签本"
                onRename={() => {
                  setName(notebook.name);
                  setEditing(notebook);
                  setError("");
                }}
                onTrash={() => onTrash(notebook.id)}
              />
            </div>
          )}
        />
      </div>
      {!notebooks.length && (
        <div className="collection-empty">
          <Layers size={32} />
          <h2>还没有便签本</h2>
          <p>点「新建便签本」为记录分类。</p>
        </div>
      )}
      {editing && (
        <WebDialog
          web
          kind="actions"
          label="编辑便签本"
          onClose={() => {
            if (!pending.current) setEditing(null);
          }}
        >
          <header>
            <h2>编辑便签本</h2>
            <button
              type="button"
              aria-label="关闭编辑便签本"
              disabled={busy}
              onClick={() => setEditing(null)}
            >
              <X size={20} />
            </button>
          </header>
          <form
            className="planner-fields"
            onSubmit={async (e) => {
              e.preventDefault();
              if (pending.current || !name.trim()) return;
              pending.current = true;
              setBusy(true);
              setError("");
              try {
                await onRename(editing.id, name);
                setEditing(null);
              } catch (reason) {
                setError(
                  reason instanceof RecordValidationError
                    ? reason.message
                    : "保存失败，名称已保留，请重试。",
                );
              } finally {
                pending.current = false;
                setBusy(false);
              }
            }}
          >
            <label>
              名称
              <input
                autoFocus
                aria-label="便签本名称"
                value={name}
                disabled={busy}
                maxLength={TEXT_LIMITS.notebookName}
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
            <button className="planner-save" disabled={busy || !name.trim()}>
              {busy ? "保存中…" : "保存"}
            </button>
            {error && <p role="alert">{error}</p>}
          </form>
        </WebDialog>
      )}
    </main>
  );
}
