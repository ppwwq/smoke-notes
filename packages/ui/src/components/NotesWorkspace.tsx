import { useRef, useState } from "react";
import { useActionMenu } from "../useActionMenu";
import type { Note, NoteKind, Notebook } from "@smoke-notes/core";
import {
  ArrowUpRight,
  CheckSquare2,
  ExternalLink,
  FilePlus2,
  NotebookPen,
  StickyNote,
  Trash2,
} from "lucide-react";
import { SortableStack } from "./SortableStack";

interface NotesWorkspaceProps {
  web?: boolean;
  notebook: Notebook | null;
  notes: Note[];
  openOnSingleClick: boolean;
  onOpenNote(id: string): void;
  onCreateNote(kind: NoteKind): Promise<void>;
  onTrashNote(id: string): Promise<void>;
  onMoveNote(
    id: string,
    previous: number | null,
    next: number | null,
  ): Promise<void>;
}

export function NotesWorkspace(props: NotesWorkspaceProps) {
  const {
    open: createMenuOpen,
    setOpen: setCreateMenuOpen,
    controlRef,
    triggerRef,
    onKeyDown,
  } = useActionMenu();
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const pending = useRef(false);
  async function create(kind: NoteKind) {
    if (pending.current) return;
    pending.current = true;
    setCreating(true);
    setCreateError(null);
    setCreateMenuOpen(false);
    try {
      await props.onCreateNote(kind);
    } catch {
      setCreateError("新建失败，已有内容已保留，请重试。");
    } finally {
      pending.current = false;
      setCreating(false);
    }
  }
  if (!props.notebook)
    return (
      <main className="empty-workspace">
        <span className="empty-orbit">
          <FilePlus2 size={28} />
        </span>
        <p className="eyebrow">NO NOTEBOOK YET</p>
        <h1>先建立一个便签本</h1>
        <p>左侧的「＋」是入口。工作、生活、灵感，都可以各有一处安静空间。</p>
      </main>
    );

  return (
    <main className="notes-board">
      <header className="notes-board-header">
        <div>
          <p className="eyebrow">
            {props.web ? "YOUR EVERYDAY SPACE" : "STICKY NOTES"}
          </p>
          <h1>{props.notebook.name}</h1>
          <span>
            {props.notes.length} 张{props.web ? "" : "桌面"}便签
          </span>
        </div>
        <div
          className="create-note-control"
          ref={controlRef}
          onKeyDown={onKeyDown}
        >
          <button
            type="button"
            className="create-note-button"
            aria-label="新建便签"
            ref={triggerRef}
            disabled={creating}
            aria-haspopup="menu"
            aria-expanded={createMenuOpen}
            onClick={() => setCreateMenuOpen((open) => !open)}
          >
            <FilePlus2 size={17} />
            <span>新建便签</span>
          </button>
          {createMenuOpen && (
            <div className="create-note-menu" role="menu" aria-label="便签类型">
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setCreateMenuOpen(false);
                  void create("note");
                }}
              >
                <StickyNote size={15} />
                普通便签
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setCreateMenuOpen(false);
                  void create("todo");
                }}
              >
                <CheckSquare2 size={15} />
                待办便签
              </button>
            </div>
          )}
        </div>
      </header>
      {createError && (
        <p role="alert" className="create-note-error">
          {createError}
        </p>
      )}
      <section
        className="notes-board-scroll"
        aria-label={`${props.notebook.name}便签列表`}
      >
        {props.web && (
          <div className="web-note-overview">
            <section className="web-collection-card" aria-label="便签本概览">
              <div className="overview-label">
                <span>一点一滴，都在这里</span>
                <NotebookPen size={22} />
              </div>
              <div className="collection-total">
                <strong>{String(props.notes.length).padStart(2, "0")}</strong>
                <span>张便签</span>
              </div>
              <div className="collection-breakdown">
                <span>
                  随手记{" "}
                  <b>
                    {props.notes.filter((note) => note.kind === "note").length}
                  </b>
                </span>
                <span>
                  待办清单{" "}
                  <b>
                    {props.notes.filter((note) => note.kind === "todo").length}
                  </b>
                </span>
              </div>
            </section>
            <section className="web-capture-card" aria-label="快速记录">
              <div>
                <p>MAKE ROOM FOR IDEAS</p>
                <h2>
                  想到了，
                  <br />
                  就记下来。
                </h2>
              </div>
              <div className="paper-stack" aria-hidden="true">
                <i />
                <i />
                <i>
                  <span />
                  <span />
                  <span />
                </i>
              </div>
              <button
                type="button"
                disabled={creating}
                onClick={() => void create("note")}
              >
                <span>写一张便签</span>
                <ArrowUpRight size={19} />
              </button>
            </section>
          </div>
        )}
        {props.web && (
          <div className="web-section-heading">
            <h2>全部便签</h2>
            <span>拖动手柄，自由整理</span>
          </div>
        )}
        {props.notes.length === 0 ? (
          <button
            type="button"
            className="blank-note-card"
            disabled={creating}
            onClick={() => void create("note")}
          >
            <FilePlus2 size={25} />
            <strong>写下第一张便签</strong>
            <span>自动保存，离线也能继续。</span>
          </button>
        ) : (
          <SortableStack
            items={props.notes}
            label={(note) => note.title || "无标题便签"}
            onMove={props.onMoveNote}
            className="sticky-card-grid"
            renderItem={(note) => {
              const displayTitle = note.title || "无标题便签";
              return (
                <article className={`sticky-card note-color-${note.color}`}>
                  <button
                    type="button"
                    className="sticky-card-open"
                    aria-label={`打开便签：${displayTitle}`}
                    onClick={() => {
                      if (props.openOnSingleClick) props.onOpenNote(note.id);
                    }}
                    onDoubleClick={() => props.onOpenNote(note.id)}
                  >
                    <span className="sticky-card-accent" />
                    {note.kind === "todo" && (
                      <span
                        className="note-kind-marker"
                        aria-label={`待办便签：${displayTitle}`}
                      >
                        <CheckSquare2 size={13} />
                      </span>
                    )}
                    <strong>{displayTitle}</strong>
                    <p>{note.body || "空白便签"}</p>
                    <time>
                      {new Date(note.updatedAt).toLocaleDateString("zh-HK", {
                        month: "short",
                        day: "numeric",
                      })}
                    </time>
                    <ExternalLink size={14} className="sticky-open-icon" />
                  </button>
                  <button
                    type="button"
                    className="sticky-card-delete"
                    aria-label={`删除便签：${displayTitle}`}
                    onClick={() => void props.onTrashNote(note.id)}
                  >
                    <Trash2 size={14} />
                  </button>
                </article>
              );
            }}
          />
        )}
      </section>
    </main>
  );
}
