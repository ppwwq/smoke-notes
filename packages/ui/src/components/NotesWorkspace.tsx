import { useState } from "react";
import type { Note, NoteKind, Notebook } from "@smoke-notes/core";
import {
  CheckSquare2,
  ExternalLink,
  FilePlus2,
  StickyNote,
  Trash2,
} from "lucide-react";
import { SortableStack } from "./SortableStack";

interface NotesWorkspaceProps {
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
  const [createMenuOpen, setCreateMenuOpen] = useState(false);
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
          <p className="eyebrow">STICKY NOTES</p>
          <h1>{props.notebook.name}</h1>
          <span>{props.notes.length} 张桌面便签</span>
        </div>
        <div className="create-note-control">
          <button
            type="button"
            className="create-note-button"
            aria-label="新建便签"
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
                  void props.onCreateNote("note");
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
                  void props.onCreateNote("todo");
                }}
              >
                <CheckSquare2 size={15} />
                待办便签
              </button>
            </div>
          )}
        </div>
      </header>
      <section
        className="notes-board-scroll"
        aria-label={`${props.notebook.name}便签列表`}
      >
        {props.notes.length === 0 ? (
          <button
            type="button"
            className="blank-note-card"
            onClick={() => void props.onCreateNote("note")}
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
