import { useRef, useState, type RefObject } from "react";
import { ChevronDown, Layers, X } from "../icons";
import {
  RecordValidationError,
  TEXT_LIMITS,
  type Notebook,
} from "@smoke-notes/core";
import { SortableStack } from "./SortableStack";
import { useNotebookTones } from "./useNotebookTones";
import { RecordActions } from "./RecordActions";
import { WebDialog } from "./glass/WebDialog";
import "./notebook-collection.css";

interface Props {
  notebooks: Notebook[];
  expanded?: boolean;
  onExpandedChange?(expanded: boolean): void;
  onManage?(): void;
  manageRef?: RefObject<HTMLButtonElement | null>;
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
  expanded: controlledExpanded,
  onExpandedChange,
  onManage,
  manageRef,
  onSelect,
  onRename,
  onTrash,
  onMove,
}: Props) {
  const [localExpanded, setLocalExpanded] = useState(false);
  const expanded = controlledExpanded ?? localExpanded;
  const [editing, setEditing] = useState<Notebook | null>(null);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const pending = useRef(false);
  const tones = useNotebookTones(notebooks);
  return (
    <main className="web-notebook-collection">
      <header className="notes-board-header">
        <div>
          <p className="eyebrow">A PLACE FOR EVERYTHING</p>
          <h1>便签本</h1>
          <span>{notebooks.length} 个便签本 · 在这里分类、命名与整理</span>
        </div>
      </header>
      <div className="web-section-heading">
        <h2>我的收藏</h2>
        {onManage && (
          <button
            type="button"
            className="collection-manage"
            ref={manageRef}
            onClick={onManage}
          >
            管理便签本
          </button>
        )}
        <button
          type="button"
          className="collection-expand"
          aria-expanded={expanded}
          aria-controls="notebook-collection-cards"
          onClick={() => {
            setLocalExpanded(!expanded);
            onExpandedChange?.(!expanded);
          }}
        >
          <Layers size={15} />
          {expanded ? "收起卡片" : "展开卡片"}
          <ChevronDown size={14} />
        </button>
      </div>
      <p className="collection-hint">点击进入 · 长按任意位置拖动排序</p>
      <div id="notebook-collection-cards">
        <SortableStack
          wholeCard
          layout="stack"
          itemKind="便签本"
          items={notebooks}
          label={(book) => book.name}
          onMove={onMove}
          renderDragOverlay={(notebook, index) => (
            <div className="collection-drag-overlay" aria-hidden="true" inert>
              <div
                className={`collection-card collection-tone-${tones[notebook.id]}`}
              >
                <span className="collection-card-top">
                  <span>NOTEBOOK / {String(index + 1).padStart(2, "0")}</span>
                </span>
                <strong>{notebook.name}</strong>
                <span className="collection-card-bottom">
                  打开这个空间<span>记录 · 整理 · 继续</span>
                </span>
              </div>
            </div>
          )}
          className={`collection-cards${expanded ? " expanded" : ""}`}
          renderItem={(notebook, index) => (
            <div className="collection-card-shell">
              <button
                type="button"
                data-sortable-open
                className={`collection-card collection-tone-${tones[notebook.id]}`}
                aria-label={`进入便签本：${notebook.name}`}
                onClick={() => onSelect(notebook.id)}
              >
                <span className="collection-card-top">
                  <span>NOTEBOOK / {String(index + 1).padStart(2, "0")}</span>
                </span>
                <strong>{notebook.name}</strong>
                <span className="collection-card-bottom">
                  打开这个空间<span>记录 · 整理 · 继续</span>
                </span>
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
          <h2>给想法一个落脚处。</h2>
          <p>点击右下角「新增」，建立你的第一个便签本。</p>
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
