import { useRef, useState } from "react";
import { X } from "../icons";
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
import { NoteStack } from "./NoteStacks";

interface Props {
  activeNotebookId?: string | null;
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
  activeNotebookId = null,
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
  return (
    <>
      <SortableStack
        wholeCard
        itemKind="便签本"
        items={notebooks}
        label={(book) => book.name}
        onMove={onMove}
        className="note-stacks"
        renderItem={(notebook) => (
          <div className="notebook-stack-shell">
            <NoteStack
              notebook={notebook}
              notes={notebookNotes[notebook.id] ?? []}
              tone={tones[notebook.id]}
              activeNotebookId={activeNotebookId}
              onExpand={onSelect}
            />
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
    </>
  );
}
