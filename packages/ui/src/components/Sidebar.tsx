import { useState, type CSSProperties } from "react";
import type { Notebook } from "@smoke-notes/core";
import {
  CheckCircle2,
  NotebookPen,
  Pencil,
  Plus,
  Settings2,
  Trash2,
} from "lucide-react";
import { SortableStack } from "./SortableStack";
import { notebookTint } from "./notebook-tint";

interface SidebarProps {
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

  async function submit() {
    if (!name.trim()) return;
    await props.onCreateNotebook(name);
    setName("");
    setAdding(false);
  }

  return (
    <aside className="sidebar" aria-label="便签导航">
      <div className="brand-block">
        <span className="brand-mark">烟</span>
        <div>
          <strong>烟笺</strong>
          <span>SMOKE NOTES</span>
        </div>
      </div>

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
            value={name}
            placeholder="新的便签本"
            onChange={(event) => setName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") void submit();
              if (event.key === "Escape") setAdding(false);
            }}
            onBlur={() => {
              if (!name.trim()) setAdding(false);
            }}
          />
        </div>
      )}

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
                    value={renameValue}
                    onChange={(event) => setRenameValue(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" && renameValue.trim()) {
                        void props
                          .onRenameNotebook(notebook.id, renameValue)
                          .then(() => setRenamingId(null));
                      }
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
                <button
                  type="button"
                  className="notebook-action"
                  aria-label={`重命名便签本：${notebook.name}`}
                  onClick={() => {
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
