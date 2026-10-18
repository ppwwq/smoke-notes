import { useRef, useState, type RefObject } from "react";
import { ArrowUpRight, ChevronDown, Layers, Plus } from "lucide-react";
import {
  RecordValidationError,
  TEXT_LIMITS,
  type Notebook,
} from "@smoke-notes/core";

interface Props {
  notebooks: Notebook[];
  expanded?: boolean;
  onExpandedChange?(expanded: boolean): void;
  onManage?(): void;
  manageRef?: RefObject<HTMLButtonElement | null>;
  onSelect(id: string): void;
  onCreate(name: string): Promise<void>;
}

/** A web presentation of the same notebooks, with no separate data or ordering. */
export function WebNotebookCollection({
  notebooks,
  expanded: controlledExpanded,
  onExpandedChange,
  onManage,
  manageRef,
  onSelect,
  onCreate,
}: Props) {
  const [localExpanded, setLocalExpanded] = useState(false);
  const expanded = controlledExpanded ?? localExpanded;
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const revision = useRef(0);
  async function create() {
    if (pending.current || !name.trim()) return;
    pending.current = true;
    const submittedRevision = revision.current;
    setBusy(true);
    setError("");
    try {
      await onCreate(name);
      if (revision.current === submittedRevision) {
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
      pending.current = false;
      setBusy(false);
    }
  }
  return (
    <main className="web-notebook-collection">
      <header className="notes-board-header">
        <div>
          <p className="eyebrow">A PLACE FOR EVERYTHING</p>
          <h1>便签本</h1>
          <span>{notebooks.length} 个空间，装下不同的日常</span>
        </div>
        <button
          type="button"
          className="create-note-button"
          aria-label="建立新便签本"
          onClick={() => setAdding((value) => !value)}
          aria-expanded={adding}
        >
          <Plus size={19} />
          <span>新建便签本</span>
        </button>
      </header>
      {adding && (
        <form
          className="collection-create"
          onSubmit={(event) => {
            event.preventDefault();
            void create();
          }}
        >
          <input
            autoFocus
            aria-label="新便签本名称"
            maxLength={TEXT_LIMITS.notebookName}
            placeholder="给这个空间起个名字"
            value={name}
            onChange={(event) => {
              revision.current++;
              setName(event.target.value);
            }}
            onKeyDown={(event) => {
              if (
                event.key === "Enter" &&
                (event.nativeEvent.isComposing || event.keyCode === 229)
              )
                event.preventDefault();
            }}
          />
          <button type="submit" disabled={busy}>
            {busy ? "创建中…" : "创建"}
          </button>
        </form>
      )}
      {error && <p role="alert">{error}</p>}
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
      <div
        id="notebook-collection-cards"
        className={`collection-cards${expanded ? " expanded" : ""}`}
      >
        {notebooks.map((notebook, index) => (
          <button
            type="button"
            className={`collection-card collection-tone-${index % 4}`}
            key={notebook.id}
            aria-label={`进入便签本：${notebook.name}`}
            onClick={() => onSelect(notebook.id)}
          >
            <span className="collection-card-top">
              <span>NOTEBOOK / {String(index + 1).padStart(2, "0")}</span>
              <ArrowUpRight size={21} />
            </span>
            <strong>{notebook.name}</strong>
            <span className="collection-card-bottom">
              打开这个空间<span>记录 · 整理 · 继续</span>
            </span>
          </button>
        ))}
      </div>
      {!notebooks.length && (
        <div className="collection-empty">
          <Layers size={32} />
          <h2>给想法一个落脚处。</h2>
          <p>工作、生活、灵感，都可以拥有自己的便签本。</p>
          <button type="button" onClick={() => setAdding(true)}>
            建立第一个便签本 <Plus size={16} />
          </button>
        </div>
      )}
      <p className="collection-hint">便签本里的内容会一直保留在原处。</p>
    </main>
  );
}
