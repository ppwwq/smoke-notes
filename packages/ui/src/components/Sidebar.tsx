import { useRef, useState, type CSSProperties } from "react";
import {
  RecordValidationError,
  TEXT_LIMITS,
  type Notebook,
} from "@smoke-notes/core";
import {
  CheckCircle2,
  Notebook as NotebookPen,
  Pencil,
  Plus,
  Settings2,
  Trash2,
  X,
} from "../icons";
import { SortableStack } from "./SortableStack";
import { notebookTint } from "./notebook-tint";
import { RecordActions } from "./RecordActions";

interface SidebarProps {
  web?: boolean;
  onClose?(): void;
  notebooks: Notebook[];
  selectedNotebookId: string | null;
  view: "notes" | "todos";
  onSelectNotebook: (id: string) => void;
  onShowTodos: () => void;
  onCreateNotebook: (name: string) => Promise<void>;
  onMoveNotebook: (
    id: string,
    previous: number | null,
    next: number | null,
  ) => Promise<void>;
  onRenameNotebook: (id: string, name: string) => Promise<void>;
  onTrashNotebook: (id: string) => Promise<void>;
  onOpenSettings: () => void;
}

function notebookStyle(id: string): CSSProperties {
  return { "--notebook-tint": notebookTint(id) } as CSSProperties;
}

export function Sidebar(props: SidebarProps) {
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [error, setError] = useState("");
  const createPending = useRef(false);
  const renamePending = useRef(false);
  const nameRevision = useRef(0);
  const renameRevision = useRef(0);

  async function submit() {
    if (!name.trim() || createPending.current) return;
    createPending.current = true;
    const revision = nameRevision.current;
    setError("");
    try {
      await props.onCreateNotebook(name);
      if (revision === nameRevision.current) {
        setName("");
        setAdding(false);
      }
    } catch (reason) {
      setError(
        reason instanceof RecordValidationError
          ? reason.message
          : "新建失败，请重试",
      );
    } finally {
      createPending.current = false;
    }
  }

  async function rename(id: string) {
    if (!renameValue.trim() || renamePending.current) return;
    renamePending.current = true;
    const revision = renameRevision.current;
    setError("");
    try {
      await props.onRenameNotebook(id, renameValue);
      if (revision === renameRevision.current) setRenamingId(null);
    } catch (reason) {
      setError(
        reason instanceof RecordValidationError
          ? reason.message
          : "重命名失败，请重试",
      );
    } finally {
      renamePending.current = false;
    }
  }

  return (
    <aside className="sidebar" aria-label="便签导航">
      <div className="brand-block">
        <span className="brand-mark" aria-hidden="true">
          J
        </span>
        <div>
          <strong>Jotday</strong>
          <span>NOTES + CALENDAR</span>
        </div>
      </div>
      {props.onClose && (
        <button
          type="button"
          className="sidebar-close"
          aria-label="关闭便签本管理"
          onClick={props.onClose}
        >
          <X size={20} />
        </button>
      )}

      <button
        type="button"
        className={`primary-nav${props.view === "todos" ? " active" : ""}`}
        onClick={props.onShowTodos}
      >
        <CheckCircle2 size={18} />
        <span>待办</span>
        <i>固定</i>
      </button>

      <div className="sidebar-heading">
        <span>便签本</span>
        <button
          type="button"
          aria-label="新建便签本"
          onClick={() => setAdding(true)}
        >
          <Plus size={16} />
        </button>
      </div>

      {adding && (
        <div className="inline-create">
          <input
            autoFocus
            aria-label="便签本名称"
            maxLength={TEXT_LIMITS.notebookName}
            value={name}
            placeholder="新的便签本"
            onChange={(event) => {
              nameRevision.current += 1;
              setName(event.target.value);
            }}
            onKeyDown={(event) => {
              if (event.nativeEvent.isComposing || event.keyCode === 229)
                return;
              if (event.key === "Enter") void submit();
              if (event.key === "Escape") setAdding(false);
            }}
            onBlur={() => {
              if (!name.trim()) setAdding(false);
            }}
          />
        </div>
      )}
      {error && <p role="alert">{error}</p>}

      <div className="notebook-scroll">
        {props.notebooks.length === 0 ? (
          <div className="sidebar-empty">
            建立第一个便签本，给想法一个落脚处。
          </div>
        ) : (
          <SortableStack
            items={props.notebooks}
            label={(item) => item.name}
            onMove={props.onMoveNotebook}
            className="notebook-stack"
            renderItem={(notebook) => (
              <div className="notebook-item-controls">
                {renamingId === notebook.id ? (
                  <input
                    autoFocus
                    aria-label={`重命名：${notebook.name}`}
                    maxLength={TEXT_LIMITS.notebookName}
                    value={renameValue}
                    onChange={(event) => {
                      renameRevision.current += 1;
                      setRenameValue(event.target.value);
                    }}
                    onKeyDown={(event) => {
                      if (
                        event.nativeEvent.isComposing ||
                        event.keyCode === 229
                      )
                        return;
                      if (event.key === "Enter") void rename(notebook.id);
                      if (event.key === "Escape") setRenamingId(null);
                    }}
                  />
                ) : (
                  <button
                    type="button"
                    aria-label={notebook.name}
                    className={`notebook-link${
                      props.view === "notes" &&
                      props.selectedNotebookId === notebook.id
                        ? " active"
                        : ""
                    }`}
                    style={notebookStyle(notebook.id)}
                    onClick={() => props.onSelectNotebook(notebook.id)}
                  >
                    <NotebookPen size={16} />
                    <span>{notebook.name}</span>
                  </button>
                )}
                {props.web ? (
                  <RecordActions
                    name={notebook.name}
                    kind="便签本"
                    onRename={() => {
                      renameRevision.current += 1;
                      setRenamingId(notebook.id);
                      setRenameValue(notebook.name);
                    }}
                    onTrash={() => props.onTrashNotebook(notebook.id)}
                  />
                ) : (
                  <>
                    <button
                      type="button"
                      className="notebook-action"
                      aria-label={`重命名便签本：${notebook.name}`}
                      onClick={() => {
                        renameRevision.current += 1;
                        setRenamingId(notebook.id);
                        setRenameValue(notebook.name);
                      }}
                    >
                      <Pencil size={12} />
                    </button>
                    <button
                      type="button"
                      className="notebook-action notebook-delete"
                      aria-label={`删除便签本：${notebook.name}`}
                      onClick={() => void props.onTrashNotebook(notebook.id)}
                    >
                      <Trash2 size={12} />
                    </button>
                  </>
                )}
              </div>
            )}
          />
        )}
      </div>

      <button
        type="button"
        className="settings-link"
        aria-label="窗口设置"
        onClick={props.onOpenSettings}
      >
        <Settings2 size={16} />
        <span>设置与同步</span>
      </button>
    </aside>
  );
}
